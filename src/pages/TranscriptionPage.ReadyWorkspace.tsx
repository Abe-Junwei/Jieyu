/**
 * TranscriptionPage - Ready Workspace
 *
 * Heavy ready-state runtime extracted from the thin orchestrator shell.
 * 从轻量壳组件中拆出的 ready 态重运行时 | Heavy ready-state runtime extracted from the lightweight shell.
 */

import { Suspense, useCallback, useEffect, useState } from 'react';
import {
  Merge as _Merge,
  Pause as _Pause,
} from 'lucide-react';
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
import { OrchestratorWaveformContent } from './OrchestratorWaveformContent';
import { TrackFocusToolbarControls } from '../components/transcription/toolbar/TrackFocusToolbarControls';
import { ToolbarAiProgress } from '../components/transcription/toolbar/ToolbarAiProgress';
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
import { useRecoveryBanner } from '../hooks/useRecoveryBanner';
import { getUtteranceSpeakerKey } from '../hooks/useSpeakerActions';
import {
  isUtteranceTimelineUnit,
} from '../hooks/transcriptionTypes';
import { t, tf, useLocale } from '../i18n';
import { fireAndForget } from '../utils/fireAndForget';
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
    selectedUtteranceIds,

    setUtteranceSelection,
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
    selectedUtterance,
    selectedUtteranceMedia,
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
    saveUtteranceTiming,
    saveTextTranslationForUtterance,
    createNextUtterance: _createNextUtterance,
    createUtteranceFromSelection,
    deleteUtterance,
    mergeWithPrevious,
    mergeWithNext,
    splitUtterance,
    selectTimelineUnit,
    selectUtterance,
    selectSegment,
    toggleUtteranceSelection,
    selectUtteranceRange,
    selectAllBefore,
    selectAllAfter,
    selectAllUtterances,
    clearUtteranceSelection,
    toggleSegmentSelection,
    selectSegmentRange,
    setSelectedUtteranceIds: _setSelectedUtteranceIds,
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
  const selectedTimelineUtteranceId = isUtteranceTimelineUnit(selectedTimelineUnit)
    ? selectedTimelineUnit.unitId
    : '';

  // 独立边界层 segments 加载 | Load segments for independent-boundary layers
  const { segmentsByLayer, reloadSegments, updateSegmentsLocally } = useLayerSegments(layers, selectedUtteranceMedia?.id, defaultTranscriptionLayerId);
  const { segmentContentByLayer, reloadSegmentContents } = useLayerSegmentContents(
    layers,
    selectedUtteranceMedia?.id,
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
    uiFontScaleMode,
    setUiFontScale,
    resetUiFontScale,
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
    activeTextPrimaryOrthographyId,
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
    selectedTimelineOwnerUtterance,
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
    selectedUtterance: selectedUtterance ?? null,
    ...(selectedUtteranceMedia ? { selectedUtteranceMedia } : {}),
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
    speakerFocusTargetMemoryByMediaRef,
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
    selectedTimelineOwnerUtteranceId: selectedTimelineOwnerUtterance?.id,
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

  const [speakerFocusMode, setSpeakerFocusMode] = useState<'all' | 'focus-soft' | 'focus-hard'>('all');
  const [speakerFocusTargetKey, setSpeakerFocusTargetKey] = useState<string | null>(null);
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
    selectUtterance,
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
    activeUtteranceUnitId: selectedTimelineUtteranceId,
    focusedLayerRowId,
    utterances,
    timelineUnitIds: noteTimelineUnitIds,
    transcriptionLayers,
    translationLayers,
    updateTokenPos,
    batchUpdateTokenPosByForm,
    selectUtterance,
    setSaveState,
  });

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
    segmentsByLayer,
    utterancesOnCurrentMedia,
    setSaveState,
    splitUtterance,
    mergeSelectedUtterances,
    mergeWithPrevious,
    mergeWithNext,
    deleteUtterance,
    deleteSelectedUtterances,
  });

  const { createNextSegmentRouted, createUtteranceFromSelectionRouted } = useTranscriptionSegmentCreationController({
    activeLayerIdForEdits,
    resolveSegmentRoutingForLayer,
    selectedTimelineMedia: selectedTimelineMedia ?? null,
    segmentsByLayer,
    speakerFocusTargetKey,
    utterancesOnCurrentMedia,
    pushUndo,
    reloadSegments,
    refreshSegmentUndoSnapshot,
    reloadSegmentContents,
    selectTimelineUnit,
    setSaveState,
    createNextUtterance: _createNextUtterance,
    createUtteranceFromSelection,
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
    segmentsByLayer,
    utterancesOnCurrentMedia,
    selectedTimelineUnit,
    selectedTimelineUnitForTime,
    selectedUtteranceIds,
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
    clearUtteranceSelection,
    createUtteranceFromSelection: createUtteranceFromSelectionRouted,
    setUtteranceSelection,
    resolveNoteIndicatorTarget,
    tierContainerRef,
    ...(selectedTimelineMedia?.id !== undefined ? { mediaId: selectedTimelineMedia.id } : {}),
    ...(selectedMediaBlobSize !== undefined && { mediaBlobSize: selectedMediaBlobSize }),
  });

  const selectionSnapshot = useTranscriptionSelectionSnapshot({
    selectedTimelineUnit,
    selectedTimelineSegment,
    selectedTimelineOwnerUtterance: selectedTimelineOwnerUtterance ?? null,
    selectedTimelineRowMeta,
    selectedLayerId,
    layers,
    segmentContentByLayer,
    getUtteranceTextForLayer,
    formatTime,
  });

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
    selectedUtterance: selectedTimelineOwnerUtterance ?? undefined,
    selectedUtteranceText: selectionSnapshot.selectedText,
    translationLayers,
    translationDrafts,
    translationTextByLayer,
    aiChatConnectionTestStatus: deferredAiRuntime.aiChat.connectionTestStatus,
    aiPanelMode,
    selectUtterance,
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
    bottomToolbarAcousticRuntimeStatus,
    showBottomToolbarAiProgress,
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
    selectUtterance,
    manualSelectTsRef,
    player,
    locale,
    sidePaneRows,
    selectedTimelineUtteranceId,
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
    toggleUtteranceSelection,
    selectUtteranceRange,
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
    selectedUtteranceIds,
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
    selectUtterance,
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
    utterancesLength: utterances.length,
    translationLayersLength: translationLayers.length,
    aiConfidenceAvg,
    selectedTimelineOwnerUtterance: selectedTimelineOwnerUtterance ?? null,
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
    selectUtterance,
    aiChatEnabled: deferredAiRuntime.aiChat.enabled,
    aiChatSettings: deferredAiRuntime.aiChat.settings,
    pushUndo,
    setUtterances,
  });

  const {
    handleGlobalPlayPauseAction,
    handleWaveformKeyDown,
    navigateUtteranceFromInput,
    executeAction,
    toggleVoiceRef,
  } = useTranscriptionPlaybackKeyboardController({
    player,
    subSelectionRange,
    setSubSelectionRange,
    selectedUtterance: selectedTimelineOwnerUtterance ?? undefined,
    selectedPlayableRange: selectedTimelineUnitForTime,
    selectedTimelineUnit,
    selectedUtteranceIds,
    selectedMediaUrl,
    segMarkStart,
    setSegMarkStart,
    segmentLoopPlayback,
    setSegmentLoopPlayback,
    utterancesOnCurrentMedia,
    markingModeRef,
    skipSeekForIdRef,
    creatingSegmentRef,
    manualSelectTsRef,
    waveformAreaRef,
    createUtteranceFromSelection: createUtteranceFromSelectionRouted,
    selectTimelineUnit,
    selectUtterance,
    selectAllUtterances,
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

  const assistantSidebarControllerInput = useTranscriptionAssistantSidebarControllerInput({
    locale,
    analysisTab,
    onAnalysisTabChange: setAnalysisTab,
    currentPage: 'transcription',
    selectedUtterance: selectedTimelineOwnerUtterance ?? null,
    selectedRowMeta: selectedTimelineRowMeta,
    selectedUnitKind: selectionSnapshot.selectedUnitKind,
    selectedLayerType: selectionSnapshot.selectedLayerType,
    selectedText: selectionSnapshot.selectedText,
    selectedTimeRangeLabel: selectionSnapshot.selectedTimeRangeLabel ?? null,
    lexemeMatches,
    aiChat: deferredAiRuntimeForSidebar.aiChat,
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
    selectedUtteranceMedia: selectedTimelineMedia,
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
    speakerActionUtteranceIdByUnitId,
    segmentByIdForSpeakerActions,
    resolveSpeakerKeyForSegment,
    resolveExplicitSpeakerKeyForSegment,
    segmentSpeakerAssignmentsOnCurrentMedia,
    speakerVisualByTimelineUnitId,
    activeSpeakerManagementLayer,
    speakerFilterOptionsForActions,
    selectedUnitIdsForSpeakerActions,
    selectedBatchSegmentsForSpeakerActions,
    resolveSpeakerActionUtteranceIds,
    selectedSpeakerUnitIdsForActionsSet,
  } = useSpeakerActionScopeController({
    utterancesOnCurrentMedia,
    segmentsByLayer,
    speakers,
    layers,
    ...(defaultTranscriptionLayerId !== undefined ? { defaultTranscriptionLayerId } : {}),
    ...(selectedLayerId !== undefined ? { selectedLayerId } : {}),
    selectedUtteranceIds,
    selectedTimelineUnit,
    getUtteranceSpeakerKey,
  });

  const {
    selectedUtteranceIdsForSpeakerActionsSet,
    selectedBatchUtterances,
    handleBatchOffset,
    handleBatchScale,
    handleBatchSplitByRegex,
    handleBatchMerge,
  } = useBatchOperationController({
    selectedUtteranceIds,
    selectedTimelineUnit,
    unitToUtteranceId: speakerActionUtteranceIdByUnitId,
    utterancesOnCurrentMedia,
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
    speakerFocusOptions,
    resolvedSpeakerFocusTargetKey,
    resolvedSpeakerFocusTargetName,
    cycleSpeakerFocusMode,
    handleSpeakerFocusTargetChange,
    handleOpenSpeakerManagementPanel,
    handleAssignSpeakerFromMenu,
  } = useTranscriptionSpeakerController({
    utterances,
    setUtterances,
    speakers,
    setSpeakers,
    utterancesOnCurrentMedia,
    selectedTimelineUtteranceId,
    selectedUtteranceIds,
    selectedBatchUtterances,
    selectedUtteranceIdsForSpeakerActionsSet,
    selectedTimelineUnit,
    selectedTimelineMediaId: selectedTimelineMedia?.id ?? null,
    selectedUtterance: selectedUtterance ?? null,
    statePhase: state.phase,
    setUtteranceSelection,
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
    selectedBatchSegmentsForSpeakerActions,
    selectedUnitIdsForSpeakerActions,
    segmentByIdForSpeakerActions,
    resolveSpeakerActionUtteranceIds,
    speakerFilterOptionsForActions,
    segmentSpeakerAssignmentsOnCurrentMedia,
    speakerFocusMode,
    setSpeakerFocusMode,
    speakerFocusTargetKey,
    setSpeakerFocusTargetKey,
    speakerFocusTargetMemoryByMediaRef,
    selectTimelineUnit,
    setSelectedUtteranceIds: _setSelectedUtteranceIds,
    reloadSegments,
    refreshSegmentUndoSnapshot,
    updateSegmentsLocally,
    layerAction,
  });

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
    selectUtteranceRange,
    toggleUtteranceSelection,
    selectTimelineUnit,
    selectUtterance,
    selectSegment,
    setSelectedLayerId,
    onFocusLayerRow: handleFocusLayerRow,
    tierContainerRef,
    zoomPxPerSec,
    setCtxMenu,
    navigateUtteranceFromInput,
    waveformAreaRef,
    dragPreview,
    selectedUtteranceIds,
    focusedLayerRowId,
    zoomToUtterance,
    startTimelineResizeDrag,
    handleNoteClick,
    resolveNoteIndicatorTarget,
    speakerVisualByUtteranceId: speakerVisualByTimelineUnitId,
    independentLayerIds: segmentTimelineLayerIds,
    orthographies: displayStyleControl.orthographies,
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
    trackModeLabel,
    trackConflictLabel,
    trackLockDiagnostics,
    handleOpenLockConflictDetails,
  } = useTrackDisplayController({
    utterancesOnCurrentMedia,
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
    segmentsByLayer,
    segmentContentByLayer,
    saveSegmentContentForLayer,
    selectedTimelineUnit,
    flashLayerRowId,
    focusedLayerRowId,
    selectedTimelineUtteranceId,
    orderedLayers,
    reorderLayers,
    deletableLayers,
    handleFocusLayerRow,
    layerLinks,
    showAllLayerConnectors,
    activeTextPrimaryLanguageId,
    activeTextPrimaryOrthographyId,
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
    speakerFocusMode,
    resolvedSpeakerFocusTargetKey,
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
    navigateUtteranceFromInput,
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
    selectedTimelineUtteranceId,
    searchOverlayRequest,
    manualSelectTsRef,
    selectUtterance,
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
                  selectedUtteranceDuration={selectedTimelineUnitForTime
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
                  selectedUtteranceIds={selectedUtteranceIds}
                  selectedTimelineUtteranceId={selectedTimelineUtteranceId}
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
                <Suspense
                  fallback={(
                    <div className="timeline-top-placeholder" aria-hidden="true">
                      <div className="waveform-overview-bar waveform-overview-placeholder" />
                      <div className="time-ruler time-ruler-placeholder" />
                    </div>
                  )}
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
                        selectedUtteranceIds={selectedSpeakerUnitIdsForActionsSet}
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
                          ...(activeTextPrimaryLanguageId ? { defaultLanguageId: activeTextPrimaryLanguageId } : {}),
                          ...(activeTextPrimaryOrthographyId ? { defaultOrthographyId: activeTextPrimaryOrthographyId } : {}),
                          onReorderLayers: reorderLayers,
                          uiFontScale,
                          uiFontScaleMode,
                          onUiFontScaleChange: setUiFontScale,
                          onUiFontScaleReset: resetUiFontScale,
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
                            <div className="timeline-content timeline-content-placeholder" aria-hidden="true">
                              <div className="timeline-lane" />
                              <div className="timeline-lane" />
                              <div className="timeline-lane" />
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
                      activeUtteranceUnitId={selectedWaveformRegionId || null}
                      utterancesOnCurrentMedia={waveformTimelineItems}
                      fitPxPerSec={fitPxPerSec}
                      maxZoomPercent={maxZoomPercent}
                      onZoomToPercent={(percent, mode) => zoomToPercent(percent, undefined, mode)}
                      onZoomToUtterance={zoomToUtterance}
                      onSnapEnabledChange={setSnapEnabled}
                      onAutoScrollEnabledChange={setAutoScrollEnabled}
                    />
                    <div className="toolbar-sep toolbar-sep-compact-gap" />
                    <TrackFocusToolbarControls
                      trackModeLabel={trackModeLabel}
                      laneLockCount={Object.keys(effectiveLaneLockMap).length}
                      lockConflictCount={trackLockDiagnostics.count}
                      lockConflictSpeakerNames={trackLockDiagnostics.speakerNames}
                      trackConflictLabel={trackConflictLabel}
                      onOpenLockConflictDetails={handleOpenLockConflictDetails}
                      speakerFocusMode={speakerFocusMode}
                      {...(resolvedSpeakerFocusTargetName ? { speakerFocusTargetName: resolvedSpeakerFocusTargetName } : {})}
                      speakerFocusOptions={speakerFocusOptions}
                      speakerFocusTargetKey={speakerFocusTargetKey ?? ''}
                      onSpeakerFocusTargetKeyChange={handleSpeakerFocusTargetChange}
                      onCycleSpeakerFocusMode={cycleSpeakerFocusMode}
                    />
                    {showBottomToolbarAiProgress ? <div className="toolbar-sep toolbar-sep-compact-gap" /> : null}
                    <ToolbarAiProgress
                      {...(bottomToolbarAcousticRuntimeStatus ? { acousticRuntimeStatus: bottomToolbarAcousticRuntimeStatus } : {})}
                    />
                    <div className="toolbar-sep toolbar-sep-compact-gap" />
                    <ObserverStatusSection
                      observerStage={observerResult.stage}
                      recommendations={actionableObserverRecommendations || []}
                      onExecuteRecommendation={handleExecuteObserverRecommendation}
                    />
                  </ToolbarLeftSection>
                  <ToolbarRightSection
                    canUndo={canUndo}
                    canRedo={canRedo}
                    undoLabel={undoLabel}
                    undoHistory={undoHistory}
                    isHistoryVisible={showUndoHistory}
                    onToggleHistoryVisible={setShowUndoHistory}
                    onJumpToHistoryIndex={(idx) => fireAndForget(undoToHistoryIndex(idx))}
                    onRedo={() => { fireAndForget(redo()); }}
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
                    utterances,
                    utterancesOnCurrentMedia,
                    selectedUnitIds: selectedUtteranceIds,
                    selectedUtterance: selectedUtterance ?? null,
                    selectedTimelineOwnerUtterance: selectedTimelineOwnerUtterance ?? null,
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
                    utteranceCount: state.phase === 'ready' ? state.utteranceCount : utterances.length,
                    translationLayerCount: state.phase === 'ready' ? state.translationLayerCount : translationLayers.length,
                    aiConfidenceAvg,
                    undoHistory,
                    createLayerWithActiveContext,
                    createTranscriptionSegment: createNextSegmentRouted,
                    splitTranscriptionSegment: splitRouted,
                    mergeWithPrevious: mergeWithPreviousRouted,
                    mergeWithNext: mergeWithNextRouted,
                    mergeSelectedUtterances,
                    mergeSelectedSegments: mergeSelectedSegmentsRouted,
                    deleteUtterance: deleteUtteranceRouted,
                    deleteSelectedUtterances: deleteSelectedUtterancesRouted,
                    deleteLayer,
                    toggleLayerLink,
                    saveUtteranceText,
                    saveTextTranslationForUtterance,
                    saveSegmentContentForLayer,
                    updateTokenPos,
                    batchUpdateTokenPosByForm,
                    updateTokenGloss,
                    selectUtterance,
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
                selectedUtteranceIds={selectedUtteranceIds}
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
                onBatchJumpToUtterance={selectUtterance}
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
          selectedUtteranceIds={selectedUtteranceIds}
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
          getUtteranceTextForLayer={getUtteranceTextForLayer}
          transcriptionLayers={transcriptionLayers}
          translationLayers={translationLayers}
          speakerOptions={speakerOptions}
          speakerFilterOptions={speakerFilterOptionsForActions}
          onAssignSpeakerFromMenu={handleAssignSpeakerFromMenu}
          onOpenSpeakerManagementPanelFromMenu={() => handleOpenSpeakerManagementPanel()}
          displayStyleControl={displayStyleControl}
        />
      </Suspense>
    </TimelineStyledSection>
  );
}

export { TranscriptionPageReadyWorkspace };
