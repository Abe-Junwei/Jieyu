/**
 * 阶段 F·1 / D：语段范围手势「预览」读模型（wave / tier 套索、子选区、改时预览）。
 * 单一判定入口 | Single precedence gate for preview SSOT.
 */

import type { LassoSurfacePreview } from './segmentRangeGesturePreviewWriter';

export type WaveLassoPreviewRect = {
  x: number;
  y: number;
  w: number;
  h: number;
  mode: 'select' | 'create';
  hitCount: number;
};

export type TierLassoPreviewRect = { x: number; y: number; w: number; h: number };

export type TimeRangeDragPreview = { id: string; start: number; end: number };

/** 改时预览（拖边 / Regions）与范围拖建预览的互斥模式标签 | Preview mode for timing-edit vs range gestures. */
export type SegmentRangeGesturePreviewMode = 'range' | 'timing-edit';

export type SegmentRangeGesturePreviewReadModel =
  | { surface: 'none' }
  | { surface: 'wave'; rect: WaveLassoPreviewRect; hintCount: number }
  | { surface: 'tier'; rect: TierLassoPreviewRect }
  | { surface: 'subSelect'; start: number; end: number }
  | { surface: 'timeRange'; preview: TimeRangeDragPreview; mode: SegmentRangeGesturePreviewMode };

export type BuildSegmentRangeGesturePreviewInput = {
  lasso: LassoSurfacePreview;
  timeDrag: TimeRangeDragPreview | null;
  previewMode?: SegmentRangeGesturePreviewMode | null;
  subSelectPreview?: { start: number; end: number } | null;
};

/**
 * 预览互斥优先级：wave 框选/拖建 > tier 套索 > 子选区 > Regions/resize 时间预览。
 */
export function buildSegmentRangeGesturePreviewReadModel(
  input: BuildSegmentRangeGesturePreviewInput,
): SegmentRangeGesturePreviewReadModel {
  const { lasso, timeDrag, previewMode = null, subSelectPreview = null } = input;

  if (lasso.surface === 'wave') {
    return { surface: 'wave', rect: lasso.rect, hintCount: lasso.hintCount };
  }
  if (lasso.surface === 'tier') {
    return { surface: 'tier', rect: lasso.rect };
  }
  if (subSelectPreview) {
    return { surface: 'subSelect', start: subSelectPreview.start, end: subSelectPreview.end };
  }
  if (timeDrag) {
    return {
      surface: 'timeRange',
      preview: timeDrag,
      mode: previewMode ?? 'timing-edit',
    };
  }
  return { surface: 'none' };
}

export function tierLassoRectFromSegmentRangeGesturePreview(
  model: SegmentRangeGesturePreviewReadModel,
): TierLassoPreviewRect | null {
  return model.surface === 'tier' ? model.rect : null;
}

export function timeRangeDragPreviewFromSegmentRangeGesturePreview(
  model: SegmentRangeGesturePreviewReadModel,
): TimeRangeDragPreview | null {
  return model.surface === 'timeRange' ? model.preview : null;
}

export function timingEditModeFromSegmentRangeGesturePreview(
  model: SegmentRangeGesturePreviewReadModel,
): SegmentRangeGesturePreviewMode | null {
  return model.surface === 'timeRange' ? model.mode : null;
}

/** 主波形套索 SVG：仅 wave 面有像素框预览。 */
export function waveLassoOverlayFromSegmentRangeGesturePreview(
  model: SegmentRangeGesturePreviewReadModel,
): {
  x: number;
  y: number;
  w: number;
  h: number;
  mode: WaveLassoPreviewRect['mode'];
  hintCount: number;
} | null {
  if (model.surface !== 'wave') return null;
  const { x, y, w, h, mode } = model.rect;
  return { x, y, w, h, mode, hintCount: model.hintCount };
}

/** 子选区拖建预览（秒）→ 波形内容坐标像素。 */
export function subSelectPreviewPxFromSegmentRangeGesturePreview(
  model: SegmentRangeGesturePreviewReadModel,
  zoomPxPerSec: number,
): { leftPx: number; widthPx: number } | null {
  if (model.surface !== 'subSelect' || zoomPxPerSec <= 0) return null;
  const start = Math.min(model.start, model.end);
  const end = Math.max(model.start, model.end);
  return {
    leftPx: start * zoomPxPerSec,
    widthPx: Math.max(0, (end - start) * zoomPxPerSec),
  };
}
