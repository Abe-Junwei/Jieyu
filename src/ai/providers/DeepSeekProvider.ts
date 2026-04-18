import type { ChatChunk, ChatMessage, ChatRequestOptions, LLMProvider } from './LLMProvider';
import { buildBearerAuthHeader, parseProviderJson, requireProviderValue, throwProviderHttpError } from './errorUtils';
import { buildTraceContextHeaders } from './traceContextHeaders';
import { createThinkTagStripper, iterateSseData, toErrorChunk } from './streamUtils';
import { normalizeOpenAIUsage } from './tokenUsage';

export interface DeepSeekProviderConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

export class DeepSeekProvider implements LLMProvider {
  readonly id = 'deepseek';
  readonly label = 'DeepSeek';
  readonly supportsStreaming = true;

  constructor(private readonly config: DeepSeekProviderConfig) {}

  async *chat(
    messages: ChatMessage[],
    options?: ChatRequestOptions,
  ): AsyncGenerator<ChatChunk, void, unknown> {
    const baseUrl = trimTrailingSlash(requireProviderValue(this.label, ' Base URL', this.config.baseUrl));
    const authorization = buildBearerAuthHeader(this.label, this.config.apiKey);

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: authorization,
        ...buildTraceContextHeaders(options),
      },
      body: JSON.stringify({
        model: options?.model ?? this.config.model,
        messages,
        temperature: options?.temperature ?? 0.2,
        max_tokens: options?.maxTokens,
        stream: true,
        stream_options: { include_usage: true },
      }),
      ...(options?.signal ? { signal: options.signal } : {}),
    });

    if (!response.ok) {
      await throwProviderHttpError(this.label, response, `DeepSeek 请求失败 (${response.status})`);
    }

    const visibleTextStripper = createThinkTagStripper();

    try {
      for await (const payload of iterateSseData(response)) {
        if (payload === '[DONE]') {
          const tail = visibleTextStripper.feed('', true);
          if (tail.length > 0) {
            yield { delta: tail };
          }
          yield { delta: '', done: true };
          return;
        }

        const json = parseProviderJson<{
          choices?: Array<{ delta?: { content?: string; reasoning_content?: string } }>;
          error?: { message?: string } | string;
          usage?: {
            prompt_tokens?: number;
            completion_tokens?: number;
            total_tokens?: number;
            input_tokens?: number;
            output_tokens?: number;
          };
        }>(payload, this.label, 'DeepSeek SSE');

        const reasoningDelta = json.choices?.[0]?.delta?.reasoning_content ?? '';
        const contentDelta = json.choices?.[0]?.delta?.content ?? '';
        const usage = normalizeOpenAIUsage(json.usage);

        // 显式 error.message 优先处理（如 rate_limit、invalid_request）
        const explicitError = json.error && typeof json.error === 'object' && 'message' in json.error
          ? (json.error as { message: string }).message
          : null;
        if (explicitError) {
          yield toErrorChunk(explicitError);
          return;
        }

        // 兜底：如果有 error 字段但无 choices（DeepSeek 偶发返回）
        if (json.error && !reasoningDelta && !contentDelta) {
          const rawError = typeof json.error === 'string' ? json.error : JSON.stringify(json.error);
          yield toErrorChunk(`DeepSeek 请求异常：${rawError}`);
          return;
        }

        if (usage) {
          yield { delta: '', usage };
        }

        // 推理内容单独 yield，不与 content 混淆
        if (reasoningDelta.length > 0) {
          yield { delta: '', reasoningContent: reasoningDelta };
        }
        if (contentDelta.length > 0) {
          const visibleDelta = visibleTextStripper.feed(contentDelta);
          if (visibleDelta.length > 0) {
            yield { delta: visibleDelta };
          }
        }
      }
    } catch (streamError) {
      yield toErrorChunk(streamError instanceof Error ? streamError.message : 'Stream read failed');
      return;
    }

    const tail = visibleTextStripper.feed('', true);
    if (tail.length > 0) {
      yield { delta: tail };
    }

    yield { delta: '', done: true };
  }
}
