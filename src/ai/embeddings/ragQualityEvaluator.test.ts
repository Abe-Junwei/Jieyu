import { describe, expect, it } from 'vitest';
import { evaluateRagQuality } from './ragQualityEvaluator';

describe('evaluateRagQuality', () => {
  // ---- CORRECT 分支 | CORRECT branch ----
  it('returns correct when top score >= 0.55 and gap >= 0.1', () => {
    const matches = [{ score: 0.82 }, { score: 0.60 }];
    const result = evaluateRagQuality(matches, '这段语料如何标注');
    expect(result.verdict).toBe('correct');
    expect(result.maxScore).toBeCloseTo(0.82);
    expect(result.scoreGap).toBeCloseTo(0.22);
    expect(result.refinedQuery).toBeUndefined();
  });

  it('returns correct when only one match with score >= 0.55', () => {
    // secondScore = 0, gap = maxScore
    const result = evaluateRagQuality([{ score: 0.65 }], 'query');
    expect(result.verdict).toBe('correct');
    expect(result.scoreGap).toBeCloseTo(0.65);
  });

  // ---- AMBIGUOUS 分支 | AMBIGUOUS branch ----
  it('returns ambiguous when score is sufficient but gap < 0.1', () => {
    const matches = [{ score: 0.58 }, { score: 0.54 }];
    const result = evaluateRagQuality(matches, '音位转写标注规则');
    expect(result.verdict).toBe('ambiguous');
    expect(result.refinedQuery).toBeDefined();
    expect(result.refinedQuery!.length).toBeGreaterThan(0);
  });

  it('returns ambiguous when max score is 0.45 (between 0.35 and 0.55)', () => {
    const matches = [{ score: 0.45 }, { score: 0.30 }];
    const result = evaluateRagQuality(matches, '田野调查音频样本');
    expect(result.verdict).toBe('ambiguous');
    expect(result.refinedQuery).toBeDefined();
  });

  it('refined query drops stopwords and deduplicates', () => {
    const result = evaluateRagQuality(
      [{ score: 0.45 }],
      '这是 一个 关于 音位 和 正字法 的 问题',
    );
    expect(result.verdict).toBe('ambiguous');
    // 停用词"这是的和"应被过滤 | stopwords should be filtered
    expect(result.refinedQuery).not.toContain('是');
    expect(result.refinedQuery).toContain('音位');
    expect(result.refinedQuery).toContain('正字法');
  });

  // ---- INCORRECT 分支 | INCORRECT branch ----
  it('returns incorrect when matches is empty', () => {
    const result = evaluateRagQuality([], '随机查询');
    expect(result.verdict).toBe('incorrect');
    expect(result.maxScore).toBe(0);
    expect(result.scoreGap).toBe(0);
  });

  it('returns incorrect when top score < 0.35', () => {
    const matches = [{ score: 0.22 }, { score: 0.10 }];
    const result = evaluateRagQuality(matches, '无关内容查询');
    expect(result.verdict).toBe('incorrect');
    expect(result.maxScore).toBeCloseTo(0.22);
  });

  it('returns incorrect when score is exactly at boundary 0.00', () => {
    const result = evaluateRagQuality([{ score: 0.0 }], '空召回');
    expect(result.verdict).toBe('incorrect');
  });
});
