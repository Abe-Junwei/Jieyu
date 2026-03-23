// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GeminiProvider } from './GeminiProvider';

function createSseResponse(chunks: string[]): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder();
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });
  return new Response(stream, { status: 200 });
}

describe('GeminiProvider', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sends API key via header instead of URL query string', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      createSseResponse([
        'data: {"candidates":[{"content":{"parts":[{"text":"hello"}]},"finishReason":"STOP"}]}\n\n',
      ]),
    );

    const provider = new GeminiProvider({
      baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
      model: 'gemini-2.0-flash',
      apiKey: 'AIza-test-key',
    });

    const chunks: string[] = [];
    for await (const chunk of provider.chat([{ role: 'user', content: 'ping' }])) {
      if (chunk.delta) chunks.push(chunk.delta);
      if (chunk.done) break;
    }

    expect(chunks.join('')).toBe('hello');
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(String(url)).toContain('streamGenerateContent?alt=sse');
    expect(String(url)).not.toContain('key=');

    const headers = (init?.headers ?? {}) as Record<string, string>;
    expect(headers['x-goog-api-key']).toBe('AIza-test-key');
  });

  it('strips think tags from streamed visible content', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      createSseResponse([
        'data: {"candidates":[{"content":{"parts":[{"text":"<think>内部推理</think>hello"}]}}]}\n\n',
        'data: {"candidates":[{"content":{"parts":[{"text":"<think>内部推理</think>hello world"}]},"finishReason":"STOP"}]}\n\n',
      ]),
    );

    const provider = new GeminiProvider({
      baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
      model: 'gemini-2.0-flash',
      apiKey: 'AIza-test-key',
    });

    const chunks: string[] = [];
    for await (const chunk of provider.chat([{ role: 'user', content: 'ping' }])) {
      if (chunk.delta) chunks.push(chunk.delta);
    }

    expect(chunks.join('')).toBe('hello world');
  });
});
