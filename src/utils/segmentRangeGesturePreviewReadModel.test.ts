import { describe, expect, it } from 'vitest';
import {
  buildSegmentRangeGesturePreviewReadModel,
  subSelectPreviewPxFromSegmentRangeGesturePreview,
  tierLassoRectFromSegmentRangeGesturePreview,
  timeRangeDragPreviewFromSegmentRangeGesturePreview,
  waveLassoOverlayFromSegmentRangeGesturePreview,
} from './segmentRangeGesturePreviewReadModel';

const waveRect = { x: 1, y: 2, w: 3, h: 4, mode: 'select' as const, hitCount: 0 };
const tier = { x: 10, y: 20, w: 30, h: 40 };
const time = { id: 'u1', start: 1, end: 2 };

describe('buildSegmentRangeGesturePreviewReadModel', () => {
  it('returns none when all inputs are empty', () => {
    expect(
      buildSegmentRangeGesturePreviewReadModel({
        lasso: { surface: 'none' },
        timeDrag: null,
      }),
    ).toEqual({ surface: 'none' });
  });

  it('prefers wave lasso over tier and time-range previews', () => {
    expect(
      buildSegmentRangeGesturePreviewReadModel({
        lasso: { surface: 'wave', rect: waveRect, hintCount: 2 },
        timeDrag: time,
      }),
    ).toEqual({
      surface: 'wave',
      rect: waveRect,
      hintCount: 2,
    });
  });

  it('uses tier lasso when wave is inactive', () => {
    expect(
      buildSegmentRangeGesturePreviewReadModel({
        lasso: { surface: 'tier', rect: tier },
        timeDrag: time,
      }),
    ).toEqual({
      surface: 'tier',
      rect: tier,
    });
  });

  it('uses time-range preview when only drag preview is set', () => {
    expect(
      buildSegmentRangeGesturePreviewReadModel({
        lasso: { surface: 'none' },
        timeDrag: time,
      }),
    ).toEqual({
      surface: 'timeRange',
      preview: time,
      mode: 'timing-edit',
    });
  });

  it('honors explicit preview mode on time-range surface', () => {
    expect(
      buildSegmentRangeGesturePreviewReadModel({
        lasso: { surface: 'none' },
        timeDrag: time,
        previewMode: 'range',
      }),
    ).toEqual({
      surface: 'timeRange',
      preview: time,
      mode: 'range',
    });
  });

  it('uses sub-select preview after tier lasso and before time-range', () => {
    expect(
      buildSegmentRangeGesturePreviewReadModel({
        lasso: { surface: 'none' },
        timeDrag: time,
        subSelectPreview: { start: 1, end: 2 },
      }),
    ).toEqual({
      surface: 'subSelect',
      start: 1,
      end: 2,
    });
    expect(
      buildSegmentRangeGesturePreviewReadModel({
        lasso: { surface: 'tier', rect: tier },
        timeDrag: time,
        subSelectPreview: { start: 1, end: 2 },
      }),
    ).toEqual({
      surface: 'tier',
      rect: tier,
    });
  });

  it('maps sub-select seconds to content pixels', () => {
    const m = buildSegmentRangeGesturePreviewReadModel({
      lasso: { surface: 'none' },
      timeDrag: null,
      subSelectPreview: { start: 1, end: 3 },
    });
    expect(subSelectPreviewPxFromSegmentRangeGesturePreview(m, 10)).toEqual({
      leftPx: 10,
      widthPx: 20,
    });
  });

  it('exposes tier rect only on tier surface', () => {
    const m = buildSegmentRangeGesturePreviewReadModel({
      lasso: { surface: 'tier', rect: tier },
      timeDrag: time,
    });
    expect(tierLassoRectFromSegmentRangeGesturePreview(m)).toEqual(tier);
    expect(
      tierLassoRectFromSegmentRangeGesturePreview({
        surface: 'wave',
        rect: waveRect,
        hintCount: 0,
      }),
    ).toBeNull();
  });

  it('exposes time-range preview only on timeRange surface', () => {
    const m = buildSegmentRangeGesturePreviewReadModel({
      lasso: { surface: 'none' },
      timeDrag: time,
    });
    expect(timeRangeDragPreviewFromSegmentRangeGesturePreview(m)).toEqual(time);
    expect(timeRangeDragPreviewFromSegmentRangeGesturePreview({ surface: 'none' })).toBeNull();
  });

  it('maps wave surface to overlay props for waveform chrome', () => {
    const m = buildSegmentRangeGesturePreviewReadModel({
      lasso: { surface: 'wave', rect: waveRect, hintCount: 3 },
      timeDrag: time,
    });
    expect(waveLassoOverlayFromSegmentRangeGesturePreview(m)).toEqual({
      x: waveRect.x,
      y: waveRect.y,
      w: waveRect.w,
      h: waveRect.h,
      mode: waveRect.mode,
      hintCount: 3,
    });
    expect(
      waveLassoOverlayFromSegmentRangeGesturePreview({ surface: 'tier', rect: tier }),
    ).toBeNull();
  });
});
