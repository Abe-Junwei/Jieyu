import { describe, expect, it } from 'vitest';
import { readProvenance } from './provenanceEnvelope';

const base = { actorType: 'ai', method: 'auto-segmentation', createdAt: '2026-10-09T00:00:00Z' };

describe('readProvenance params', () => {
  it('keeps flat string / number / boolean params', () => {
    const params = { engine: 'silero', speechThreshold: 0.5, cached: true };
    expect(readProvenance({ ...base, params })).toMatchObject({ params });
  });

  it('absent params stay absent', () => {
    expect(readProvenance(base)).not.toHaveProperty('params');
  });

  it.each([
    ['nested object', { a: { b: 1 } }],
    ['array value', { a: [1] }],
    ['non-finite number', { a: Number.POSITIVE_INFINITY }],
    ['array params', [1, 2]],
    ['too many keys', Object.fromEntries(Array.from({ length: 33 }, (_, i) => [`k${i}`, i]))],
  ])('malformed params (%s) make the envelope unusable', (_label, params) => {
    expect(readProvenance({ ...base, params })).toBeNull();
  });
});
