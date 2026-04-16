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
import {
  isSegmentTimelineUnit,
  isUtteranceTimelineUnit,
  type DbState,
  type LayerCreateInput,
  type SaveState,
  type SnapGuide,
} from './transcriptionTypes';
export type { DbState, LayerCreateInput, SaveState, SnapGuide };

export function useTranscriptionData() {
  const {
    state,
    setState,
    utterances,
    setUtterances,
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
    utteranceDrafts,
    setUtteranceDrafts,
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
    utterancesRef,
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

  const activeUnitId = isUtteranceTimelineUnit(selectedTimelineUnit)
    ? selectedTimelineUnit.unitId
    : '';
  const activeSegmentUnitId = isSegmentTimelineUnit(selectedTimelineUnit)
    ? selectedTimelineUnit.unitId
    : '';

  const {
    runWithDbMutex,
    syncToDb,
  } = useTranscriptionPersistence({
    utterancesRef,
    translationsRef,
      speakersRef,
  });

  const {
    dbNameRef,
    dirtyRef,
    recoverySave,
    scheduleRecoverySave,
  } = useTranscriptionRecoverySnapshotScheduler({
    utterancesRef,
    translationsRef,
    layersRef,
  });

  const {
    createAnchor,
    pruneOrphanAnchors,
    updateAnchorTime,
  } = useTranscriptionAnchorActions({
    anchorsRef,
    utterancesRef,
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
    utterancesRef,
    translationsRef,
    layersRef,
    layerLinksRef,
    speakersRef,
    dirtyRef,
    scheduleRecoverySave,
    syncToDb,
    setUtterances,
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
    utterancesOnCurrentMedia,
    visibleUtterances,
    aiConfidenceAvg,
    translationTextByLayer,
    layerById,
    defaultTranscriptionLayerId,
    getUtteranceTextForLayer,
    selectedRowMeta,
  } = useTranscriptionDerivedData({
    layers,
    layerToDeleteId,
    selectedTimelineUnit,
    selectedMediaId,
    mediaItems,
    utterances,
    translations,
  });

  useEffect(() => {
    if (state.phase !== 'ready') return;
    const nextUnitCount = utterances.length;
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
  }, [state.phase, utterances.length, translationLayers.length, translations.length, setState]);

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

  const utterancesOnCurrentMediaRef = useLatest(utterancesOnCurrentMedia);

  const {
    clearAutoSaveTimer,
    scheduleAutoSave,
  } = useTranscriptionAutoSaveActions({
    autoSaveTimersRef,
  });

  const {
    loadSnapshot,
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
    setUtteranceDrafts,
    setUtterances,
  });

  const {
    checkRecovery,
    applyRecovery,
    dismissRecovery,
  } = useTranscriptionRecoveryActions({
    dbNameRef,
    utterancesRef,
    loadSnapshot,
    runWithDbMutex,
    setSaveState,
  });

  // Action implementations -----------------------------------------------
  const {
    saveVoiceTranslation: saveVoiceTranslationRaw,
    deleteVoiceTranslation: deleteVoiceTranslationRaw,
    saveUtteranceText: saveUtteranceTextRaw,
    saveUtteranceSelfCertainty: saveUtteranceSelfCertaintyRaw,
    saveUtteranceTiming: saveUtteranceTimingRaw,
    saveTextTranslationForUtterance: saveTextTranslationForUtteranceRaw,
    createNextUtterance: createNextUtteranceRaw,
    createUtteranceFromSelection: createUtteranceFromSelectionRaw,
    deleteUtterance: deleteUtteranceRaw,
    mergeWithPrevious: mergeWithPreviousRaw,
    mergeWithNext: mergeWithNextRaw,
    splitUtterance: splitUtteranceRaw,
    deleteSelectedUtterances: deleteSelectedUtterancesRaw,
    offsetSelectedTimes: offsetSelectedTimesRaw,
    scaleSelectedTimes: scaleSelectedTimesRaw,
    splitByRegex: splitByRegexRaw,
    mergeSelectedUtterances: mergeSelectedUtterancesRaw,
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
    utterancesRef,
    utterancesOnCurrentMediaRef,
    getUtteranceTextForLayer,
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
    setUtterances,
    setUtteranceDrafts,
    setSelectedUnitIds,
    setSelectedTimelineUnit,
    allowOverlapInTranscription: transcriptionTrackMode !== 'single',
  });

  const {
    saveVoiceTranslation,
    deleteVoiceTranslation,
    saveUtteranceText,
    saveUtteranceSelfCertainty,
    saveUtteranceTiming,
    saveTextTranslationForUtterance,
    createNextUtterance,
    createUtteranceFromSelection,
    deleteUtterance,
    mergeWithPrevious,
    mergeWithNext,
    splitUtterance,
    deleteSelectedUtterances,
    offsetSelectedTimes,
    scaleSelectedTimes,
    splitByRegex,
    mergeSelectedUtterances,
    createLayer,
    deleteLayer,
    toggleLayerLink,
  } = useTranscriptionMutexActionWrappers({
    runWithDbMutex,
    saveVoiceTranslationRaw,
    deleteVoiceTranslationRaw,
    saveUtteranceTextRaw,
    saveUtteranceSelfCertaintyRaw,
    saveUtteranceTimingRaw,
    saveTextTranslationForUtteranceRaw,
    createNextUtteranceRaw,
    createUtteranceFromSelectionRaw,
    deleteUtteranceRaw,
    mergeWithPreviousRaw,
    mergeWithNextRaw,
    splitUtteranceRaw,
    deleteSelectedUtterancesRaw,
    offsetSelectedTimesRaw,
    scaleSelectedTimesRaw,
    splitByRegexRaw,
    mergeSelectedUtterancesRaw,
    createLayerRaw,
    deleteLayerRaw,
    toggleLayerLinkRaw,
  });

  const {
    getNeighborBounds,
    makeSnapGuide,
  } = useTranscriptionSnapGuideActions({
    utterancesRef,
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
    utterancesOnCurrentMedia,
    translationTextByLayer,
    setTranslationDrafts,
    focusedTranslationDraftKeyRef,
  });

  // Bootstrap and cleanup ------------------------------------------------
  useTranscriptionLifecycle({
    loadSnapshot,
    setState,
    dbNameRef,
    dirtyRef,
    utterancesRef,
    translationsRef,
    layersRef,
    autoSaveTimersRef,
    recoveryCancel: recoverySave.cancel,
    saveState,
  });

  // v16-1 Phase 2: Canonical token/morpheme read APIs
  const {
    getCanonicalTokensForUtterance,
    getCanonicalMorphemesForToken,
    updateTokenPos,
    batchUpdateTokenPosByForm,
    updateTokenGloss,
  } = useTranscriptionCanonicalActions({
    runWithDbMutex,
    setUtterances,
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
    utterancesOnCurrentMediaRef,
    ...(defaultTranscriptionLayerId !== undefined ? { defaultTranscriptionLayerId } : {}),
    ...(transcriptionLayers[0]?.id !== undefined ? { fallbackLayerId: transcriptionLayers[0].id } : {}),
    setSelectedLayerId,
    setSelectedUnitIds,
    setSelectedTimelineUnit,
  });

  const stateApi = {
    state,
    setState,
    utterances,
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
    utteranceDrafts,
    setUtteranceDrafts,
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
    utterancesOnCurrentMedia,
    visibleUtterances,
    aiConfidenceAvg,
    translationTextByLayer,
    getUtteranceTextForLayer,
    selectedRowMeta,
  };

  const actionApi = {
    loadSnapshot,
    addMediaItem,
    saveVoiceTranslation,
    deleteVoiceTranslation,
    saveUtteranceText,
    saveUtteranceSelfCertainty,
    saveUtteranceTiming,
    saveTextTranslationForUtterance,
    createNextUtterance,
    createUtteranceFromSelection,
    deleteUtterance,
    mergeWithPrevious,
    mergeWithNext,
    splitUtterance,
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
    deleteSelectedUtterances,
    offsetSelectedTimes,
    scaleSelectedTimes,
    splitByRegex,
    mergeSelectedUtterances,
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
    getCanonicalTokensForUtterance,
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
    setUtterances,
    setSpeakers,
    setLayers,
  };
}
