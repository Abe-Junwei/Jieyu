import { describe, expect, it } from 'vitest';
import { evaluateSegmentTimeUpdateGuard } from '../src/utils/segmentPlaybackGuard';

describe('evaluateSegmentTimeUpdateGuard', () => {
  it('ignores stale pre-seek ticks while guard is pending', () => {
    const res = evaluateSegmentTimeUpdateGuard(9.8, { start: 1, end: 2 }, { pending: true });
    expect(res.ignore).toBe(true);
    expect(res.nextGuard?.pending).toBe(true);
  });

  it('unblocks once tick enters segment bounds', () => {
    const res = evaluateSegmentTimeUpdateGuard(1.2, { start: 1, end: 2 }, { pending: true });
    expect(res.ignore).toBe(false);
    expect(res.nextGuard?.pending).toBe(false);
  });

  it('does not interfere when guard is not pending', () => {
    const res = evaluateSegmentTimeUpdateGuard(9.8, { start: 1, end: 2 }, { pending: false });
    expect(res.ignore).toBe(false);
    expect(res.nextGuard?.pending).toBe(false);
  });
});
