import { describe, expect, it } from 'vitest';
import { judgeCitationAccuracy, judgeCitationAccuracyBatch } from './citationJudge';

describe('judgeCitationAccuracy', () => {
  it('scores a perfect packet as 5', () => {
    const result = judgeCitationAccuracy({
      id: 'ep-001',
      sourceType: 'segment',
      sourceId: 'seg-001',
      quote: 'This is a well-formed quote with adequate length.',
      confidence: 0.85,
    });
    expect(result.overallScore).toBe(5);
    expect(result.dimensions.sourceId.score).toBe(5);
    expect(result.dimensions.quote.score).toBe(5);
    expect(result.dimensions.confidence.score).toBe(5);
  });

  it('scores empty sourceId down', () => {
    const result = judgeCitationAccuracy({
      id: 'ep-002',
      sourceType: 'segment',
      sourceId: '',
      quote: 'A reasonable quote here.',
      confidence: 0.85,
    });
    expect(result.dimensions.sourceId.score).toBe(1);
    expect(result.overallScore).toBeLessThan(5);
  });

  it('scores placeholder sourceId as 3', () => {
    const result = judgeCitationAccuracy({
      id: 'ep-003',
      sourceType: 'segment',
      sourceId: 'unknown',
      quote: 'A reasonable quote here.',
      confidence: 0.85,
    });
    expect(result.dimensions.sourceId.score).toBe(3);
  });

  it('scores empty quote as 1', () => {
    const result = judgeCitationAccuracy({
      id: 'ep-004',
      sourceType: 'segment',
      sourceId: 'seg-004',
      quote: '',
      confidence: 0.85,
    });
    expect(result.dimensions.quote.score).toBe(1);
  });

  it('scores very short quote as 3', () => {
    const result = judgeCitationAccuracy({
      id: 'ep-005',
      sourceType: 'segment',
      sourceId: 'seg-005',
      quote: 'Hi',
      confidence: 0.85,
    });
    expect(result.dimensions.quote.score).toBe(3);
  });

  it('scores boundary confidence (1.0) as 3', () => {
    const result = judgeCitationAccuracy({
      id: 'ep-006',
      sourceType: 'segment',
      sourceId: 'seg-006',
      quote: 'A reasonable quote here.',
      confidence: 1.0,
    });
    expect(result.dimensions.confidence.score).toBe(3);
  });

  it('scores out-of-bounds confidence as 2', () => {
    const result = judgeCitationAccuracy({
      id: 'ep-007',
      sourceType: 'segment',
      sourceId: 'seg-007',
      quote: 'A reasonable quote here.',
      confidence: 1.5,
    });
    expect(result.dimensions.confidence.score).toBe(2);
  });

  it('scores NaN confidence as 1', () => {
    const result = judgeCitationAccuracy({
      id: 'ep-008',
      sourceType: 'segment',
      sourceId: 'seg-008',
      quote: 'A reasonable quote here.',
      confidence: NaN,
    });
    expect(result.dimensions.confidence.score).toBe(1);
  });

  it('scores UUID sourceId as 5', () => {
    const result = judgeCitationAccuracy({
      id: 'ep-009',
      sourceType: 'segment',
      sourceId: '550e8400-e29b-41d4-a716-446655440000',
      quote: 'A reasonable quote here.',
      confidence: 0.6,
    });
    expect(result.dimensions.sourceId.score).toBe(5);
  });

  it('overall score is clamped to 1–5', () => {
    const result = judgeCitationAccuracy({
      id: 'ep-010',
      sourceType: 'segment',
      sourceId: '',
      quote: '',
      confidence: NaN,
    });
    expect(result.overallScore).toBe(1);
  });
});

describe('judgeCitationAccuracyBatch', () => {
  it('computes average for a batch', () => {
    const inputs = [
      { id: 'a', sourceType: 'segment', sourceId: 'seg-a', quote: 'Good quote.', confidence: 0.9 },
      { id: 'b', sourceType: 'segment', sourceId: '', quote: 'Good quote.', confidence: 0.9 },
    ];
    const { averageScore, results } = judgeCitationAccuracyBatch(inputs);
    expect(results).toHaveLength(2);
    expect(averageScore).toBeGreaterThanOrEqual(1);
    expect(averageScore).toBeLessThanOrEqual(5);
  });

  it('returns 0 for empty batch', () => {
    const { averageScore, results } = judgeCitationAccuracyBatch([]);
    expect(averageScore).toBe(0);
    expect(results).toHaveLength(0);
  });
});
