import { useTranscriptionLayerMetadataController } from './useTranscriptionLayerMetadataController';
import { useTranscriptionSelfCertaintyController } from './useTranscriptionSelfCertaintyController';
import { useTranscriptionSpeakerController } from './useTranscriptionSpeakerController';
import { useSpeakerActionScopeController } from './useSpeakerActionScopeController';
import { useBatchOperationController } from './useBatchOperationController';
import { useTrackDisplayController } from './useTrackDisplayController';
import { useTrackEntityPersistenceController } from './useTrackEntityPersistenceController';
import { useTrackEntityStateController } from './useTrackEntityStateController';
import { useReadyWorkspaceTextEditingController } from './useReadyWorkspaceTextEditingController';
import { buildReadyWorkspaceTextEditingControllerInput } from './transcriptionReadyWorkspaceDomainInputBuilder';
import { timeRangeDragPreviewFromSegmentRangeGesturePreview } from '../utils/segmentRangeGesturePreviewReadModel';

export interface UseReadyWorkspaceTrackEditControllersParams {
  data: any;
  timelineUnitViewIndex: any;
  getUnitDocById: any;
  activeTimelineUnitId: any;
  selectedUnitIds: any;
  selectedTimelineUnit: any;
  selectedTimelineMedia: any;
  selectedUnit: any;
  defaultTranscriptionLayerId: any;
  selectedLayerId: any;
  segmentsByLayer: any;
  segmentContentByLayer: any;
  transcriptionTrackMode: any;
  activeTextId: any;
  segmentTimelineLayerIds: any;
  displayStyleControl: any;
  manualSelectTsRef: any;
  player: any;
  navigateUnitFromInput: any;
  waveformAreaRef: any;
  segmentRangeGesturePreviewReadModel: any;
  timelineViewportProjection: any;
  focusedLayerRowId: any;
  zoomToUnit: any;
  startTimelineResizeDrag: any;
  handleNoteClick: any;
  resolveNoteIndicatorTarget: any;
  setOverlapCycleToast: any;
  overlapCycleTelemetryRef: any;
  createLayerWithActiveContext: any;
  handleFocusLayerRow: any;
  tierContainerRef: any;
  zoomPxPerSec: any;
  setCtxMenu: any;
  activeLayerIdForEdits: any;
  setLockConflictToast: any;
  selectUnitRange: any;
  toggleUnitSelection: any;
  selectUnit: any;
  selectSegment: any;
  setSelectedLayerId: any;
  formatTime: any;
  getUnitSpeakerKey: any;
}

export function useReadyWorkspaceTrackEditControllers(
  params: UseReadyWorkspaceTrackEditControllersParams,
) {
  const {
    data,
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
    transcriptionTrackMode,
    activeTextId,
    segmentTimelineLayerIds,
    displayStyleControl,
    manualSelectTsRef,
    player,
    navigateUnitFromInput,
    waveformAreaRef,
    segmentRangeGesturePreviewReadModel,
    timelineViewportProjection,
    focusedLayerRowId,
    zoomToUnit,
    startTimelineResizeDrag,
    handleNoteClick,
    resolveNoteIndicatorTarget,
    setOverlapCycleToast,
    overlapCycleTelemetryRef,
    createLayerWithActiveContext,
    handleFocusLayerRow,
    tierContainerRef,
    zoomPxPerSec,
    setCtxMenu,
    activeLayerIdForEdits,
    setLockConflictToast,
    selectUnitRange,
    toggleUnitSelection,
    selectUnit,
    selectSegment,
    setSelectedLayerId,
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
    reloadSegments: data.reloadSegments,
    refreshSegmentUndoSnapshot: data.refreshSegmentUndoSnapshot,
    updateSegmentsLocally: data.updateSegmentsLocally,
    layerAction: data.layerAction,
    recordTimelineEdit: data.recordTimelineEdit,
  });

  const selfCertaintyController = useTranscriptionSelfCertaintyController({
    segmentsByLayer,
    currentMediaUnits: timelineUnitViewIndex.currentMediaUnits,
    units: data.units,
    saveUnitSelfCertainty: ((targets: readonly { id: string }[], value: number) => {
      data.saveUnitSelfCertainty(
        targets.map((t) => t.id),
        value,
      );
    }) as any,
  });

  const { updateLayerMetadata } = useTranscriptionLayerMetadataController({
    layers: data.layers,
    layerLinks: data.layerLinks,
    setLayerCreateMessage: data.setLayerCreateMessage,
    setLayers: data.setLayers,
    setLayerLinks: data.setLayerLinks,
  });

  const trackEntityStateController = useTrackEntityStateController({
    activeTextId,
    selectedTimelineMediaId: selectedTimelineMedia?.id ?? null,
    setTranscriptionTrackMode: data.setTranscriptionTrackMode,
  });

  const { annotationController, timelineController } = useReadyWorkspaceTextEditingController(
    buildReadyWorkspaceTextEditingControllerInput({
      transcriptionLayers: data.transcriptionLayers,
      translationLayers: data.translationLayers,
      annotationInput: {
        manualSelectTsRef,
        player,
        selectedTimelineUnit,
        currentTimelineUnitId: activeTimelineUnitId,
        selectUnitRange,
        toggleUnitSelection,
        selectTimelineUnit: data.selectTimelineUnit,
        selectUnit,
        selectSegment,
        setSelectedLayerId,
        onFocusLayerRow: handleFocusLayerRow,
        tierContainerRef,
        zoomPxPerSec,
        setCtxMenu,
        navigateUnitFromInput,
        waveformAreaRef,
        dragPreview: timeRangeDragPreviewFromSegmentRangeGesturePreview(
          segmentRangeGesturePreviewReadModel,
        ),
        selectedUnitIds,
        focusedLayerRowId,
        zoomToUnit,
        startTimelineResizeDrag,
        handleNoteClick,
        resolveNoteIndicatorTarget,
        setOverlapCycleToast,
        overlapCycleTelemetryRef,
      },
      speakerVisualByUnitId: speakerActionScopeController.speakerVisualByTimelineUnitId,
      independentLayerIds: segmentTimelineLayerIds,
      orthographies: displayStyleControl.orthographies,
      resolveSelfCertaintyForUnit: selfCertaintyController.resolveSelfCertaintyForUnit,
      resolveSelfCertaintyAmbiguityForUnit:
        selfCertaintyController.resolveSelfCertaintyAmbiguityForUnit,
      timelineInput: {
        activeSpeakerFilterKey: speakerController.activeSpeakerFilterKey,
        unitsOnCurrentMedia: data.unitsOnCurrentMedia,
        getUnitSpeakerKey,
        rulerView: timelineViewportProjection.rulerView ?? null,
        playerDuration: player.duration,
        translations: data.translations,
        selectedBatchUnits: batchOperationController.selectedBatchUnits,
        selectedLayerId: selectedLayerId ?? null,
        getUnitTextForLayer: data.getUnitTextForLayer,
        unitDrafts: data.unitDrafts,
        setUnitDrafts: data.setUnitDrafts,
        translationDrafts: data.translationDrafts,
        setTranslationDrafts: data.setTranslationDrafts,
        translationTextByLayer: data.translationTextByLayer,
        focusedTranslationDraftKeyRef: data.focusedTranslationDraftKeyRef,
        scheduleAutoSave: data.scheduleAutoSave,
        clearAutoSaveTimer: data.clearAutoSaveTimer,
        saveUnitText: data.saveUnitText,
        saveUnitLayerText: data.saveUnitLayerText,
        createLayer: createLayerWithActiveContext,
        updateLayerMetadata,
        deleteLayer: data.deleteLayer,
        deleteLayerWithoutConfirm: data.deleteLayerWithoutConfirm,
        checkLayerHasContent: data.checkLayerHasContent,
      },
    }),
  );

  const trackDisplayController = useTrackDisplayController({
    unitsOnCurrentMedia: data.unitsOnCurrentMedia,
    timelineUnitsOnCurrentMedia: timelineUnitViewIndex.currentMediaUnits,
    timelineRenderUnits: timelineController.timelineRenderUnits,
    activeLayerIdForEdits,
    ...(defaultTranscriptionLayerId !== undefined ? { defaultTranscriptionLayerId } : {}),
    layers: data.layers,
    segmentsByLayer,
    segmentSpeakerAssignmentsOnCurrentMedia:
      speakerActionScopeController.segmentSpeakerAssignmentsOnCurrentMedia,
    transcriptionTrackMode,
    setTranscriptionTrackMode: data.setTranscriptionTrackMode,
    laneLockMap: trackEntityStateController.laneLockMap,
    setLaneLockMap: trackEntityStateController.setLaneLockMap,
    selectedSpeakerIdsForTrackLock: speakerController.selectedSpeakerIdsForTrackLock,
    speakerNameById: speakerController.speakerNameById,
    setLockConflictToast,
    getUnitSpeakerKey,
  });

  useTrackEntityPersistenceController({
    activeTextId: trackEntityStateController.persistenceContext.activeTextId,
    trackEntityScopedKey: trackEntityStateController.persistenceContext.trackEntityScopedKey,
    trackEntityStateByMediaRef:
      trackEntityStateController.persistenceContext.trackEntityStateByMediaRef,
    trackEntityHydratedKeyRef:
      trackEntityStateController.persistenceContext.trackEntityHydratedKeyRef,
    transcriptionTrackMode,
    effectiveLaneLockMap: trackDisplayController.effectiveLaneLockMap,
  });

  return {
    speakerActionScopeController,
    batchOperationController,
    speakerController,
    selfCertaintyController,
    updateLayerMetadata,
    trackEntityStateController,
    annotationController,
    timelineController,
    trackDisplayController,
  };
}
