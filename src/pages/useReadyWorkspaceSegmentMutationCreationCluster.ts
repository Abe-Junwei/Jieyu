import { useTranscriptionSegmentMutationController } from './useTranscriptionSegmentMutationController';
import { useReadyWorkspaceSegmentMutationAdapters } from './useReadyWorkspaceSegmentMutationAdapters';
import { useTranscriptionSegmentCreationController } from './useTranscriptionSegmentCreationController';

import type { UseReadyWorkspaceSegmentMutationCreationClusterParams } from './useReadyWorkspaceSegmentMutationCreationCluster.types';

export type { UseReadyWorkspaceSegmentMutationCreationClusterParams };

export function useReadyWorkspaceSegmentMutationCreationCluster(
  params: UseReadyWorkspaceSegmentMutationCreationClusterParams,
) {
  const {
    activeLayerIdForEdits,
    resolveSegmentRoutingForLayer,
    pushUndo,
    reloadSegments,
    refreshSegmentUndoSnapshot,
    selectTimelineUnit,
    setSaveState,
    splitUnit,
    mergeSelectedUnits,
    mergeWithPrevious,
    mergeWithNext,
    deleteUnit,
    deleteSelectedUnits,
    timelineCurrentMediaUnits,
    getUnitDocById,
    findUnitDocContainingRange,
    recordTimelineEdit,
    reloadSegmentContents,
    selectedTimelineMediaForCreation,
    getDocumentSpanSec,
    ensureTimelineMediaRowResolved,
    findOverlappingUnitDoc,
    createAdjacentUnit,
    createUnitFromSelection,
  } = params;

  const {
    splitRouted,
    mergeAdjacentSegmentsForAiRollback,
    mergeWithPreviousRouted,
    mergeWithNextRouted,
    mergeSelectedSegmentsRouted,
    deleteUnitRouted,
    deleteSelectedUnitsRouted,
    toggleSkipProcessingRouted,
  } = useTranscriptionSegmentMutationController({
    activeLayerIdForEdits,
    resolveSegmentRoutingForLayer,
    pushUndo,
    reloadSegments,
    refreshSegmentUndoSnapshot,
    selectTimelineUnit,
    unitsOnCurrentMedia: timelineCurrentMediaUnits,
    getUnitDocById,
    findUnitDocContainingRange,
    setSaveState,
    splitUnit,
    mergeSelectedUnits,
    mergeWithPrevious,
    mergeWithNext,
    deleteUnit,
    deleteSelectedUnits,
    recordTimelineEdit,
  });

  const { splitRoutedVoidResult, silentSegmentGraphSyncForAi } =
    useReadyWorkspaceSegmentMutationAdapters({
      splitRouted,
      reloadSegments,
      refreshSegmentUndoSnapshot,
      reloadSegmentContents,
    });

  const { createNextSegmentRouted, createUnitFromSelectionRouted } =
    useTranscriptionSegmentCreationController({
      activeLayerIdForEdits,
      resolveSegmentRoutingForLayer,
      selectedTimelineMedia: selectedTimelineMediaForCreation,
      getDocumentSpanSec,
      ...(ensureTimelineMediaRowResolved !== undefined ? { ensureTimelineMediaRowResolved } : {}),
      unitsOnCurrentMedia: timelineCurrentMediaUnits,
      getUnitDocById,
      findUnitDocContainingRange,
      findOverlappingUnitDoc,
      pushUndo,
      reloadSegments: reloadSegments as Parameters<
        typeof useTranscriptionSegmentCreationController
      >[0]['reloadSegments'],
      refreshSegmentUndoSnapshot: refreshSegmentUndoSnapshot as Parameters<
        typeof useTranscriptionSegmentCreationController
      >[0]['refreshSegmentUndoSnapshot'],
      reloadSegmentContents: reloadSegmentContents as Parameters<
        typeof useTranscriptionSegmentCreationController
      >[0]['reloadSegmentContents'],
      selectTimelineUnit,
      setSaveState,
      createAdjacentUnit,
      createUnitFromSelection,
      recordTimelineEdit,
    });

  return {
    splitRouted,
    mergeAdjacentSegmentsForAiRollback,
    mergeWithPreviousRouted,
    mergeWithNextRouted,
    mergeSelectedSegmentsRouted,
    deleteUnitRouted,
    deleteSelectedUnitsRouted,
    toggleSkipProcessingRouted,
    splitRoutedVoidResult,
    silentSegmentGraphSyncForAi,
    createNextSegmentRouted,
    createUnitFromSelectionRouted,
  };
}
