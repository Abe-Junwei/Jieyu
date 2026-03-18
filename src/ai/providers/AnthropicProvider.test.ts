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
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
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

    expect(all[0]?.error).toBe('invalid auth');
    expect(all[0]?.done).toBe(true);
  });
});
