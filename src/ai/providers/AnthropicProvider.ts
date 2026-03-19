import type {
  ChatChunk,
  ChatMessage,
  ChatRequestOptions,
  LLMProvider,
} from './LLMProvider';
import {
  ensureHttpHeaderValue,
  parseProviderJson,
  requireProviderValue,
  throwProviderHttpError,
} from './errorUtils';
import { iterateSseData, toErrorChunk } from './streamUtils';

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

    try {
      for await (const payload of iterateSseData(response)) {
        if (payload === '[DONE]') {
          yield { delta: '', done: true };
          return;
        }

        const json = parseProviderJson<{
          type?: string;
          delta?: { text?: string };
          error?: { message?: string };
        }>(payload, this.label, 'Anthropic SSE');

        const errorMessage = json.error?.message;
        if (errorMessage) {
          yield toErrorChunk(errorMessage);
          return;
        }

        if (json.type === 'content_block_delta') {
          const delta = json.delta?.text ?? '';
          if (delta.length > 0) {
            yield { delta };
          }
        }

        if (json.type === 'message_stop') {
          yield { delta: '', done: true };
          return;
        }
      }
    } catch (streamError) {
      yield toErrorChunk(streamError instanceof Error ? streamError.message : 'Stream read failed');
      return;
    }

    yield { delta: '', done: true };
  }
}