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
import { iterateJsonLines, iterateSseData, toErrorChunk } from './streamUtils';

export type CustomHttpAuthScheme = 'none' | 'bearer' | 'raw';
export type CustomHttpResponseFormat = 'openai-sse' | 'anthropic-sse' | 'ollama-jsonl' | 'plain-json';

export interface CustomHttpProviderConfig {
  endpointUrl: string;
  model: string;
  apiKey: string;
  authHeaderName: string;
  authScheme: CustomHttpAuthScheme;
  responseFormat: CustomHttpResponseFormat;
}

function buildAuthHeaders(config: CustomHttpProviderConfig): HeadersInit {
  if (config.authScheme === 'none') {
    return { 'Content-Type': 'application/json' };
  }

  const headerName = config.authHeaderName.trim() || 'Authorization';
  const apiKey = ensureHttpHeaderValue('Custom HTTP', headerName, config.apiKey).replace(/^Bearer\s+/i, '').trim();

  return {
    'Content-Type': 'application/json',
    [headerName]: config.authScheme === 'bearer' ? `Bearer ${apiKey}` : apiKey,
  };
}

function extractPlainJsonText(payload: unknown): string {
  if (!payload || typeof payload !== 'object') return '';

  const record = payload as Record<string, unknown>;
  const directCandidates = [
    record.output_text,
    record.content,
    record.text,
    record.response,
  ];

  for (const item of directCandidates) {
    if (typeof item === 'string' && item.trim().length > 0) {
      return item;
    }
  }

  const message = record.message;
  if (message && typeof message === 'object') {
    const content = (message as Record<string, unknown>).content;
    if (typeof content === 'string' && content.trim().length > 0) {
      return content;
    }
  }

  const choices = record.choices;
  if (Array.isArray(choices) && choices.length > 0) {
    const firstChoice = choices[0];
    if (firstChoice && typeof firstChoice === 'object') {
      const choiceRecord = firstChoice as Record<string, unknown>;
      const messageValue = choiceRecord.message;
      if (messageValue && typeof messageValue === 'object') {
        const content = (messageValue as Record<string, unknown>).content;
        if (typeof content === 'string' && content.trim().length > 0) {
          return content;
        }
      }
    }
  }

  return '';
}

export class CustomHttpProvider implements LLMProvider {
  readonly id = 'custom-http';
  readonly label = 'Custom HTTP';
  readonly supportsStreaming = true;

  constructor(private readonly config: CustomHttpProviderConfig) {}

  async *chat(
    messages: ChatMessage[],
    options?: ChatRequestOptions,
  ): AsyncGenerator<ChatChunk, void, unknown> {
    const endpointUrl = requireProviderValue(this.label, ' Endpoint URL', this.config.endpointUrl);

    const response = await fetch(endpointUrl, {
      method: 'POST',
      headers: buildAuthHeaders(this.config),
      body: JSON.stringify({
        model: options?.model ?? this.config.model,
        messages,
        temperature: options?.temperature ?? 0.2,
        max_tokens: options?.maxTokens,
        stream: this.config.responseFormat !== 'plain-json',
      }),
      ...(options?.signal ? { signal: options.signal } : {}),
    });

    if (!response.ok) {
      await throwProviderHttpError(this.label, response, `Custom HTTP 请求失败 (${response.status})`);
    }

    if (this.config.responseFormat === 'plain-json') {
      // Non-streaming single-shot: read entire response body and yield at once.
      const payload = parseProviderJson<unknown>(await response.text(), this.label, 'Plain JSON');
      const text = extractPlainJsonText(payload);
      if (text.length > 0) {
        yield { delta: text };
      }
      yield { delta: '', done: true };
      return;
    }

    if (this.config.responseFormat === 'ollama-jsonl') {
      try {
        for await (const line of iterateJsonLines(response)) {
          const json = parseProviderJson<{
            message?: { content?: string };
            error?: string;
            done?: boolean;
          }>(line, this.label, 'Ollama JSONL');

          if (json.error) {
            yield toErrorChunk(json.error);
            return;
          }

          const delta = json.message?.content ?? '';
          if (delta.length > 0) {
            yield { delta };
          }

          if (json.done) {
            yield { delta: '', done: true };
            return;
          }
        }
      } catch (streamError) {
        yield toErrorChunk(streamError instanceof Error ? streamError.message : 'Stream read failed');
        return;
      }

      yield { delta: '', done: true };
      return;
    }

    try {
      for await (const payload of iterateSseData(response)) {
        if (payload === '[DONE]') {
          yield { delta: '', done: true };
          return;
        }

        if (this.config.responseFormat === 'anthropic-sse') {
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

          continue;
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
    } catch (streamError) {
      yield toErrorChunk(streamError instanceof Error ? streamError.message : 'Stream read failed');
      return;
    }

    yield { delta: '', done: true };
  }
}