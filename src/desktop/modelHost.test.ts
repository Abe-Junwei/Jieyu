import { createServer, type Server } from 'node:http';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  assertLoopbackUrl,
  cancelModelTranscribe,
  parseTranscribeBody,
  planAudioChunks,
  runModelTranscribe,
} from './modelHost';

const roots: string[] = [];
const servers: Server[] = [];

afterEach(async () => {
  for (const server of servers) {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
  servers.length = 0;
  for (const root of roots) rmSync(root, { recursive: true, force: true });
  roots.length = 0;
});

function declaration(baseUrl: string, extra: Record<string, unknown> = {}): string {
  const dir = mkdtempSync(join(tmpdir(), 'jieyu-model-host-'));
  roots.push(dir);
  const file = join(dir, 'jieyu-model.json');
  writeFileSync(
    file,
    JSON.stringify({
      id: 'org.example.nxq-asr',
      name: 'sample',
      version: '3.0.1',
      minJieyuProtocol: '1',
      license: 'CC-BY-NC-4.0',
      capabilities: { transcribe: { wordTimestamps: true, maxAudioSec: 2 } },
      audio: { accept: [{ format: 'wav-pcm16', sampleRate: 16000, channels: 1 }] },
      transport: { kind: 'http', baseUrl, timeoutSecPerChunk: 2 },
      ...extra,
    }),
  );
  return file;
}

function listen(
  handler: (
    request: import('node:http').IncomingMessage,
    response: import('node:http').ServerResponse,
  ) => void,
): Promise<string> {
  const server = createServer(handler);
  servers.push(server);
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (address === null || typeof address === 'string') throw new Error('missing port');
      resolve(`http://127.0.0.1:${address.port}`);
    });
  });
}

const call = (file: string, requestId = 'req-1') => ({
  declarationPath: file,
  audio: Buffer.from('RIFF'),
  format: 'wav-pcm16',
  sampleRate: 16000,
  channels: 1,
  range: { start: 1, end: 2 },
  requestId,
});

describe('model host', () => {
  it('exposes transcribe and cancel through the desktop ipc', () => {
    const preload = readFileSync(join(process.cwd(), 'electron/preload.ts'), 'utf8');
    const main = readFileSync(join(process.cwd(), 'electron/main.ts'), 'utf8');
    expect(preload.includes("invoke('model:transcribe'")).toBe(true);
    expect(preload.includes("invoke('model:cancel'")).toBe(true);
    expect(main.includes("handle('model:transcribe'")).toBe(true);
    expect(main.includes("handle('model:cancel'")).toBe(true);
  });

  it('splits a long range without overlap and refuses a remote address', async () => {
    expect(planAudioChunks(0, 5, 2)).toEqual([
      { start: 0, end: 2 },
      { start: 2, end: 4 },
      { start: 4, end: 5 },
    ]);
    await expect(assertLoopbackUrl('http://1.2.3.4:9')).rejects.toThrow('model address is remote');
  });

  it('keeps a mock transcription whose times sit inside the requested range', async () => {
    let authorization = '';
    const base = await listen((request, response) => {
      if (request.url === '/health') {
        response.end(
          JSON.stringify({
            jieyu: '1',
            status: 'ok',
            model: { id: 'org.example.nxq-asr', version: '3.0.1' },
          }),
        );
        return;
      }
      authorization = request.headers.authorization ?? '';
      response.end(
        JSON.stringify({
          jieyu: '1',
          requestId: 'req-1',
          status: 'ok',
          note: 'ignored',
          model: { id: 'org.example.nxq-asr', version: '3.0.1' },
          result: {
            segments: [
              { start: 1, end: 2, text: 'kept', words: [{ text: 'kept', start: 1, end: 1.4 }] },
            ],
          },
        }),
      );
    });
    const result = await runModelTranscribe({ ...call(declaration(base)), token: 'secret' });
    expect(authorization).toBe('Bearer secret');
    expect(result).toEqual({
      status: 'ok',
      warnings: ['license is non-commercial'],
      segments: [{ start: 1, end: 2, text: 'kept' }],
    });
  });

  it('drops a segment outside the range, an oversized body, and a mismatched request', async () => {
    expect(
      parseTranscribeBody(
        JSON.stringify({
          jieyu: '1',
          requestId: 'req-1',
          status: 'ok',
          model: { id: 'org.example.nxq-asr', version: '3.0.1' },
          result: { segments: [{ start: 0, end: 1, text: 'out' }] },
        }),
        {
          requestId: 'req-1',
          id: 'org.example.nxq-asr',
          version: '3.0.1',
          range: { start: 1, end: 2 },
        },
      ).code,
    ).toBe('bad_response');
    expect(
      parseTranscribeBody(
        JSON.stringify({
          jieyu: '1',
          requestId: 'req-1',
          status: 'ok',
          model: { id: 'org.example.nxq-asr', version: '3.0.1' },
          result: {
            segments: [
              { start: 1, end: 1.2, text: 'a' },
              { start: 1.2, end: 2, text: 'b' },
            ],
          },
        }),
        {
          requestId: 'req-1',
          id: 'org.example.nxq-asr',
          version: '3.0.1',
          range: { start: 1, end: 2 },
        },
        1,
      ).code,
    ).toBe('bad_response');

    const base = await listen((request, response) => {
      if (request.url === '/health') {
        response.end(
          JSON.stringify({
            jieyu: '1',
            status: 'ok',
            model: { id: 'org.example.nxq-asr', version: '3.0.1' },
          }),
        );
        return;
      }
      response.writeHead(200, { 'Content-Length': String(8 * 1024 * 1024 + 1) });
      response.end('{}');
    });
    const oversized = await runModelTranscribe(call(declaration(base)));
    expect(oversized.code).toBe('bad_response');
  });

  it('cancels a hanging mock and times out another', async () => {
    const hanging = await listen((request, response) => {
      if (request.url === '/health') {
        response.end(
          JSON.stringify({
            jieyu: '1',
            status: 'ok',
            model: { id: 'org.example.nxq-asr', version: '3.0.1' },
          }),
        );
        return;
      }
      request.on('aborted', () => response.end());
    });
    const pending = runModelTranscribe(call(declaration(hanging), 'cancel-me'));
    await new Promise((resolve) => setTimeout(resolve, 50));
    cancelModelTranscribe('cancel-me');
    await expect(pending).resolves.toMatchObject({ status: 'error', code: 'cancelled' });

    const slow = await listen((request, response) => {
      if (request.url === '/health') {
        response.end(
          JSON.stringify({
            jieyu: '1',
            status: 'ok',
            model: { id: 'org.example.nxq-asr', version: '3.0.1' },
          }),
        );
        return;
      }
      setTimeout(() => response.end('{}'), 5_000);
    });
    const file = declaration(slow, {
      transport: { kind: 'http', baseUrl: slow, timeoutSecPerChunk: 0.2 },
    });
    await expect(runModelTranscribe(call(file, 'slow'))).resolves.toMatchObject({
      status: 'error',
      code: 'timeout',
    });
  });
});
