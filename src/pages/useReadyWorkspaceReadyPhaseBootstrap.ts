import type { MutableRefObject } from 'react';

import type { DbState } from '../hooks/transcriptionTypes';
import type { Locale } from '../i18n';

import { useTranscriptionSegmentMutationController } from './useTranscriptionSegmentMutationController';
import { useTranscriptionSegmentCreationController } from './useTranscriptionSegmentCreationController';
import { useUnitOps } from '../hooks/useUnitOps';

import { useReadyWorkspaceSegmentGraphCluster } from './useReadyWorkspaceSegmentGraphCluster';
import { useReadyWorkspaceSegmentMutationCreationCluster } from './useReadyWorkspaceSegmentMutationCreationCluster';
import { useReadyWorkspaceUnitOpsAndOverlayCluster } from './useReadyWorkspaceUnitOpsAndOverlayCluster';

type SegmentMutationControllerInput = Parameters<
  typeof useTranscriptionSegmentMutationController
>[0];
type SegmentCreationControllerInput = Parameters<
  typeof useTranscriptionSegmentCreationController
>[0];
type SegmentRangeClampInput = Parameters<
  typeof import('./useReadyWorkspaceSegmentRangeClamp').useReadyWorkspaceSegmentRangeClamp
>[0];
type InteractionHelpersInput = Parameters<
  typeof import('./useReadyWorkspaceInteractionHelpers').useReadyWorkspaceInteractionHelpers
>[0];

export type UseReadyWorkspaceReadyPhaseBootstrapParams = Pick<
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
> &
  Pick<
    SegmentCreationControllerInput,
    | 'ensureTimelineMediaRowResolved'
    | 'createAdjacentUnit'
    | 'createUnitFromSelection'
    | 'reloadSegmentContents'
  > &
  Pick<InteractionHelpersInput, 'unitsOnCurrentMedia'> & {
    statePhase: DbState['phase'];
    timelineTotalCount: number;
    timelineCurrentMediaUnits: SegmentMutationControllerInput['unitsOnCurrentMedia'];
    setState: Parameters<
      typeof import('./useReadyWorkspaceUnifiedUnitCountSync').useReadyWorkspaceUnifiedUnitCountSync
    >[0]['setState'];
    segmentScopeMediaItem: SegmentRangeClampInput['segmentScopeMediaItem'];
    selectedTimelineMedia: SegmentRangeClampInput['selectedTimelineMedia'];
    documentSpanSecFromBridgeRef: MutableRefObject<number>;
    selectedTimelineMediaForCreation: SegmentCreationControllerInput['selectedTimelineMedia'];
    selectAllBefore: Parameters<typeof useUnitOps>[0]['selectAllBefore'];
    selectAllAfter: Parameters<typeof useUnitOps>[0]['selectAllAfter'];
    units: Parameters<typeof useUnitOps>[0]['units'];
    translationTextByLayer: Parameters<typeof useUnitOps>[0]['translationTextByLayer'];
    locale: Locale;
  };

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
