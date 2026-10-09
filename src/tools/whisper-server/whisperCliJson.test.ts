/**
 * whisper-server JSON 输出（S-2）：参数、真实 whisper-cli 输出解析、时间戳与兼容字段
 * whisper-server JSON output (S-2): args, parsing real whisper-cli output, timestamps, back-compat fields.
 */
import { spawn } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  tryParseVerboseResponse,
  computeWhisperConfidence,
} from '../../services/stt/sttConfidence';
import {
  buildTranscriptionResponse,
  buildWhisperCliArgs,
  parseWhisperCliJson,
} from './whisperCliJson.js';

const HERE = path.dirname(new URL(import.meta.url).pathname);
// whisper.cpp v1.9.5 `whisper-cli -m ggml-tiny.bin -l auto -f samples/jfk.wav -ojf -of out -np` 的原样输出
// Verbatim output of whisper.cpp v1.9.5 `whisper-cli ... -ojf` on samples/jfk.wav
const REAL_FIXTURE = readFileSync(
  path.join(HERE, '__fixtures__/whisper-cli-1.9.5-jfk.ojf.json'),
  'utf8',
);

describe('buildWhisperCliArgs', () => {
  it('JSON 输出 + 只传一次语言 | JSON output and the language passed exactly once', () => {
    const args = buildWhisperCliArgs({
      model: '/m.bin',
      language: 'zh',
      audioPath: '/a.wav',
      outputBase: '/tmp/out',
      threads: 4,
    });
    expect(args).toEqual([
      '-m',
      '/m.bin',
      '-l',
      'zh',
      '-f',
      '/a.wav',
      '-ojf',
      '-of',
      '/tmp/out',
      '-np',
      '-t',
      '4',
    ]);
    expect(args.filter((a) => a === '-l' || a === '--language')).toHaveLength(1);
    expect(args).not.toContain('-otxt');
    expect(
      buildWhisperCliArgs({
        model: 'm',
        language: '',
        audioPath: 'a',
        outputBase: 'o',
        threads: 1,
      }),
    ).toContain('auto');
  });
});

describe('buildTranscriptionResponse (real whisper-cli 1.9.5 output)', () => {
  const response = buildTranscriptionResponse(parseWhisperCliJson(REAL_FIXTURE), 'auto');

  it('保留 text + language 兼容字段 | keeps text + language for backward compatibility', () => {
    expect(response.text).toBe(
      'And so, my fellow Americans, ask not what your country can do for you, ask what you can do for your country.',
    );
    expect(response.language).toBe('en'); // whisper.cpp 检出语言 | detected by whisper.cpp
  });

  it('返回语段级时间戳（秒）| returns segment timestamps in seconds', () => {
    expect(response.segments).toHaveLength(1);
    expect(response.segments[0]).toMatchObject({ id: 0, start: 0, end: 10.5 });
    expect(response.segments[0]!.avg_logprob).toBeLessThan(0);
    expect(response.duration).toBe(10.5);
  });

  it('返回词级时间戳，过滤特殊 token | returns word timestamps without special tokens', () => {
    const words = response.segments[0]!.words;
    expect(words.map((w) => w.word).join(' ')).toBe(
      'And so, my fellow Americans, ask not what your country can do for you, ask what you can do for your country.',
    );
    expect(words.some((w) => w.word.startsWith('[_'))).toBe(false);
    expect(words[0]).toMatchObject({ word: 'And', start: 0.32, end: 0.32 });
    expect(words[1]).toMatchObject({ word: 'so,', start: 0.33, end: 0.74 });
    for (let i = 1; i < words.length; i += 1) {
      expect(words[i]!.start).toBeGreaterThanOrEqual(words[i - 1]!.start);
      expect(words[i]!.end).toBeGreaterThanOrEqual(words[i]!.start);
    }
    expect(response.words).toEqual(words);
  });

  it('客户端 verbose 解析能拿到 segments 与真实置信度 | client verbose parser gets segments and a real confidence', () => {
    const verbose = tryParseVerboseResponse(response as unknown as Record<string, unknown>);
    expect(verbose?.segments).toHaveLength(1);
    const confidence = computeWhisperConfidence(verbose!);
    expect(confidence).toBeGreaterThan(0);
    expect(confidence).toBeLessThan(1);
  });
});

describe('CJK tokens and robustness', () => {
  const cliJson = {
    result: { language: 'zh' },
    transcription: [
      {
        offsets: { from: 0, to: 1200 },
        text: '你好，世界。',
        tokens: [
          { text: '[_BEG_]', offsets: { from: 0, to: 0 }, id: 50364, p: 0.9, t_dtw: -1 },
          { text: '你', offsets: { from: 100, to: 300 }, id: 1, p: 0.9, t_dtw: -1 },
          { text: '好', offsets: { from: 300, to: 500 }, id: 2, p: 0.8, t_dtw: -1 },
          { text: '，', offsets: { from: 500, to: 550 }, id: 3, p: 0.7, t_dtw: -1 },
          { text: '世界', offsets: { from: 600, to: 1000 }, id: 4, p: 0.95, t_dtw: -1 },
          { text: '。', offsets: { from: 1000, to: 1100 }, id: 5, p: 0.9, t_dtw: -1 },
          { text: '[_TT_60]', offsets: { from: 1200, to: 1200 }, id: 50424, p: 0.5, t_dtw: -1 },
        ],
      },
    ],
  };

  it('CJK 按字/词元切分，标点并入前词 | CJK split per token, punctuation attached', () => {
    const response = buildTranscriptionResponse(cliJson, 'zh');
    expect(response.text).toBe('你好，世界。');
    expect(response.segments[0]!.words.map((w) => [w.word, w.start, w.end])).toEqual([
      ['你', 0.1, 0.3],
      ['好，', 0.3, 0.55],
      ['世界。', 0.6, 1.1],
    ]);
  });

  it('未检出语言时回退到请求语言；auto 回退 null | language falls back to request, auto -> null', () => {
    expect(buildTranscriptionResponse({ transcription: [] }, 'fr').language).toBe('fr');
    expect(buildTranscriptionResponse({ transcription: [] }, 'auto')).toEqual({
      text: '',
      language: null,
      duration: 0,
      segments: [],
      words: [],
    });
  });

  it('容忍字符串中的原始控制字符 | tolerates raw control characters inside strings', () => {
    const raw =
      '{"result":{"language":"en"},"transcription":[{"offsets":{"from":0,"to":10},"text":"a\tb","tokens":[]}]}';
    const parsed = parseWhisperCliJson(raw) as { transcription: Array<{ text: string }> };
    expect(parsed.transcription[0]!.text).toBe('a\tb');
  });
});

describe('server.js end to end with a stub whisper-cli', () => {
  it('POST /v1/audio/transcriptions 返回 segments，且只传一次语言 | returns segments and passes the language once', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'whisper-server-test-'));
    const argsLog = path.join(dir, 'args.json');
    const fixturePath = path.join(HERE, '__fixtures__/whisper-cli-1.9.5-jfk.ojf.json');
    const fakeCli = path.join(dir, 'whisper-cli');
    writeFileSync(
      fakeCli,
      `#!/usr/bin/env node
const fs = require('fs');
const args = process.argv.slice(2);
fs.writeFileSync(${JSON.stringify(argsLog)}, JSON.stringify(args));
const of = args[args.indexOf('-of') + 1];
fs.copyFileSync(${JSON.stringify(fixturePath)}, of + '.json');
`,
    );
    const fakeFfmpeg = path.join(dir, 'ffmpeg');
    writeFileSync(
      fakeFfmpeg,
      `#!/usr/bin/env node
const fs = require('fs'); const a = process.argv.slice(2);
fs.copyFileSync(a[a.indexOf('-i') + 1], a[a.length - 1]);
`,
    );
    chmodSync(fakeCli, 0o755);
    chmodSync(fakeFfmpeg, 0o755);
    const model = path.join(dir, 'ggml-test.bin');
    writeFileSync(model, 'x');
    const port = 31000 + Math.floor(Math.random() * 2000);

    const proc = spawn(
      process.execPath,
      [path.join(HERE, 'server.js'), `--port=${port}`, `--whisper-cli=${fakeCli}`],
      {
        env: { ...process.env, WHISPER_MODEL: model, FFMPEG_PATH: fakeFfmpeg },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    try {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('server did not start')), 10_000);
        proc.stdout!.on('data', (d: Buffer) => {
          if (d.toString().includes('listening')) {
            clearTimeout(timer);
            resolve();
          }
        });
        proc.on('exit', (code) => {
          clearTimeout(timer);
          reject(new Error(`server exited ${code}`));
        });
      });
      const form = new FormData();
      form.append(
        'file',
        new Blob([new Uint8Array([1, 2, 3])], { type: 'audio/webm' }),
        'recording.webm',
      );
      form.append('model', 'ggml-test.bin');
      form.append('language', 'en');
      form.append('response_format', 'verbose_json');
      const res = await fetch(`http://127.0.0.1:${port}/v1/audio/transcriptions`, {
        method: 'POST',
        body: form,
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        text: string;
        language: string;
        segments: Array<{ start: number; end: number; words: unknown[] }>;
      };
      expect(body.text).toMatch(/^And so, my fellow Americans/);
      expect(body.language).toBe('en');
      expect(body.segments[0]).toMatchObject({ start: 0, end: 10.5 });
      expect(body.segments[0]!.words.length).toBeGreaterThan(10);

      const args = JSON.parse(readFileSync(argsLog, 'utf8')) as string[];
      expect(args.filter((a) => a === '-l' || a === '--language')).toHaveLength(1);
      expect(args[args.indexOf('-l') + 1]).toBe('en');
      expect(args).toContain('-ojf');
    } finally {
      proc.kill('SIGTERM');
    }
  }, 20_000);
});
