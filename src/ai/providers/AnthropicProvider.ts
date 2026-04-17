import type { ChatChunk, ChatMessage, ChatRequestOptions, LLMProvider } from './LLMProvider';
import { ensureHttpHeaderValue, parseProviderJson, requireProviderValue, throwProviderHttpError } from './errorUtils';
import { buildTraceContextHeaders } from './traceContextHeaders';
import { createThinkTagStripper, iterateSseData, toErrorChunk } from './streamUtils';

export interface AnthropicProviderConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

export class AnthropicProvider implements LLMProvider {
  readonly id = 'anthropic';
  readonly label = 'Anthropic';
  readonly supportsStreaming = true;

  constructor(private readonly config: AnthropicProviderConfig) {}

  async *chat(
    messages: ChatMessage[],
    options?: ChatRequestOptions,
  ): AsyncGenerator<ChatChunk, void, unknown> {
    const baseUrl = trimTrailingSlash(requireProviderValue(this.label, ' Base URL', this.config.baseUrl));
    const apiKey = ensureHttpHeaderValue(this.label, 'x-api-key', this.config.apiKey);

    const system = messages
      .filter((message) => message.role === 'system')
      .map((message) => message.content.trim())
      .filter((message) => message.length > 0)
      .join('\n\n');

    const payloadMessages = messages
      .filter((message) => message.role !== 'system')
      .map((message) => ({
        role: message.role,
        content: [{ type: 'text', text: message.content }],
      }));

    const response = await fetch(`${baseUrl}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2024-06-01',
        ...buildTraceContextHeaders(options),
      },
      body: JSON.stringify({
        model: options?.model ?? this.config.model,
        system,
        messages: payloadMessages,
        max_tokens: options?.maxTokens ?? 1024,
        temperature: options?.temperature ?? 0.2,
        stream: true,
      }),
      ...(options?.signal ? { signal: options.signal } : {}),
    });

    if (!response.ok) {
      await throwProviderHttpError(this.label, response, `Anthropic 请求失败 (${response.status})`);
    }

    // 发出思考中信号：首个delta到达前显示"正在思考"
    yield { delta: '', thinking: true };
    const visibleTextStripper = createThinkTagStripper();

    let emittedFirstDelta = false;
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
          type?: string;
          delta?: { text?: string };
          error?: { message?: string } | string;
        }>(payload, this.label, 'Anthropic SSE');

        // 显式 error.message 优先处理
        const explicitError = json.error && typeof json.error === 'object' && 'message' in json.error
          ? (json.error as { message: string }).message
          : null;
        if (explicitError) {
          yield toErrorChunk(explicitError);
          return;
        }

        // 兜底：如果有 error 字段但无 type
        if (json.error && json.type !== 'content_block_delta') {
          const rawError = typeof json.error === 'string' ? json.error : JSON.stringify(json.error);
          yield toErrorChunk(`Anthropic 请求异常：${rawError}`);
          return;
        }

        if (json.type === 'content_block_delta') {
          const delta = json.delta?.text ?? '';
          if (delta.length > 0) {
            const visibleDelta = visibleTextStripper.feed(delta);
            if (visibleDelta.length > 0) {
              yield { delta: visibleDelta, ...(!emittedFirstDelta ? { thinking: false } : {}) };
              emittedFirstDelta = true;
            }
          }
        }

        if (json.type === 'message_stop') {
          const tail = visibleTextStripper.feed('', true);
          if (tail.length > 0) {
            yield { delta: tail };
          }
          yield { delta: '', done: true };
          return;
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