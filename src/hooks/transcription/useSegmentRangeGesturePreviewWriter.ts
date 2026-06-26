import { useMemo, useReducer } from 'react';
import type { SetStateAction } from 'react';
import type { SnapGuide } from './transcriptionTypes';
import type { TimeRangeDragPreview } from '../../utils/segmentRangeGesturePreviewReadModel';
import type { LassoSurfacePreview } from '../../utils/segmentRangeGesturePreviewWriter';
import {
  initialSegmentRangeGestureWriterState,
  segmentRangeGestureReadModelFromWriterState,
  segmentRangeGestureWriterReducer,
} from '../../utils/segmentRangeGesturePreviewWriter';

/**
 * 波形桥专用：语段范围手势预览（lasso 抬升 + Regions 时间拖）单 reducer，供 `useTranscriptionWaveformBridgeController` 复用。
 */
export function useSegmentRangeGesturePreviewWriter() {
  const [gestureWriter, dispatchGestureWriter] = useReducer(
    segmentRangeGestureWriterReducer,
    initialSegmentRangeGestureWriterState,
  );

  const { setLiftedLassoPreview, setDragPreview, setSnapGuide } = useMemo(
    () => ({
      setLiftedLassoPreview: (update: SetStateAction<LassoSurfacePreview>) => {
        dispatchGestureWriter({ type: 'lasso', update });
      },
      setDragPreview: (update: SetStateAction<TimeRangeDragPreview | null>) => {
        dispatchGestureWriter({ type: 'timeDrag', update });
      },
      setSnapGuide: (update: SetStateAction<SnapGuide>) => {
        dispatchGestureWriter({ type: 'snapGuide', update });
      },
    }),
    [dispatchGestureWriter],
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
    dragPreview,
    snapGuide,
    segmentRangeGesturePreviewReadModel,
  };
}
