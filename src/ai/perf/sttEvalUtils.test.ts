import { describe, it, expect } from 'vitest';
import {
  editDistance,
  normalizeForEval,
  wer,
  cer,
  evaluateSttSample,
  runSttEvalReport,
  type SttEvalSample,
} from './sttEvalUtils';

// ── editDistance | 编辑距离 ────────────────────────────────────────────────

describe('editDistance', () => {
  it('identical arrays → 0', () => {
    expect(editDistance(['a', 'b'], ['a', 'b'])).toBe(0);
  });

  it('insertion', () => {
    expect(editDistance(['a'], ['a', 'b'])).toBe(1);
  });

  it('deletion', () => {
    expect(editDistance(['a', 'b'], ['a'])).toBe(1);
  });

  it('substitution', () => {
    expect(editDistance(['a'], ['b'])).toBe(1);
  });

  it('empty ref → hyp length', () => {
    expect(editDistance([], ['x', 'y'])).toBe(2);
  });

  it('empty hyp → ref length', () => {
    expect(editDistance(['x', 'y'], [])).toBe(2);
  });

  it('both empty → 0', () => {
    expect(editDistance([], [])).toBe(0);
  });
});

// ── normalizeForEval | 归一化 ─────────────────────────────────────────────

describe('normalizeForEval', () => {
  it('lowercases and strips punctuation', () => {
    expect(normalizeForEval('Hello, World!')).toBe('hello world');
  });

  it('collapses whitespace', () => {
    expect(normalizeForEval('a   b\tc')).toBe('a b c');
  });

  it('preserves CJK characters', () => {
    expect(normalizeForEval('你好，世界！')).toBe('你好 世界');
  });

  it('empty string → empty string', () => {
    expect(normalizeForEval('')).toBe('');
  });
});

// ── WER ───────────────────────────────────────────────────────────────────

describe('wer', () => {
  it('identical → 0', () => {
    expect(wer('hello world', 'hello world')).toBe(0);
  });

  it('one substitution in three words → 1/3', () => {
    expect(wer('the cat sat', 'the dog sat')).toBeCloseTo(1 / 3);
  });

  it('completely wrong → 1', () => {
    expect(wer('abc', 'xyz')).toBe(1);
  });

  it('empty ref + non-empty hyp → 1', () => {
    expect(wer('', 'hello')).toBe(1);
  });

  it('both empty → 0', () => {
    expect(wer('', '')).toBe(0);
  });

  it('ignores case and punctuation', () => {
    expect(wer('Hello, World!', 'hello world')).toBe(0);
  });
});

// ── CER ───────────────────────────────────────────────────────────────────

describe('cer', () => {
  it('identical → 0', () => {
    expect(cer('abc', 'abc')).toBe(0);
  });

  it('one char substitution in 4 chars → 0.25', () => {
    expect(cer('abcd', 'abxd')).toBeCloseTo(0.25);
  });

  it('CJK text: one char wrong', () => {
    // 你好世界 → 你好地界: 1 substitution / 4 chars = 0.25
    expect(cer('你好世界', '你好地界')).toBeCloseTo(0.25);
  });

  it('empty ref + non-empty hyp → 1', () => {
    expect(cer('', 'a')).toBe(1);
  });

  it('both empty → 0', () => {
    expect(cer('', '')).toBe(0);
  });
});

// ── evaluateSttSample | 单条评测 ──────────────────────────────────────────

describe('evaluateSttSample', () => {
  it('returns correct metrics and preserves tag', () => {
    const sample: SttEvalSample = {
      reference: 'the cat sat',
      hypothesis: 'the dog sat',
      tag: 'en',
    };
    const result = evaluateSttSample(sample);
    expect(result.wer).toBeCloseTo(1 / 3);
    expect(result.cer).toBeGreaterThan(0);
    expect(result.refWordCount).toBe(3);
    expect(result.tag).toBe('en');
  });

  it('omits tag when undefined', () => {
    const result = evaluateSttSample({ reference: 'a', hypothesis: 'a' });
    expect(result).not.toHaveProperty('tag');
  });
});

// ── runSttEvalReport | 批量评测 ───────────────────────────────────────────

describe('runSttEvalReport', () => {
  it('empty corpus → zeroed report', () => {
    const report = runSttEvalReport([]);
    expect(report.sampleCount).toBe(0);
    expect(report.meanWer).toBe(0);
    expect(report.sentenceAccuracy).toBe(0);
  });

  it('perfect match → 0 WER/CER, 100% accuracy', () => {
    const report = runSttEvalReport([
      { reference: 'hello world', hypothesis: 'HELLO, WORLD!' },
      { reference: 'foo bar', hypothesis: 'foo bar' },
    ]);
    expect(report.sampleCount).toBe(2);
    expect(report.meanWer).toBe(0);
    expect(report.meanCer).toBe(0);
    expect(report.sentenceAccuracy).toBe(1);
  });

  it('per-tag WER is computed correctly', () => {
    const report = runSttEvalReport([
      { reference: 'a b', hypothesis: 'a b', tag: 'en' },
      { reference: 'a b', hypothesis: 'x y', tag: 'en' },
      { reference: '你 好', hypothesis: '你 好', tag: 'zh' },
    ]);
    // en: (0 + 1) / 2 = 0.5
    expect(report.perTagWer['en']).toBeCloseTo(0.5);
    // zh: 0/1 = 0
    expect(report.perTagWer['zh']).toBe(0);
  });

  it('weighted WER favours longer samples', () => {
    const report = runSttEvalReport([
      // 短句 1 词，WER=1 | short sentence, 1 word, WER=1
      { reference: 'a', hypothesis: 'b' },
      // 长句 10 词，WER=0 | long sentence, 10 words, WER=0
      { reference: 'one two three four five six seven eight nine ten', hypothesis: 'one two three four five six seven eight nine ten' },
    ]);
    // 宏平均 = (1+0)/2 = 0.5 | macro = 0.5
    expect(report.meanWer).toBeCloseTo(0.5);
    // 微平均 = 1*1 / (1+10) ≈ 0.09 | micro: closer to 0
    expect(report.weightedWer).toBeLessThan(0.15);
  });
});
