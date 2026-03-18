import type {
  ChatChunk,
  ChatMessage,
  ChatRequestOptions,
  LLMProvider,
} from './LLMProvider';
import {
  parseProviderJson,
  requireProviderValue,
  throwProviderHttpError,
} from './errorUtils';
import { iterateSseData, toErrorChunk } from './streamUtils';

export interface GeminiProviderConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

function buildGeminiUrl(baseUrl: string, model: string, apiKey: string): string {
  const normalizedBase = trimTrailingSlash(baseUrl);
  requireProviderValue('Gemini', ' API Key', apiKey);
  return `${normalizedBase}/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`;
}

export class GeminiProvider implements LLMProvider {
  readonly id = 'gemini';
  readonly label = 'Gemini';
  readonly supportsStreaming = true;

  constructor(private readonly config: GeminiProviderConfig) {}

  async *chat(
    messages: ChatMessage[],
    options?: ChatRequestOptions,
  ): AsyncGenerator<ChatChunk, void, unknown> {
    const baseUrl = trimTrailingSlash(requireProviderValue(this.label, ' Base URL', this.config.baseUrl));
    requireProviderValue(this.label, ' API Key', this.config.apiKey);

    const systemInstruction = messages
      .filter((message) => message.role === 'system')
      .map((message) => message.content.trim())
      .filter((message) => message.length > 0)
      .join('\n\n');

    const contents = messages
      .filter((message) => message.role !== 'system')
      .map((message) => ({
        role: message.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: message.content }],
      }));

    const response = await fetch(buildGeminiUrl(baseUrl, options?.model ?? this.config.model, this.config.apiKey), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': this.config.apiKey,
      },
      body: JSON.stringify({
        contents,
        ...(systemInstruction.length > 0
          ? { systemInstruction: { parts: [{ text: systemInstruction }] } }
          : {}),
        generationConfig: {
          temperature: options?.temperature ?? 0.2,
          ...(typeof options?.maxTokens === 'number' ? { maxOutputTokens: options.maxTokens } : {}),
        },
      }),
      ...(options?.signal ? { signal: options.signal } : {}),
    });

    if (!response.ok) {
      await throwProviderHttpError(this.label, response, `Gemini 请求失败 (${response.status})`);
    }

    let emittedText = '';

    for await (const payload of iterateSseData(response)) {
      if (payload === '[DONE]') {
        yield { delta: '', done: true };
        return;
      }

      const json = parseProviderJson<{
        candidates?: Array<{
          content?: {
            parts?: Array<{ text?: string }>;
          };
          finishReason?: string;
        }>;
        error?: { message?: string };
      }>(payload, this.label, 'Gemini SSE');

      const errorMessage = json.error?.message;
      if (errorMessage) {
        yield toErrorChunk(errorMessage);
        return;
      }

      const fullText = json.candidates?.[0]?.content?.parts?.map((part) => part.text ?? '').join('') ?? '';
      if (fullText.length > emittedText.length) {
        const delta = fullText.slice(emittedText.length);
        emittedText = fullText;
        if (delta.length > 0) {
          yield { delta };
        }
      }

      if (json.candidates?.[0]?.finishReason) {
        yield { delta: '', done: true };
        return;
      }
    }

    yield { delta: '', done: true };
  }
}