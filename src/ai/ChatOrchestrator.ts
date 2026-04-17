import type {
  ChatChunk,
  ChatMessage,
  ChatRequestOptions,
  LLMProvider,
  TraceContextHeaders,
} from './providers/LLMProvider';
import { generateTraceId, startAiTraceSpan, type ActiveSpan } from '../observability/aiTrace';

export interface SendMessageInput {
  history: ChatMessage[];
  userText: string;
  systemPrompt?: string;
  options?: ChatRequestOptions;
}

export interface SendMessageOutput {
  messages: ChatMessage[];
  stream: AsyncGenerator<ChatChunk, void, unknown>;
}

/**
 * 判断流式错误是否可重试（限速 / 服务不可用 / 网络错误）
 * Classify whether a streaming error is retryable (rate-limit / unavailable / network).
 */
export function isRetryableStreamError(error: unknown): boolean {
  if (!error) return false;
  const msg = error instanceof Error ? error.message : String(error);
  // HTTP 429 (rate limit), 502/503/504 (gateway / unavailable), 网络类错误 | Network errors
  return /\b(429|502|503|504)\b/.test(msg)
    || /rate.?limit/i.test(msg)
    || /service.?unavailable/i.test(msg)
    || /network|ECONNRESET|ECONNREFUSED|ETIMEDOUT|fetch failed/i.test(msg);
}

function trimMessageContent(value: string): string {
  return value.trim();
}

function hashToHex32(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function stableHex(input: string, length: number): string {
  let hex = '';
  let salt = 0;
  while (hex.length < length) {
    hex += hashToHex32(`${input}:${salt}`);
    salt += 1;
  }
  return hex.slice(0, length);
}

function createTraceContextHeaders(traceId: string): TraceContextHeaders {
  const traceIdHex = stableHex(traceId, 32);
  const spanIdHex = stableHex(`${traceId}:llm-request`, 16);
  return {
    traceparent: `00-${traceIdHex}-${spanIdHex}-01`,
  };
}

function shouldInjectTraceContextHeaders(env: ImportMetaEnv): boolean {
  return (env.VITE_OTEL_INJECT_TRACE_CONTEXT_HEADERS ?? '').trim().toLowerCase() === 'true';
}

function assembleMessages(input: SendMessageInput): ChatMessage[] {
  const nextMessages: ChatMessage[] = [];

  const systemPrompt = trimMessageContent(input.systemPrompt ?? '');
  if (systemPrompt.length > 0) {
    nextMessages.push({ role: 'system', content: systemPrompt });
  } else if (import.meta.env.DEV && input.systemPrompt != null) {
    console.debug('[ChatOrchestrator] systemPrompt trimmed to empty, skipped');
  }

  for (const msg of input.history) {
    if (trimMessageContent(msg.content).length === 0) {
      if (import.meta.env.DEV) console.debug('[ChatOrchestrator] skipped empty history message', msg.role);
      continue;
    }
    nextMessages.push(msg);
  }

  const userText = trimMessageContent(input.userText);
  if (userText.length === 0) {
    throw new Error('userText 不能为空');
  }

  nextMessages.push({ role: 'user', content: userText });
  return nextMessages;
}

export class ChatOrchestrator {
  private readonly fallbackProvider: LLMProvider | null;

  constructor(
    private readonly provider: LLMProvider,
    fallbackProvider?: LLMProvider | null,
  ) {
    this.fallbackProvider = fallbackProvider ?? null;
  }

  sendMessage(input: SendMessageInput): SendMessageOutput {
    const nextMessages = assembleMessages(input);
    const primary = this.provider;
    const fallback = this.fallbackProvider;

    const traceId = generateTraceId();
    const optionsWithTraceContext = shouldInjectTraceContextHeaders(import.meta.env)
      ? {
          ...(input.options ?? {}),
          traceContext: createTraceContextHeaders(traceId),
        }
      : input.options;

    const span = startAiTraceSpan({
      kind: 'llm-request',
      traceId,
      provider: primary.id,
      ...(input.options?.model !== undefined ? { model: input.options.model } : {}),
    });

    // 包装 stream：主 provider 遇到可重试错误时自动降级到 fallback
    // Wrap stream: auto-fallback to secondary provider on retryable errors
    const rawStream = fallback
      ? this.streamWithFallback(primary, fallback, nextMessages, optionsWithTraceContext, span)
      : primary.chat(nextMessages, optionsWithTraceContext);

    // 包装 stream 以自动记录 span 生命周期 | Wrap stream to auto-track span lifecycle
    const tracedStream = this.wrapStreamWithTrace(rawStream, span);

    return { messages: nextMessages, stream: tracedStream };
  }

  private async *wrapStreamWithTrace(
    stream: AsyncGenerator<ChatChunk, void, unknown>,
    span: ActiveSpan,
  ): AsyncGenerator<ChatChunk, void, unknown> {
    try {
      for await (const chunk of stream) {
        if (chunk.delta && chunk.delta.length > 0) span.markFirstToken();
        yield chunk;
        if (chunk.done) { span.end(); return; }
      }
      span.end();
    } catch (error) {
      span.endWithError(error instanceof Error ? error.message : String(error));
      throw error;
    }
  }

  private async *streamWithFallback(
    primary: LLMProvider,
    fallback: LLMProvider,
    messages: ChatMessage[],
    options?: ChatRequestOptions,
    span?: ActiveSpan,
  ): AsyncGenerator<ChatChunk, void, unknown> {
    let usedFallback = false;
    let hasYielded = false;
    let fallbackError: unknown = null;
    try {
      for await (const chunk of primary.chat(messages, options)) {
        // 若首个 chunk 就是错误，尝试降级 | If first chunk is an error, attempt fallback
        if (!hasYielded && chunk.error) {
          usedFallback = true;
          fallbackError = chunk.error;
          break;
        }
        hasYielded = true;
        yield chunk;
        if (chunk.done) return;
      }
    } catch (error) {
      // B-17 fix: attempt fallback for ALL errors, not just retryable ones.
      // Non-retryable errors (401/403/format) from primary may still succeed on fallback.
      usedFallback = true;
      fallbackError = error;
    }

    if (usedFallback) {
      span?.markFallback(fallback.id);
      // 降级到备用 provider | Fallback to secondary provider
      // 若主模型已输出部分内容后中断，提示可能存在重复 | If primary already emitted partial content, warn about potential duplicates
      const retryable = isRetryableStreamError(fallbackError);
      const notice = hasYielded
        ? `\n\n---\n[降级] 主模型 (${primary.id}) 输出中断，以下为备用模型 (${fallback.id}) 重新生成的完整回复，上方内容可忽略。`
        : retryable
          ? `[降级] 主模型 (${primary.id}) 暂时不可用，切换到备用模型 (${fallback.id})。`
          : `[降级] 主模型 (${primary.id}) 返回错误，切换到备用模型 (${fallback.id})。`;
      yield { delta: '', error: notice };
      try {
        yield* fallback.chat(messages, options);
      } catch (fallbackCatchError) {
        // Fallback also failed — propagate the error
        throw fallbackCatchError;
      }
    }
  }
}
