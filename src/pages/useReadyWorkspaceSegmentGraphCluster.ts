import type { MutableRefObject } from 'react';

import type { DbState } from '../hooks/transcriptionTypes';

import { useReadyWorkspaceUnifiedUnitCountSync } from './useReadyWorkspaceUnifiedUnitCountSync';
import { useReadyWorkspaceSegmentRangeClamp } from './useReadyWorkspaceSegmentRangeClamp';
import { useReadyWorkspaceInteractionHelpers } from './useReadyWorkspaceInteractionHelpers';

import type { UseTranscriptionSegmentCreationControllerInput } from './transcriptionSegmentCreationActions';
import { useTranscriptionSegmentMutationController } from './useTranscriptionSegmentMutationController';

type SegmentMutationControllerInput = Parameters<
  typeof useTranscriptionSegmentMutationController
>[0];
type SegmentRangeClampInput = Parameters<typeof useReadyWorkspaceSegmentRangeClamp>[0];
type InteractionHelpersInput = Parameters<typeof useReadyWorkspaceInteractionHelpers>[0];

export interface UseReadyWorkspaceSegmentGraphClusterParams {
  statePhase: DbState['phase'];
  timelineTotalCount: number;
  setState: Parameters<typeof useReadyWorkspaceUnifiedUnitCountSync>[0]['setState'];
  activeLayerIdForEdits: SegmentMutationControllerInput['activeLayerIdForEdits'];
  resolveSegmentRoutingForLayer: SegmentMutationControllerInput['resolveSegmentRoutingForLayer'];
  timelineCurrentMediaUnits: SegmentMutationControllerInput['unitsOnCurrentMedia'];
  segmentScopeMediaItem: SegmentRangeClampInput['segmentScopeMediaItem'];
  selectedTimelineMedia: SegmentRangeClampInput['selectedTimelineMedia'];
  documentSpanSecFromBridgeRef: MutableRefObject<number>;
  unitsOnCurrentMedia: InteractionHelpersInput['unitsOnCurrentMedia'];
}

export function useReadyWorkspaceSegmentGraphCluster(
  params: UseReadyWorkspaceSegmentGraphClusterParams,
) {
  const {
    statePhase,
    timelineTotalCount,
    setState,
    activeLayerIdForEdits,
    resolveSegmentRoutingForLayer,
    timelineCurrentMediaUnits,
    segmentScopeMediaItem,
    selectedTimelineMedia,
    documentSpanSecFromBridgeRef,
    unitsOnCurrentMedia,
  } = params;

  useReadyWorkspaceUnifiedUnitCountSync({
    statePhase,
    timelineTotalCount,
    setState,
  });

  const tierIndependentSegmentCreateRangeClamp = useReadyWorkspaceSegmentRangeClamp({
    activeLayerIdForEdits,
    resolveSegmentRoutingForLayer,
    currentMediaUnits: timelineCurrentMediaUnits,
    segmentScopeMediaItem,
    selectedTimelineMedia,
    getDocumentSpanSec: () => documentSpanSecFromBridgeRef.current,
  });

  const {
    recentTimelineEditEvents,
    recordTimelineEdit,
    getUnitDocById,
    findUnitDocContainingRange,
    findOverlappingUnitDoc,
  } = useReadyWorkspaceInteractionHelpers({
    unitsOnCurrentMedia,
  });

  return {
    tierIndependentSegmentCreateRangeClamp,
    recentTimelineEditEvents,
    recordTimelineEdit,
    getUnitDocById: getUnitDocById as unknown as SegmentMutationControllerInput['getUnitDocById'],
    findUnitDocContainingRange:
      findUnitDocContainingRange as unknown as SegmentMutationControllerInput['findUnitDocContainingRange'],
    findOverlappingUnitDoc:
      findOverlappingUnitDoc as unknown as UseTranscriptionSegmentCreationControllerInput['findOverlappingUnitDoc'],
  };
}
