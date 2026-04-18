// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OllamaProvider } from './OllamaProvider';

function createJsonlResponse(lines: string[]): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder();
      for (const line of lines) {
        controller.enqueue(encoder.encode(line));
      }
      controller.close();
    },
  });
  return new Response(stream, { status: 200, headers: { 'Content-Type': 'application/x-ndjson' } });
}

describe('OllamaProvider', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('injects trace context headers when traceContext is provided', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      createJsonlResponse([
        '{"message":{"content":"ok"},"done":true}\n',
      ]),
    );

    const provider = new OllamaProvider({
      baseUrl: 'http://localhost:11434',
      model: 'qwen3:8b',
    });

    for await (const _chunk of provider.chat(
      [{ role: 'user', content: 'ping' }],
      {
        traceContext: {
          traceparent: '00-77777777777777777777777777777777-8888888888888888-01',
          tracestate: 'vendor=ollama',
        },
      },
    )) {
      // noop
    }

    const [, init] = fetchMock.mock.calls[0] ?? [];
    const headers = (init?.headers ?? {}) as Record<string, string>;
    expect(headers.traceparent).toBe('00-77777777777777777777777777777777-8888888888888888-01');
    expect(headers.tracestate).toBe('vendor=ollama');
  });

  it('surfaces prompt and generation token counts from the final JSONL record', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      createJsonlResponse([
        '{"message":{"content":"hello"},"done":false}\n',
        '{"message":{"content":" world"},"prompt_eval_count":21,"eval_count":9,"done":true}\n',
      ]),
    );

    const provider = new OllamaProvider({
      baseUrl: 'http://localhost:11434',
      model: 'qwen3:8b',
    });

    let finalUsage: { inputTokens?: number; outputTokens?: number; totalTokens?: number } | undefined;
    for await (const chunk of provider.chat([{ role: 'user', content: 'ping' }])) {
      if (chunk.usage) finalUsage = chunk.usage;
    }

    expect(finalUsage).toEqual({ inputTokens: 21, outputTokens: 9, totalTokens: 30 });
  });
});
