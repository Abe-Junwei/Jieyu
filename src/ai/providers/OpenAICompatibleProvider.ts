import type {
  ChatChunk,
  ChatMessage,
  ChatRequestOptions,
  LLMProvider,
} from './LLMProvider';
import {
  buildBearerAuthHeader,
  parseProviderJson,
  requireProviderValue,
  throwProviderHttpError,
} from './errorUtils';
import { iterateSseData, toErrorChunk } from './streamUtils';

export interface OpenAICompatibleProviderConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

export class OpenAICompatibleProvider implements LLMProvider {
  readonly id = 'openai-compatible';
  readonly label = 'OpenAI Compatible';
  readonly supportsStreaming = true;

  constructor(private readonly config: OpenAICompatibleProviderConfig) {}

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
      },
      body: JSON.stringify({
        model: options?.model ?? this.config.model,
        messages,
        temperature: options?.temperature ?? 0.2,
        max_tokens: options?.maxTokens,
        stream: true,
      }),
      ...(options?.signal ? { signal: options.signal } : {}),
    });

    if (!response.ok) {
      await throwProviderHttpError(this.label, response, `远程模型请求失败 (${response.status})`);
    }

    for await (const payload of iterateSseData(response)) {
      if (payload === '[DONE]') {
        yield { delta: '', done: true };
        return;
      }

      const json = parseProviderJson<{
        choices?: Array<{ delta?: { content?: string } }>;
        error?: { message?: string };
      }>(payload, this.label, 'OpenAI SSE');

      const errorMessage = json.error?.message;
      if (errorMessage) {
        yield toErrorChunk(errorMessage);
        return;
      }

      const delta = json.choices?.[0]?.delta?.content ?? '';
      if (delta.length > 0) {
        yield { delta };
      }
    }

    yield { delta: '', done: true };
  }
}
