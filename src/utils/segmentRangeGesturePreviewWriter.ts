import type { SetStateAction } from 'react';
import {
  buildSegmentRangeGesturePreviewReadModel,
  type SegmentRangeGesturePreviewReadModel,
  type TimeRangeDragPreview,
} from './segmentRangeGesturePreviewReadModel';

export type TierLassoPreviewRect = { x: number; y: number; w: number; h: number };

export type WaveLassoPreviewRect = {
  x: number;
  y: number;
  w: number;
  h: number;
  mode: 'select' | 'create';
  hitCount: number;
};

/** 波形 / tier 套索预览互斥（与 `useLasso` 内状态一致）。 */
export type LassoSurfacePreview =
  | { surface: 'none' }
  | { surface: 'tier'; rect: TierLassoPreviewRect }
  | { surface: 'wave'; rect: WaveLassoPreviewRect; hintCount: number };

export type SegmentRangeGestureWriterState = {
  lasso: LassoSurfacePreview;
  timeDrag: TimeRangeDragPreview | null;
};

export const initialSegmentRangeGestureWriterState: SegmentRangeGestureWriterState = {
  lasso: { surface: 'none' },
  timeDrag: null,
};

export type SegmentRangeGestureWriterAction =
  | { type: 'lasso'; update: SetStateAction<LassoSurfacePreview> }
  | { type: 'timeDrag'; update: SetStateAction<TimeRangeDragPreview | null> };

export function segmentRangeGestureWriterReducer(
  state: SegmentRangeGestureWriterState,
  action: SegmentRangeGestureWriterAction,
): SegmentRangeGestureWriterState {
  switch (action.type) {
    case 'lasso': {
      const next = typeof action.update === 'function' ? action.update(state.lasso) : action.update;
      return { ...state, lasso: next };
    }
    case 'timeDrag': {
      const next = typeof action.update === 'function' ? action.update(state.timeDrag) : action.update;
      return { ...state, timeDrag: next };
    }
    default:
      return state;
  }
}

export function toLegacyLassoOutputs(preview: LassoSurfacePreview): {
  lassoRect: TierLassoPreviewRect | null;
  waveLassoRect: WaveLassoPreviewRect | null;
  waveLassoHintCount: number;
} {
  if (preview.surface === 'tier') {
    return { lassoRect: preview.rect, waveLassoRect: null, waveLassoHintCount: 0 };
  }
  if (preview.surface === 'wave') {
    return { lassoRect: null, waveLassoRect: preview.rect, waveLassoHintCount: preview.hintCount };
  }
  return { lassoRect: null, waveLassoRect: null, waveLassoHintCount: 0 };
}

export function segmentRangeGestureReadModelFromWriterState(
  state: SegmentRangeGestureWriterState,
): SegmentRangeGesturePreviewReadModel {
  const { waveLassoRect, lassoRect, waveLassoHintCount } = toLegacyLassoOutputs(state.lasso);
  return buildSegmentRangeGesturePreviewReadModel(waveLassoRect, waveLassoHintCount, lassoRect, state.timeDrag);
}
