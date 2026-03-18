// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CustomHttpProvider } from './CustomHttpProvider';

function createStreamResponse(chunks: string[], contentType = 'text/event-stream'): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder();
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });
  return new Response(stream, { status: 200, headers: { 'Content-Type': contentType } });
}

describe('CustomHttpProvider', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('parses ollama-jsonl and stops on done=true', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      createStreamResponse([
        '{"message":{"content":"a"},"done":false}\n',
        '{"message":{"content":"b"},"done":true}\n',
      ], 'application/x-ndjson'),
    );

    const provider = new CustomHttpProvider({
      endpointUrl: 'https://gateway.example.com/chat',
      model: 'model-x',
      apiKey: '',
      authHeaderName: 'Authorization',
      authScheme: 'none',
      responseFormat: 'ollama-jsonl',
    });

    const text: string[] = [];
    let doneSeen = false;
    for await (const chunk of provider.chat([{ role: 'user', content: 'ping' }])) {
      if (chunk.delta) text.push(chunk.delta);
      if (chunk.done) doneSeen = true;
    }

    expect(text.join('')).toBe('ab');
    expect(doneSeen).toBe(true);
  });

  it('returns error chunk when custom openai-sse emits error payload', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      createStreamResponse([
        'data: {"error":{"message":"bad gateway"}}\n\n',
      ]),
    );

    const provider = new CustomHttpProvider({
      endpointUrl: 'https://gateway.example.com/chat',
      model: 'model-x',
      apiKey: 'sk-test',
      authHeaderName: 'Authorization',
      authScheme: 'bearer',
      responseFormat: 'openai-sse',
    });

    const chunks = [] as Array<{ error?: string; done?: boolean }>;
    for await (const chunk of provider.chat([{ role: 'user', content: 'ping' }])) {
      chunks.push(chunk);
    }

    expect(chunks[0]?.error).toBe('bad gateway');
    expect(chunks[0]?.done).toBe(true);
  });
});
