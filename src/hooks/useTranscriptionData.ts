import { useLatest } from './useLatest';
import { useTranscriptionState } from './useTranscriptionState';
import { useTranscriptionRecovery } from './useTranscriptionRecovery';
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
import type { DbState, LayerCreateInput, SaveState, SnapGuide } from './transcriptionTypes';
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
    selectedUtteranceId,
    setSelectedUtteranceId,
    selectedUtteranceIds,
    setSelectedUtteranceIds,
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
    autoSaveTimersRef,
    focusedTranslationDraftKeyRef,
    utterancesRef,
    anchorsRef,
    translationsRef,
    layersRef,
    layerLinksRef,
      speakersRef,
    selectedUtteranceIdRef,
    selectedUtteranceIdsRef,
  } = useTranscriptionState();

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
  } = useTranscriptionRecovery({
    utterancesRef,
    translationsRef,
    layersRef,
    loadSnapshot: async () => {},
    setSaveState,
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
    translationLayers,
    transcriptionLayers,
    layerRailRows,
    deletableLayers,
    layerPendingDelete,
    selectedUtterance,
    selectedUtteranceMedia,
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
    selectedUtteranceId,
    selectedMediaId,
    mediaItems,
    utterances,
    translations,
  });

  const {
    selectedMediaUrl,
    selectedMediaIsVideo,
  } = useTranscriptionMediaSelection({
    mediaItems,
    selectedMediaId,
    setSelectedMediaId,
    selectedUtteranceMediaId: selectedUtterance?.mediaId,
    selectedUtteranceMedia,
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
    setSelectedUtteranceId,
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
    saveUtteranceText: saveUtteranceTextRaw,
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
    selectedUtteranceMedia,
    selectedUtteranceId,
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
    setSelectedUtteranceId,
    setSelectedUtteranceIds,
  });

  const {
    saveVoiceTranslation,
    saveUtteranceText,
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
    saveUtteranceTextRaw,
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
    translationLayers,
    layerToDeleteId,
    setLayerToDeleteId,
    deletableLayers,
    selectedUtteranceId,
    setSelectedUtteranceIds,
    selectedUtteranceIdsRef,
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
    setUtteranceSelection,
    selectUtterance,
    toggleUtteranceSelection,
    selectUtteranceRange,
    selectAllBefore,
    selectAllAfter,
    selectAllUtterances,
    clearUtteranceSelection,
  } = useTranscriptionSelectionActions({
    selectedUtteranceIdRef,
    selectedUtteranceIdsRef,
    utterancesOnCurrentMediaRef,
    setSelectedUtteranceId,
    setSelectedUtteranceIds,
  });

  const stateApi = {
    state,
    utterances,
    anchors,
    layers,
    translations,
    layerLinks,
    mediaItems,
    speakers,
    selectedUtteranceId,
    setSelectedUtteranceId,
    selectedUtteranceIds,
    setSelectedUtteranceIds,
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
  };

  const derivedApi = {
    translationLayers,
    transcriptionLayers,
    defaultTranscriptionLayerId,
    layerRailRows,
    deletableLayers,
    layerPendingDelete,
    selectedUtterance,
    selectedUtteranceMedia,
    selectedMediaUrl,
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
    saveUtteranceText,
    saveUtteranceTiming,
    saveTextTranslationForUtterance,
    createNextUtterance,
    createUtteranceFromSelection,
    deleteUtterance,
    mergeWithPrevious,
    mergeWithNext,
    splitUtterance,
    selectUtterance,
    setUtteranceSelection,
    toggleUtteranceSelection,
    selectUtteranceRange,
    selectAllBefore,
    selectAllAfter,
    selectAllUtterances,
    clearUtteranceSelection,
    deleteSelectedUtterances,
    offsetSelectedTimes,
    scaleSelectedTimes,
    splitByRegex,
    mergeSelectedUtterances,
    createLayer,
    deleteLayer,
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
    setUtterances,
  };
}
