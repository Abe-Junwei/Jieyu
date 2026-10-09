/**
 * sttConfidence.test
 * STT 置信度计算工具单元测试 | Unit tests for STT confidence utilities.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, vi } from 'vitest';
import {
  logprobToConfidence,
  computeWhisperConfidence,
  tryParseVerboseResponse,
  whisperJsonToSttResult,
} from './sttConfidence';
import { LocalWhisperSttProvider } from './LocalWhisperSttProvider';
import type { WhisperVerboseResponse } from './sttConfidence';

// ── logprobToConfidence ─────────────────────────────────────────────────────

describe('logprobToConfidence', () => {
  it('converts 0 logprob to 1.0', () => {
    expect(logprobToConfidence(0)).toBe(1);
  });

  it('converts large negative logprob to near-zero', () => {
    expect(logprobToConfidence(-10)).toBeCloseTo(0.0000454, 5);
  });

  it('converts typical Whisper logprob (-0.3) to ~0.74', () => {
    expect(logprobToConfidence(-0.3)).toBeCloseTo(0.7408, 3);
  });

  it('clamps positive logprob to 1.0', () => {
    // 理论上不应出现正值，但防御性处理 | Should not happen, but handle defensively
    expect(logprobToConfidence(1)).toBe(1);
  });
});

// ── computeWhisperConfidence ────────────────────────────────────────────────

describe('computeWhisperConfidence', () => {
  it('returns fallback when no segments', () => {
    const resp: WhisperVerboseResponse = { text: 'hello' };
    expect(computeWhisperConfidence(resp)).toBe(1.0);
    expect(computeWhisperConfidence(resp, 0.5)).toBe(0.5);
  });

  it('returns fallback when segments array is empty', () => {
    const resp: WhisperVerboseResponse = { text: 'hello', segments: [] };
    expect(computeWhisperConfidence(resp)).toBe(1.0);
  });

  it('computes confidence from single segment', () => {
    const resp: WhisperVerboseResponse = {
      text: 'hello',
      segments: [{ start: 0, end: 2, text: 'hello', avg_logprob: -0.3 }],
    };
    expect(computeWhisperConfidence(resp)).toBeCloseTo(0.7408, 3);
  });

  it('duration-weights multiple segments', () => {
    const resp: WhisperVerboseResponse = {
      text: 'hello world',
      segments: [
        { start: 0, end: 1, text: 'hello', avg_logprob: -0.1 }, // conf ~0.905, dur 1
        { start: 1, end: 4, text: 'world', avg_logprob: -0.5 }, // conf ~0.607, dur 3
      ],
    };
    // expected: (1 * 0.905 + 3 * 0.607) / 4 ≈ 0.681
    expect(computeWhisperConfidence(resp)).toBeCloseTo(0.681, 2);
  });

  it('penalises high no_speech_prob', () => {
    const respNormal: WhisperVerboseResponse = {
      text: 'hello',
      segments: [{ start: 0, end: 2, text: 'hello', avg_logprob: -0.2, no_speech_prob: 0.0 }],
    };
    const respNoisy: WhisperVerboseResponse = {
      text: 'hello',
      segments: [{ start: 0, end: 2, text: 'hello', avg_logprob: -0.2, no_speech_prob: 0.8 }],
    };
    const normal = computeWhisperConfidence(respNormal);
    const noisy = computeWhisperConfidence(respNoisy);
    expect(noisy).toBeLessThan(normal);
    expect(noisy).toBeCloseTo(normal * 0.2, 3);
  });
});

// ── tryParseVerboseResponse ─────────────────────────────────────────────────

describe('tryParseVerboseResponse', () => {
  it('returns null for plain JSON response', () => {
    expect(tryParseVerboseResponse({ text: 'hello' })).toBeNull();
  });

  it('returns null when segments is empty array', () => {
    expect(tryParseVerboseResponse({ text: 'hello', segments: [] })).toBeNull();
  });

  it('returns null when first segment lacks avg_logprob', () => {
    expect(
      tryParseVerboseResponse({
        text: 'hello',
        segments: [{ start: 0, end: 1, text: 'hello' }],
      }),
    ).toBeNull();
  });

  it('parses valid verbose_json', () => {
    const raw = {
      text: 'hello world',
      language: 'en',
      duration: 5.0,
      segments: [
        { start: 0, end: 2.5, text: 'hello', avg_logprob: -0.2, no_speech_prob: 0.01 },
        { start: 2.5, end: 5.0, text: 'world', avg_logprob: -0.3 },
      ],
    };
    const result = tryParseVerboseResponse(raw);
    expect(result).not.toBeNull();
    expect(result!.text).toBe('hello world');
    expect(result!.language).toBe('en');
    expect(result!.segments).toHaveLength(2);
  });

  it('omits optional fields when missing', () => {
    const raw = {
      text: 'hello',
      segments: [{ start: 0, end: 1, text: 'hello', avg_logprob: -0.5 }],
    };
    const result = tryParseVerboseResponse(raw);
    expect(result).not.toBeNull();
    expect(result!.language).toBeUndefined();
    expect(result!.duration).toBeUndefined();
  });
});

describe('whisperJsonToSttResult (BF2-2, P6)', () => {
  // whisper.cpp 1.9.5 tiny + 真实 server.js 的中文响应 | Real zh response from server.js + whisper.cpp 1.9.5 tiny
  const body = readFileSync(
    fileURLToPath(
      new URL(
        '../../tools/whisper-server/__fixtures__/whisper-server-zh-tiny.resp.json',
        import.meta.url,
      ),
    ),
    'utf8',
  );
  const server = JSON.parse(body) as {
    language: string;
    words: Array<{ word: string; start: number; end: number; probability: number }>;
  };

  it('服务端词级时间戳映射到 wordTimings，语言取检出值 | maps server words to wordTimings and keeps the detected language', () => {
    const blob = new Blob(['a']);
    const result = whisperJsonToSttResult(
      JSON.parse(body) as Record<string, unknown>,
      'unknown',
      blob,
    );
    expect(result.lang).toBe(server.language);
    expect(result.confidence).toBeLessThan(1);
    expect(result.wordTimings).toHaveLength(server.words.length);
    expect(result.wordTimings?.[0]).toEqual({
      word: server.words[0]!.word,
      start: server.words[0]!.start,
      end: server.words[0]!.end,
      confidence: server.words[0]!.probability,
    });
    expect(result.audioBlob).toBe(blob);
  });

  it('没有 words/segments 时退回旧行为 | plain {text} responses keep the old shape', () => {
    const result = whisperJsonToSttResult({ text: 'ok' }, 'en', new Blob(['a']));
    expect(result).toMatchObject({
      text: 'ok',
      lang: 'en',
      confidence: 1,
      engine: 'whisper-local',
    });
    expect(result.wordTimings).toBeUndefined();
  });

  it('LocalWhisperSttProvider 返回 wordTimings | LocalWhisperSttProvider returns wordTimings', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(body, { status: 200 })),
    );
    try {
      const result = await new LocalWhisperSttProvider().transcribe(
        new Blob([new Uint8Array(8)]),
        'zh-CN',
      );
      expect(result.wordTimings).toHaveLength(server.words.length);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
