import type { ChatChunk, ChatMessage, ChatRequestOptions, LLMProvider } from './LLMProvider';
import { ensureHttpHeaderValue, parseProviderJson, requireProviderValue, throwProviderHttpError } from './errorUtils';
import { buildTraceContextHeaders } from './traceContextHeaders';
import { createThinkTagStripper, iterateJsonLines, iterateSseData, toErrorChunk } from './streamUtils';
import { normalizeAnthropicUsage, normalizeOpenAIUsage, normalizeOllamaUsage } from './tokenUsage';

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

function buildAuthHeaders(config: CustomHttpProviderConfig, options?: ChatRequestOptions): HeadersInit {
  if (config.authScheme === 'none') {
    return {
      'Content-Type': 'application/json',
      ...buildTraceContextHeaders(options),
    };
  }

  const headerName = config.authHeaderName.trim() || 'Authorization';
  const apiKey = ensureHttpHeaderValue('Custom HTTP', headerName, config.apiKey).replace(/^Bearer\s+/i, '').trim();

  return {
    'Content-Type': 'application/json',
    [headerName]: config.authScheme === 'bearer' ? `Bearer ${apiKey}` : apiKey,
    ...buildTraceContextHeaders(options),
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
      headers: buildAuthHeaders(this.config, options),
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
      const usage = normalizeOpenAIUsage(
        payload && typeof payload === 'object'
          ? (payload as { usage?: unknown }).usage
          : undefined,
      );
      if (usage) {
        yield { delta: '', usage };
      }
      const text = extractPlainJsonText(payload);
      if (text.length > 0) {
        const visibleTextStripper = createThinkTagStripper();
        const visible = visibleTextStripper.feed(text, true);
        if (visible.length > 0) {
          yield { delta: visible };
        }
      }
      yield { delta: '', done: true };
      return;
    }

    if (this.config.responseFormat === 'ollama-jsonl') {
      const visibleTextStripper = createThinkTagStripper();
      try {
        for await (const line of iterateJsonLines(response)) {
          const json = parseProviderJson<{
            message?: { content?: string };
            error?: string;
            done?: boolean;
            prompt_eval_count?: number;
            eval_count?: number;
          }>(line, this.label, 'Ollama JSONL');

          if (json.error) {
            yield toErrorChunk(json.error);
            return;
          }

          const usage = normalizeOllamaUsage(json);
          if (usage) {
            yield { delta: '', usage };
          }

          const delta = json.message?.content ?? '';
          if (delta.length > 0) {
            const visibleDelta = visibleTextStripper.feed(delta);
            if (visibleDelta.length > 0) {
              yield { delta: visibleDelta };
            }
          }

          if (json.done) {
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
      return;
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

        if (this.config.responseFormat === 'anthropic-sse') {
          const json = parseProviderJson<{
            type?: string;
            delta?: { text?: string };
            error?: { message?: string };
            usage?: { input_tokens?: number; output_tokens?: number };
            message?: { usage?: { input_tokens?: number; output_tokens?: number } };
          }>(payload, this.label, 'Anthropic SSE');

          const errorMessage = json.error?.message;
          if (errorMessage) {
            yield toErrorChunk(errorMessage);
            return;
          }

          const usage = normalizeAnthropicUsage(json.usage ?? json.message?.usage);
          if (usage) {
            yield { delta: '', usage };
          }

          if (json.type === 'content_block_delta') {
            const delta = json.delta?.text ?? '';
            if (delta.length > 0) {
              const visibleDelta = visibleTextStripper.feed(delta);
              if (visibleDelta.length > 0) {
                yield { delta: visibleDelta };
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

          continue;
        }

        const json = parseProviderJson<{
          choices?: Array<{ delta?: { content?: string; reasoning_content?: string } }>;
          error?: { message?: string };
          usage?: {
            prompt_tokens?: number;
            completion_tokens?: number;
            total_tokens?: number;
            input_tokens?: number;
            output_tokens?: number;
          };
        }>(payload, this.label, 'OpenAI SSE');

        const errorMessage = json.error?.message;
        if (errorMessage) {
          yield toErrorChunk(errorMessage);
          return;
        }

        const usage = normalizeOpenAIUsage(json.usage);
        if (usage) {
          yield { delta: '', usage };
        }

        const reasoningContent = json.choices?.[0]?.delta?.reasoning_content;
        if (typeof reasoningContent === 'string' && reasoningContent.length > 0) {
          yield { delta: '', reasoningContent };
        }

        const delta = json.choices?.[0]?.delta?.content ?? '';
        if (delta.length > 0) {
          const visibleDelta = visibleTextStripper.feed(delta);
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