import { useTranscriptionSegmentMutationController } from './useTranscriptionSegmentMutationController';
import { useReadyWorkspaceSegmentMutationAdapters } from './useReadyWorkspaceSegmentMutationAdapters';
import { useTranscriptionSegmentCreationController } from './useTranscriptionSegmentCreationController';

type SegmentMutationControllerInput = Parameters<
  typeof useTranscriptionSegmentMutationController
>[0];
type SegmentCreationControllerInput = Parameters<
  typeof useTranscriptionSegmentCreationController
>[0];

export interface UseReadyWorkspaceSegmentMutationCreationClusterParams extends Pick<
  SegmentMutationControllerInput,
  | 'activeLayerIdForEdits'
  | 'resolveSegmentRoutingForLayer'
  | 'pushUndo'
  | 'reloadSegments'
  | 'refreshSegmentUndoSnapshot'
  | 'selectTimelineUnit'
  | 'setSaveState'
  | 'splitUnit'
  | 'mergeSelectedUnits'
  | 'mergeWithPrevious'
  | 'mergeWithNext'
  | 'deleteUnit'
  | 'deleteSelectedUnits'
> {
  timelineCurrentMediaUnits: SegmentMutationControllerInput['unitsOnCurrentMedia'];
  getUnitDocById: SegmentMutationControllerInput['getUnitDocById'];
  findUnitDocContainingRange: SegmentMutationControllerInput['findUnitDocContainingRange'];
  recordTimelineEdit: NonNullable<SegmentMutationControllerInput['recordTimelineEdit']>;
  reloadSegmentContents: Parameters<
    typeof useReadyWorkspaceSegmentMutationAdapters
  >[0]['reloadSegmentContents'];
  selectedTimelineMediaForCreation: SegmentCreationControllerInput['selectedTimelineMedia'];
  getDocumentSpanSec: NonNullable<SegmentCreationControllerInput['getDocumentSpanSec']>;
  ensureTimelineMediaRowResolved?: SegmentCreationControllerInput['ensureTimelineMediaRowResolved'];
  findOverlappingUnitDoc: SegmentCreationControllerInput['findOverlappingUnitDoc'];
  createAdjacentUnit: SegmentCreationControllerInput['createAdjacentUnit'];
  createUnitFromSelection: SegmentCreationControllerInput['createUnitFromSelection'];
}

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
      reloadSegments: reloadSegments as SegmentCreationControllerInput['reloadSegments'],
      refreshSegmentUndoSnapshot:
        refreshSegmentUndoSnapshot as SegmentCreationControllerInput['refreshSegmentUndoSnapshot'],
      reloadSegmentContents:
        reloadSegmentContents as SegmentCreationControllerInput['reloadSegmentContents'],
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
