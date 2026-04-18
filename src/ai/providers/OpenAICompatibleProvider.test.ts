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

  it('injects trace context headers when traceContext is provided', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      createSseResponse([
        'data: {"choices":[{"delta":{"content":"ok"}}]}\n\n',
        'data: [DONE]\n\n',
      ]),
    );

    const provider = new OpenAICompatibleProvider({
      baseUrl: 'https://api.example.com/v1',
      apiKey: 'sk-test',
      model: 'gpt-test',
    });

    for await (const _chunk of provider.chat(
      [{ role: 'user', content: 'ping' }],
      {
        traceContext: {
          traceparent: '00-0123456789abcdef0123456789abcdef-0123456789abcdef-01',
          tracestate: 'vendor=a',
        },
      },
    )) {
      // noop
    }

    const [, init] = fetchMock.mock.calls[0] ?? [];
    const headers = (init?.headers ?? {}) as Record<string, string>;
    expect(headers.traceparent).toBe('00-0123456789abcdef0123456789abcdef-0123456789abcdef-01');
    expect(headers.tracestate).toBe('vendor=a');
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

  it('yields error chunk on malformed SSE JSON payload', async () => {
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

    const all: Array<{ delta: string; done?: boolean; error?: string }> = [];
    for await (const chunk of provider.chat([{ role: 'user', content: 'ping' }])) {
      all.push(chunk);
    }

    const errChunk = all.find((c) => c.error);
    expect(errChunk).toBeDefined();
    expect(errChunk?.error).toContain('返回格式无法解析');
    expect(errChunk?.done).toBe(true);
  });

  it('yields error chunk when stream read fails mid-stream', async () => {
    const encoder = new TextEncoder();
    let readCount = 0;
    const mockReader = {
      read: async () => {
        readCount += 1;
        if (readCount === 1) {
          return { done: false, value: encoder.encode('data: {"choices":[{"delta":{"content":"he"}}]}\n\n') };
        }
        throw new Error('network disconnect');
      },
      cancel: async () => {},
    };
    const mockResponse = {
      ok: true,
      status: 200,
      body: { getReader: () => mockReader },
    } as unknown as Response;
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse);

    const provider = new OpenAICompatibleProvider({
      baseUrl: 'https://api.example.com/v1',
      apiKey: 'sk-test',
      model: 'gpt-test',
    });

    const all: Array<{ delta: string; done?: boolean; error?: string }> = [];
    for await (const chunk of provider.chat([{ role: 'user', content: 'ping' }])) {
      all.push(chunk);
    }

    const errChunk = all.find((c) => c.error);
    expect(errChunk).toBeDefined();
    expect(errChunk?.error).toContain('network disconnect');
    expect(errChunk?.done).toBe(true);
  });

  it('keeps reasoning_content private and strips think tags from visible content', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      createSseResponse([
        'data: {"choices":[{"delta":{"reasoning_content":"内部推理"}}]}\n\n',
        'data: {"choices":[{"delta":{"content":"<think>隐私</think>可见"}}]}\n\n',
        'data: [DONE]\n\n',
      ]),
    );

    const provider = new OpenAICompatibleProvider({
      baseUrl: 'https://api.example.com/v1',
      apiKey: 'sk-test',
      model: 'gpt-test',
    });

    const visible: string[] = [];
    const reasoning: string[] = [];
    for await (const chunk of provider.chat([{ role: 'user', content: 'ping' }])) {
      if (chunk.delta) visible.push(chunk.delta);
      if (chunk.reasoningContent) reasoning.push(chunk.reasoningContent);
    }

    expect(visible.join('')).toBe('可见');
    expect(reasoning.join('')).toBe('内部推理');
  });

  it('surfaces provider-reported token usage from the stream', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      createSseResponse([
        'data: {"choices":[{"delta":{"content":"ok"}}]}\n\n',
        'data: {"choices":[],"usage":{"prompt_tokens":12,"completion_tokens":5,"total_tokens":17}}\n\n',
        'data: [DONE]\n\n',
      ]),
    );

    const provider = new OpenAICompatibleProvider({
      baseUrl: 'https://api.example.com/v1',
      apiKey: 'sk-test',
      model: 'gpt-test',
    });

    const usageChunks: Array<{ inputTokens?: number; outputTokens?: number; totalTokens?: number }> = [];
    for await (const chunk of provider.chat([{ role: 'user', content: 'ping' }])) {
      if (chunk.usage) usageChunks.push(chunk.usage);
    }

    expect(usageChunks[usageChunks.length - 1]).toEqual({ inputTokens: 12, outputTokens: 5, totalTokens: 17 });
    const [, init] = fetchMock.mock.calls[0] ?? [];
    const body = JSON.parse(String(init?.body ?? '{}')) as { stream_options?: { include_usage?: boolean } };
    expect(body.stream_options?.include_usage).toBe(true);
  });
});
