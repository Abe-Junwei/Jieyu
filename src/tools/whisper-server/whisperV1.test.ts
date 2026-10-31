import { afterEach, expect, it, vi } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { request, type Server } from 'node:http';
import { createWhisperServer } from './whisperV1.js';

const servers: Server[] = [];
const dirs: string[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  for (const server of servers.splice(0)) {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
      server.closeAllConnections();
    });
  }
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});
function wav() {
  const bytes = Buffer.alloc(44 + 32000);
  bytes.write('RIFF');
  bytes.writeUInt32LE(bytes.length - 8, 4);
  bytes.write('WAVEfmt ', 8);
  bytes.writeUInt32LE(16, 16);
  bytes.writeUInt16LE(1, 20);
  bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(16000, 24);
  bytes.writeUInt32LE(32000, 28);
  bytes.writeUInt16LE(2, 32);
  bytes.writeUInt16LE(16, 34);
  bytes.write('data', 36);
  bytes.writeUInt32LE(32000, 40);
  return bytes;
}
async function fixture(hold = false, fail = false) {
  const dir = mkdtempSync(join(tmpdir(), 'jieyu-whisper-v1-test-'));
  dirs.push(dir);
  const trace = join(dir, 'trace.json');
  const cli = join(dir, 'cli');
  writeFileSync(
    cli,
    `#!${process.execPath}\nconst fs=require('fs');const a=process.argv;const output=a[a.indexOf('-of')+1];fs.writeFileSync(${JSON.stringify(trace)},JSON.stringify({pid:process.pid,audio:a[a.indexOf('-f')+1],output}));${fail ? 'process.stderr.write("private path and transcript");process.exit(7);' : hold ? "process.on('SIGTERM',()=>{});setInterval(()=>{},1000);" : "fs.writeFileSync(output+'.json', JSON.stringify({result:{language:'en'},transcription:[{offsets:{from:0,to:1000},text:'synthetic speech'}]}));"}`,
    { mode: 0o700 },
  );
  const server = createWhisperServer({
    model: join(dir, 'model.bin'),
    whisperCli: cli,
    modelId: 'app.jieyu.whisper.test',
    modelVersion: '1',
    maxAudioSec: 30,
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('port');
  return { url: `http://127.0.0.1:${address.port}`, trace };
}
function form() {
  const form = new FormData();
  form.set(
    'request',
    JSON.stringify({
      jieyu: '1',
      requestId: 'test',
      capability: 'transcribe',
      range: { start: 5, end: 6 },
    }),
  );
  form.set('audio', new Blob([wav()]), 'audio.wav');
  return form;
}
it('uses real multipart and a CLI child, preserves upload bytes, shifts times, and cleans private files', async () => {
  const f = await fixture();
  expect(await (await fetch(f.url + '/health')).json()).toMatchObject({
    jieyu: '1',
    status: 'ok',
    model: { id: 'app.jieyu.whisper.test' },
  });
  const response = await fetch(f.url + '/transcribe', { method: 'POST', body: form() });
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({
    requestId: 'test',
    status: 'ok',
    result: { segments: [{ start: 5, end: 6, text: 'synthetic speech' }] },
  });
  const trace = JSON.parse(readFileSync(f.trace, 'utf8'));
  await expect
    .poll(() => existsSync(dirname(trace.audio)) || existsSync(dirname(trace.output)))
    .toBe(false);
});
it('rejects remote origins, malformed Host, bad audio and wrong range without launching a CLI', async () => {
  const f = await fixture();
  for (const headers of [{ Origin: 'https://evil.example' }, { Origin: 'null' }]) {
    expect(
      (await fetch(f.url + '/transcribe', { method: 'POST', headers, body: form() })).status,
    ).toBe(403);
  }
  for (const host of ['evil@localhost', 'example.org']) {
    const status = await new Promise<number | undefined>((resolve, reject) => {
      const req = request(f.url + '/health', { headers: { Host: host } }, (res) => {
        res.resume();
        resolve(res.statusCode);
      });
      req.on('error', reject);
      req.end();
    });
    expect(status).toBe(403);
  }
  const body = form();
  body.set('audio', new Blob(['bad']), 'audio.wav');
  expect((await fetch(f.url + '/transcribe', { method: 'POST', body })).status).toBe(422);
  expect(existsSync(f.trace)).toBe(false);
});
it('disconnecting after upload kills the child and cleans temporary input and output', async () => {
  const f = await fixture(true);
  const abort = new AbortController();
  const pending = fetch(f.url + '/transcribe', {
    method: 'POST',
    body: form(),
    signal: abort.signal,
  });
  const rejected = expect(pending).rejects.toThrow();
  await expect.poll(() => existsSync(f.trace)).toBe(true);
  const trace = JSON.parse(readFileSync(f.trace, 'utf8'));
  abort.abort();
  await rejected;
  await expect
    .poll(
      () => {
        try {
          process.kill(trace.pid, 0);
          return true;
        } catch {
          return false;
        }
      },
      { timeout: 5000 },
    )
    .toBe(false);
  await expect
    .poll(() => existsSync(dirname(trace.audio)) || existsSync(dirname(trace.output)))
    .toBe(false);
});

it('maps CLI failure to a generic error and still removes input and output', async () => {
  const f = await fixture(false, true);
  const response = await fetch(f.url + '/transcribe', { method: 'POST', body: form() });
  expect(response.status).toBe(500);
  expect(await response.json()).toEqual({
    jieyu: '1',
    requestId: 'test',
    status: 'error',
    error: { code: 'internal', message: 'internal' },
  });
  const trace = JSON.parse(readFileSync(f.trace, 'utf8'));
  await expect
    .poll(() => existsSync(dirname(trace.audio)) || existsSync(dirname(trace.output)))
    .toBe(false);
});

it('times out a hung CLI, kills it and records timeout separately from cancellation', async () => {
  const f = await fixture(true);
  const nativeTimeout = globalThis.setTimeout;
  let timeout!: () => void;
  vi.spyOn(globalThis, 'setTimeout').mockImplementation((callback, ms, ...args) => {
    if (ms === 120_000) {
      timeout = () => callback(...args);
      return nativeTimeout(() => {}, ms);
    }
    return nativeTimeout(callback, ms, ...args);
  });
  const pending = fetch(f.url + '/transcribe', { method: 'POST', body: form() });
  await expect.poll(() => existsSync(f.trace)).toBe(true);
  timeout();
  const response = await pending;
  expect(response.status).toBe(504);
  expect(await response.json()).toMatchObject({ status: 'error', error: { code: 'timeout' } });
  const trace = JSON.parse(readFileSync(f.trace, 'utf8'));
  expect(() => process.kill(trace.pid, 0)).toThrow();
  await expect
    .poll(() => existsSync(dirname(trace.audio)) || existsSync(dirname(trace.output)))
    .toBe(false);
});
