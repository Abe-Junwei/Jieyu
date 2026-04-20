import { describe, expect, it } from 'vitest';
import { evaluateSegmentTimeUpdateGuard } from './segmentPlaybackGuard';

describe('segmentPlaybackGuard', () => {
  it('does not ignore when no bounds or guard not pending', () => {
    expect(evaluateSegmentTimeUpdateGuard(1.5, null, { pending: true })).toEqual({
      ignore: false,
      nextGuard: { pending: true },
    });
    expect(evaluateSegmentTimeUpdateGuard(1.5, { start: 1, end: 2 }, null)).toEqual({
      ignore: false,
      nextGuard: null,
    });
    expect(evaluateSegmentTimeUpdateGuard(1.5, { start: 1, end: 2 }, { pending: false })).toEqual({
      ignore: false,
      nextGuard: { pending: false },
    });
  });

  it('ignores stale ticks outside bounds while pending', () => {
    const bounds = { start: 2, end: 4 };
    const guard = { pending: true };
    expect(evaluateSegmentTimeUpdateGuard(0.5, bounds, guard)).toEqual({
      ignore: true,
      nextGuard: guard,
    });
  });

  it('clears pending on first in-bounds tick', () => {
    const bounds = { start: 2, end: 4 };
    const guard = { pending: true };
    expect(evaluateSegmentTimeUpdateGuard(2.005, bounds, guard, 0.02)).toEqual({
      ignore: false,
      nextGuard: { pending: false },
    });
  });
});
