import { describe, expect, it } from 'vitest';
import { resolveVerticalReorderTargetIndex } from './dragReorder';

const RECTS = [
  { top: 0, bottom: 40, height: 40 },
  { top: 40, bottom: 80, height: 40 },
  { top: 80, bottom: 120, height: 40 },
];

const TALL_RECTS = [
  { top: 0, bottom: 100, height: 100 },
  { top: 100, bottom: 200, height: 100 },
];

const BUNDLE_RECTS = [
  { top: 0, bottom: 50, height: 50 },
  { top: 50, bottom: 100, height: 50 },
  { top: 100, bottom: 150, height: 50 },
  { top: 150, bottom: 200, height: 50 },
];

describe('dragReorder', () => {
  it('snaps to a nearby boundary to enlarge drop tolerance', () => {
    expect(resolveVerticalReorderTargetIndex(RECTS, 76, 'down')).toBe(2);
    expect(resolveVerticalReorderTargetIndex(RECTS, 43, 'up')).toBe(1);
  });

  it('biases the threshold by drag direction', () => {
    expect(resolveVerticalReorderTargetIndex(TALL_RECTS, 48, 'down')).toBe(1);
    expect(resolveVerticalReorderTargetIndex(TALL_RECTS, 48, 'up')).toBe(0);
  });

  it('can constrain root bundle dragging to bundle boundaries only', () => {
    expect(resolveVerticalReorderTargetIndex(BUNDLE_RECTS, 48, 'down', {
      allowedBoundaryIndexes: [0, 2, 4],
    })).toBe(2);
    expect(resolveVerticalReorderTargetIndex(BUNDLE_RECTS, 48, 'up', {
      allowedBoundaryIndexes: [0, 2, 4],
    })).toBe(0);
    expect(resolveVerticalReorderTargetIndex(BUNDLE_RECTS, 196, 'down', {
      allowedBoundaryIndexes: [0, 2, 4],
    })).toBe(4);
  });
});