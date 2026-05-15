/**
 * Phase C2: speaker action scope + batch + speaker controller chain (ordering-dependent).
 * Aggregated by `useReadyWorkspaceTrackEditControllers`.
 */

import { useTranscriptionSpeakerController } from './useTranscriptionSpeakerController';
import { useSpeakerActionScopeController } from './useSpeakerActionScopeController';
import { useBatchOperationController } from './useBatchOperationController';
import type { UseReadyWorkspaceTrackEditControllersParams } from './readyWorkspaceTrackEditControllersParams';

export function useReadyWorkspaceTrackEditSpeakerBatchChain(
  params: UseReadyWorkspaceTrackEditControllersParams,
) {
  const {
    data,
    reloadSegments,
    refreshSegmentUndoSnapshot,
    updateSegmentsLocally,
    layerAction,
    recordTimelineEdit,
    timelineUnitViewIndex,
    getUnitDocById,
    activeTimelineUnitId,
    selectedUnitIds,
    selectedTimelineUnit,
    selectedTimelineMedia,
    selectedUnit,
    defaultTranscriptionLayerId,
    selectedLayerId,
    segmentsByLayer,
    segmentContentByLayer,
    formatTime,
    getUnitSpeakerKey,
  } = params;

  const speakerActionScopeController = useSpeakerActionScopeController({
    unitsOnCurrentMedia: timelineUnitViewIndex.currentMediaUnits,
    unitViewById: timelineUnitViewIndex.byId,
    resolveUnitViewById: timelineUnitViewIndex.resolveBySemanticId,
    getUnitDocById,
    segmentsByLayer,
    speakers: data.speakers,
    layers: data.layers,
    ...(defaultTranscriptionLayerId !== undefined ? { defaultTranscriptionLayerId } : {}),
    ...(selectedLayerId !== undefined ? { selectedLayerId } : {}),
    selectedUnitIds,
    selectedTimelineUnit,
    getUnitSpeakerKey,
  });

  const batchOperationController = useBatchOperationController({
    selectedUnitIds,
    selectedTimelineUnit,
    unitViewById: timelineUnitViewIndex.byId,
    resolveUnitViewById: timelineUnitViewIndex.resolveBySemanticId,
    unitsOnCurrentMedia: timelineUnitViewIndex.currentMediaUnits,
    getUnitDocById,
    setSaveState: data.setSaveState,
    offsetSelectedTimes: data.offsetSelectedTimes,
    scaleSelectedTimes: data.scaleSelectedTimes,
    splitByRegex: data.splitByRegex,
    mergeSelectedUnits: data.mergeSelectedUnits,
  });

  const speakerController = useTranscriptionSpeakerController({
    units: data.units,
    setUnits: data.setUnits,
    speakers: data.speakers,
    setSpeakers: data.setSpeakers,
    unitsOnCurrentMedia: timelineUnitViewIndex.currentMediaUnits,
    getUnitDocById,
    activeTimelineUnitId,
    selectedUnitIds,
    selectedBatchSegmentsForSpeakerActions:
      speakerActionScopeController.selectedBatchSegmentsForSpeakerActions,
    selectedBatchUnits: speakerActionScopeController.selectedBatchUnits,
    selectedTimelineUnit,
    selectedTimelineMediaId: selectedTimelineMedia?.id ?? null,
    selectedUnit: selectedUnit ?? null,
    statePhase: data.state.phase,
    setUnitSelection: data.setUnitSelection,
    data,
    setSaveState: data.setSaveState,
    getUnitTextForLayer: data.getUnitTextForLayer,
    formatTime,
    getUnitSpeakerKey,
    activeSpeakerManagementLayer: speakerActionScopeController.activeSpeakerManagementLayer,
    segmentsByLayer,
    segmentContentByLayer,
    resolveExplicitSpeakerKeyForSegment:
      speakerActionScopeController.resolveExplicitSpeakerKeyForSegment,
    resolveSpeakerKeyForSegment: speakerActionScopeController.resolveSpeakerKeyForSegment,
    selectedUnitIdsForSpeakerActions: speakerActionScopeController.selectedUnitIdsForSpeakerActions,
    segmentByIdForSpeakerActions: speakerActionScopeController.segmentByIdForSpeakerActions,
    resolveSpeakerActionUnitIds: speakerActionScopeController.resolveSpeakerActionUnitIds,
    speakerFilterOptionsForActions: speakerActionScopeController.speakerFilterOptionsForActions,
    segmentSpeakerAssignmentsOnCurrentMedia:
      speakerActionScopeController.segmentSpeakerAssignmentsOnCurrentMedia,
    selectTimelineUnit: data.selectTimelineUnit,
    setSelectedUnitIds: data.setSelectedUnitIds,
    reloadSegments,
    refreshSegmentUndoSnapshot,
    updateSegmentsLocally,
    layerAction,
    recordTimelineEdit,
  });

  return { speakerActionScopeController, batchOperationController, speakerController };
}
