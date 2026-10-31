import { expect, it } from 'vitest';
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

it('keeps the standalone OpenAI endpoint while exposing v1 health and rejects browser cross-origin writes', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'jieyu-whisper-compat-'));
  const model = join(dir, 'model.bin'),
    cli = join(dir, 'cli'),
    ffmpeg = join(dir, 'ffmpeg');
  writeFileSync(model, 'synthetic weights');
  writeFileSync(
    cli,
    `#!${process.execPath}\nconst fs=require('fs'),a=process.argv;fs.writeFileSync(a[a.indexOf('-of')+1]+'.json',JSON.stringify({result:{language:'en'},transcription:[{offsets:{from:0,to:1000},text:'compatible'}]}));`,
    { mode: 0o700 },
  );
  writeFileSync(
    ffmpeg,
    `#!${process.execPath}\nconst fs=require('fs'),a=process.argv;fs.copyFileSync(a[a.indexOf('-i')+1],a[a.length-1]);`,
    { mode: 0o700 },
  );
  const proc = spawn(
    process.execPath,
    [resolve('src/tools/whisper-server/server.js'), '--port=0'],
    {
      env: { ...process.env, WHISPER_MODEL: model, WHISPER_CLI: cli, FFMPEG_PATH: ffmpeg },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  const closed = new Promise<void>((resolve) => proc.once('close', () => resolve()));
  try {
    const url = await new Promise<string>((resolve, reject) => {
      let output = '';
      const timer = setTimeout(() => reject(new Error('server startup timed out')), 5000);
      proc.once('error', reject);
      proc.once('close', () => {
        clearTimeout(timer);
        reject(new Error('server exited'));
      });
      proc.stdout.on('data', (data) => {
        output += data.toString();
        const match = output.match(/listening on (http:\/\/127\.0\.0\.1:\d+)/);
        if (match) {
          clearTimeout(timer);
          resolve(match[1]!);
        }
      });
    });
    expect(await (await fetch(url + '/health')).json()).toMatchObject({ jieyu: '1', status: 'ok' });
    expect(await (await fetch(url + '/v1/models')).json()).toMatchObject({ object: 'list' });
    const result = await fetch(url + '/v1/audio/transcriptions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ file: Buffer.from('synthetic audio').toString('base64') }),
    });
    expect(result.status).toBe(200);
    expect(await result.json()).toMatchObject({
      text: 'compatible',
      segments: [{ start: 0, end: 1 }],
    });
    const forbidden = await fetch(url + '/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Origin: 'https://evil.example' },
    });
    expect(forbidden.status).toBe(403);
    expect(forbidden.headers.get('access-control-allow-origin')).toBeNull();
    expect(
      (
        await fetch(url + '/v1/audio/transcriptions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ file: 'YQ==', model: '../other.bin' }),
        })
      ).status,
    ).toBe(400);
  } finally {
    proc.kill('SIGKILL');
    await closed;
    rmSync(dir, { recursive: true, force: true });
  }
});
