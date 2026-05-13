import { describe, expect, it } from 'vitest';
import type { LayerUnitDocType } from '../db';
import { hasTimelineGapOverlapAfterTransforms } from './timelineBatchOverlapValidation';

function u(id: string, start: number, end: number): LayerUnitDocType {
  return {
    id,
    textId: 't',
    mediaId: 'm',
    startTime: start,
    endTime: end,
    createdAt: '',
    updatedAt: '',
  } as LayerUnitDocType;
}

function legacyOverlap(
  units: readonly LayerUnitDocType[],
  transformed: Map<string, { startTime: number; endTime: number }>,
  gap: number,
): boolean {
  const timeline = units
    .map((unit) => {
      const next = transformed.get(unit.id);
      return next ? { ...unit, ...next } : unit;
    })
    .sort((a, b) => a.startTime - b.startTime);
  for (let i = 1; i < timeline.length; i++) {
    if (timeline[i]!.startTime < timeline[i - 1]!.endTime + gap) {
      return true;
    }
  }
  return false;
}

describe('hasTimelineGapOverlapAfterTransforms', () => {
  it('matches legacy clone+sort for offset-like transforms on a sorted timeline', () => {
    const units = [u('a', 0, 1), u('b', 1.5, 2.5), u('c', 3, 4)];
    const gap = 0.02;
    const deltas = [-0.4, 0, 0.1, 0.5, -0.2, 0.3];
    for (const d of deltas) {
      const transformed = new Map(
        units
          .filter((_, i) => i % 2 === 0)
          .map((unit) => [unit.id, { startTime: unit.startTime + d, endTime: unit.endTime + d }]),
      );
      expect(hasTimelineGapOverlapAfterTransforms(units, transformed, gap)).toBe(
        legacyOverlap(units, transformed, gap),
      );
    }
  });

  it('returns false when only one unit', () => {
    expect(hasTimelineGapOverlapAfterTransforms([u('a', 0, 1)], new Map(), 0.02)).toBe(false);
  });

  it('uses sort fallback when effective starts break monotonicity in array order', () => {
    const units = [u('a', 0, 1), u('b', 2, 3)];
    const transformed = new Map<string, { startTime: number; endTime: number }>([
      ['a', { startTime: 5, endTime: 6 }],
      ['b', { startTime: 0.5, endTime: 1.5 }],
    ]);
    const gap = 0.02;
    expect(hasTimelineGapOverlapAfterTransforms(units, transformed, gap)).toBe(
      legacyOverlap(units, transformed, gap),
    );
  });
});
