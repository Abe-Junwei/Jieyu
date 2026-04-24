import type { useReadyWorkspaceTimelineSyncController } from './useReadyWorkspaceTimelineSyncController';

type ReadyWorkspaceTimelineSyncControllerInput = Parameters<typeof useReadyWorkspaceTimelineSyncController>[0];

export type BuildReadyWorkspaceTimelineSyncControllerInput = {
  interactionInput: ReadyWorkspaceTimelineSyncControllerInput['interactionInput'];
  resizeBridgeInput: {
    timelineZoomPxPerSec: number;
    selectSegment: ReadyWorkspaceTimelineSyncControllerInput['resizeBridgeInput']['selectSegment'];
    setSelectedLayerId: ReadyWorkspaceTimelineSyncControllerInput['resizeBridgeInput']['setSelectedLayerId'];
    setFocusedLayerRowId: ReadyWorkspaceTimelineSyncControllerInput['resizeBridgeInput']['setFocusedLayerRowId'];
  };
};

export function buildReadyWorkspaceTimelineSyncControllerInput(
  input: BuildReadyWorkspaceTimelineSyncControllerInput,
): ReadyWorkspaceTimelineSyncControllerInput {
  return {
    interactionInput: input.interactionInput,
    resizeBridgeInput: {
      zoomPxPerSec: input.resizeBridgeInput.timelineZoomPxPerSec,
      selectSegment: input.resizeBridgeInput.selectSegment,
      setSelectedLayerId: input.resizeBridgeInput.setSelectedLayerId,
      setFocusedLayerRowId: input.resizeBridgeInput.setFocusedLayerRowId,
    },
  };
}
