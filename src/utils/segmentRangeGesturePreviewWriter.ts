import type { SetStateAction } from 'react';
import type { SnapGuide } from '../hooks/transcription/transcriptionTypes';
import {
  buildSegmentRangeGesturePreviewReadModel,
  type SegmentRangeGesturePreviewMode,
  type SegmentRangeGesturePreviewReadModel,
  type TimeRangeDragPreview,
} from './segmentRangeGesturePreviewReadModel';

export const initialSegmentRangeGestureSnapGuide: SnapGuide = { visible: false };

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
  snapGuide: SnapGuide;
  previewMode: SegmentRangeGesturePreviewMode | null;
};

export const initialSegmentRangeGestureWriterState: SegmentRangeGestureWriterState = {
  lasso: { surface: 'none' },
  timeDrag: null,
  snapGuide: initialSegmentRangeGestureSnapGuide,
  previewMode: null,
};

/** 阶段 E：改时预览与 snap 同批写入 patch | Batched timing-edit preview + snap guide patch. */
export type TimingEditPreviewPatch = {
  preview?: TimeRangeDragPreview | null;
  snapGuide?: SnapGuide;
};

export type SegmentRangeGestureWriterAction =
  | { type: 'lasso'; update: SetStateAction<LassoSurfacePreview> }
  | { type: 'timeDrag'; update: SetStateAction<TimeRangeDragPreview | null> }
  | { type: 'snapGuide'; update: SetStateAction<SnapGuide> }
  | { type: 'timingEdit'; patch: TimingEditPreviewPatch };

function applyTimingEditPatch(
  state: SegmentRangeGestureWriterState,
  patch: TimingEditPreviewPatch,
): SegmentRangeGestureWriterState {
  let next = state;

  if ('preview' in patch) {
    const preview = patch.preview ?? null;
    if (preview === null) {
      next = {
        ...next,
        timeDrag: null,
        previewMode: null,
        ...(!('snapGuide' in patch) ? { snapGuide: initialSegmentRangeGestureSnapGuide } : {}),
      };
    } else {
      next = {
        ...next,
        timeDrag: preview,
        previewMode: 'timing-edit',
        lasso: { surface: 'none' },
      };
    }
  }

  if ('snapGuide' in patch && patch.snapGuide !== undefined) {
    next = { ...next, snapGuide: patch.snapGuide };
  }

  return next;
}

export function segmentRangeGestureWriterReducer(
  state: SegmentRangeGestureWriterState,
  action: SegmentRangeGestureWriterAction,
): SegmentRangeGestureWriterState {
  switch (action.type) {
    case 'lasso': {
      const next = typeof action.update === 'function' ? action.update(state.lasso) : action.update;
      if (next.surface !== 'none') {
        return {
          ...state,
          lasso: next,
          timeDrag: null,
          snapGuide: initialSegmentRangeGestureSnapGuide,
          previewMode: null,
        };
      }
      return { ...state, lasso: next };
    }
    case 'timeDrag': {
      const next =
        typeof action.update === 'function' ? action.update(state.timeDrag) : action.update;
      return {
        ...state,
        timeDrag: next,
        previewMode: next ? 'range' : null,
        ...(next ? { lasso: { surface: 'none' as const } } : {}),
      };
    }
    case 'snapGuide': {
      const next =
        typeof action.update === 'function' ? action.update(state.snapGuide) : action.update;
      return { ...state, snapGuide: next };
    }
    case 'timingEdit':
      return applyTimingEditPatch(state, action.patch);
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
  return buildSegmentRangeGesturePreviewReadModel(
    waveLassoRect,
    waveLassoHintCount,
    lassoRect,
    state.timeDrag,
    state.previewMode,
  );
}
