// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OpenAICompatibleProvider } from './OpenAICompatibleProvider';

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

describe('OpenAICompatibleProvider', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('streams delta content and terminates on DONE marker', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      createSseResponse([
        'data: {"choices":[{"delta":{"content":"he"}}]}\n\n',
        'data: {"choices":[{"delta":{"content":"llo"}}]}\n\n',
        'data: [DONE]\n\n',
      ]),
    );

    const provider = new OpenAICompatibleProvider({
      baseUrl: 'https://api.example.com/v1',
      apiKey: 'sk-test',
      model: 'gpt-test',
    });

    const chunks: string[] = [];
    let doneSeen = false;
    for await (const chunk of provider.chat([{ role: 'user', content: 'ping' }])) {
      if (chunk.delta) chunks.push(chunk.delta);
      if (chunk.done) doneSeen = true;
    }

    expect(chunks.join('')).toBe('hello');
    expect(doneSeen).toBe(true);
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(String(url)).toBe('https://api.example.com/v1/chat/completions');
    const headers = (init?.headers ?? {}) as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer sk-test');
  });

  it('returns error chunk when provider emits error payload', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      createSseResponse([
        'data: {"error":{"message":"rate limited"}}\n\n',
      ]),
    );

    const provider = new OpenAICompatibleProvider({
      baseUrl: 'https://api.example.com/v1',
      apiKey: 'sk-test',
      model: 'gpt-test',
    });

    const all = [] as Array<{ delta: string; done?: boolean; error?: string }>;
    for await (const chunk of provider.chat([{ role: 'user', content: 'ping' }])) {
      all.push(chunk);
    }

    expect(all[0]?.error).toBe('rate limited');
    expect(all[0]?.done).toBe(true);
  });

  it('throws format error on malformed SSE JSON payload', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      createSseResponse([
        'data: {bad json}\n\n',
      ]),
    );

    const provider = new OpenAICompatibleProvider({
      baseUrl: 'https://api.example.com/v1',
      apiKey: 'sk-test',
      model: 'gpt-test',
    });

    await expect(async () => {
      for await (const _chunk of provider.chat([{ role: 'user', content: 'ping' }])) {
        // iterate until failure
      }
    }).rejects.toThrow('返回格式无法解析');
  });
});
