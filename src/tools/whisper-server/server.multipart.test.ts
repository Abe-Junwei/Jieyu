/**
 * Multipart 文件体必须按字节保留。
 * File bytes in multipart/form-data must round-trip unchanged.
 *
 * parseMultipart used to trim CR/LF/SP/TAB on the whole part, so a synthetic
 * 44-byte header plus 32,000 samples of 0x09 (32,044 bytes) came back as 44.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const WAV_HEADER_BYTES = 44;
const SAMPLE_BYTES = 32_000;

function quotedSampleWav(): Buffer {
  const header = Buffer.alloc(WAV_HEADER_BYTES, 0x01);
  header.write('RIFF', 0, 'ascii');
  header.write('WAVE', 8, 'ascii');
  header.write('fmt ', 12, 'ascii');
  header.write('data', 36, 'ascii');
  const samples = Buffer.alloc(SAMPLE_BYTES, 0x09);
  header.writeUInt32LE(samples.length, 40);
  return Buffer.concat([header, samples]);
}

function textPart(name: string, value: string): { headers: string; body: Buffer } {
  return { headers: `Content-Disposition: form-data; name="${name}"`, body: Buffer.from(value) };
}

function filePart(filename: string, body: Buffer): { headers: string; body: Buffer } {
  return {
    headers:
      `Content-Disposition: form-data; name="file"; filename="${filename}"\r\n` +
      'Content-Type: application/octet-stream',
    body,
  };
}

function multipart(
  boundary: string,
  parts: Array<{ headers: string; body: Buffer }>,
  extras?: { loosePart?: string },
): Buffer {
  const chunks: Buffer[] = [Buffer.from('preamble\r\n')];
  if (extras?.loosePart !== undefined) {
    chunks.push(Buffer.from(`--${boundary}\r\n${extras.loosePart}`));
  }
  for (const part of parts) {
    chunks.push(Buffer.from(`--${boundary}\r\n${part.headers}\r\n\r\n`));
    chunks.push(part.body);
    chunks.push(Buffer.from('\r\n'));
  }
  chunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data\r\n\r\nnameless\r\n`));
  chunks.push(Buffer.from(`--${boundary}--\r\nepilogue\r\n`));
  return Buffer.concat(chunks);
}

describe('whisper-server multipart file bytes', () => {
  let url = '';
  let dir = '';
  let capture = '';
  let argsLog = '';
  let modelName = '';
  let proc: ChildProcess | undefined;
  let closed: Promise<void> = Promise.resolve();

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), 'jieyu-whisper-multipart-'));
    capture = join(dir, 'captured.bin');
    argsLog = join(dir, 'args.json');
    modelName = 'ggml-test.bin';
    const model = join(dir, modelName);
    const cli = join(dir, 'cli');
    const ffmpeg = join(dir, 'ffmpeg');
    writeFileSync(model, 'synthetic weights');
    writeFileSync(
      cli,
      `#!${process.execPath}\nconst fs=require('fs'),a=process.argv;fs.writeFileSync(${JSON.stringify(argsLog)},JSON.stringify(a));fs.writeFileSync(a[a.indexOf('-of')+1]+'.json',JSON.stringify({result:{language:'en'},transcription:[{offsets:{from:0,to:1000},text:'compatible'}]}));\n`,
      { mode: 0o700 },
    );
    writeFileSync(
      ffmpeg,
      `#!${process.execPath}\nconst fs=require('fs'),a=process.argv;const input=a[a.indexOf('-i')+1];fs.writeFileSync(${JSON.stringify(capture)},fs.readFileSync(input));fs.copyFileSync(input,a[a.length-1]);\n`,
      { mode: 0o700 },
    );
    proc = spawn(process.execPath, [resolve('src/tools/whisper-server/server.js'), '--port=0'], {
      env: { ...process.env, WHISPER_MODEL: model, WHISPER_CLI: cli, FFMPEG_PATH: ffmpeg },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    closed = new Promise((resolveClose) => proc?.once('close', () => resolveClose()));
    url = await new Promise<string>((resolveUrl, reject) => {
      let output = '';
      let err = '';
      const timer = setTimeout(
        () => reject(new Error(`server startup timed out\n${output}\n${err}`)),
        8000,
      );
      proc?.once('error', reject);
      proc?.once('close', () => {
        clearTimeout(timer);
        reject(new Error(`server exited\n${output}\n${err}`));
      });
      proc?.stderr?.on('data', (data: Buffer) => {
        err += data.toString();
      });
      proc?.stdout?.on('data', (data: Buffer) => {
        output += data.toString();
        const match = output.match(/listening on (http:\/\/127\.0\.0\.1:\d+)/);
        if (match?.[1]) {
          clearTimeout(timer);
          resolveUrl(match[1]);
        }
      });
    });
  }, 15_000);

  afterAll(async () => {
    proc?.kill('SIGKILL');
    if (proc) await closed;
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  function resetSideFiles(): void {
    rmSync(capture, { force: true });
    rmSync(argsLog, { force: true });
  }

  async function postMultipart(
    boundary: string,
    raw: Buffer,
  ): Promise<{ status: number; text: string }> {
    const result = await fetch(`${url}/v1/audio/transcriptions`, {
      method: 'POST',
      headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
      body: new Uint8Array(raw),
    });
    return { status: result.status, text: await result.text() };
  }

  function capturedAudio(): Buffer {
    return readFileSync(capture);
  }

  function languageArg(): string {
    const args = JSON.parse(readFileSync(argsLog, 'utf8')) as string[];
    return args[args.indexOf('-l') + 1] ?? '';
  }

  it('keeps a 32044-byte synthetic WAV whose samples are 0x09', async () => {
    resetSideFiles();
    const wav = quotedSampleWav();
    expect(wav.length).toBe(WAV_HEADER_BYTES + SAMPLE_BYTES);
    const boundary = '----JieyuBoundary574';
    const response = await postMultipart(
      boundary,
      multipart(boundary, [
        filePart('clip.wav', wav),
        textPart('model', modelName),
        textPart('language', 'zh'),
        textPart('response_format', 'verbose_json'),
      ]),
    );
    expect(response.status, response.text).toBe(200);
    const captured = capturedAudio();
    expect(captured.length).toBe(wav.length);
    expect(captured.subarray(-2).toString('hex')).toBe('0909');
    expect(captured.equals(wav)).toBe(true);
    expect(languageArg()).toBe('zh');
    expect(JSON.parse(response.text)).toMatchObject({ text: 'compatible' });
  });

  it('keeps spaces, tabs, CR, LF, NUL, and high bytes in the file body', async () => {
    resetSideFiles();
    const audio = Buffer.from([
      0x0d, 0x0a, 0x20, 0x09, 0x00, 0xff, 0xfe, 0x2d, 0x2d, 0x6e, 0x6f, 0x0d, 0x0a, 0x09, 0x09,
      0x20, 0x20, 0x0a, 0x0d, 0x00, 0x0d, 0x0a, 0x0d, 0x0a,
    ]);
    const boundary = 'jieyu.574+audio';
    const response = await postMultipart(
      boundary,
      multipart(
        boundary,
        [
          filePart('clip.bin', audio),
          textPart('language', '   '),
          textPart('model', 'whisper-local'),
        ],
        { loosePart: 'this part has no header separator' },
      ),
    );
    expect(response.status, response.text).toBe(200);
    const captured = capturedAudio();
    expect(captured.equals(audio)).toBe(true);
    expect(languageArg()).toBe('auto');
  });

  it('keeps a file body that is only CR, LF, space, and tab', async () => {
    resetSideFiles();
    const audio = Buffer.from([0x09, 0x20, 0x0d, 0x0a, 0x09, 0x09, 0x0d, 0x0a]);
    const boundary = 'whitespace-body';
    const response = await postMultipart(
      boundary,
      multipart(boundary, [filePart('blank.bin', audio)]),
    );
    expect(response.status, response.text).toBe(200);
    expect(capturedAudio().equals(audio)).toBe(true);
    expect(languageArg()).toBe('auto');
  });

  it('keeps FormData file bytes the local client posts', async () => {
    resetSideFiles();
    const audio = Buffer.from([0x00, 0x09, 0x0a, 0x0d, 0x20, 0xff, 0x09, 0x09, 0x0d, 0x0a]);
    const form = new FormData();
    form.append(
      'file',
      new Blob([new Uint8Array(audio)], { type: 'audio/webm' }),
      'recording.webm',
    );
    form.append('model', modelName);
    form.append('language', 'en');
    form.append('response_format', 'verbose_json');
    const result = await fetch(`${url}/v1/audio/transcriptions`, { method: 'POST', body: form });
    const text = await result.text();
    expect(result.status, text).toBe(200);
    expect(capturedAudio().equals(audio)).toBe(true);
    expect(languageArg()).toBe('en');
  });

  it('rejects an unknown model and a multipart body that never supplies a file', async () => {
    resetSideFiles();
    const boundary = 'malformed-574';
    const missing = await postMultipart(
      boundary,
      multipart(boundary, [textPart('language', 'en')], { loosePart: 'no file here' }),
    );
    expect(missing.status).toBe(400);
    expect(missing.text).toContain('No audio data provided');
    expect(() => capturedAudio()).toThrow();

    resetSideFiles();
    const wav = Buffer.from([0x01, 0x02, 0x03, 0x04]);
    const unknown = await postMultipart(
      boundary,
      multipart(boundary, [filePart('clip.wav', wav), textPart('model', '../other.bin')]),
    );
    expect(unknown.status).toBe(400);
    expect(unknown.text).toContain('Unknown model');
    expect(() => capturedAudio()).toThrow();

    resetSideFiles();
    const garbage = await postMultipart(boundary, Buffer.from('not a multipart body'));
    expect(garbage.status).toBe(400);
    expect(garbage.text).toContain('No audio data provided');
  });
});
