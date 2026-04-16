import { useEffect } from 'react';
import { useLatest } from './useLatest';
import { useTranscriptionState } from './useTranscriptionState';
import { useTranscriptionRecoverySnapshotScheduler } from './useTranscriptionRecovery';
import { useTranscriptionUndo } from './useTranscriptionUndo';
import { useTranscriptionActions } from './useTranscriptionActions';
import { useTranscriptionAnchorActions } from './useTranscriptionAnchorActions';
import { useTranscriptionSelectionActions } from './useTranscriptionSelectionActions';
import { useTranscriptionAutoSaveActions } from './useTranscriptionAutoSaveActions';
import { useTranscriptionRecoveryActions } from './useTranscriptionRecoveryActions';
import { useTranscriptionSnapshotLoader } from './useTranscriptionSnapshotLoader';
import { useTranscriptionSnapGuideActions } from './useTranscriptionSnapGuideActions';
import { useTranscriptionDerivedData } from './useTranscriptionDerivedData';
import { useTranscriptionMediaSelection } from './useTranscriptionMediaSelection';
import { useTranscriptionSelectionGuards } from './useTranscriptionSelectionGuards';
import { useTranscriptionTranslationDraftSync } from './useTranscriptionTranslationDraftSync';
import { useTranscriptionLifecycle } from './useTranscriptionLifecycle';
import { useTranscriptionMutexActionWrappers } from './useTranscriptionMutexActionWrappers';
import { useTranscriptionCanonicalActions } from './useTranscriptionCanonicalActions';
import { useTranscriptionPersistence } from './useTranscriptionPersistence';
import { isSegmentTimelineUnit, isUnitTimelineUnit, type DbState, type LayerCreateInput, type SaveState, type SnapGuide } from './transcriptionTypes';
export type { DbState, LayerCreateInput, SaveState, SnapGuide };

export function useTranscriptionData() {
  const {
    state,
    setState,
    units,
    setUnits,
    anchors,
    setAnchors,
    layers,
    setLayers,
    translations,
    setTranslations,
    layerLinks,
    setLayerLinks,
    mediaItems,
    setMediaItems,
    speakers,
    setSpeakers,
    selectedTimelineUnit,
    setSelectedTimelineUnit,
    selectedUnitIds,
    setSelectedUnitIds,
    selectedMediaId,
    setSelectedMediaId,
    selectedLayerId,
    setSelectedLayerId,
    saveState,
    setSaveState,
    layerCreateMessage,
    setLayerCreateMessage,
    unitDrafts,
    setUnitDrafts,
    translationDrafts,
    setTranslationDrafts,
    snapGuide,
    setSnapGuide,
    layerToDeleteId,
    setLayerToDeleteId,
    showLayerManager,
    setShowLayerManager,
    transcriptionTrackMode,
    setTranscriptionTrackMode,
    autoSaveTimersRef,
    focusedTranslationDraftKeyRef,
    unitsRef,
    anchorsRef,
    translationsRef,
    layersRef,
    layerLinksRef,
      speakersRef,
    selectedTimelineUnitRef,
    selectedUnitIdRef,
    selectedUnitIdsRef,
    selectedLayerIdRef,
  } = useTranscriptionState();

  const activeUnitId = isUnitTimelineUnit(selectedTimelineUnit)
    ? selectedTimelineUnit.unitId
    : '';
  const activeSegmentUnitId = isSegmentTimelineUnit(selectedTimelineUnit)
    ? selectedTimelineUnit.unitId
    : '';

  const {
    runWithDbMutex,
    syncToDb,
  } = useTranscriptionPersistence({
    unitsRef,
    translationsRef,
      speakersRef,
  });

  const {
    dbNameRef,
    dirtyRef,
    recoverySave,
    scheduleRecoverySave,
  } = useTranscriptionRecoverySnapshotScheduler({
    unitsRef,
    translationsRef,
    layersRef,
  });

  const {
    createAnchor,
    pruneOrphanAnchors,
    updateAnchorTime,
  } = useTranscriptionAnchorActions({
    anchorsRef,
    unitsRef,
    setAnchors,
  });

  const {
    segmentUndoRef,
    timingUndoRef,
    timingGestureRef,
    pushUndo,
    beginTimingGesture,
    endTimingGesture,
    undo,
    undoToHistoryIndex,
    redo,
    canUndo,
    canRedo,
    undoLabel,
    undoHistory,
  } = useTranscriptionUndo({
    unitsRef,
    translationsRef,
    layersRef,
    layerLinksRef,
    speakersRef,
    dirtyRef,
    scheduleRecoverySave,
    syncToDb,
    setUnits,
    setTranslations,
    setLayers,
    setLayerLinks,
      setSpeakers,
    setSaveState,
  });

  // Derived data ---------------------------------------------------------
  const {
    orderedLayers,
    translationLayers,
    transcriptionLayers,
    sidePaneRows,
    deletableLayers,
    layerPendingDelete,
    selectedUnit,
    selectedUnitMedia,
    unitsOnCurrentMedia,
    visibleUnits,
    aiConfidenceAvg,
    translationTextByLayer,
    layerById,
    defaultTranscriptionLayerId,
    getUnitTextForLayer,
    selectedRowMeta,
  } = useTranscriptionDerivedData({
    layers,
    layerToDeleteId,
    selectedTimelineUnit,
    selectedMediaId,
    mediaItems,
    units,
    translations,
  });

  useEffect(() => {
    if (state.phase !== 'ready') return;
    const nextUnitCount = units.length;
    const nextTranslationLayerCount = translationLayers.length;
    const nextTranslationRecordCount = translations.length;
    setState((prev) => {
      if (prev.phase !== 'ready') return prev;
      const nextUnifiedUnitCount = prev.unifiedUnitCount ?? nextUnitCount;
      if (
        prev.unitCount === nextUnitCount
        && prev.unifiedUnitCount === nextUnifiedUnitCount
        && prev.translationLayerCount === nextTranslationLayerCount
        && prev.translationRecordCount === nextTranslationRecordCount
      ) {
        return prev;
      }
      return {
        ...prev,
        unitCount: nextUnitCount,
        unifiedUnitCount: nextUnifiedUnitCount,
        translationLayerCount: nextTranslationLayerCount,
        translationRecordCount: nextTranslationRecordCount,
      };
    });
  }, [state.phase, units.length, translationLayers.length, translations.length, setState]);

  const {
    selectedMediaUrl,
    selectedMediaBlobSize,
    selectedMediaIsVideo,
  } = useTranscriptionMediaSelection({
    mediaItems,
    selectedMediaId,
    setSelectedMediaId,
    selectedUnitMediaId: selectedUnit?.mediaId,
    selectedUnitMedia,
  });

  const unitsOnCurrentMediaRef = useLatest(unitsOnCurrentMedia);

  const {
    clearAutoSaveTimer,
    scheduleAutoSave,
  } = useTranscriptionAutoSaveActions({
    autoSaveTimersRef,
  });

  const {
    loadSnapshot,
    loadLinguisticAnnotations,
  } = useTranscriptionSnapshotLoader({
    dbNameRef,
    setAnchors,
    setLayerLinks,
    setLayers,
    setMediaItems,
    setSpeakers,
    setSelectedLayerId,
    setSelectedUnitIds,
    setSelectedTimelineUnit,
    setState,
    setTranslations,
    setUnitDrafts,
    setUnits,
  });

  const {
    checkRecovery,
    applyRecovery,
    dismissRecovery,
  } = useTranscriptionRecoveryActions({
    dbNameRef,
    unitsRef,
    loadSnapshot,
    runWithDbMutex,
    setSaveState,
  });

  // Action implementations -----------------------------------------------
  const {
    saveVoiceTranslation: saveVoiceTranslationRaw,
    deleteVoiceTranslation: deleteVoiceTranslationRaw,
    saveUnitText: saveUnitTextRaw,
    saveUnitSelfCertainty: saveUnitSelfCertaintyRaw,
    saveUnitTiming: saveUnitTimingRaw,
    saveUnitLayerText: saveUnitLayerTextRaw,
    createAdjacentUnit: createAdjacentUnitRaw,
    createUnitFromSelection: createUnitFromSelectionRaw,
    deleteUnit: deleteUnitRaw,
    mergeWithPrevious: mergeWithPreviousRaw,
    mergeWithNext: mergeWithNextRaw,
    splitUnit: splitUnitRaw,
    deleteSelectedUnits: deleteSelectedUnitsRaw,
    offsetSelectedTimes: offsetSelectedTimesRaw,
    scaleSelectedTimes: scaleSelectedTimesRaw,
    splitByRegex: splitByRegexRaw,
    mergeSelectedUnits: mergeSelectedUnitsRaw,
    createLayer: createLayerRaw,
    deleteLayer: deleteLayerRaw,
    deleteLayerWithoutConfirm,
    checkLayerHasContent,
    toggleLayerLink: toggleLayerLinkRaw,
    addMediaItem,
    reorderLayers,
  } = useTranscriptionActions({
    defaultTranscriptionLayerId,
    layerById,
    layers,
    layerLinks,
    layerToDeleteId,
    selectedLayerId,
    selectedUnitMedia,
    activeUnitId,
    translations,
    unitsRef,
    unitsOnCurrentMediaRef,
    getUnitTextForLayer,
    timingGestureRef,
    timingUndoRef,
    pushUndo,
    rollbackUndo: undo,
    createAnchor,
    updateAnchorTime,
    pruneOrphanAnchors,
    setSaveState,
    setLayerCreateMessage,
    setLayers,
    setLayerLinks,
    setLayerToDeleteId,
    setShowLayerManager,
    setSelectedLayerId,
    setSelectedMediaId,
    setSnapGuide,
    setMediaItems,
    setTranslations,
    setUnits,
    setUnitDrafts,
    setSelectedUnitIds,
    setSelectedTimelineUnit,
    allowOverlapInTranscription: transcriptionTrackMode !== 'single',
  });

  const {
    saveVoiceTranslation,
    deleteVoiceTranslation,
    saveUnitText,
    saveUnitSelfCertainty,
    saveUnitTiming,
    saveUnitLayerText,
    createAdjacentUnit,
    createUnitFromSelection,
    deleteUnit,
    mergeWithPrevious,
    mergeWithNext,
    splitUnit,
    deleteSelectedUnits,
    offsetSelectedTimes,
    scaleSelectedTimes,
    splitByRegex,
    mergeSelectedUnits,
    createLayer,
    deleteLayer,
    toggleLayerLink,
  } = useTranscriptionMutexActionWrappers({
    runWithDbMutex,
    saveVoiceTranslationRaw,
    deleteVoiceTranslationRaw,
    saveUnitTextRaw,
    saveUnitSelfCertaintyRaw,
    saveUnitTimingRaw,
    saveUnitLayerTextRaw,
    createAdjacentUnitRaw,
    createUnitFromSelectionRaw,
    deleteUnitRaw,
    mergeWithPreviousRaw,
    mergeWithNextRaw,
    splitUnitRaw,
    deleteSelectedUnitsRaw,
    offsetSelectedTimesRaw,
    scaleSelectedTimesRaw,
    splitByRegexRaw,
    mergeSelectedUnitsRaw,
    createLayerRaw,
    deleteLayerRaw,
    toggleLayerLinkRaw,
  });

  const {
    getNeighborBounds,
    makeSnapGuide,
  } = useTranscriptionSnapGuideActions({
    unitsRef,
  });

  // Selection guards and translation draft sync --------------------------
  useTranscriptionSelectionGuards({
    selectedLayerId,
    setSelectedLayerId,
    layers,
    layerToDeleteId,
    setLayerToDeleteId,
    deletableLayers,
  });

  useTranscriptionTranslationDraftSync({
    translationLayers,
    unitsOnCurrentMedia,
    translationTextByLayer,
    setTranslationDrafts,
    focusedTranslationDraftKeyRef,
  });

  // Bootstrap and cleanup ------------------------------------------------
  useTranscriptionLifecycle({
    loadSnapshot,
    loadLinguisticAnnotations,
    setState,
    dbNameRef,
    dirtyRef,
    unitsRef,
    translationsRef,
    layersRef,
    autoSaveTimersRef,
    recoveryCancel: recoverySave.cancel,
    saveState,
  });

  // v16-1 Phase 2: Canonical token/morpheme read APIs
  const {
    getCanonicalTokensForUnit,
    getCanonicalMorphemesForToken,
    updateTokenPos,
    batchUpdateTokenPosByForm,
    updateTokenGloss,
  } = useTranscriptionCanonicalActions({
    runWithDbMutex,
    setUnits,
  });

  const {
    selectTimelineUnit,
    setUnitSelection,
    selectUnit,
    selectSegment,
    toggleUnitSelection,
    selectUnitRange,
    selectAllBefore,
    selectAllAfter,
    selectAllUnits,
    clearUnitSelection,
    toggleSegmentSelection,
    selectSegmentRange,
  } = useTranscriptionSelectionActions({
    selectedUnitIdRef,
    selectedUnitIdsRef,
    selectedLayerIdRef,
    selectedTimelineUnitRef,
    unitsOnCurrentMediaRef,
    ...(defaultTranscriptionLayerId !== undefined ? { defaultTranscriptionLayerId } : {}),
    ...(transcriptionLayers[0]?.id !== undefined ? { fallbackLayerId: transcriptionLayers[0].id } : {}),
    setSelectedLayerId,
    setSelectedUnitIds,
    setSelectedTimelineUnit,
  });

  const stateApi = {
    state,
    setState,
    units,
    anchors,
    layers,
    translations,
    layerLinks,
    mediaItems,
    speakers,
    selectedTimelineUnit,
    setSelectedTimelineUnit,
    activeUnitId,
    selectedUnitIds,
    setSelectedUnitIds,
    activeSegmentUnitId,
    setSelectedMediaId,
    selectedLayerId,
    setSelectedLayerId,
    saveState,
    setSaveState,
    layerCreateMessage,
    setLayerCreateMessage,
    unitDrafts,
    setUnitDrafts,
    translationDrafts,
    setTranslationDrafts,
    focusedTranslationDraftKeyRef,
    snapGuide,
    setSnapGuide,
    layerToDeleteId,
    setLayerToDeleteId,
    showLayerManager,
    setShowLayerManager,
    transcriptionTrackMode,
    setTranscriptionTrackMode,
  };

  const derivedApi = {
    orderedLayers,
    translationLayers,
    transcriptionLayers,
    defaultTranscriptionLayerId,
    sidePaneRows,
    deletableLayers,
    layerPendingDelete,
    selectedUnit,
    selectedUnitMedia,
    selectedMediaUrl,
    selectedMediaBlobSize,
    selectedMediaIsVideo,
    unitsOnCurrentMedia,
    visibleUnits,
    aiConfidenceAvg,
    translationTextByLayer,
    getUnitTextForLayer,
    selectedRowMeta,
  };

  const actionApi = {
    loadSnapshot,
    loadLinguisticAnnotations,
    addMediaItem,
    saveVoiceTranslation,
    deleteVoiceTranslation,
    saveUnitText,
    saveUnitSelfCertainty,
    saveUnitTiming,
    saveUnitLayerText,
    createAdjacentUnit,
    createUnitFromSelection,
    deleteUnit,
    mergeWithPrevious,
    mergeWithNext,
    splitUnit,
    selectTimelineUnit,
    selectUnit,
    selectSegment,
    setUnitSelection,
    toggleUnitSelection,
    selectUnitRange,
    selectAllBefore,
    selectAllAfter,
    selectAllUnits,
    clearUnitSelection,
    toggleSegmentSelection,
    selectSegmentRange,
    deleteSelectedUnits,
    offsetSelectedTimes,
    scaleSelectedTimes,
    splitByRegex,
    mergeSelectedUnits,
    createLayer,
    deleteLayer,
    deleteLayerWithoutConfirm,
    checkLayerHasContent,
    toggleLayerLink,
    reorderLayers,
    getNeighborBounds,
    makeSnapGuide,
    clearAutoSaveTimer,
    scheduleAutoSave,
    beginTimingGesture,
    endTimingGesture,
  };

  const undoApi = {
    undo,
    undoToHistoryIndex,
    redo,
    canUndo,
    canRedo,
    undoLabel,
    undoHistory,
  };

  const recoveryApi = {
    checkRecovery,
    applyRecovery,
    dismissRecovery,
  };

  const canonicalApi = {
    getCanonicalTokensForUnit,
    getCanonicalMorphemesForToken,
    updateTokenPos,
    batchUpdateTokenPosByForm,
    updateTokenGloss,
  };

  return {
    ...stateApi,
    ...derivedApi,
    ...actionApi,
    ...undoApi,
    ...recoveryApi,
    ...canonicalApi,
    pushUndo,
    segmentUndoRef,
    setUnits,
    setSpeakers,
    setLayers,
  };
}
