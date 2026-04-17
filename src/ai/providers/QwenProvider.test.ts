// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QwenProvider } from './QwenProvider';

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

describe('QwenProvider', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('injects trace context headers when traceContext is provided', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      createSseResponse([
        'data: [DONE]\n\n',
      ]),
    );

    const provider = new QwenProvider({
      baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      apiKey: 'sk-test',
      model: 'qwen-plus',
    });

    for await (const _chunk of provider.chat(
      [{ role: 'user', content: 'ping' }],
      {
        traceContext: {
          traceparent: '00-33333333333333333333333333333333-4444444444444444-01',
          tracestate: 'vendor=qwen',
        },
      },
    )) {
      // noop
    }

    const [, init] = fetchMock.mock.calls[0] ?? [];
    const headers = (init?.headers ?? {}) as Record<string, string>;
    expect(headers.traceparent).toBe('00-33333333333333333333333333333333-4444444444444444-01');
    expect(headers.tracestate).toBe('vendor=qwen');
  });
});
