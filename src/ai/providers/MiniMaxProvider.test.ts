// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MiniMaxProvider } from './MiniMaxProvider';

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

describe('MiniMaxProvider', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('injects trace context headers when traceContext is provided', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      createSseResponse([
        'data: [DONE]\n\n',
      ]),
    );

    const provider = new MiniMaxProvider({
      baseUrl: 'https://api.minimax.chat/v1',
      apiKey: 'sk-test',
      model: 'MiniMax-Text-01',
    });

    for await (const _chunk of provider.chat(
      [{ role: 'user', content: 'ping' }],
      {
        traceContext: {
          traceparent: '00-55555555555555555555555555555555-6666666666666666-01',
          tracestate: 'vendor=minimax',
        },
      },
    )) {
      // noop
    }

    const [, init] = fetchMock.mock.calls[0] ?? [];
    const headers = (init?.headers ?? {}) as Record<string, string>;
    expect(headers.traceparent).toBe('00-55555555555555555555555555555555-6666666666666666-01');
    expect(headers.tracestate).toBe('vendor=minimax');
  });
});
