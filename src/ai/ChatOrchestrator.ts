import type { ChatChunk, ChatMessage, ChatRequestOptions, LLMProvider } from './providers/LLMProvider';

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

    // 包装 stream：主 provider 遇到可重试错误时自动降级到 fallback
    // Wrap stream: auto-fallback to secondary provider on retryable errors
    const wrappedStream = fallback
      ? this.streamWithFallback(primary, fallback, nextMessages, input.options)
      : primary.chat(nextMessages, input.options);

    return { messages: nextMessages, stream: wrappedStream };
  }

  private async *streamWithFallback(
    primary: LLMProvider,
    fallback: LLMProvider,
    messages: ChatMessage[],
    options?: ChatRequestOptions,
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
      } catch (fallbackError) {
        // Fallback also failed — propagate the error
        throw fallbackError;
      }
    }
  }
}
