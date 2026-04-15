/**
 * TranscriptionPage - Ready Workspace
 *
 * Heavy ready-state runtime extracted from the thin orchestrator shell.
 * 从轻量壳组件中拆出的 ready 态重运行时 | Heavy ready-state runtime extracted from the lightweight shell.
 *
 * Styles load with this async chunk (see TranscriptionPage.Orchestrator lazy import) to split CSS away from the route shell.
 */

import '../styles/transcription-entry.css';
import { Suspense, lazy, useCallback, useEffect, useMemo, useState } from 'react';
import type { EditEvent } from '../hooks/useEditEventBuffer';
import { pushTimelineEditToRing, type PushTimelineEditInput } from '../hooks/useEditEventBuffer';
import {
  TimelineRailSection,
  TimelineScrollSection,
} from '../components/transcription/TranscriptionTimelineSections';
import {
  BottomToolbarSection,
  ObserverStatusSection,
  TimelineMainSection,
  ToolbarLeftSection,
  ToolbarRightSection,
  ZoomControlsSection,
} from '../components/transcription/TranscriptionLayoutSections';
import { TimelineStyledSection } from '../components/transcription/TimelineStyledContainer';
import { LeftRailProjectHub } from '../components/transcription/LeftRailProjectHub';
const OrchestratorWaveformContent = lazy(async () => {
  const mod = await import('./OrchestratorWaveformContent');
  return { default: mod.OrchestratorWaveformContent };
});
import { TranscriptionEditorContext } from '../contexts/TranscriptionEditorContext';
import { useAiPanelContextUpdater, AiPanelContext } from '../contexts/AiPanelContext';
import { ToastProvider } from '../contexts/ToastContext';
import { useTranscriptionData } from '../hooks/useTranscriptionData';
import { useRecording } from '../hooks/useRecording';
import { useUtteranceOps } from '../hooks/useUtteranceOps';
import { useJKLShuttle } from '../hooks/useJKLShuttle';
import { useImportExport } from '../hooks/useImportExport';
import { useAiPanelLogic } from '../hooks/useAiPanelLogic';
import { useNoteHandlers } from '../hooks/useNoteHandlers';
import { useTranscriptionUIState } from './TranscriptionPage.UIState';
import {
  type AppShellOpenSearchDetail,
} from '../utils/appShellEvents';
import { useTimelineResize } from '../hooks/useTimelineResize';
import { useLayerSegments } from '../hooks/useLayerSegments';
import { useLayerSegmentContents } from '../hooks/useLayerSegmentContents';
import { useTimelineUnitViewIndex } from '../hooks/useTimelineUnitViewIndex';
import { useRecoveryBanner } from '../hooks/useRecoveryBanner';
import { getUtteranceSpeakerKey } from '../hooks/useSpeakerActions';
import {
  isUtteranceTimelineUnit,
  type TimelineUnitKind,
} from '../hooks/transcriptionTypes';
import { t, tf, useLocale } from '../i18n';
import { fireAndForget } from '../utils/fireAndForget';
import {
  resolveSelfCertaintyHostUtteranceIds,
  type UtteranceSelfCertainty,
} from '../utils/utteranceSelfCertainty';
import { reportValidationError } from '../utils/validationErrorReporter';
import { formatSidePaneLayerLabel, formatTime } from '../utils/transcriptionFormatters';
import { useTranscriptionAssistantSidebarController } from './useTranscriptionAssistantSidebarController';
import { useWaveformRuntimeController } from './useWaveformRuntimeController';
import { useBatchOperationController } from './useBatchOperationController';
import { useSpeakerActionScopeController } from './useSpeakerActionScopeController';
import { useTranscriptionAssistantController } from './useTranscriptionAssistantController';
import { useTranscriptionSelectionContextController } from './useTranscriptionSelectionContextController';
import { useTranscriptionProjectMediaController } from './useTranscriptionProjectMediaController';
import { useTranscriptionOverlayActionRoutingController } from './useTranscriptionOverlayActionRoutingController';
import { useTranscriptionSegmentCreationController } from './useTranscriptionSegmentCreationController';
import { useTranscriptionSegmentBridgeController } from './useTranscriptionSegmentBridgeController';
import { useTranscriptionSegmentMutationController } from './useTranscriptionSegmentMutationController';
import { useTranscriptionShellController } from './useTranscriptionShellController';
import { useTrackEntityPersistenceController } from './useTrackEntityPersistenceController';
import { useTrackEntityStateController } from './useTrackEntityStateController';
import { useTranscriptionTimelineController } from './useTranscriptionTimelineController';
import { useTranscriptionTimelineInteractionController } from './useTranscriptionTimelineInteractionController';
import { useTrackDisplayController } from './useTrackDisplayController';
import { useOrchestratorViewModels } from './useOrchestratorViewModels';
import { useTranscriptionWorkspaceLayoutController } from './useTranscriptionWorkspaceLayoutController';
import { useTranscriptionActionRefBindings } from './useTranscriptionActionRefBindings';
import { useTranscriptionWaveformBridgeController } from './useTranscriptionWaveformBridgeController';
import { useTranscriptionSpeakerController } from './useTranscriptionSpeakerController';
import { useTranscriptionSelectionSnapshot } from './useTranscriptionSelectionSnapshot';
import { utteranceDocForSpeakerTargetFromUnitView } from './timelineUnitViewUtteranceHelpers';
import { useTranscriptionDisplayStyleControl } from './useTranscriptionDisplayStyleControl';
import { useTranscriptionAnnotationController } from './useTranscriptionAnnotationController';
import { useTranscriptionRuntimeRefs } from './useTranscriptionRuntimeRefs';
import { useTranscriptionWorkspacePanelEffects } from './useTranscriptionWorkspacePanelEffects';
import { useTranscriptionPlaybackKeyboardController } from './useTranscriptionPlaybackKeyboardController';
import { useTranscriptionAcousticPanelState } from './useTranscriptionAcousticPanelState';
import { useTranscriptionAssistantSidebarControllerInput } from './useTranscriptionAssistantSidebarControllerInput';
import { useTranscriptionImportExportInput } from './useTranscriptionImportExportInput';
import { useTranscriptionProjectMediaControllerInput } from './useTranscriptionProjectMediaControllerInput';
import { useDeferredAiRuntimeBridge } from './useDeferredAiRuntimeBridge';
import { ToastController } from './TranscriptionPage.ToastController';
import { buildSharedLaneProps } from './transcriptionReadyWorkspacePropsBuilders';
import { buildOrchestratorViewModelsInput } from './transcriptionReadyWorkspaceOrchestratorInput';
import { TranscriptionPageAiPanelHandle } from './TranscriptionPage.AiPanelHandle';
import { loadEmbeddingProviderConfig } from './TranscriptionPage.helpers';
import {
  RecoveryBanner,
  TranscriptionOverlays,
  TranscriptionPageAiSidebar,
  TranscriptionPageAssistantBridge,
  TranscriptionPageBatchOps,
  TranscriptionPageDialogs,
  TranscriptionPagePdfRuntime,
  TranscriptionPageSidePane,
  TranscriptionPageTimelineContent,
  TranscriptionPageTimelineTop,
  TranscriptionPageToolbar,
} from './TranscriptionPage.ReadyWorkspace.runtime';
interface TranscriptionPageReadyWorkspaceProps {
  data: ReturnType<typeof useTranscriptionData>;
  appSearchRequest?: AppShellOpenSearchDetail | null;
  onConsumeAppSearchRequest?: () => void;
}

function TranscriptionPageReadyWorkspace({
  data,
  appSearchRequest,
  onConsumeAppSearchRequest,
}: TranscriptionPageReadyWorkspaceProps) {
  const locale = useLocale();
  /** Pre-bound tf for components that need (key, params) without locale */
  const tfB = (key: string, opts?: Record<string, unknown>) => tf(locale, key as Parameters<typeof tf>[1], opts as Parameters<typeof tf>[2]);
  const {
    state,
    utterances,
    speakers,
    anchors,
    layers,
    translations,
    layerLinks,
    mediaItems: _mediaItems,
    selectedTimelineUnit,
    selectedUnitIds,

    setUnitSelection,
    setSelectedMediaId: _setSelectedMediaId,
    selectedLayerId,
    setSelectedLayerId,
    saveState,
    setSaveState,
    setUtterances,
    setSpeakers,
    layerCreateMessage,
    setLayerCreateMessage,
    utteranceDrafts,
    setUtteranceDrafts,
    translationDrafts,
    setTranslationDrafts,
    focusedTranslationDraftKeyRef,
    snapGuide,
    setSnapGuide,
    orderedLayers,
    translationLayers,
    transcriptionLayers,
    defaultTranscriptionLayerId,
    sidePaneRows,
    deletableLayers,
    selectedUnit,
    selectedUnitMedia,
    selectedMediaUrl,
    selectedMediaBlobSize,
    selectedMediaIsVideo,
    utterancesOnCurrentMedia,
    aiConfidenceAvg,
    translationTextByLayer,
    getUtteranceTextForLayer,
    loadSnapshot,
    addMediaItem,
    saveVoiceTranslation,
    deleteVoiceTranslation,
    saveUtteranceText,
    saveUtteranceSelfCertainty,
    saveUtteranceTiming,
    saveTextTranslationForUtterance,
    createNextUtterance: _createNextUtterance,
    createUtteranceFromSelection,
    deleteUtterance,
    mergeWithPrevious,
    mergeWithNext,
    splitUtterance,
    selectTimelineUnit,
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
    setSelectedUnitIds: _setSelectedUnitIds,
    transcriptionTrackMode,
    setTranscriptionTrackMode,
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
    checkRecovery,
    applyRecovery,
    dismissRecovery,
    updateTokenPos,
    batchUpdateTokenPosByForm,
    updateTokenGloss,
    segmentUndoRef,
  } = data;
  const activeTimelineUnitId = isUtteranceTimelineUnit(selectedTimelineUnit)
    ? selectedTimelineUnit.unitId
    : '';

  // 独立边界层 segments 加载 | Load segments for independent-boundary layers
  const {
    segmentsByLayer,
    segmentsLoadComplete,
    reloadSegments,
    updateSegmentsLocally,
  } = useLayerSegments(layers, selectedUnitMedia?.id, defaultTranscriptionLayerId);
  const { segmentContentByLayer, reloadSegmentContents } = useLayerSegmentContents(
    layers,
    selectedUnitMedia?.id,
    segmentsByLayer,
    defaultTranscriptionLayerId,
  );
  const {
    focusedLayerRowId,
    flashLayerRowId,
    setFocusedLayerRowId,
    setFlashLayerRowId,
    showAllLayerConnectors,
    handleToggleAllLayerConnectors,
    pdfPreviewRequest,
    setPdfPreviewRequest,
    openPdfPreviewRequest,
    isAiPanelCollapsed,
    setIsAiPanelCollapsed,
    aiPanelWidth,
    setAiPanelWidth,
    uiFontScale,
    uiTextDirection,
    adaptiveDialogWidth,
    adaptiveDialogCompactWidth,
    adaptiveDialogWideWidth,
    handleAiPanelToggle,
    isHubCollapsed,
    hubHeight,
    setHubHeight,
    analysisTab,
    setAnalysisTab,
    hubSidebarTab,
    setHubSidebarTab,
    showProjectSetup,
    setShowProjectSetup,
    showAudioImport,
    setShowAudioImport,
    showSearch,
    setShowSearch,
    showUndoHistory,
    setShowUndoHistory,
    activeTextId,
    setActiveTextId,
    activeTextPrimaryLanguageId,
    getActiveTextId,
    getActiveTextPrimaryLanguageId,
    searchOverlayRequest,
    setSearchOverlayRequest,
    openSearchFromRequest,
    createLayerWithActiveContext,
    layerAction,
    handleFocusLayerRow,
  } = useTranscriptionShellController({
    utterances,
    ...(appSearchRequest !== undefined ? { appSearchRequest } : {}),
    ...(onConsumeAppSearchRequest ? { onConsumeAppSearchRequest } : {}),
    selectedLayerId,
    setSelectedLayerId,
    orderedLayers,
    layerLinks,
    deletableLayers,
    layerCreateMessage,
    setLayerCreateMessage,
    createLayer,
    deleteLayer,
    deleteLayerWithoutConfirm,
    checkLayerHasContent,
  });
  const [hasActivatedAiSidebar, setHasActivatedAiSidebar] = useState(false);

  const {
    layerById,
    selectedTimelineSegment,
    selectedTimelineOwnerUnit,
    selectedTimelineMedia,
    selectedTimelineUnitForTime,
    selectedTimelineRowMeta,
    nextUtteranceIdForVoiceDictation,
    independentLayerIds,
    noteTimelineUnitIds,
    segmentTimelineLayerIds,
  } = useTranscriptionSelectionContextController({
    layers,
    ...(defaultTranscriptionLayerId !== undefined ? { defaultTranscriptionLayerId } : {}),
    mediaItems: _mediaItems,
    utterances,
    utterancesOnCurrentMedia,
    selectedUnit: selectedUnit ?? null,
    ...(selectedUnitMedia ? { selectedUnitMedia } : {}),
    selectedTimelineUnit,
    segmentsByLayer,
  });

  const {
    activeLayerIdForEdits,
    resolveSegmentRoutingForLayer,
    refreshSegmentUndoSnapshot,
    saveSegmentContentForLayer,
  } = useTranscriptionSegmentBridgeController({
    selectedLayerId,
    focusedLayerId: focusedLayerRowId,
    selectedTimelineUnit,
    ...(defaultTranscriptionLayerId !== undefined ? { defaultTranscriptionLayerId } : {}),
    ...(transcriptionLayers[0]?.id ? { firstTranscriptionLayerId: transcriptionLayers[0].id } : {}),
    layerById,
    independentLayerIds,
    segmentsByLayer,
    segmentContentByLayer,
    reloadSegments,
    reloadSegmentContents,
    selectTimelineUnit,
    segmentUndoRef,
  });

  // ---- Recovery banner ----
  const {
    recoveryAvailable,
    recoveryDiffSummary,
    applyRecoveryBanner,
    dismissRecoveryBanner,
  } = useRecoveryBanner({
    phase: data.state.phase,
    utterancesLength: utterances.length,
    translationsLength: translations.length,
    layersLength: layers.length,
    checkRecovery,
    applyRecovery,
    dismissRecovery,
  });

  const {
    executeActionRef,
    openSearchRef,
    seekToTimeRef,
    splitAtTimeRef,
    zoomToSegmentRef,
    utteranceRowRef,
    overlapCycleTelemetryRef,
    manualSelectTsRef,
    tierContainerRef,
    listMainRef,
    workspaceRef,
    screenRef,
    waveformSectionRef,
    dragCleanupRef,
  } = useTranscriptionRuntimeRefs({
    cssVarEnabled: state.phase === 'ready',
  });

  const {
    waveformHeight,
    amplitudeScale,
    setAmplitudeScale,
    waveformDisplayMode,
    setWaveformDisplayMode,
    waveformVisualStyle,
    setWaveformVisualStyle,
    acousticOverlayMode,
    setAcousticOverlayMode,
    isResizingWaveform,
    handleWaveformResizeStart,
  } = useWaveformRuntimeController();
  const {
    zoomPercent,
    setZoomPercent,
    zoomMode,
    setZoomMode,
    isTimelineLaneHeaderCollapsed,
    toggleTimelineLaneHeader,
    laneLabelWidth,
    timelineLaneHeights,
    handleLaneLabelWidthResizeStart,
    handleTimelineLaneHeightChange,
    videoPreviewHeight,
    videoRightPanelWidth,
    videoLayoutMode,
    setVideoLayoutMode,
    isResizingVideoPreview,
    isResizingVideoRightPanel,
    handleVideoPreviewResizeStart,
    handleVideoRightPanelResizeStart,
    autoScrollEnabled,
    setAutoScrollEnabled,
    isFocusMode,
    exitFocusMode,
    showShortcuts,
    closeShortcuts,
    snapEnabled,
    setSnapEnabled,
    toggleSnapEnabled,
  } = useTranscriptionWorkspaceLayoutController({
    layers,
    selectedTimelineOwnerUnitId: selectedTimelineOwnerUnit?.id,
    utteranceRowRef,
  });

  const {
    displayStyleControl,
    waveformHoverPreviewProps,
    batchPreviewTextPropsByLayerId,
    voiceDictationPreviewTextProps,
  } = useTranscriptionDisplayStyleControl({
    layers,
    transcriptionLayers,
    translationLayers,
    layerById,
    ...(defaultTranscriptionLayerId ? { defaultTranscriptionLayerId } : {}),
    ...(selectedLayerId ? { selectedLayerId } : {}),
    setLayers: data.setLayers,
    handleTimelineLaneHeightChange,
  });

  const [overlapCycleToast, setOverlapCycleToast] = useState<{ index: number; total: number; nonce: number } | null>(null);
  const [lockConflictToast, setLockConflictToast] = useState<{ count: number; speakers: string[]; nonce: number } | null>(null);

  const {
    recording,
    recordingUtteranceId,
    recordingLayerId: _recordingLayerId,
    recordingError,
    startRecordingForUtterance: _startRecordingForUtterance,
    stopRecording: _stopRecording,
  } = useRecording({
    saveVoiceTranslation,
    setSaveState,
    selectUnit,
    manualSelectTsRef,
  });

  // UI state (context menu, batch operations)
  const {
    ctxMenu,
    setCtxMenu,
    uttOpsMenu,
    setUttOpsMenu,
    showBatchOperationPanel,
    setShowBatchOperationPanel,
  } = useTranscriptionUIState();

  // ---- Notes (extracted hook) ----
  const {
    notePopover,
    setNotePopover,
    currentNotes,
    addNote,
    updateNote,
    deleteNote,
    toggleNotes,
    handleNoteClick,
    resolveNoteIndicatorTarget,
    handleOpenWordNote,
    handleOpenMorphemeNote,
    handleUpdateTokenPos,
    handleBatchUpdateTokenPosByForm,
    handleExecuteRecommendation,
  } = useNoteHandlers({
    activeUnitId: activeTimelineUnitId,
    focusedLayerRowId,
    utterances,
    timelineUnitIds: noteTimelineUnitIds,
    transcriptionLayers,
    translationLayers,
    updateTokenPos,
    batchUpdateTokenPosByForm,
    selectUnit,
    setSaveState,
  });

  const timelineUnitViewIndex = useTimelineUnitViewIndex({
    utterances,
    utterancesOnCurrentMedia,
    segmentsByLayer,
    segmentContentByLayer,
    currentMediaId: selectedTimelineMedia?.id,
    activeLayerIdForEdits,
    defaultTranscriptionLayerId,
    segmentsLoadComplete,
  });

  const [recentTimelineEditEvents, setRecentTimelineEditEvents] = useState<EditEvent[]>([]);
  const recordTimelineEdit = useCallback((event: PushTimelineEditInput) => {
    setRecentTimelineEditEvents((prev) => pushTimelineEditToRing(prev, event));
  }, []);

  const getUtteranceDocById = useCallback(
    (id: string) => utterancesOnCurrentMedia.find((u) => u.id === id),
    [utterancesOnCurrentMedia],
  );

  const findUtteranceDocContainingRange = useCallback(
    (start: number, end: number) => utterancesOnCurrentMedia.find(
      (u) => u.startTime <= start + 0.01 && u.endTime >= end - 0.01,
    ),
    [utterancesOnCurrentMedia],
  );

  const findOverlappingUtteranceDoc = useCallback(
    (start: number, end: number) => utterancesOnCurrentMedia.find(
      (u) => u.startTime <= end - 0.01 && u.endTime >= start + 0.01,
    ),
    [utterancesOnCurrentMedia],
  );

  const {
    splitRouted,
    mergeWithPreviousRouted,
    mergeWithNextRouted,
    mergeSelectedSegmentsRouted,
    deleteUtteranceRouted,
    deleteSelectedUtterancesRouted,
  } = useTranscriptionSegmentMutationController({
    activeLayerIdForEdits,
    resolveSegmentRoutingForLayer,
    pushUndo,
    reloadSegments,
    refreshSegmentUndoSnapshot,
    selectTimelineUnit,
    unitsOnCurrentMedia: timelineUnitViewIndex.currentMediaUnits,
    getUtteranceDocById,
    findUtteranceDocContainingRange,
    setSaveState,
    splitUtterance,
    mergeSelectedUtterances,
    mergeWithPrevious,
    mergeWithNext,
    deleteUtterance,
    deleteSelectedUtterances,
    recordTimelineEdit,
  });

  const { createNextSegmentRouted, createUtteranceFromSelectionRouted } = useTranscriptionSegmentCreationController({
    activeLayerIdForEdits,
    resolveSegmentRoutingForLayer,
    selectedTimelineMedia: selectedTimelineMedia ?? null,
    unitsOnCurrentMedia: timelineUnitViewIndex.currentMediaUnits,
    getUtteranceDocById,
    findUtteranceDocContainingRange,
    findOverlappingUtteranceDoc,
    pushUndo,
    reloadSegments,
    refreshSegmentUndoSnapshot,
    reloadSegmentContents,
    selectTimelineUnit,
    setSaveState,
    createNextUtterance: _createNextUtterance,
    createUtteranceFromSelection,
    recordTimelineEdit,
  });

  const {
    utteranceHasText: _utteranceHasText,
    runDeleteSelection,
    runDeleteOne,
    runMergeSelection,
    runMergePrev,
    runMergeNext,
    runSplitAtTime,
    runSelectBefore,
    runSelectAfter,
    deleteConfirmState,
    muteDeleteConfirmInSession,
    setMuteDeleteConfirmInSession,
    closeDeleteConfirmDialog,
    confirmDeleteFromDialog,
  } = useUtteranceOps({
    utterances,
    translationTextByLayer,
    deleteUtterance: deleteUtteranceRouted,
    deleteSelectedUtterances: deleteSelectedUtterancesRouted,
    mergeSelectedUtterances,
    mergeWithPrevious: mergeWithPreviousRouted,
    mergeWithNext: mergeWithNextRouted,
    onMergeTargetMissing: () => {
      reportValidationError({
        message: t(locale, 'transcription.error.validation.mergeTargetSelectionRequired'),
        i18nKey: 'transcription.error.validation.mergeTargetSelectionRequired',
        setErrorState: ({ message, meta }) => setSaveState({ kind: 'error', message, errorMeta: meta }),
      });
    },
    splitUtterance: splitRouted,
    selectAllBefore,
    selectAllAfter,
  });

  const {
    runOverlayDeleteSelection,
    runOverlayMergeSelection,
    runOverlayDeleteOne,
    runOverlayMergePrev,
    runOverlayMergeNext,
    runOverlaySplitAtTime,
  } = useTranscriptionOverlayActionRoutingController({
    deleteSelectedUtterancesRouted,
    deleteUtteranceRouted,
    mergeWithPreviousRouted,
    mergeWithNextRouted,
    splitRouted,
    runDeleteSelection,
    runMergeSelection,
    runDeleteOne,
    runMergePrev,
    runMergeNext,
    runSplitAtTime,
  });

  const {
    waveformAreaRef,
    waveCanvasRef,
    player,
    useSegmentWaveformRegions,
    waveformTimelineItems,
    waveformRegions,
    selectedWaveformRegionId,
    selectedWaveformTimelineItem,
    segmentLoopPlayback,
    setSegmentLoopPlayback,
    globalLoopPlayback,
    setGlobalLoopPlayback,
    segmentPlaybackRate,
    segMarkStart,
    setSegMarkStart,
    dragPreview,
    setDragPreview,
    skipSeekForIdRef,
    creatingSegmentRef,
    markingModeRef,
    subSelectionRange,
    setSubSelectionRange,
    subSelectDragRef,
    waveLassoRect,
    waveLassoHintCount,
    lassoRect,
    handleLassoPointerDown,
    handleLassoPointerMove,
    handleLassoPointerUp,
    fitPxPerSec,
    zoomPxPerSec,
    maxZoomPercent,
    rulerView,
    zoomToPercent,
    zoomToUtterance,
    hoverTime,
    handleWaveformAreaFocus,
    handleWaveformAreaBlur,
    handleWaveformAreaMouseMove,
    handleWaveformAreaMouseLeave,
    handleWaveformAreaWheel,
    waveformScrollLeft,
    handleTimelineScroll,
    waveformNoteIndicators,
    waveformLowConfidenceOverlays,
    waveformOverlapOverlays,
    acousticOverlayViewportWidth,
    acousticOverlayF0Path,
    acousticOverlayIntensityPath,
    acousticOverlayVisibleSummary,
    acousticOverlayLoading,
    waveformHoverReadout,
    spectrogramHoverReadout,
    handleSpectrogramMouseMove,
    handleSpectrogramMouseLeave,
    handleSpectrogramClick,
    handleSegmentPlaybackRateChange,
    handleToggleSelectedWaveformLoop,
    handleToggleSelectedWaveformPlay,
    waveformInteractionHandlerRefs,
  } = useTranscriptionWaveformBridgeController({
    activeLayerIdForEdits,
    layers,
    layerById,
    ...(defaultTranscriptionLayerId !== undefined ? { defaultTranscriptionLayerId } : {}),
    timelineUnitViewIndex,
    selectedTimelineUnit,
    selectedTimelineUnitForTime,
    selectedUnitIds,
    selectedMediaUrl,
    waveformHeight,
    amplitudeScale,
    setAmplitudeScale,
    waveformDisplayMode,
    waveformVisualStyle,
    acousticOverlayMode,
    zoomPercent,
    setZoomPercent,
    zoomMode,
    setZoomMode,
    clearUnitSelection,
    createUtteranceFromSelection: createUtteranceFromSelectionRouted,
    setUnitSelection,
    resolveNoteIndicatorTarget,
    tierContainerRef,
    ...(selectedTimelineMedia?.id !== undefined ? { mediaId: selectedTimelineMedia.id } : {}),
    ...(selectedMediaBlobSize !== undefined && { mediaBlobSize: selectedMediaBlobSize }),
  });

  const selectionSnapshot = useTranscriptionSelectionSnapshot({
    selectedTimelineUnit,
    selectedTimelineSegment,
    selectedTimelineOwnerUnit: selectedTimelineOwnerUnit ?? null,
    primaryUnitView: selectedTimelineUnit
      ? timelineUnitViewIndex.byId.get(selectedTimelineUnit.unitId) ?? null
      : null,
    selectedTimelineRowMeta,
    selectedLayerId,
    layers,
    segmentContentByLayer,
    getUtteranceTextForLayer,
    formatTime,
  });

  const selectedUtteranceForAiPanelLogic = useMemo(
    () => utteranceDocForSpeakerTargetFromUnitView(selectionSnapshot.selectedUnit, getUtteranceDocById),
    [getUtteranceDocById, selectionSnapshot.selectedUnit],
  );

  const setAiPanelContext = useAiPanelContextUpdater();
  const [aiPanelMode, setAiPanelMode] = useState<'auto' | 'all'>('auto');
  const [aiSidebarError, setAiSidebarError] = useState<string | null>(null);
  const [embeddingProviderConfig, setEmbeddingProviderConfig] = useState(() => loadEmbeddingProviderConfig());
  const [acousticProviderPreference, setAcousticProviderPreference] = useState<string | null>(null);
  const {
    deferredAiRuntime,
    deferredAiRuntimeForSidebar,
    setDeferredAiRuntime,
    handleDeferredAiRuntimeChange,
    flushDeferredAiRuntime,
  } = useDeferredAiRuntimeBridge();

  const {
    lexemeMatches,
    observerResult,
    actionableObserverRecommendations,
    selectedAiWarning,
    selectedTranslationGapCount,
    aiCurrentTask,
    aiVisibleCards,
    vadCacheStatus,
    handleJumpToTranslationGap,
  } = useAiPanelLogic({
    locale,
    utterances,
    selectedUnit: selectedUtteranceForAiPanelLogic ?? undefined,
    selectedUnitText: selectionSnapshot.selectedText,
    translationLayers,
    translationDrafts,
    translationTextByLayer,
    aiChatConnectionTestStatus: deferredAiRuntime.aiChat.connectionTestStatus,
    aiPanelMode,
    selectUnit,
    setSaveState,
    ...(selectedTimelineMedia?.id !== undefined ? { mediaId: selectedTimelineMedia.id } : {}),
  });

  const handleExecuteObserverRecommendation = useCallback((item: { id: string }) => {
    const match = actionableObserverRecommendations.find((candidate) => candidate.id === item.id);
    if (match) {
      fireAndForget(Promise.resolve(handleExecuteRecommendation(match)));
    }
  }, [actionableObserverRecommendations, handleExecuteRecommendation]);

  const {
    waveformAcousticRuntimeStatus,
    waveformVadCacheStatus,
    pinnedInspector,
    selectedHotspotTimeSec,
    acousticConfigOverride,
    acousticInspector,
    handlePinInspector,
    handleClearPinnedInspector,
    handleSelectHotspot,
    handleChangeAcousticConfig,
    handleResetAcousticConfig,
    handleChangeAcousticProvider,
    handleRefreshAcousticProviderState,
  } = useTranscriptionAcousticPanelState({
    deferredAiRuntime,
    setDeferredAiRuntime,
    setAcousticProviderPreference,
    ...(selectedTimelineMedia?.id !== undefined ? { selectedTimelineMediaId: selectedTimelineMedia.id } : {}),
    ...(selectedMediaUrl !== undefined ? { selectedMediaUrl } : {}),
    waveformHoverReadout,
    spectrogramHoverReadout,
    acousticProviderPreference,
    vadCacheStatus,
  });

  // 稳定引用，防止 OrchestratorWaveformContent memo 失效 | Stable ref to avoid breaking OrchestratorWaveformContent React.memo
  const playerInstanceGetWidth = useCallback(() => player.instanceRef.current?.getWidth() ?? 9999, [player.instanceRef]);

  const {
    handleSearchReplace,
    handleJumpToEmbeddingMatch,
    handleJumpToCitation,
    handleSplitAtTimeRequest,
    handleZoomToSegmentRequest,
    getNeighborBoundsRouted,
    saveTimingRouted,
    handleWaveformRegionContextMenu,
    handleWaveformRegionAltPointerDown,
    handleWaveformRegionClick,
    handleWaveformRegionDoubleClick,
    handleWaveformRegionCreate,
    handleWaveformRegionUpdate,
    handleWaveformRegionUpdateEnd,
    handleWaveformTimeUpdate,
  } = useTranscriptionTimelineInteractionController({
    layers,
    saveUtteranceText: (utteranceId, text, layerId) => saveUtteranceText(utteranceId, text, layerId),
    saveTextTranslationForUtterance,
    utterances,
    selectUnit,
    manualSelectTsRef,
    player,
    locale,
    sidePaneRows,
    activeTimelineUnitId,
    onSetNotePopover: setNotePopover,
    onSetSidebarError: setAiSidebarError,
    onRevealSchemaLayer: (layerId) => {
      setSelectedLayerId(layerId);
      setFocusedLayerRowId(layerId);
      setFlashLayerRowId(layerId);
    },
    onOpenPdfPreviewRequest: openPdfPreviewRequest,
    waveformTimelineItems,
    runSplitAtTime,
    activeLayerIdForEdits,
    useSegmentWaveformRegions,
    selectTimelineUnit,
    selectedTimelineUnit,
    toggleSegmentSelection,
    selectSegmentRange,
    toggleUnitSelection,
    selectUnitRange,
    setSubSelectionRange,
    subSelectDragRef,
    waveCanvasRef,
    zoomToPercent,
    zoomToUtterance,
    resolveSegmentRoutingForLayer,
    segmentsByLayer,
    utterancesOnCurrentMedia,
    getNeighborBounds,
    reloadSegments,
    saveUtteranceTiming,
    setSaveState,
    selectedUnitIds,
    selectedWaveformRegionId,
    beginTimingGesture,
    endTimingGesture,
    makeSnapGuide,
    snapEnabled,
    setSnapGuide,
    setDragPreview,
    creatingSegmentRef,
    markingModeRef,
    setCtxMenu,
    createUtteranceFromSelection: createUtteranceFromSelectionRouted,
  });

  const { timelineResizeTooltip, startTimelineResizeDrag } = useTimelineResize({
    zoomPxPerSec,
    manualSelectTsRef,
    player,
    selectUnit,
    selectSegment,
    setSelectedLayerId,
    setFocusedLayerRowId,
    beginTimingGesture,
    endTimingGesture,
    getNeighborBounds: getNeighborBoundsRouted,
    makeSnapGuide,
    snapEnabled,
    setSnapGuide,
    setDragPreview,
    saveUtteranceTiming: saveTimingRouted,
    segmentsByLayer,
  });

  const {
    aiPanelContextValue,
    handleResolveVoiceIntentWithLlm,
    handleVoiceDictation,
    voiceDictationPipeline,
    handleVoiceAnalysisResult,
  } = useTranscriptionAssistantController({
    state,
    unitsLength: utterances.length,
    translationLayersLength: translationLayers.length,
    aiConfidenceAvg,
    selectedPrimaryUnitView: selectionSnapshot.selectedUnit,
    selectedTimelineOwnerUnit: selectedTimelineOwnerUnit ?? null,
    selectedTimelineRowMeta,
    selectedAiWarning,
    lexemeMatches,
    handleOpenWordNote,
    handleOpenMorphemeNote,
    handleUpdateTokenPos,
    handleBatchUpdateTokenPosByForm,
    aiPanelMode,
    setAiPanelMode,
    aiCurrentTask,
    aiVisibleCards,
    vadCacheStatus,
    acousticRuntimeStatus: deferredAiRuntime.acousticRuntimeStatus,
    acousticSummary: deferredAiRuntime.acousticSummary,
    acousticInspector,
    pinnedInspector,
    selectedHotspotTimeSec,
    acousticDetail: deferredAiRuntime.acousticDetail,
    acousticDetailFullMedia: deferredAiRuntime.acousticDetailFullMedia,
    acousticBatchDetails: deferredAiRuntime.acousticBatchDetails,
    acousticBatchSelectionCount: deferredAiRuntime.acousticBatchSelectionCount,
    acousticBatchDroppedSelectionRanges: deferredAiRuntime.acousticBatchDroppedSelectionRanges,
    acousticCalibrationStatus: deferredAiRuntime.acousticCalibrationStatus,
    acousticConfigOverride,
    acousticProviderPreference,
    acousticProviderState: deferredAiRuntime.acousticProviderState,
    selectedTranslationGapCount,
    handleJumpToTranslationGap,
    handleJumpToAcousticHotspot: deferredAiRuntime.onJumpToAcousticHotspot,
    handlePinInspector,
    handleClearPinnedInspector,
    handleSelectHotspot,
    handleChangeAcousticConfig,
    handleResetAcousticConfig,
    handleChangeAcousticProvider,
    handleRefreshAcousticProviderState,
    setAiPanelContext,
    selectedTimelineUnit,
    saveSegmentContentForLayer,
    selectedLayerId,
    ...(defaultTranscriptionLayerId !== undefined ? { defaultTranscriptionLayerId } : {}),
    translationLayers,
    layers,
    utterancesOnCurrentMedia,
    getUtteranceTextForLayer,
    saveUtteranceText,
    saveTextTranslationForUtterance,
    setSaveState,
    ...(nextUtteranceIdForVoiceDictation ? { nextUtteranceIdForVoiceDictation } : {}),
    selectUnit,
    aiChatEnabled: deferredAiRuntime.aiChat.enabled,
    aiChatSettings: deferredAiRuntime.aiChat.settings,
    pushUndo,
    setUtterances,
  });

  const {
    handleGlobalPlayPauseAction,
    handleWaveformKeyDown,
    navigateUnitFromInput,
    executeAction,
    toggleVoiceRef,
  } = useTranscriptionPlaybackKeyboardController({
    player,
    subSelectionRange,
    setSubSelectionRange,
    selectedUnit: selectedTimelineOwnerUnit ?? undefined,
    selectedPlayableRange: selectedTimelineUnitForTime,
    selectedTimelineUnit,
    selectedUnitIds,
    selectedMediaUrl,
    segMarkStart,
    setSegMarkStart,
    segmentLoopPlayback,
    setSegmentLoopPlayback,
    timelineUnitsOnCurrentMedia: timelineUnitViewIndex.currentMediaUnits,
    markingModeRef,
    skipSeekForIdRef,
    creatingSegmentRef,
    manualSelectTsRef,
    waveformAreaRef,
    createUtteranceFromSelection: createUtteranceFromSelectionRouted,
    selectTimelineUnit,
    selectUnit,
    selectAllUnits,
    runDeleteSelection,
    runMergePrev,
    runMergeNext,
    runSplitAtTime,
    runSelectBefore,
    runSelectAfter,
    undo,
    redo,
    setShowSearch,
    toggleNotes,
  });

  useJKLShuttle(player);

  useTranscriptionActionRefBindings({
    executeActionRef,
    executeAction,
    openSearchRef,
    openSearchFromRequest,
    seekToTimeRef,
    seekToTime: (timeSeconds) => {
      player.seekTo(timeSeconds);
    },
    splitAtTimeRef,
    handleSplitAtTimeRequest,
    zoomToSegmentRef,
    handleZoomToSegmentRequest,
    waveformInteractionHandlerRefs,
    handleWaveformRegionAltPointerDown,
    handleWaveformRegionClick,
    handleWaveformRegionDoubleClick,
    handleWaveformRegionCreate,
    handleWaveformRegionContextMenu,
    handleWaveformRegionUpdate,
    handleWaveformRegionUpdateEnd,
    handleWaveformTimeUpdate,
  });

  const aiChatForSidebar = useMemo(() => ({
    ...deferredAiRuntimeForSidebar.aiChat,
    providerLabel: deferredAiRuntime.aiChat.providerLabel,
    settings: deferredAiRuntime.aiChat.settings,
    connectionTestStatus: deferredAiRuntime.aiChat.connectionTestStatus,
    connectionTestMessage: deferredAiRuntime.aiChat.connectionTestMessage,
    updateSettings: deferredAiRuntime.aiChat.updateSettings,
    testConnection: deferredAiRuntime.aiChat.testConnection,
  }), [
    deferredAiRuntime.aiChat.connectionTestMessage,
    deferredAiRuntime.aiChat.connectionTestStatus,
    deferredAiRuntime.aiChat.providerLabel,
    deferredAiRuntime.aiChat.settings,
    deferredAiRuntime.aiChat.testConnection,
    deferredAiRuntime.aiChat.updateSettings,
    deferredAiRuntimeForSidebar.aiChat,
  ]);

  const assistantSidebarControllerInput = useTranscriptionAssistantSidebarControllerInput({
    locale,
    analysisTab,
    onAnalysisTabChange: setAnalysisTab,
    timelineReadModelEpoch: timelineUnitViewIndex.epoch,
    currentPage: 'transcription',
    selectedUnit: selectionSnapshot.selectedUnit,
    selectedRowMeta: selectedTimelineRowMeta,
    selectedUnitKind: selectionSnapshot.selectedUnitKind,
    selectedLayerType: selectionSnapshot.selectedLayerType,
    selectedText: selectionSnapshot.selectedText,
    selectedTimeRangeLabel: selectionSnapshot.selectedTimeRangeLabel ?? null,
    lexemeMatches,
    aiChat: aiChatForSidebar,
    aiToolDecisionLogs: deferredAiRuntimeForSidebar.aiToolDecisionLogs,
    observerStage: observerResult.stage,
    observerRecommendations: actionableObserverRecommendations,
    onJumpToCitation: handleJumpToCitation,
    runtimePropsInput: {
      saveState,
      recording,
      recordingUtteranceId,
      recordingError,
      overlapCycleToast,
      lockConflictToast,
      tfB,
      activeTextPrimaryLanguageId,
      getActiveTextPrimaryLanguageId,
      executeAction,
      handleResolveVoiceIntentWithLlm,
      handleVoiceDictation,
      handleVoiceAnalysisResult,
      selectionSnapshot,
      ...(defaultTranscriptionLayerId !== undefined ? { defaultTranscriptionLayerId } : {}),
      translationLayers,
      layers,
      ...(voiceDictationPreviewTextProps !== undefined ? { dictationPreviewTextProps: voiceDictationPreviewTextProps } : {}),
      ...(voiceDictationPipeline !== undefined ? { dictationPipeline: voiceDictationPipeline } : {}),
      formatSidePaneLayerLabel,
      formatTime,
      toggleVoiceRef,
      utterancesOnCurrentMedia,
      getUtteranceDocById,
      getUtteranceTextForLayer,
      handleJumpToCitation,
      handleJumpToEmbeddingMatch,
      embeddingProviderConfig,
      setEmbeddingProviderConfig,
      aiSidebarError,
      locale,
      pdfPreviewRequest,
      setPdfPreviewRequest,
    },
  });

  const {
    assistantRuntimeProps,
    analysisRuntimeProps,
    pdfRuntimeProps,
  } = useTranscriptionAssistantSidebarController({
    ...assistantSidebarControllerInput,
  });

  const { handleAiPanelResizeStart } = useTranscriptionWorkspacePanelEffects({
    isAiPanelCollapsed,
    setIsAiPanelCollapsed,
    workspaceRef,
    aiPanelWidth,
    setAiPanelWidth,
    dragCleanupRef,
    isHubCollapsed,
    hubHeight,
    setHubHeight,
    screenRef,
    setShowBatchOperationPanel,
  });

  // ── Import / Export (extracted hook) ──

  const importExportInput = useTranscriptionImportExportInput({
    activeTextId,
    getActiveTextId,
    selectedUnitMedia: selectedTimelineMedia,
    utterancesOnCurrentMedia,
    anchors,
    layers,
    translations,
    defaultTranscriptionLayerId,
    loadSnapshot,
    setSaveState,
  });

  const {
    importFileRef,
    exportMenuRef,
    showExportMenu,
    setShowExportMenu,
    handleExportEaf,
    handleExportTextGrid,
    handleExportTrs,
    handleExportFlextext,
    handleExportToolbox,
    handleExportJyt,
    handleExportJym,
    previewProjectArchiveImport,
    importProjectArchive,
    handleImportFile,
  } = useImportExport(importExportInput);

  const projectMediaControllerInput = useTranscriptionProjectMediaControllerInput({
    activeTextId,
    getActiveTextId,
    setActiveTextId,
    setShowAudioImport,
    addMediaItem,
    setSaveState,
    selectedMediaUrl: selectedMediaUrl ?? null,
    selectedTimelineMedia: selectedTimelineMedia ?? null,
    utterancesOnCurrentMedia,
    createUtteranceFromSelectionRouted,
    loadSnapshot,
    selectTimelineUnit,
    locale,
    tfB,
    transcriptionLayers,
    translationLayers,
    translationTextByLayer,
    getUtteranceTextForLayer,
  });

  const {
    mediaFileInputRef,
    handleDirectMediaImport,
    audioDeleteConfirm,
    projectDeleteConfirm,
    autoSegmentBusy,
    handleAutoSegment,
    handleDeleteCurrentAudio,
    handleConfirmAudioDelete,
    handleDeleteCurrentProject,
    handleConfirmProjectDelete,
    handleProjectSetupSubmit,
    handleAudioImport,
    searchableItems,
    setAudioDeleteConfirm,
    setProjectDeleteConfirm,
  } = useTranscriptionProjectMediaController({
    ...projectMediaControllerInput,
  });

  const {
    segmentByIdForSpeakerActions,
    resolveSpeakerKeyForSegment,
    resolveExplicitSpeakerKeyForSegment,
    segmentSpeakerAssignmentsOnCurrentMedia,
    speakerVisualByTimelineUnitId,
    activeSpeakerManagementLayer,
    speakerFilterOptionsForActions,
    selectedUnitIdsForSpeakerActions,
    selectedBatchUnits,
    resolveSpeakerActionUtteranceIds,
    selectedSpeakerUnitIdsForActionsSet,
  } = useSpeakerActionScopeController({
    unitsOnCurrentMedia: timelineUnitViewIndex.currentMediaUnits,
    unitViewById: timelineUnitViewIndex.byId,
    getUtteranceDocById,
    segmentsByLayer,
    speakers,
    layers,
    ...(defaultTranscriptionLayerId !== undefined ? { defaultTranscriptionLayerId } : {}),
    ...(selectedLayerId !== undefined ? { selectedLayerId } : {}),
    selectedUnitIds,
    selectedTimelineUnit,
    getUtteranceSpeakerKey,
  });

  const {
    selectedUnitIdsForSpeakerActionsSet,
    selectedBatchUtterances,
    handleBatchOffset,
    handleBatchScale,
    handleBatchSplitByRegex,
    handleBatchMerge,
  } = useBatchOperationController({
    selectedUnitIds,
    selectedTimelineUnit,
    unitViewById: timelineUnitViewIndex.byId,
    unitsOnCurrentMedia: timelineUnitViewIndex.currentMediaUnits,
    getUtteranceDocById,
    setSaveState,
    offsetSelectedTimes,
    scaleSelectedTimes,
    splitByRegex,
    mergeSelectedUtterances,
  });

  const {
    speakerOptions,
    speakerDraftName,
    setSpeakerDraftName,
    batchSpeakerId,
    setBatchSpeakerId,
    speakerSavingRouted,
    activeSpeakerFilterKey,
    setActiveSpeakerFilterKey,
    speakerReferenceStats,
    speakerReferenceUnassignedStats,
    speakerReferenceStatsMediaScoped,
    speakerReferenceStatsReady,
    speakerDialogStateRouted,
    selectedSpeakerSummaryForActions,
    handleSelectSpeakerUnitsRouted,
    handleClearSpeakerAssignmentsRouted,
    handleExportSpeakerSegmentsRouted,
    handleRenameSpeaker,
    handleMergeSpeaker,
    handleDeleteSpeaker,
    handleDeleteUnusedSpeakers,
    handleAssignSpeakerToSelectedRouted,
    handleCreateSpeakerAndAssignRouted,
    handleCreateSpeakerOnly,
    closeSpeakerDialogRouted,
    updateSpeakerDialogDraftNameRouted,
    updateSpeakerDialogTargetKeyRouted,
    confirmSpeakerDialogRouted,
    handleClearSpeakerOnSelectedRouted,
    speakerQuickActions,
    selectedSpeakerIdsForTrackLock,
    selectedSpeakerNamesForTrackLock,
    speakerNameById,
    handleOpenSpeakerManagementPanel,
    handleAssignSpeakerFromMenu,
  } = useTranscriptionSpeakerController({
    utterances,
    setUtterances,
    speakers,
    setSpeakers,
    unitsOnCurrentMedia: timelineUnitViewIndex.currentMediaUnits,
    getUtteranceDocById,
    activeTimelineUnitId,
    selectedUnitIds,
    selectedBatchUnits,
    selectedUnitIdsForSpeakerActionsSet,
    selectedTimelineUnit,
    selectedTimelineMediaId: selectedTimelineMedia?.id ?? null,
    selectedUnit: selectedUnit ?? null,
    statePhase: state.phase,
    setUnitSelection,
    data,
    setSaveState,
    getUtteranceTextForLayer,
    formatTime,
    getUtteranceSpeakerKey,
    activeSpeakerManagementLayer,
    segmentsByLayer,
    segmentContentByLayer,
    resolveExplicitSpeakerKeyForSegment,
    resolveSpeakerKeyForSegment,
    selectedUnitIdsForSpeakerActions,
    segmentByIdForSpeakerActions,
    resolveSpeakerActionUtteranceIds,
    speakerFilterOptionsForActions,
    segmentSpeakerAssignmentsOnCurrentMedia,
    selectTimelineUnit,
    setSelectedUnitIds: _setSelectedUnitIds,
    reloadSegments,
    refreshSegmentUndoSnapshot,
    updateSegmentsLocally,
    layerAction,
    recordTimelineEdit,
  });

  const selfCertaintyHostHintsByUnitId = useMemo(() => {
    const out = new Map<string, {
      parentUtteranceId?: string;
      mediaId?: string;
      startTime?: number;
      endTime?: number;
    }>();
    for (const segments of segmentsByLayer.values()) {
      for (const seg of segments) {
        out.set(seg.id, {
          ...(seg.utteranceId ? { parentUtteranceId: seg.utteranceId } : {}),
          ...(seg.mediaId ? { mediaId: seg.mediaId } : {}),
          startTime: seg.startTime,
          endTime: seg.endTime,
        });
      }
    }
    for (const unit of timelineUnitViewIndex.currentMediaUnits) {
      out.set(unit.id, {
        ...((unit.parentUtteranceId && unit.parentUtteranceId.trim().length > 0)
          ? { parentUtteranceId: unit.parentUtteranceId }
          : {}),
        ...(unit.mediaId ? { mediaId: unit.mediaId } : {}),
        startTime: unit.startTime,
        endTime: unit.endTime,
      });
    }
    return out;
  }, [segmentsByLayer, timelineUnitViewIndex.currentMediaUnits]);

  const resolveSelfCertaintyUtteranceIds = useCallback((ids: readonly string[]) => resolveSelfCertaintyHostUtteranceIds(
    ids,
    utterances,
    selfCertaintyHostHintsByUnitId,
  ), [selfCertaintyHostHintsByUnitId, utterances]);

  const handleSetUtteranceSelfCertaintyFromMenu = useCallback((
    unitIds: Iterable<string>,
    _kind: TimelineUnitKind,
    value: UtteranceSelfCertainty | undefined,
  ) => {
    const resolved = resolveSelfCertaintyUtteranceIds([...unitIds]);
    if (resolved.length === 0) return;
    fireAndForget(saveUtteranceSelfCertainty(resolved, value));
  }, [saveUtteranceSelfCertainty, resolveSelfCertaintyUtteranceIds]);

  const {
    laneLockMap,
    setLaneLockMap,
    persistenceContext: trackEntityPersistenceContext,
  } = useTrackEntityStateController({
    activeTextId,
    selectedTimelineMediaId: selectedTimelineMedia?.id ?? null,
    setTranscriptionTrackMode,
  });

  const { handleAnnotationClick, handleAnnotationContextMenu, renderAnnotationItem, renderLaneLabel } = useTranscriptionAnnotationController({
    manualSelectTsRef,
    player,
    selectedTimelineUnit,
    selectUnitRange,
    toggleUnitSelection,
    selectTimelineUnit,
    selectUnit,
    selectSegment,
    setSelectedLayerId,
    onFocusLayerRow: handleFocusLayerRow,
    tierContainerRef,
    zoomPxPerSec,
    setCtxMenu,
    navigateUnitFromInput,
    waveformAreaRef,
    dragPreview,
    selectedUnitIds,
    focusedLayerRowId,
    zoomToUtterance,
    startTimelineResizeDrag,
    handleNoteClick,
    resolveNoteIndicatorTarget,
    speakerVisualByUtteranceId: speakerVisualByTimelineUnitId,
    independentLayerIds: segmentTimelineLayerIds,
    orthographies: displayStyleControl.orthographies,
    // 自我确信度宿主句段可能来自历史数据或跨媒体映射，不能只限 currentMedia 子集。
    // Self-certainty host lookup must use the full utterance set, not only the current-media subset.
    utterancesForSelfCertainty: utterances,
    setOverlapCycleToast,
    overlapCycleTelemetryRef,
  });

  const {
    filteredUtterancesOnCurrentMedia,
    timelineRenderUtterances,
    translationAudioByLayer,
    selectedBatchUtteranceTextById,
    batchPreviewLayerOptions,
    batchPreviewTextByLayerId,
    defaultBatchPreviewLayerId,
    editorContextValue,
  } = useTranscriptionTimelineController({
    activeSpeakerFilterKey,
    utterancesOnCurrentMedia,
    getUtteranceSpeakerKey,
    rulerView: rulerView ?? null,
    playerDuration: player.duration,
    translations,
    selectedBatchUtterances,
    transcriptionLayers,
    selectedLayerId: selectedLayerId ?? null,
    getUtteranceTextForLayer,
    utteranceDrafts,
    setUtteranceDrafts,
    translationDrafts,
    setTranslationDrafts,
    translationTextByLayer,
    focusedTranslationDraftKeyRef,
    scheduleAutoSave,
    clearAutoSaveTimer,
    saveUtteranceText,
    saveTextTranslationForUtterance,
    renderLaneLabel,
    createLayer: createLayerWithActiveContext,
    deleteLayer,
    deleteLayerWithoutConfirm,
    checkLayerHasContent,
  });

  const {
    speakerSortKeyById,
    effectiveLaneLockMap,
    speakerLayerLayout,
    setTrackDisplayMode,
    handleToggleTrackDisplayMode,
    handleLockSelectedSpeakersToLane,
    handleUnlockSelectedSpeakers,
    handleResetTrackAutoLayout,
  } = useTrackDisplayController({
    utterancesOnCurrentMedia,
    timelineUnitsOnCurrentMedia: timelineUnitViewIndex.currentMediaUnits,
    timelineRenderUtterances,
    activeLayerIdForEdits,
    ...(defaultTranscriptionLayerId !== undefined ? { defaultTranscriptionLayerId } : {}),
    layers,
    segmentsByLayer,
    segmentSpeakerAssignmentsOnCurrentMedia,
    transcriptionTrackMode,
    setTranscriptionTrackMode,
    laneLockMap,
    setLaneLockMap,
    selectedSpeakerIdsForTrackLock,
    speakerNameById,
    setLockConflictToast,
    getUtteranceSpeakerKey,
  });

  useTrackEntityPersistenceController({
    activeTextId: trackEntityPersistenceContext.activeTextId,
    trackEntityScopedKey: trackEntityPersistenceContext.trackEntityScopedKey,
    trackEntityStateByMediaRef: trackEntityPersistenceContext.trackEntityStateByMediaRef,
    trackEntityHydratedKeyRef: trackEntityPersistenceContext.trackEntityHydratedKeyRef,
    transcriptionTrackMode,
    effectiveLaneLockMap,
  });

  const sharedLaneProps = buildSharedLaneProps({
    transcriptionLayers,
    translationLayers,
    timelineUnitViewIndex,
    segmentsByLayer,
    segmentContentByLayer,
    saveSegmentContentForLayer,
    selectedTimelineUnit,
    flashLayerRowId,
    focusedLayerRowId,
    activeTimelineUnitId,
    orderedLayers,
    reorderLayers,
    deletableLayers,
    handleFocusLayerRow,
    layerLinks,
    showAllLayerConnectors,
    handleToggleAllLayerConnectors,
    timelineLaneHeights,
    handleTimelineLaneHeightChange,
    transcriptionTrackMode,
    handleToggleTrackDisplayMode,
    setTrackDisplayMode,
    effectiveLaneLockMap,
    handleLockSelectedSpeakersToLane,
    handleUnlockSelectedSpeakers,
    handleResetTrackAutoLayout,
    selectedSpeakerNamesForTrackLock,
    speakerLayerLayout,
    activeSpeakerFilterKey,
    speakerQuickActions,
    handleLaneLabelWidthResizeStart,
    translationAudioByLayer,
    mediaItems: _mediaItems,
    recording,
    recordingUtteranceId,
    recordingLayerId: _recordingLayerId,
    startRecordingForUtterance: _startRecordingForUtterance,
    stopRecording: _stopRecording,
    deleteVoiceTranslation,
    displayStyleControl,
  });

  const orchestratorViewModelsInput = buildOrchestratorViewModelsInput({
    selectedMediaUrl,
    player,
    layers,
    locale,
    importFileRef,
    layerAction,
    sharedLaneProps,
    zoomPxPerSec,
    lassoRect,
    timelineRenderUtterances,
    defaultTranscriptionLayerId,
    renderAnnotationItem,
    speakerSortKeyById,
    filteredUtterancesOnCurrentMedia,
    tierContainerRef,
    handleAnnotationClick,
    handleAnnotationContextMenu,
    navigateUnitFromInput,
    speakerVisualByTimelineUnitId,
    selectedTimelineMedia,
    waveformDisplayMode,
    setWaveformDisplayMode,
    waveformVisualStyle,
    setWaveformVisualStyle,
    acousticOverlayMode,
    setAcousticOverlayMode,
    globalLoopPlayback,
    setGlobalLoopPlayback,
    handleGlobalPlayPauseAction,
    canUndo,
    canRedo,
    undoLabel,
    activeTextId,
    selectedTimelineUnit,
    notePopover,
    showExportMenu,
    exportMenuRef,
    loadSnapshot,
    undo,
    redo,
    setShowProjectSetup,
    setShowAudioImport,
    handleDeleteCurrentAudio,
    handleDeleteCurrentProject,
    toggleNotes,
    setUttOpsMenu,
    handleAutoSegment,
    autoSegmentBusy,
    setShowExportMenu,
    handleExportEaf,
    handleExportTextGrid,
    handleExportTrs,
    handleExportFlextext,
    handleExportToolbox,
    handleExportJyt,
    handleExportJym,
    handleImportFile,
    utterancesOnCurrentMedia,
    rulerView,
    isTimelineLaneHeaderCollapsed,
    toggleTimelineLaneHeader,
    waveCanvasRef,
    showSearch,
    searchableItems,
    displayStyleControl,
    activeLayerIdForEdits,
    activeTimelineUnitId,
    searchOverlayRequest,
    manualSelectTsRef,
    selectUnit,
    handleSearchReplace,
    setShowSearch,
    setSearchOverlayRequest,
    isAiPanelCollapsed,
    hubSidebarTab,
    setHubSidebarTab,
    assistantRuntimeProps,
    analysisRuntimeProps,
    selectedAiWarning,
    selectedTranslationGapCount,
    aiSidebarError,
    speakerDialogStateRouted,
    speakerSavingRouted,
    closeSpeakerDialogRouted,
    confirmSpeakerDialogRouted,
    updateSpeakerDialogDraftNameRouted,
    updateSpeakerDialogTargetKeyRouted,
    showProjectSetup,
    handleProjectSetupSubmit,
    showAudioImport,
    handleAudioImport,
    mediaFileInputRef,
    handleDirectMediaImport,
    audioDeleteConfirm,
    setAudioDeleteConfirm,
    handleConfirmAudioDelete,
    projectDeleteConfirm,
    setProjectDeleteConfirm,
    handleConfirmProjectDelete,
    showShortcuts,
    closeShortcuts,
    isFocusMode,
    exitFocusMode,
  });

  const {
    toolbarProps,
    timelineTopProps,
    timelineContentProps,
    aiSidebarProps,
    dialogsProps,
  } = useOrchestratorViewModels(orchestratorViewModelsInput);

  useEffect(() => {
    if (isAiPanelCollapsed) {
      return;
    }
    setHasActivatedAiSidebar(true);
    flushDeferredAiRuntime();
  }, [flushDeferredAiRuntime, isAiPanelCollapsed]);

  useEffect(() => {
    if (!assistantRuntimeProps.aiChatContextValue.aiPendingToolCall) return;
    setHubSidebarTab('assistant');
    setHasActivatedAiSidebar(true);
    setIsAiPanelCollapsed(false);
  }, [assistantRuntimeProps.aiChatContextValue.aiPendingToolCall, setHubSidebarTab, setIsAiPanelCollapsed]);
  const shouldRenderAiSidebar = hasActivatedAiSidebar || !isAiPanelCollapsed;
  const shouldRenderDialogs = Boolean(
    speakerDialogStateRouted
      || showProjectSetup
      || showAudioImport
      || audioDeleteConfirm
      || projectDeleteConfirm
      || showShortcuts
      || isFocusMode,
  );
  const shouldRenderPdfRuntime = pdfRuntimeProps.previewRequest.request !== null;
  const shouldRenderBatchOps = showBatchOperationPanel;
  const shouldRenderRecoveryBanner = recoveryAvailable;

  // ═══════════════════════════════════════════════════════
  // JSX RETURN
  // ═══════════════════════════════════════════════════════

  return (
    <TimelineStyledSection
      className="transcription-screen"
      ref={screenRef}
      dir={uiTextDirection}
      layoutStyle={{
        '--ui-font-scale': String(uiFontScale),
        '--dialog-auto-width': `${adaptiveDialogWidth}px`,
        '--dialog-compact-auto-width': `${adaptiveDialogCompactWidth}px`,
        '--dialog-wide-auto-width': `${adaptiveDialogWideWidth}px`,
        '--transcription-ai-width': `${aiPanelWidth}px`,
        '--transcription-ai-visible-width': `${isAiPanelCollapsed ? 0 : aiPanelWidth}px`,
        '--lane-label-width': isTimelineLaneHeaderCollapsed ? '0px' : `${laneLabelWidth}px`,
        '--video-left-panel-width': selectedMediaUrl && selectedMediaIsVideo && videoLayoutMode === 'left'
          ? `${videoRightPanelWidth + 8}px`
          : '0px',
      } as React.CSSProperties}
    >
      {state.phase === 'loading' && <p className="hint">{t(locale, 'transcription.status.loading')}</p>}
      {state.phase === 'error' && <p className="error">{tf(locale, 'transcription.status.dbError', { message: state.message })}</p>}

      {state.phase === 'ready' && (
        <>
          <ToastProvider>
            <ToastController
              mode="core-only"
              voiceAgent={{
                agentState: 'idle',
                mode: 'command',
                listening: false,
                isRecording: false,
              }}
              saveState={assistantRuntimeProps.frame.saveState}
              recording={assistantRuntimeProps.frame.recording}
              recordingUtteranceId={assistantRuntimeProps.frame.recordingUtteranceId}
              recordingError={assistantRuntimeProps.frame.recordingError}
              {...(assistantRuntimeProps.frame.overlapCycleToast !== undefined ? { overlapCycleToast: assistantRuntimeProps.frame.overlapCycleToast } : {})}
              {...(assistantRuntimeProps.frame.lockConflictToast !== undefined ? { lockConflictToast: assistantRuntimeProps.frame.lockConflictToast } : {})}
              tf={assistantRuntimeProps.frame.tf}
            />
            {shouldRenderRecoveryBanner ? (
              <Suspense fallback={null}>
                <RecoveryBanner
                  locale={locale}
                  recoveryAvailable={recoveryAvailable}
                  recoveryDiffSummary={recoveryDiffSummary}
                  onApply={applyRecoveryBanner}
                  onDismiss={dismissRecoveryBanner}
                />
              </Suspense>
            ) : null}
            <section className="transcription-waveform" ref={waveformSectionRef}>
              <Suspense fallback={null}>
                <TranscriptionPageToolbar
                  {...toolbarProps}
                  leftToolbarExtras={(
                    <>
                      <span className="transcription-toolbar-sep transcription-wave-toolbar-extras-sep" aria-hidden="true" />
                      <ObserverStatusSection
                        observerStage={observerResult.stage}
                        recommendations={actionableObserverRecommendations || []}
                        onExecuteRecommendation={handleExecuteObserverRecommendation}
                      />
                    </>
                  )}
                  acousticRuntimeStatus={deferredAiRuntime.acousticRuntimeStatus}
                  vadCacheStatus={vadCacheStatus}
                />
              </Suspense>
            </section>
            <LeftRailProjectHub
              currentProjectLabel={toolbarProps.filename}
              canDeleteProject={Boolean(activeTextId)}
              canDeleteAudio={Boolean(selectedTimelineMedia)}
              onOpenProjectSetup={() => setShowProjectSetup(true)}
              onOpenAudioImport={() => setShowAudioImport(true)}
              onOpenSpeakerManagementPanel={() => handleOpenSpeakerManagementPanel()}
              onDeleteCurrentProject={handleDeleteCurrentProject}
              onDeleteCurrentAudio={handleDeleteCurrentAudio}
              onImportAnnotationFile={async (file, strategy) => {
                await handleImportFile(file, strategy);
              }}
              onPreviewProjectArchiveImport={previewProjectArchiveImport}
              onImportProjectArchive={importProjectArchive}
              onExportEaf={handleExportEaf}
              onExportTextGrid={handleExportTextGrid}
              onExportTrs={handleExportTrs}
              onExportFlextext={handleExportFlextext}
              onExportToolbox={handleExportToolbox}
              onExportJyt={handleExportJyt}
              onExportJym={handleExportJym}
            />

            <input
              ref={mediaFileInputRef}
              type="file"
              className="transcription-media-file-input"
              accept=".mp3,.wav,.ogg,.webm,.m4a,.flac,.aac,.mp4,.webm,.mov,.avi,.mkv"
              aria-label={t(locale, 'transcription.importDialog.selectMedia')}
              onChange={handleDirectMediaImport}
            />

            {/* Editor workspace: left side for row editing, right side for AI guidance. */}
            <section
              ref={workspaceRef}
              className={`transcription-workspace ${isAiPanelCollapsed ? 'transcription-workspace-ai-collapsed' : ''}`}
            >
              <section
                className={`transcription-list-panel ${isTimelineLaneHeaderCollapsed ? 'transcription-list-panel-lane-header-collapsed' : ''}`}
              >
                <Suspense fallback={<div className="transcription-waveform-area-suspense-fallback" aria-hidden="true" />}>
                  <OrchestratorWaveformContent
                  locale={locale}
                  waveformAreaRef={waveformAreaRef}
                  snapGuideNearSide={snapGuide.nearSide}
                  segMarkStart={segMarkStart}
                  isResizingWaveform={isResizingWaveform}
                  waveformHeight={waveformHeight}
                  handleWaveformKeyDown={handleWaveformKeyDown}
                  handleWaveformAreaFocus={handleWaveformAreaFocus}
                  handleWaveformAreaBlur={handleWaveformAreaBlur}
                  handleWaveformAreaMouseMove={handleWaveformAreaMouseMove}
                  handleWaveformAreaMouseLeave={handleWaveformAreaMouseLeave}
                  handleWaveformAreaWheel={handleWaveformAreaWheel}
                  hoverTime={hoverTime}
                  utterancesOnCurrentMedia={utterancesOnCurrentMedia}
                  getUtteranceTextForLayer={getUtteranceTextForLayer}
                  waveformHoverPreviewProps={waveformHoverPreviewProps}
                  selectedMediaUrl={selectedMediaUrl}
                  zoomPercent={zoomPercent}
                  snapEnabled={snapEnabled}
                  toggleSnapEnabled={toggleSnapEnabled}
                  playerPlaybackRate={player.playbackRate}
                  playerCurrentTime={player.currentTime}
                  selectedUnitDuration={selectedTimelineUnitForTime
                    ? selectedTimelineUnitForTime.endTime - selectedTimelineUnitForTime.startTime
                    : null}
                  amplitudeScale={amplitudeScale}
                  setAmplitudeScale={setAmplitudeScale}
                  selectedMediaIsVideo={selectedMediaIsVideo}
                  videoLayoutMode={videoLayoutMode}
                  setVideoLayoutMode={setVideoLayoutMode}
                  handleLaneLabelWidthResizeStart={handleLaneLabelWidthResizeStart}
                  videoPreviewHeight={videoPreviewHeight}
                  videoRightPanelWidth={videoRightPanelWidth}
                  waveformRegions={waveformRegions}
                  selectedUnitIds={selectedUnitIds}
                  activeTimelineUnitId={activeTimelineUnitId}
                  segmentLoopPlayback={segmentLoopPlayback}
                  subSelectionRange={subSelectionRange}
                  isResizingVideoPreview={isResizingVideoPreview}
                  isResizingVideoRightPanel={isResizingVideoRightPanel}
                  handleVideoPreviewResizeStart={handleVideoPreviewResizeStart}
                  handleVideoRightPanelResizeStart={handleVideoRightPanelResizeStart}
                  waveformDisplayMode={waveformDisplayMode}
                  waveCanvasRef={waveCanvasRef}
                  playerSpectrogramRef={player.spectrogramRef}
                  playerWaveformRef={player.waveformRef}
                  playerSeekTo={player.seekTo}
                  playerPlayRegion={player.playRegion}
                  waveLassoRect={waveLassoRect}
                  waveLassoHintCount={waveLassoHintCount}
                  waveformNoteIndicators={waveformNoteIndicators}
                  waveformLowConfidenceOverlays={waveformLowConfidenceOverlays}
                  waveformOverlapOverlays={waveformOverlapOverlays}
                  acousticOverlayMode={acousticOverlayMode}
                  acousticOverlayViewportWidth={acousticOverlayViewportWidth}
                  acousticOverlayF0Path={acousticOverlayF0Path}
                  acousticOverlayIntensityPath={acousticOverlayIntensityPath}
                  acousticOverlayVisibleSummary={acousticOverlayVisibleSummary}
                  acousticOverlayLoading={acousticOverlayLoading}
                  {...(waveformAcousticRuntimeStatus ? { acousticRuntimeStatus: waveformAcousticRuntimeStatus } : {})}
                  {...(waveformVadCacheStatus ? { vadCacheStatus: waveformVadCacheStatus } : {})}
                  waveformHoverReadout={waveformHoverReadout}
                  spectrogramHoverReadout={spectrogramHoverReadout}
                  selectedHotspotTimeSec={selectedHotspotTimeSec}
                  handleSpectrogramMouseMove={handleSpectrogramMouseMove}
                  handleSpectrogramMouseLeave={handleSpectrogramMouseLeave}
                  handleSpectrogramClick={handleSpectrogramClick}
                  setNotePopover={setNotePopover}
                  snapGuideVisible={snapGuide.visible}
                  snapGuideLeft={snapGuide.left}
                  snapGuideRight={snapGuide.right}
                  snapGuideNearSideValue={snapGuide.nearSide}
                  playerDuration={player.duration}
                  rulerView={rulerView}
                  selectedWaveformTimelineItem={selectedWaveformTimelineItem}
                  playerIsReady={player.isReady}
                  playerIsPlaying={player.isPlaying}
                  playerInstanceGetWidth={playerInstanceGetWidth}
                  zoomPxPerSec={zoomPxPerSec}
                  waveformScrollLeft={waveformScrollLeft}
                  segmentPlaybackRate={segmentPlaybackRate}
                  handleSegmentPlaybackRateChange={handleSegmentPlaybackRateChange}
                  handleToggleSelectedWaveformLoop={handleToggleSelectedWaveformLoop}
                  handleToggleSelectedWaveformPlay={handleToggleSelectedWaveformPlay}
                  mediaFileInputRef={mediaFileInputRef}
                  handleWaveformResizeStart={handleWaveformResizeStart}
                  />
                </Suspense>
                <Suspense
                  fallback={<div className="transcription-timeline-top-suspense-fallback" aria-hidden="true" />}
                >
                  <TranscriptionPageTimelineTop {...timelineTopProps} />
                </Suspense>
                <TimelineMainSection
                  containerRef={listMainRef}
                  className={`transcription-list-main ${isTimelineLaneHeaderCollapsed ? 'transcription-list-main-lane-header-collapsed' : ''}`}
                >
                  <TimelineRailSection>
                    <Suspense fallback={<div className="transcription-side-pane transcription-side-pane-placeholder" aria-hidden="true" />}>
                      <TranscriptionPageSidePane
                        speakerManagement={{
                          speakerOptions,
                          speakerDraftName,
                          setSpeakerDraftName,
                          batchSpeakerId,
                          setBatchSpeakerId,
                          speakerSaving: speakerSavingRouted,
                          activeSpeakerFilterKey,
                          setActiveSpeakerFilterKey,
                          speakerDialogState: speakerDialogStateRouted,
                          speakerVisualByUtteranceId: speakerVisualByTimelineUnitId,
                          speakerFilterOptions: speakerFilterOptionsForActions,
                          speakerReferenceStats,
                          speakerReferenceUnassignedStats,
                          speakerReferenceStatsMediaScoped,
                          speakerReferenceStatsReady,
                          selectedSpeakerSummary: selectedSpeakerSummaryForActions,
                          handleSelectSpeakerUtterances: handleSelectSpeakerUnitsRouted,
                          handleClearSpeakerAssignments: handleClearSpeakerAssignmentsRouted,
                          handleExportSpeakerSegments: handleExportSpeakerSegmentsRouted,
                          handleRenameSpeaker,
                          handleMergeSpeaker,
                          handleDeleteSpeaker,
                          handleDeleteUnusedSpeakers,
                          handleAssignSpeakerToSelected: handleAssignSpeakerToSelectedRouted,
                          handleCreateSpeakerAndAssign: handleCreateSpeakerAndAssignRouted,
                          handleCreateSpeakerOnly,
                          closeSpeakerDialog: closeSpeakerDialogRouted,
                          updateSpeakerDialogDraftName: updateSpeakerDialogDraftNameRouted,
                          updateSpeakerDialogTargetKey: updateSpeakerDialogTargetKeyRouted,
                          confirmSpeakerDialog: confirmSpeakerDialogRouted,
                        }}
                        selectedUnitIds={selectedSpeakerUnitIdsForActionsSet}
                        handleAssignSpeakerToSelectedRouted={handleAssignSpeakerToSelectedRouted}
                        handleClearSpeakerOnSelectedRouted={handleClearSpeakerOnSelectedRouted}
                        sidebarProps={{
                          sidePaneRows: orderedLayers,
                          focusedLayerRowId,
                          flashLayerRowId,
                          onFocusLayer: handleFocusLayerRow,
                          transcriptionLayers,
                          toggleLayerLink,
                          deletableLayers,
                          layerCreateMessage,
                          layerAction,
                          onReorderLayers: reorderLayers,
                        }}
                      />
                    </Suspense>
                  </TimelineRailSection>

                  <TimelineScrollSection
                    containerRef={tierContainerRef}
                    onPointerDown={handleLassoPointerDown}
                    onPointerMove={handleLassoPointerMove}
                    onPointerUp={handleLassoPointerUp}
                    onScroll={handleTimelineScroll}
                  >
                    <TranscriptionEditorContext.Provider value={editorContextValue}>
                        <Suspense
                          fallback={(
                            <div className="timeline-scroll-suspense-fallback" aria-hidden="true">
                              <div className="timeline-scroll-suspense-fallback-row" />
                              <div className="timeline-scroll-suspense-fallback-row" />
                              <div className="timeline-scroll-suspense-fallback-row" />
                            </div>
                          )}
                        >
                          <TranscriptionPageTimelineContent {...timelineContentProps} />
                        </Suspense>
                    </TranscriptionEditorContext.Provider>
                  </TimelineScrollSection>
                </TimelineMainSection>
                {timelineResizeTooltip && (
                  <div
                    className="timeline-resize-tooltip"
                    style={{ left: timelineResizeTooltip.x, top: timelineResizeTooltip.y - 16 }}
                  >
                    {formatTime(timelineResizeTooltip.start)} - {formatTime(timelineResizeTooltip.end)}
                  </div>
                )}
                <BottomToolbarSection>
                  <ToolbarLeftSection>
                    <ZoomControlsSection
                      zoomPercent={zoomPercent}
                      snapEnabled={snapEnabled}
                      autoScrollEnabled={autoScrollEnabled}
                      activeUnitId={selectedWaveformRegionId || null}
                      unitsOnCurrentMedia={waveformTimelineItems}
                      fitPxPerSec={fitPxPerSec}
                      maxZoomPercent={maxZoomPercent}
                      onZoomToPercent={(percent, mode) => zoomToPercent(percent, undefined, mode)}
                      onZoomToUtterance={zoomToUtterance}
                      onSnapEnabledChange={setSnapEnabled}
                      onAutoScrollEnabledChange={setAutoScrollEnabled}
                    />
                  </ToolbarLeftSection>
                  <ToolbarRightSection
                    canUndo={canUndo}
                    canRedo={canRedo}
                    undoLabel={undoLabel}
                    undoHistory={undoHistory}
                    isHistoryVisible={showUndoHistory}
                    onToggleHistoryVisible={setShowUndoHistory}
                    onJumpToHistoryIndex={(idx) => fireAndForget((async () => {
                      const tu = selectedTimelineUnit;
                      recordTimelineEdit({
                        action: 'undo',
                        unitId: (tu?.unitId ?? activeTimelineUnitId) || 'history',
                        unitKind: tu?.kind ?? 'utterance',
                        detail: `historyIndex=${idx}`,
                      });
                      await undoToHistoryIndex(idx);
                    })())}
                    onRedo={() => fireAndForget((async () => {
                      const tu = selectedTimelineUnit;
                      recordTimelineEdit({
                        action: 'redo',
                        unitId: (tu?.unitId ?? activeTimelineUnitId) || 'history',
                        unitKind: tu?.kind ?? 'utterance',
                      });
                      await redo();
                    })())}
                  />
                </BottomToolbarSection>
              </section>

              <TranscriptionPageAiPanelHandle
                locale={locale}
                isAiPanelCollapsed={isAiPanelCollapsed}
                setIsAiPanelCollapsed={setIsAiPanelCollapsed}
                handleAiPanelResizeStart={handleAiPanelResizeStart}
                handleAiPanelToggle={handleAiPanelToggle}
              />

              <Suspense fallback={null}>
                <TranscriptionPageAssistantBridge
                  controllerInput={{
                    selectedUnitIds: selectedUnitIds,
                    selectedUnit: selectedUnit ?? null,
                    getUtteranceDocById,
                    selectedTimelineSegment: selectedTimelineSegment ?? null,
                    ...(selectedTimelineMedia ? { selectedTimelineMedia } : {}),
                    ...(selectedMediaUrl ? { selectedMediaUrl } : {}),
                    selectedLayerId,
                    activeLayerIdForEdits,
                    resolveSegmentRoutingForLayer,
                    segmentsByLayer,
                    segmentContentByLayer,
                    selectionSnapshot,
                    layers,
                    transcriptionLayers,
                    translationLayers,
                    layerLinks,
                    getUtteranceTextForLayer,
                    formatTime,
                    timelineUnitViewIndex,
                    segmentsLoadComplete,
                    translationLayerCount: translationLayers.length,
                    aiConfidenceAvg,
                    ...(state.phase === 'ready' ? { authoritativeUnitCount: state.unitCount } : {}),
                    recentTimelineEditEvents,
                    createLayerWithActiveContext,
                    createTranscriptionSegment: createNextSegmentRouted,
                    splitTranscriptionSegment: splitRouted,
                    mergeWithPrevious: mergeWithPreviousRouted,
                    mergeWithNext: mergeWithNextRouted,
                    mergeSelectedUnits: mergeSelectedUtterances,
                    mergeSelectedSegments: mergeSelectedSegmentsRouted,
                    deleteUtterance: deleteUtteranceRouted,
                    deleteSelectedUnits: deleteSelectedUtterancesRouted,
                    deleteLayer,
                    toggleLayerLink,
                    saveUtteranceText,
                    saveTextTranslationForUtterance,
                    saveSegmentContentForLayer,
                    updateTokenPos,
                    batchUpdateTokenPosByForm,
                    updateTokenGloss,
                    selectUnit,
                    setSaveState,
                    translationDrafts,
                    translationTextByLayer,
                    locale,
                    playerCurrentTime: player.currentTime,
                    executeActionRef,
                    openSearchRef,
                    seekToTimeRef,
                    splitAtTimeRef,
                    zoomToSegmentRef,
                    handleExecuteRecommendation,
                    aiSidebarError,
                    setAiSidebarError,
                    embeddingProviderConfig,
                    setEmbeddingProviderConfig,
                    acousticConfigOverride,
                    acousticProviderPreference,
                    ...(defaultTranscriptionLayerId !== undefined ? { defaultTranscriptionLayerId } : {}),
                  }}
                  onRuntimeStateChange={handleDeferredAiRuntimeChange}
                />
              </Suspense>

              <AiPanelContext.Provider value={aiPanelContextValue}>
                <Suspense fallback={null}>
                  <TranscriptionPageAiSidebar
                    {...aiSidebarProps}
                    shouldRenderRuntime={shouldRenderAiSidebar}
                  />
                </Suspense>
              </AiPanelContext.Provider>

              {shouldRenderDialogs ? (
                <Suspense fallback={null}>
                  <TranscriptionPageDialogs {...dialogsProps} />
                </Suspense>
              ) : null}
              {shouldRenderPdfRuntime ? (
                <Suspense fallback={null}>
                  <TranscriptionPagePdfRuntime {...pdfRuntimeProps} />
                </Suspense>
              ) : null}
            </section>
          </ToastProvider>

          {shouldRenderBatchOps ? (
            <Suspense fallback={null}>
              <TranscriptionPageBatchOps
                showBatchOperationPanel={showBatchOperationPanel}
                selectedUnitIds={selectedUnitIds}
                selectedBatchUtterances={selectedBatchUtterances}
                utterancesOnCurrentMedia={utterancesOnCurrentMedia}
                selectedBatchUtteranceTextById={selectedBatchUtteranceTextById}
                batchPreviewLayerOptions={batchPreviewLayerOptions}
                batchPreviewTextByLayerId={batchPreviewTextByLayerId}
                batchPreviewTextPropsByLayerId={batchPreviewTextPropsByLayerId}
                defaultBatchPreviewLayerId={defaultBatchPreviewLayerId}
                onBatchClose={() => setShowBatchOperationPanel(false)}
                onBatchOffset={handleBatchOffset}
                onBatchScale={handleBatchScale}
                onBatchSplitByRegex={handleBatchSplitByRegex}
                onBatchMerge={handleBatchMerge}
                onBatchJumpToUtterance={selectUnit}
              />
            </Suspense>
          ) : null}
        </>
      )}
      <Suspense fallback={null}>
        <TranscriptionOverlays
          ctxMenu={ctxMenu}
          onCloseCtxMenu={() => setCtxMenu(null)}
          uttOpsMenu={uttOpsMenu}
          onCloseUttOpsMenu={() => setUttOpsMenu(null)}
          selectedTimelineUnit={selectedTimelineUnit ?? null}
          selectedUnitIds={selectedUnitIds}
          runDeleteSelection={runOverlayDeleteSelection}
          runMergeSelection={runOverlayMergeSelection}
          runSelectBefore={runSelectBefore}
          runSelectAfter={runSelectAfter}
          runDeleteOne={runOverlayDeleteOne}
          runMergePrev={runOverlayMergePrev}
          runMergeNext={runOverlayMergeNext}
          runSplitAtTime={runOverlaySplitAtTime}
          getCurrentTime={() => player.instanceRef.current?.getCurrentTime() ?? 0}
          onOpenNoteFromMenu={(x, y, uttId, layerId, scope) => {
            if (layerId) {
              setNotePopover({ x, y, uttId, layerId, scope: scope ?? 'timeline' });
              return;
            }
            setNotePopover({ x, y, uttId });
          }}
          deleteConfirmState={deleteConfirmState}
          muteDeleteConfirmInSession={muteDeleteConfirmInSession}
          setMuteDeleteConfirmInSession={setMuteDeleteConfirmInSession}
          closeDeleteConfirmDialog={closeDeleteConfirmDialog}
          confirmDeleteFromDialog={confirmDeleteFromDialog}
          notePopover={notePopover}
          currentNotes={currentNotes}
          onCloseNotePopover={() => setNotePopover(null)}
          addNote={addNote}
          updateNote={updateNote}
          deleteNote={deleteNote}
          utterances={utterances}
          resolveSelfCertaintyUtteranceIds={resolveSelfCertaintyUtteranceIds}
          getUtteranceTextForLayer={getUtteranceTextForLayer}
          transcriptionLayers={transcriptionLayers}
          translationLayers={translationLayers}
          speakerOptions={speakerOptions}
          speakerFilterOptions={speakerFilterOptionsForActions}
          onAssignSpeakerFromMenu={handleAssignSpeakerFromMenu}
          onSetUtteranceSelfCertaintyFromMenu={handleSetUtteranceSelfCertaintyFromMenu}
          onOpenSpeakerManagementPanelFromMenu={() => handleOpenSpeakerManagementPanel()}
          displayStyleControl={displayStyleControl}
        />
      </Suspense>
    </TimelineStyledSection>
  );
}

export { TranscriptionPageReadyWorkspace };
