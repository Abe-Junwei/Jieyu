/**
 * 阶段 F·1：语段范围手势「预览」读模型（wave 套索 / tier 套索 / Regions 时间拖预览）。
 * 单一判定入口，便于后续把多路 setState 收敛为单写者 | Single precedence gate for preview SSOT.
 */

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

export type SegmentRangeGesturePreviewReadModel =
  | { surface: 'none' }
  | { surface: 'wave'; rect: WaveLassoPreviewRect; hintCount: number }
  | { surface: 'tier'; rect: TierLassoPreviewRect }
  | { surface: 'timeRange'; preview: TimeRangeDragPreview };

/**
 * 预览互斥优先级：wave 框选/拖建 > tier 套索 > Regions/resize 时间预览。
 * （与 `useLasso` 内指针会话设计一致：同会话下通常只有一路为真。）
 */
export function buildSegmentRangeGesturePreviewReadModel(
  waveLassoRect: WaveLassoPreviewRect | null,
  waveLassoHintCount: number,
  lassoRect: TierLassoPreviewRect | null,
  dragPreview: TimeRangeDragPreview | null,
): SegmentRangeGesturePreviewReadModel {
  if (waveLassoRect) {
    return { surface: 'wave', rect: waveLassoRect, hintCount: waveLassoHintCount };
  }
  if (lassoRect) {
    return { surface: 'tier', rect: lassoRect };
  }
  if (dragPreview) {
    return { surface: 'timeRange', preview: dragPreview };
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

/** 主波形套索 SVG：仅 wave 面有像素框预览。 */
export function waveLassoOverlayFromSegmentRangeGesturePreview(
  model: SegmentRangeGesturePreviewReadModel,
): { x: number; y: number; w: number; h: number; mode: WaveLassoPreviewRect['mode']; hintCount: number } | null {
  if (model.surface !== 'wave') return null;
  const { x, y, w, h, mode } = model.rect;
  return { x, y, w, h, mode, hintCount: model.hintCount };
}
