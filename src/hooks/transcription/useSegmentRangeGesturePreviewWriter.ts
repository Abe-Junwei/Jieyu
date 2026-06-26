import { useCallback, useMemo, useReducer } from 'react';
import type { SetStateAction } from 'react';
import type { SnapGuide } from './transcriptionTypes';
import type { TimeRangeDragPreview } from '../../utils/segmentRangeGesturePreviewReadModel';
import type {
  LassoSurfacePreview,
  SubSelectPreviewRange,
  TimingEditPreviewPatch,
} from '../../utils/segmentRangeGesturePreviewWriter';
import {
  initialSegmentRangeGestureWriterState,
  segmentRangeGestureReadModelFromWriterState,
  segmentRangeGestureWriterReducer,
} from '../../utils/segmentRangeGesturePreviewWriter';

export type { TimingEditPreviewPatch } from '../../utils/segmentRangeGesturePreviewWriter';

/**
 * 波形桥专用：语段范围手势预览（lasso 抬升 + Regions 时间拖）单 reducer，供 `useTranscriptionWaveformBridgeController` 复用。
 */
export function useSegmentRangeGesturePreviewWriter() {
  const [gestureWriter, dispatchGestureWriter] = useReducer(
    segmentRangeGestureWriterReducer,
    initialSegmentRangeGestureWriterState,
  );

  const setLiftedLassoPreview = useCallback((update: SetStateAction<LassoSurfacePreview>) => {
    dispatchGestureWriter({ type: 'lasso', update });
  }, []);

  const setDragPreview = useCallback((update: SetStateAction<TimeRangeDragPreview | null>) => {
    dispatchGestureWriter({ type: 'timeDrag', update });
  }, []);

  const setSnapGuide = useCallback((update: SetStateAction<SnapGuide>) => {
    dispatchGestureWriter({ type: 'snapGuide', update });
  }, []);

  const setTimingEditPreview = useCallback((patch: TimingEditPreviewPatch) => {
    dispatchGestureWriter({ type: 'timingEdit', patch });
  }, []);

  const setSubSelectPreview = useCallback(
    (update: SetStateAction<SubSelectPreviewRange | null>) => {
      dispatchGestureWriter({ type: 'subSelect', update });
    },
    [],
  );

  const dragPreview = gestureWriter.timeDrag;
  const snapGuide = gestureWriter.snapGuide;

  const segmentRangeGesturePreviewReadModel = useMemo(
    () => segmentRangeGestureReadModelFromWriterState(gestureWriter),
    [gestureWriter],
  );

  return {
    gestureWriter,
    dispatchGestureWriter,
    setLiftedLassoPreview,
    setDragPreview,
    setSnapGuide,
    setTimingEditPreview,
    setSubSelectPreview,
    dragPreview,
    snapGuide,
    segmentRangeGesturePreviewReadModel,
  };
}
