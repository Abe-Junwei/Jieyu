import { describe, expect, it } from 'vitest';
import {
  buildSegmentRangeGesturePreviewReadModel,
  tierLassoRectFromSegmentRangeGesturePreview,
  timeRangeDragPreviewFromSegmentRangeGesturePreview,
  waveLassoOverlayFromSegmentRangeGesturePreview,
} from './segmentRangeGesturePreviewReadModel';

const wave = { x: 1, y: 2, w: 3, h: 4, mode: 'select' as const, hitCount: 0 };
const tier = { x: 10, y: 20, w: 30, h: 40 };
const time = { id: 'u1', start: 1, end: 2 };

describe('buildSegmentRangeGesturePreviewReadModel', () => {
  it('returns none when all inputs are empty', () => {
    expect(buildSegmentRangeGesturePreviewReadModel(null, 0, null, null)).toEqual({ surface: 'none' });
  });

  it('prefers wave lasso over tier and time-range previews', () => {
    expect(buildSegmentRangeGesturePreviewReadModel(wave, 2, tier, time)).toEqual({
      surface: 'wave',
      rect: wave,
      hintCount: 2,
    });
  });

  it('uses tier lasso when wave is inactive', () => {
    expect(buildSegmentRangeGesturePreviewReadModel(null, 0, tier, time)).toEqual({
      surface: 'tier',
      rect: tier,
    });
  });

  it('uses time-range preview when only drag preview is set', () => {
    expect(buildSegmentRangeGesturePreviewReadModel(null, 0, null, time)).toEqual({
      surface: 'timeRange',
      preview: time,
    });
  });

  it('exposes tier rect only on tier surface', () => {
    const m = buildSegmentRangeGesturePreviewReadModel(null, 0, tier, time);
    expect(tierLassoRectFromSegmentRangeGesturePreview(m)).toEqual(tier);
    expect(tierLassoRectFromSegmentRangeGesturePreview({ surface: 'wave', rect: wave, hintCount: 0 })).toBeNull();
  });

  it('exposes time-range preview only on timeRange surface', () => {
    const m = buildSegmentRangeGesturePreviewReadModel(null, 0, null, time);
    expect(timeRangeDragPreviewFromSegmentRangeGesturePreview(m)).toEqual(time);
    expect(timeRangeDragPreviewFromSegmentRangeGesturePreview({ surface: 'none' })).toBeNull();
  });

  it('maps wave surface to overlay props for waveform chrome', () => {
    const m = buildSegmentRangeGesturePreviewReadModel(wave, 3, tier, time);
    expect(waveLassoOverlayFromSegmentRangeGesturePreview(m)).toEqual({
      x: wave.x,
      y: wave.y,
      w: wave.w,
      h: wave.h,
      mode: wave.mode,
      hintCount: 3,
    });
    expect(waveLassoOverlayFromSegmentRangeGesturePreview({ surface: 'tier', rect: tier })).toBeNull();
  });
});
