import type { useReadyWorkspaceTimelineSyncController } from './useReadyWorkspaceTimelineSyncController';

type ReadyWorkspaceTimelineSyncControllerInput = Parameters<
  typeof useReadyWorkspaceTimelineSyncController
>[0];
type ReadyWorkspaceTimelineInteractionInput = Omit<
  ReadyWorkspaceTimelineSyncControllerInput['interactionInput'],
  'onRevealSchemaLayer'
>;

type BuildReadyWorkspaceTimelineInteractionReadInput = Pick<
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

type BuildReadyWorkspaceTimelineInteractionWriteInput = Omit<
  ReadyWorkspaceTimelineInteractionInput,
  keyof BuildReadyWorkspaceTimelineInteractionReadInput
>;

/**
 * 必须由 ReadyWorkspace 壳层（波形桥 / UI state / segment scope）显式注入，**禁止**从 `useTranscriptionData` 取。
 * Keys are duplicated as a const tuple so adding a new host field forces updates in both places.
 */
export const READY_WORKSPACE_TIMELINE_HOST_WRITE_KEYS = [
  'setSubSelectionRange',
  'setDragPreview',
  'zoomToPercent',
  'zoomToUnit',
  'setCtxMenu',
  'reloadSegments',
] as const satisfies ReadonlyArray<keyof BuildReadyWorkspaceTimelineInteractionWriteInput>;

export type ReadyWorkspaceTimelineHostWriteInput = Pick<
  BuildReadyWorkspaceTimelineInteractionWriteInput,
  (typeof READY_WORKSPACE_TIMELINE_HOST_WRITE_KEYS)[number]
>;

/** 仅含 `useTranscriptionDataBindings` 能提供的写入切片；与 `hostWrite` 无交集。 */
export type ReadyWorkspaceTimelineDomainWriteInput = Omit<
  BuildReadyWorkspaceTimelineInteractionWriteInput,
  keyof ReadyWorkspaceTimelineHostWriteInput
>;

export type BuildReadyWorkspaceTimelineInteractionInput = {
  readInput: BuildReadyWorkspaceTimelineInteractionReadInput;
  domainWrite: ReadyWorkspaceTimelineDomainWriteInput;
  hostWrite: ReadyWorkspaceTimelineHostWriteInput;
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
    ...input.domainWrite,
    ...input.hostWrite,
    onRevealSchemaLayer: (layerId) => {
      input.revealSchemaLayerHandlers.setSelectedLayerId(layerId);
      input.revealSchemaLayerHandlers.setFocusedLayerRowId(layerId);
      input.revealSchemaLayerHandlers.setFlashLayerRowId(layerId);
    },
  };
}
