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
    expect(s.previewMode).toBe('range');
    s = segmentRangeGestureWriterReducer(s, {
      type: 'lasso',
      update: { surface: 'tier', rect: { x: 0, y: 0, w: 1, h: 1 } },
    });
    expect(s.lasso.surface).toBe('tier');
    expect(s.timeDrag).toBeNull();
    expect(s.previewMode).toBeNull();
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

  it('updates snap guide on the same reducer', () => {
    let s = initialSegmentRangeGestureWriterState;
    s = segmentRangeGestureWriterReducer(s, {
      type: 'snapGuide',
      update: { visible: true, left: 1, right: 2, nearSide: 'left' },
    });
    expect(s.snapGuide).toEqual({ visible: true, left: 1, right: 2, nearSide: 'left' });
  });

  it('batches timing-edit preview and snap guide in one dispatch', () => {
    const s = segmentRangeGestureWriterReducer(initialSegmentRangeGestureWriterState, {
      type: 'timingEdit',
      patch: {
        preview: { id: 'u1', start: 1, end: 2 },
        snapGuide: { visible: true, left: 1, right: 2, nearSide: 'both' },
      },
    });
    expect(s.timeDrag).toEqual({ id: 'u1', start: 1, end: 2 });
    expect(s.previewMode).toBe('timing-edit');
    expect(s.snapGuide).toEqual({ visible: true, left: 1, right: 2, nearSide: 'both' });
    expect(s.lasso).toEqual({ surface: 'none' });
  });

  it('clears timing-edit state when preview is null', () => {
    let s = segmentRangeGestureWriterReducer(initialSegmentRangeGestureWriterState, {
      type: 'timingEdit',
      patch: {
        preview: { id: 'u1', start: 1, end: 2 },
        snapGuide: { visible: true, left: 1, right: 2, nearSide: 'both' },
      },
    });
    s = segmentRangeGestureWriterReducer(s, {
      type: 'timingEdit',
      patch: { preview: null },
    });
    expect(s.timeDrag).toBeNull();
    expect(s.previewMode).toBeNull();
    expect(s.snapGuide).toEqual(initialSegmentRangeGestureWriterState.snapGuide);
  });

  it('maps writer state to read model with wave precedence over time drag', () => {
    const s = {
      lasso: {
        surface: 'wave' as const,
        rect: { x: 1, y: 2, w: 3, h: 4, mode: 'select' as const, hitCount: 0 },
        hintCount: 1,
      },
      timeDrag: { id: 'u', start: 0, end: 9 },
      snapGuide: initialSegmentRangeGestureWriterState.snapGuide,
      previewMode: 'timing-edit' as const,
      subSelectPreview: null,
    };
    expect(segmentRangeGestureReadModelFromWriterState(s)).toEqual({
      surface: 'wave',
      rect: { x: 1, y: 2, w: 3, h: 4, mode: 'select', hitCount: 0 },
      hintCount: 1,
    });
  });

  it('stores sub-select preview and clears conflicting lasso/time drag', () => {
    let s = segmentRangeGestureWriterReducer(initialSegmentRangeGestureWriterState, {
      type: 'timeDrag',
      update: { id: 'a', start: 1, end: 2 },
    });
    s = segmentRangeGestureWriterReducer(s, {
      type: 'subSelect',
      update: { start: 0.5, end: 1.5 },
    });
    expect(s.subSelectPreview).toEqual({ start: 0.5, end: 1.5 });
    expect(s.timeDrag).toBeNull();
    expect(segmentRangeGestureReadModelFromWriterState(s)).toEqual({
      surface: 'subSelect',
      start: 0.5,
      end: 1.5,
    });
  });
});
