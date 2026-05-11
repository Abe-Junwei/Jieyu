import { useReadyWorkspaceSegmentGraphCluster } from './useReadyWorkspaceSegmentGraphCluster';
import { useReadyWorkspaceSegmentMutationCreationCluster } from './useReadyWorkspaceSegmentMutationCreationCluster';
import { useReadyWorkspaceUnitOpsAndOverlayCluster } from './useReadyWorkspaceUnitOpsAndOverlayCluster';

import type { UseReadyWorkspaceReadyPhaseBootstrapParams } from './useReadyWorkspaceReadyPhaseBootstrap.types';
export type { UseReadyWorkspaceReadyPhaseBootstrapParams };

export function useReadyWorkspaceReadyPhaseBootstrap(
  params: UseReadyWorkspaceReadyPhaseBootstrapParams,
) {
  const graph = useReadyWorkspaceSegmentGraphCluster({
    statePhase: params.statePhase,
    timelineTotalCount: params.timelineTotalCount,
    setState: params.setState,
    activeLayerIdForEdits: params.activeLayerIdForEdits,
    resolveSegmentRoutingForLayer: params.resolveSegmentRoutingForLayer,
    timelineCurrentMediaUnits: params.timelineCurrentMediaUnits,
    segmentScopeMediaItem: params.segmentScopeMediaItem,
    selectedTimelineMedia: params.selectedTimelineMedia,
    documentSpanSecFromBridgeRef: params.documentSpanSecFromBridgeRef,
    unitsOnCurrentMedia: params.unitsOnCurrentMedia,
  });

  const mutationCreation = useReadyWorkspaceSegmentMutationCreationCluster({
    activeLayerIdForEdits: params.activeLayerIdForEdits,
    resolveSegmentRoutingForLayer: params.resolveSegmentRoutingForLayer,
    pushUndo: params.pushUndo,
    reloadSegments: params.reloadSegments,
    refreshSegmentUndoSnapshot: params.refreshSegmentUndoSnapshot,
    selectTimelineUnit: params.selectTimelineUnit,
    setSaveState: params.setSaveState,
    splitUnit: params.splitUnit,
    mergeSelectedUnits: params.mergeSelectedUnits,
    mergeWithPrevious: params.mergeWithPrevious,
    mergeWithNext: params.mergeWithNext,
    deleteUnit: params.deleteUnit,
    deleteSelectedUnits: params.deleteSelectedUnits,
    timelineCurrentMediaUnits: params.timelineCurrentMediaUnits,
    getUnitDocById: graph.getUnitDocById,
    findUnitDocContainingRange: graph.findUnitDocContainingRange,
    recordTimelineEdit: graph.recordTimelineEdit,
    reloadSegmentContents: params.reloadSegmentContents,
    selectedTimelineMediaForCreation: params.selectedTimelineMediaForCreation,
    getDocumentSpanSec: () => params.documentSpanSecFromBridgeRef.current,
    ...(params.ensureTimelineMediaRowResolved !== undefined
      ? { ensureTimelineMediaRowResolved: params.ensureTimelineMediaRowResolved }
      : {}),
    findOverlappingUnitDoc: graph.findOverlappingUnitDoc,
    createAdjacentUnit: params.createAdjacentUnit,
    createUnitFromSelection: params.createUnitFromSelection,
  });

  const unitOverlay = useReadyWorkspaceUnitOpsAndOverlayCluster({
    units: params.units,
    translationTextByLayer: params.translationTextByLayer,
    mergeSelectedUnits: params.mergeSelectedUnits,
    selectAllBefore: params.selectAllBefore,
    selectAllAfter: params.selectAllAfter,
    locale: params.locale,
    setSaveState: params.setSaveState,
    mutationCreation,
  });

  return {
    tierIndependentSegmentCreateRangeClamp: graph.tierIndependentSegmentCreateRangeClamp,
    recentTimelineEditEvents: graph.recentTimelineEditEvents,
    recordTimelineEdit: graph.recordTimelineEdit,
    getUnitDocById: graph.getUnitDocById,
    findUnitDocContainingRange: graph.findUnitDocContainingRange,
    findOverlappingUnitDoc: graph.findOverlappingUnitDoc,
    ...mutationCreation,
    ...unitOverlay,
  };
}
