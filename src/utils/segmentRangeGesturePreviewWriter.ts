import type { SetStateAction } from 'react';
import type { SnapGuide } from '../hooks/transcription/transcriptionTypes';
import {
  buildSegmentRangeGesturePreviewReadModel,
  type LassoSurfacePreview,
  type SegmentRangeGesturePreviewMode,
  type TierLassoPreviewRect,
  type WaveLassoPreviewRect,
  type SegmentRangeGesturePreviewReadModel,
  type TimeRangeDragPreview,
} from './segmentRangeGesturePreviewReadModel';

export const initialSegmentRangeGestureSnapGuide: SnapGuide = { visible: false };

// 套索预览类型定义在读模型里，这里转出，避免读模型 ↔ writer 循环依赖（JY-24）。
// Lasso preview types live in the read model and are re-exported here (JY-24 cycle cut).
export type { LassoSurfacePreview, TierLassoPreviewRect, WaveLassoPreviewRect };

export type SubSelectPreviewRange = { start: number; end: number };

export type SegmentRangeGestureWriterState = {
  lasso: LassoSurfacePreview;
  timeDrag: TimeRangeDragPreview | null;
  snapGuide: SnapGuide;
  previewMode: SegmentRangeGesturePreviewMode | null;
  subSelectPreview: SubSelectPreviewRange | null;
};

export const initialSegmentRangeGestureWriterState: SegmentRangeGestureWriterState = {
  lasso: { surface: 'none' },
  timeDrag: null,
  snapGuide: initialSegmentRangeGestureSnapGuide,
  previewMode: null,
  subSelectPreview: null,
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
  | { type: 'timingEdit'; patch: TimingEditPreviewPatch }
  | { type: 'subSelect'; update: SetStateAction<SubSelectPreviewRange | null> };

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
        subSelectPreview: null,
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
          subSelectPreview: null,
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
        ...(next ? { lasso: { surface: 'none' as const }, subSelectPreview: null } : {}),
      };
    }
    case 'snapGuide': {
      const next =
        typeof action.update === 'function' ? action.update(state.snapGuide) : action.update;
      return { ...state, snapGuide: next };
    }
    case 'timingEdit':
      return applyTimingEditPatch(state, action.patch);
    case 'subSelect': {
      const next =
        typeof action.update === 'function' ? action.update(state.subSelectPreview) : action.update;
      if (next === null) {
        return { ...state, subSelectPreview: null };
      }
      return {
        ...state,
        subSelectPreview: next,
        lasso: { surface: 'none' },
        timeDrag: null,
        snapGuide: initialSegmentRangeGestureSnapGuide,
        previewMode: null,
      };
    }
    default:
      return state;
  }
}

export function segmentRangeGestureReadModelFromWriterState(
  state: SegmentRangeGestureWriterState,
): SegmentRangeGesturePreviewReadModel {
  return buildSegmentRangeGesturePreviewReadModel({
    lasso: state.lasso,
    timeDrag: state.timeDrag,
    previewMode: state.previewMode,
    subSelectPreview: state.subSelectPreview,
  });
}
