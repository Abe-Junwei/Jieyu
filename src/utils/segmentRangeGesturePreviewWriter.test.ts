import { describe, expect, it } from 'vitest';
import {
  initialSegmentRangeGestureWriterState,
  segmentRangeGestureReadModelFromWriterState,
  segmentRangeGestureWriterReducer,
} from './segmentRangeGesturePreviewWriter';

describe('segmentRangeGestureWriterReducer', () => {
  it('updates lasso and time drag independently', () => {
    let s = initialSegmentRangeGestureWriterState;
    s = segmentRangeGestureWriterReducer(s, {
      type: 'timeDrag',
      update: { id: 'a', start: 1, end: 2 },
    });
    expect(s.timeDrag).toEqual({ id: 'a', start: 1, end: 2 });
    s = segmentRangeGestureWriterReducer(s, {
      type: 'lasso',
      update: { surface: 'tier', rect: { x: 0, y: 0, w: 1, h: 1 } },
    });
    expect(s.lasso.surface).toBe('tier');
    expect(s.timeDrag).toEqual({ id: 'a', start: 1, end: 2 });
  });

  it('supports functional updates', () => {
    let s = segmentRangeGestureWriterReducer(initialSegmentRangeGestureWriterState, {
      type: 'timeDrag',
      update: { id: 'x', start: 0, end: 1 },
    });
    s = segmentRangeGestureWriterReducer(s, {
      type: 'timeDrag',
      update: (prev) => (prev ? { ...prev, end: 3 } : null),
    });
    expect(s.timeDrag).toEqual({ id: 'x', start: 0, end: 3 });
  });

  it('maps writer state to read model with wave precedence over time drag', () => {
    const s = {
      lasso: {
        surface: 'wave' as const,
        rect: { x: 1, y: 2, w: 3, h: 4, mode: 'select' as const, hitCount: 0 },
        hintCount: 1,
      },
      timeDrag: { id: 'u', start: 0, end: 9 },
    };
    expect(segmentRangeGestureReadModelFromWriterState(s)).toEqual({
      surface: 'wave',
      rect: { x: 1, y: 2, w: 3, h: 4, mode: 'select', hitCount: 0 },
      hintCount: 1,
    });
  });
});
