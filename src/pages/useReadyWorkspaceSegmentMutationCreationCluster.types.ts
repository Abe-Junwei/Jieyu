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
