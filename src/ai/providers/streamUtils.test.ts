import { describe, expect, it } from 'vitest';
import { iterateSseData } from './streamUtils';

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
  return new Response(stream);
}

describe('iterateSseData', () => {
  it('merges multi-line data fields into one SSE payload', async () => {
    const response = createSseResponse([
      'data: {"a": 1,\n',
      'data: "b": 2}\n\n',
    ]);

    const payloads: string[] = [];
    for await (const payload of iterateSseData(response)) {
      payloads.push(payload);
    }

    expect(payloads).toEqual(['{"a": 1,\n"b": 2}']);
  });

  it('flushes tail payload when stream ends without blank separator', async () => {
    const response = createSseResponse(['data: tail-only']);

    const payloads: string[] = [];
    for await (const payload of iterateSseData(response)) {
      payloads.push(payload);
    }

    expect(payloads).toEqual(['tail-only']);
  });

  it('ignores non-data lines and comments', async () => {
    const response = createSseResponse([
      ': keepalive\n',
      'event: message\n',
      'data: hello\n\n',
    ]);

    const payloads: string[] = [];
    for await (const payload of iterateSseData(response)) {
      payloads.push(payload);
    }

    expect(payloads).toEqual(['hello']);
  });
});
