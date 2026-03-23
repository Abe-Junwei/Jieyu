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
import { createThinkTagStripper, iterateSseData, toErrorChunk } from './streamUtils';

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

    // 发出思考中信号：首个delta到达前显示"正在思考"
    yield { delta: '', thinking: true };
    const visibleTextStripper = createThinkTagStripper();

    let emittedText = '';
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
          candidates?: Array<{
            content?: {
              parts?: Array<{ text?: string }>;
            };
            finishReason?: string;
          }>;
          error?: { message?: string } | string;
        }>(payload, this.label, 'Gemini SSE');

        // 显式 error.message 优先处理
        const explicitError = json.error && typeof json.error === 'object' && 'message' in json.error
          ? (json.error as { message: string }).message
          : null;
        if (explicitError) {
          yield toErrorChunk(explicitError);
          return;
        }

        // 兜底：如果有 error 字段但无 candidates
        const fullText = json.candidates?.[0]?.content?.parts?.map((part) => part.text ?? '').join('') ?? '';
        if (json.error && !fullText) {
          const rawError = typeof json.error === 'string' ? json.error : JSON.stringify(json.error);
          yield toErrorChunk(`Gemini 请求异常：${rawError}`);
          return;
        }

        if (fullText.length > emittedText.length) {
          const delta = fullText.slice(emittedText.length);
          emittedText = fullText;
          if (delta.length > 0) {
            const visibleDelta = visibleTextStripper.feed(delta);
            if (visibleDelta.length > 0) {
              yield { delta: visibleDelta, ...(!emittedFirstDelta ? { thinking: false } : {}) };
              emittedFirstDelta = true;
            }
          }
        }

        if (json.candidates?.[0]?.finishReason) {
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

    // Fallback: if the stream ended without an explicit finishReason, still signal completion.
    yield { delta: '', done: true };
  }
}