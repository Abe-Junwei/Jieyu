import { useTranscriptionLayerMetadataController } from './useTranscriptionLayerMetadataController';
import { useTranscriptionSelfCertaintyController } from './useTranscriptionSelfCertaintyController';
import { useTrackDisplayController } from './useTrackDisplayController';
import { useTrackEntityPersistenceController } from './useTrackEntityPersistenceController';
import { useTrackEntityStateController } from './useTrackEntityStateController';
import { useReadyWorkspaceTextEditingController } from './useReadyWorkspaceTextEditingController';
import { useReadyWorkspaceTrackEditSpeakerBatchChain } from './useReadyWorkspaceTrackEditControllersSpeakerBatch';
import { buildReadyWorkspaceTextEditingControllerInput } from './transcriptionReadyWorkspaceDomainInputBuilder';
import { timeRangeDragPreviewFromSegmentRangeGesturePreview } from '../utils/segmentRangeGesturePreviewReadModel';
import type { UseReadyWorkspaceTrackEditControllersParams } from './readyWorkspaceTrackEditControllersParams';
import type { UnitSelfCertainty } from '../utils/unitSelfCertainty';

export type { UseReadyWorkspaceTrackEditControllersParams } from './readyWorkspaceTrackEditControllersParams';

export function useReadyWorkspaceTrackEditControllers(
  params: UseReadyWorkspaceTrackEditControllersParams,
) {
  const {
    data,
    timelineUnitViewIndex,
    activeTimelineUnitId,
    selectedUnitIds,
    selectedTimelineUnit,
    selectedTimelineMedia,
    defaultTranscriptionLayerId,
    selectedLayerId,
    segmentsByLayer,
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
    getUnitSpeakerKey,
  } = params;

  const { speakerActionScopeController, batchOperationController, speakerController } =
    useReadyWorkspaceTrackEditSpeakerBatchChain(params);

  const selfCertaintyController = useTranscriptionSelfCertaintyController({
    segmentsByLayer,
    currentMediaUnits: timelineUnitViewIndex.currentMediaUnits,
    units: data.units,
    saveUnitSelfCertainty: (
      targets: readonly { id: string }[],
      value: UnitSelfCertainty | undefined,
    ) =>
      data.saveUnitSelfCertainty(
        targets.map((t) => t.id),
        value,
      ),
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
