import { describe, expect, it } from 'vitest';
import {
  independentSegmentInsertionUpperBoundSec,
  mediaDurationSecForTimeBounds,
} from './timelineMediaDurationForBounds';

describe('mediaDurationSecForTimeBounds', () => {
  it('将 0/无效/未定义 视为无界上界', () => {
    expect(mediaDurationSecForTimeBounds(null)).toBe(Infinity);
    expect(mediaDurationSecForTimeBounds(undefined)).toBe(Infinity);
    expect(mediaDurationSecForTimeBounds({ timelineKind: 'acoustic' })).toBe(Infinity);
    expect(mediaDurationSecForTimeBounds({ duration: 0, timelineKind: 'acoustic' })).toBe(Infinity);
    expect(mediaDurationSecForTimeBounds({ duration: -1, timelineKind: 'acoustic' })).toBe(
      Infinity,
    );
  });

  it('正有限时长原样返回', () => {
    expect(mediaDurationSecForTimeBounds({ duration: 120.5, timelineKind: 'acoustic' })).toBe(
      120.5,
    );
  });

  it('占位行无论 duration 多大均视为无界', () => {
    expect(
      mediaDurationSecForTimeBounds({
        duration: 1800,
        timelineKind: 'placeholder',
      }),
    ).toBe(Infinity);
  });
});

describe('independentSegmentInsertionUpperBoundSec', () => {
  it('媒体无界时保持无界', () => {
    expect(
      independentSegmentInsertionUpperBoundSec({ duration: 0, timelineKind: 'acoustic' }, 3600),
    ).toBe(Infinity);
  });

  it('占位行与逻辑轴长度无关仍为无界', () => {
    expect(
      independentSegmentInsertionUpperBoundSec(
        {
          duration: 1800,
          timelineKind: 'placeholder',
        },
        9999,
      ),
    ).toBe(Infinity);
  });

  it('有限媒体时长与逻辑轴取较大者', () => {
    expect(
      independentSegmentInsertionUpperBoundSec({ duration: 60, timelineKind: 'acoustic' }, 120),
    ).toBe(120);
    expect(
      independentSegmentInsertionUpperBoundSec({ duration: 200, timelineKind: 'acoustic' }, 120),
    ).toBe(200);
  });
});
