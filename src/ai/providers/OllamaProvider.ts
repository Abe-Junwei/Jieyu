import type { ChatChunk, ChatMessage, ChatRequestOptions, LLMProvider } from './LLMProvider';
import { parseProviderJson, requireProviderValue, throwProviderHttpError } from './errorUtils';
import { createThinkTagStripper, iterateJsonLines, toErrorChunk } from './streamUtils';

export interface OllamaProviderConfig {
  baseUrl: string;
  model: string;
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

export class OllamaProvider implements LLMProvider {
  readonly id = 'ollama';
  readonly label = 'Ollama';
  readonly supportsStreaming = true;

  constructor(private readonly config: OllamaProviderConfig) {}

  async *chat(
    messages: ChatMessage[],
    options?: ChatRequestOptions,
  ): AsyncGenerator<ChatChunk, void, unknown> {
    const baseUrl = trimTrailingSlash(requireProviderValue(this.label, ' Base URL', this.config.baseUrl));

    const response = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: options?.model ?? this.config.model,
        messages,
        stream: true,
        options: {
          temperature: options?.temperature ?? 0.2,
          ...(typeof options?.maxTokens === 'number' ? { num_predict: options.maxTokens } : {}),
        },
      }),
      ...(options?.signal ? { signal: options.signal } : {}),
    });

    if (!response.ok) {
      await throwProviderHttpError(this.label, response, `Ollama 请求失败 (${response.status})`);
    }

    // 发出思考中信号：首个delta到达前显示"正在思考"
    yield { delta: '', thinking: true };

    let emittedFirstDelta = false;
    const visibleTextStripper = createThinkTagStripper();
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
          const visibleDelta = visibleTextStripper.feed(delta);
          if (visibleDelta.length > 0) {
            yield { delta: visibleDelta, ...(!emittedFirstDelta ? { thinking: false } : {}) };
            emittedFirstDelta = true;
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
  }
}