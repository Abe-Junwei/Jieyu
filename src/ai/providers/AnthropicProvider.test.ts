// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AnthropicProvider } from './AnthropicProvider';

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

describe('AnthropicProvider', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('streams content_block_delta and stops on message_stop', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      createSseResponse([
        'data: {"type":"content_block_delta","delta":{"text":"你好"}}\n\n',
        'data: {"type":"message_stop"}\n\n',
      ]),
    );

    const provider = new AnthropicProvider({
      baseUrl: 'https://api.anthropic.com/v1',
      apiKey: 'sk-ant-test',
      model: 'claude-test',
    });

    const chunks: string[] = [];
    let doneSeen = false;
    for await (const chunk of provider.chat([{ role: 'user', content: 'ping' }])) {
      if (chunk.delta) chunks.push(chunk.delta);
      if (chunk.done) doneSeen = true;
    }

    expect(chunks.join('')).toBe('你好');
    expect(doneSeen).toBe(true);

    const [, init] = fetchMock.mock.calls[0] ?? [];
    const headers = (init?.headers ?? {}) as Record<string, string>;
    expect(headers['x-api-key']).toBe('sk-ant-test');
  });

  it('injects trace context headers when traceContext is provided', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      createSseResponse([
        'data: {"type":"message_stop"}\n\n',
      ]),
    );

    const provider = new AnthropicProvider({
      baseUrl: 'https://api.anthropic.com/v1',
      apiKey: 'sk-ant-test',
      model: 'claude-test',
    });

    for await (const _chunk of provider.chat(
      [{ role: 'user', content: 'ping' }],
      {
        traceContext: {
          traceparent: '00-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-bbbbbbbbbbbbbbbb-01',
          tracestate: 'vendor=b',
        },
      },
    )) {
      // noop
    }

    const [, init] = fetchMock.mock.calls[0] ?? [];
    const headers = (init?.headers ?? {}) as Record<string, string>;
    expect(headers.traceparent).toBe('00-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa-bbbbbbbbbbbbbbbb-01');
    expect(headers.tracestate).toBe('vendor=b');
  });

  it('returns error chunk when anthropic error event appears', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      createSseResponse([
        'data: {"error":{"message":"invalid auth"}}\n\n',
      ]),
    );

    const provider = new AnthropicProvider({
      baseUrl: 'https://api.anthropic.com/v1',
      apiKey: 'sk-ant-test',
      model: 'claude-test',
    });

    const all = [] as Array<{ done?: boolean; error?: string }>;
    for await (const chunk of provider.chat([{ role: 'user', content: 'ping' }])) {
      all.push(chunk);
    }

    const errorChunk = all.find((chunk) => typeof chunk.error === 'string');
    expect(errorChunk?.error).toBe('invalid auth');
    expect(errorChunk?.done).toBe(true);
  });

  it('strips think tags from anthropic visible output', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      createSseResponse([
        'data: {"type":"content_block_delta","delta":{"text":"<think>内部</think>你好"}}\n\n',
        'data: {"type":"message_stop"}\n\n',
      ]),
    );

    const provider = new AnthropicProvider({
      baseUrl: 'https://api.anthropic.com/v1',
      apiKey: 'sk-ant-test',
      model: 'claude-test',
    });

    const visible: string[] = [];
    for await (const chunk of provider.chat([{ role: 'user', content: 'ping' }])) {
      if (chunk.delta) visible.push(chunk.delta);
    }

    expect(visible.join('')).toBe('你好');
  });
});
