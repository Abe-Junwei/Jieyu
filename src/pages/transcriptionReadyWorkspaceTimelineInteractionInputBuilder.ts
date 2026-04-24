import type { useReadyWorkspaceTimelineSyncController } from './useReadyWorkspaceTimelineSyncController';

type ReadyWorkspaceTimelineSyncControllerInput = Parameters<typeof useReadyWorkspaceTimelineSyncController>[0];
type ReadyWorkspaceTimelineInteractionInput = Omit<
  ReadyWorkspaceTimelineSyncControllerInput['interactionInput'],
  'onRevealSchemaLayer'
>;

export type BuildReadyWorkspaceTimelineInteractionReadInput = Pick<
  ReadyWorkspaceTimelineInteractionInput,
  | 'layers'
  | 'units'
  | 'manualSelectTsRef'
  | 'player'
  | 'locale'
  | 'sidePaneRows'
  | 'activeTimelineUnitId'
  | 'waveformTimelineItems'
  | 'activeLayerIdForEdits'
  | 'useSegmentWaveformRegions'
  | 'selectedTimelineUnit'
  | 'subSelectDragRef'
  | 'waveCanvasRef'
  | 'resolveSegmentRoutingForLayer'
  | 'segmentsByLayer'
  | 'unitsOnCurrentMedia'
  | 'selectedUnitIds'
  | 'selectedWaveformRegionId'
  | 'snapEnabled'
  | 'creatingSegmentRef'
  | 'markingModeRef'
>;

export type BuildReadyWorkspaceTimelineInteractionWriteInput = Omit<
  ReadyWorkspaceTimelineInteractionInput,
  keyof BuildReadyWorkspaceTimelineInteractionReadInput
>;

export type BuildReadyWorkspaceTimelineInteractionInput = {
  readInput: BuildReadyWorkspaceTimelineInteractionReadInput;
  writeInput: BuildReadyWorkspaceTimelineInteractionWriteInput;
  revealSchemaLayerHandlers: {
    setSelectedLayerId: ReadyWorkspaceTimelineSyncControllerInput['resizeBridgeInput']['setSelectedLayerId'];
    setFocusedLayerRowId: ReadyWorkspaceTimelineSyncControllerInput['resizeBridgeInput']['setFocusedLayerRowId'];
    setFlashLayerRowId: (layerId: string) => void;
  };
};

export function buildReadyWorkspaceTimelineInteractionInput(
  input: BuildReadyWorkspaceTimelineInteractionInput,
): ReadyWorkspaceTimelineSyncControllerInput['interactionInput'] {
  return {
    ...input.readInput,
    ...input.writeInput,
    onRevealSchemaLayer: (layerId) => {
      input.revealSchemaLayerHandlers.setSelectedLayerId(layerId);
      input.revealSchemaLayerHandlers.setFocusedLayerRowId(layerId);
      input.revealSchemaLayerHandlers.setFlashLayerRowId(layerId);
    },
  };
}
