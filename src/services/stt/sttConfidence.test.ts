/**
 * sttConfidence.test
 * STT 置信度计算工具单元测试 | Unit tests for STT confidence utilities.
 */

import { describe, it, expect } from 'vitest';
import { logprobToConfidence, computeWhisperConfidence, tryParseVerboseResponse } from './sttConfidence';
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
        { start: 0, end: 1, text: 'hello', avg_logprob: -0.1 },   // conf ~0.905, dur 1
        { start: 1, end: 4, text: 'world', avg_logprob: -0.5 },   // conf ~0.607, dur 3
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
    expect(tryParseVerboseResponse({
      text: 'hello',
      segments: [{ start: 0, end: 1, text: 'hello' }],
    })).toBeNull();
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
