import { useTimelineResize } from '../hooks/useTimelineResize';
import { useTranscriptionTimelineInteractionController } from './useTranscriptionTimelineInteractionController';

type UseInteractionInput = Parameters<typeof useTranscriptionTimelineInteractionController>[0];
type UseTimelineResizeInput = Parameters<typeof useTimelineResize>[0];

interface UseReadyWorkspaceTimelineSyncControllerInput {
  interactionInput: UseInteractionInput;
  resizeBridgeInput: {
    zoomPxPerSec: number;
    selectSegment: UseTimelineResizeInput['selectSegment'];
    setSelectedLayerId: UseTimelineResizeInput['setSelectedLayerId'];
    setFocusedLayerRowId: UseTimelineResizeInput['setFocusedLayerRowId'];
  };
}

/**
 * 时间轴同步域控制器：交互路由与拖拽时间更新在同一边界聚合。
 * Timeline-sync domain controller: interaction routing and resize timing are co-located.
 */
export function useReadyWorkspaceTimelineSyncController(
  input: UseReadyWorkspaceTimelineSyncControllerInput,
) {
  const interactionController = useTranscriptionTimelineInteractionController(
    input.interactionInput,
  );

  const timelineResizeController = useTimelineResize({
    zoomPxPerSec: input.resizeBridgeInput.zoomPxPerSec,
    manualSelectTsRef: input.interactionInput.manualSelectTsRef,
    player: input.interactionInput.player as unknown as UseTimelineResizeInput['player'],
    selectUnit: input.interactionInput.selectUnit,
    ...(input.resizeBridgeInput.selectSegment
      ? { selectSegment: input.resizeBridgeInput.selectSegment }
      : {}),
    setSelectedLayerId: input.resizeBridgeInput.setSelectedLayerId,
    setFocusedLayerRowId: input.resizeBridgeInput.setFocusedLayerRowId,
    beginTimingGesture: input.interactionInput.beginTimingGesture,
    endTimingGesture: input.interactionInput.endTimingGesture,
    getNeighborBounds: interactionController.getNeighborBoundsRouted,
    makeSnapGuide: input.interactionInput.makeSnapGuide,
    snapEnabled: input.interactionInput.snapEnabled,
    setSnapGuide: input.interactionInput.setSnapGuide,
    setDragPreview: input.interactionInput.setDragPreview,
    saveUnitTiming: interactionController.saveTimingRouted,
    ...(input.interactionInput.segmentsByLayer
      ? { segmentsByLayer: new Map(input.interactionInput.segmentsByLayer) }
      : {}),
  });

  return {
    ...interactionController,
    timelineResizeController,
  };
}
