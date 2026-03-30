/**
 * TranscriptionPage - Orchestrator
 *
 * Single source of truth for ALL hooks, state, and useEffect hooks.
 * Renders all sub-components in the correct layout positions.
 */

import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Merge as _Merge,
  Pause as _Pause,
} from 'lucide-react';
import {
  TimelineRailSection,
  TimelineScrollSection,
  VideoPreviewSection,
} from '../components/transcription/TranscriptionTimelineSections';
import {
  BottomToolbarSection,
  ObserverStatusSection,
  TimelineMainSection,
  ToolbarLeftSection,
  ToolbarRightSection,
  WaveformAreaSection,
  ZoomControlsSection,
} from '../components/transcription/TranscriptionLayoutSections';
import { WaveformHoverTooltip } from '../components/transcription/WaveformHoverTooltip';
import { WaveformLeftStatusStrip } from '../components/transcription/WaveformLeftStatusStrip';
import { RegionActionOverlay } from '../components/transcription/RegionActionOverlay';
import { NoteDocumentIcon } from '../components/NoteDocumentIcon';
import { TrackFocusToolbarControls } from '../components/transcription/toolbar/TrackFocusToolbarControls';
import { TranscriptionEditorContext } from '../contexts/TranscriptionEditorContext';
import { useAiPanelContextUpdater, AiPanelContext } from '../contexts/AiPanelContext';
import { ToastProvider } from '../contexts/ToastContext';
import { useTranscriptionData } from '../hooks/useTranscriptionData';
import { useRecording } from '../hooks/useRecording';
import { useUtteranceOps } from '../hooks/useUtteranceOps';
import { useKeybindingActions } from '../hooks/useKeybindingActions';
import { useJKLShuttle } from '../hooks/useJKLShuttle';
import { useImportExport } from '../hooks/useImportExport';
import { useNoteHandlers } from '../hooks/useNoteHandlers';
import { useTimelineAnnotationHelpers } from '../hooks/useTimelineAnnotationHelpers';
import { useTranscriptionUIState } from './TranscriptionPage.UIState';
import {
  type AppShellOpenSearchDetail,
} from '../utils/appShellEvents';
import { useTimelineResize } from '../hooks/useTimelineResize';
import { useLayerSegments } from '../hooks/useLayerSegments';
import { useLayerSegmentContents } from '../hooks/useLayerSegmentContents';
import { usePanelResize } from '../hooks/usePanelResize';
import { usePanelAutoCollapse } from '../hooks/usePanelAutoCollapse';
import { useRecoveryBanner } from '../hooks/useRecoveryBanner';
import { useSpeakerActions, getUtteranceSpeakerKey } from '../hooks/useSpeakerActions';
import {
  isUtteranceTimelineUnit,
} from '../hooks/transcriptionTypes';
import { detectLocale, t, tf } from '../i18n';
import { createLogger } from '../observability/logger';
import { fireAndForget } from '../utils/fireAndForget';
import { reportValidationError } from '../utils/validationErrorReporter';
import { formatLayerRailLabel, formatTime } from '../utils/transcriptionFormatters';
import {
  INITIAL_OVERLAP_CYCLE_TELEMETRY,
  updateOverlapCycleTelemetry,
} from '../utils/overlapCycleTelemetry';
import { useTranscriptionAiController } from './useTranscriptionAiController';
import { useTranscriptionAssistantSidebarController } from './useTranscriptionAssistantSidebarController';
import { useSpeakerFocusController } from './useSpeakerFocusController';
import { useWaveformRuntimeController } from './useWaveformRuntimeController';
import { useBatchOperationController } from './useBatchOperationController';
import { useSpeakerActionScopeController } from './useSpeakerActionScopeController';
import { useSpeakerActionRoutingController } from './useSpeakerActionRoutingController';
import { useTranscriptionAssistantController } from './useTranscriptionAssistantController';
import { useTranscriptionSelectionContextController } from './useTranscriptionSelectionContextController';
import { useTranscriptionProjectMediaController } from './useTranscriptionProjectMediaController';
import { useTranscriptionSegmentCreationController } from './useTranscriptionSegmentCreationController';
import { useTranscriptionSegmentBridgeController } from './useTranscriptionSegmentBridgeController';
import { useTranscriptionSegmentMutationController } from './useTranscriptionSegmentMutationController';
import { useTranscriptionShellController } from './useTranscriptionShellController';
import { useTrackEntityPersistenceController } from './useTrackEntityPersistenceController';
import { useTrackEntityStateController } from './useTrackEntityStateController';
import { useTranscriptionTimelineController } from './useTranscriptionTimelineController';
import { useTranscriptionTimelineInteractionController } from './useTranscriptionTimelineInteractionController';
import { useTrackDisplayController } from './useTrackDisplayController';
import { useTranscriptionTimelineContentViewModel } from './useTranscriptionTimelineContentViewModel';
import { useTranscriptionWorkspaceLayoutController } from './useTranscriptionWorkspaceLayoutController';
import { useTranscriptionWaveformBridgeController } from './useTranscriptionWaveformBridgeController';
import { useTranscriptionSectionViewModels } from './useTranscriptionSectionViewModels';
import { buildTranscriptionSelectionSnapshot } from './transcriptionSelectionSnapshot';

const log = createLogger('TranscriptionPage');

const TranscriptionPageAiSidebar = lazy(async () => import('./TranscriptionPage.AiSidebar').then((module) => ({
  default: module.TranscriptionPageAiSidebar,
})));

const TranscriptionPageToolbar = lazy(async () => import('./TranscriptionPage.Toolbar').then((module) => ({
  default: module.TranscriptionPageToolbar,
})));

const TranscriptionPageBatchOps = lazy(async () => import('./TranscriptionPage.BatchOps').then((module) => ({
  default: module.TranscriptionPageBatchOps,
})));

const TranscriptionPageDialogs = lazy(async () => import('./TranscriptionPage.Dialogs').then((module) => ({
  default: module.TranscriptionPageDialogs,
})));

const TranscriptionPageTimelineContent = lazy(async () => import('./TranscriptionPage.TimelineContent').then((module) => ({
  default: module.TranscriptionPageTimelineContent,
})));

const TranscriptionPageLayerRail = lazy(async () => import('./TranscriptionPage.LayerRail').then((module) => ({
  default: module.TranscriptionPageLayerRail,
})));

const TranscriptionPageTimelineTop = lazy(async () => import('./TranscriptionPage.TimelineTop').then((module) => ({
  default: module.TranscriptionPageTimelineTop,
})));

const TranscriptionOverlays = lazy(async () => import('../components/TranscriptionOverlays').then((module) => ({
  default: module.TranscriptionOverlays,
})));

const RecoveryBanner = lazy(async () => import('../components/RecoveryBanner').then((module) => ({
  default: module.RecoveryBanner,
})));

const TranscriptionPagePdfRuntime = lazy(async () => import('./TranscriptionPage.PdfRuntime').then((module) => ({
  default: module.TranscriptionPagePdfRuntime,
})));

interface TranscriptionPageOrchestratorProps {
  appSearchRequest?: AppShellOpenSearchDetail | null;
  onConsumeAppSearchRequest?: () => void;
}

function TranscriptionPageOrchestrator({
  appSearchRequest,
  onConsumeAppSearchRequest,
}: TranscriptionPageOrchestratorProps) {
  const locale = detectLocale();
  /** Pre-bound tf for components that need (key, params) without locale */
  const tfB = (key: string, opts?: Record<string, unknown>) => tf(locale, key as Parameters<typeof tf>[1], opts as Parameters<typeof tf>[2]);
  // ---- Data layer (from hook) ----
  const data = useTranscriptionData();
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
    layerRailRows,
    deletableLayers,
    selectedUtterance,
    selectedUtteranceMedia,
    selectedMediaUrl,
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
    isLayerRailCollapsed,
    setIsLayerRailCollapsed,
    layerRailTab,
    setLayerRailTab,
    isAiPanelCollapsed,
    setIsAiPanelCollapsed,
    layerRailWidth,
    setLayerRailWidth,
    aiPanelWidth,
    setAiPanelWidth,
    handleLayerRailToggle,
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

  // 当前媒体低置信度句段数量（< 0.75）| Count of low-confidence utterances on current media
  const lowConfidenceCount = useMemo(
    () => utterancesOnCurrentMedia.filter(
      (u) => typeof u.ai_metadata?.confidence === 'number' && u.ai_metadata.confidence < 0.75,
    ).length,
    [utterancesOnCurrentMedia],
  );
  const {
    recoveryAvailable,
    recoveryDiffSummary,
    recoveryDataRef,
    hideRecoveryBanner,
  } = useRecoveryBanner({
    phase: data.state.phase,
    utterancesLength: utterances.length,
    translationsLength: translations.length,
    layersLength: layers.length,
    checkRecovery,
  });

  // Pre-declare action/search refs before dependent controllers; populated after useKeybindingActions.
  const executeActionRef = useRef<((actionId: string) => void) | undefined>(undefined);
  const openSearchRef = useRef<typeof openSearchFromRequest | undefined>(undefined);
  const seekToTimeRef = useRef<((timeSeconds: number) => void) | undefined>(undefined);
  const splitAtTimeRef = useRef<((timeSeconds: number) => boolean) | undefined>(undefined);
  const zoomToSegmentRef = useRef<((segmentId: string, zoomLevel?: number) => boolean) | undefined>(undefined);
  openSearchRef.current = openSearchFromRequest;

  const utteranceRowRef = useRef<Record<string, HTMLDivElement | null>>({});
  const {
    waveformHeight,
    amplitudeScale,
    setAmplitudeScale,
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
    hoverExpandEnabled,
    setHoverExpandEnabled,
  } = useTranscriptionWorkspaceLayoutController({
    layers,
    selectedTimelineOwnerUtteranceId: selectedTimelineOwnerUtterance?.id,
    utteranceRowRef,
  });
  const [speakerFocusMode, setSpeakerFocusMode] = useState<'all' | 'focus-soft' | 'focus-hard'>('all');
  const [speakerFocusTargetKey, setSpeakerFocusTargetKey] = useState<string | null>(null);
  const [overlapCycleToast, setOverlapCycleToast] = useState<{ index: number; total: number; nonce: number } | null>(null);
  const [lockConflictToast, setLockConflictToast] = useState<{ count: number; speakers: string[]; nonce: number } | null>(null);
  const speakerFocusTargetMemoryByMediaRef = useRef<Record<string, string | null>>({});
  const overlapCycleTelemetryRef = useRef(INITIAL_OVERLAP_CYCLE_TELEMETRY);
  const manualSelectTsRef = useRef(0);

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

  const tierContainerRef = useRef<HTMLDivElement>(null);
  const listMainRef = useRef<HTMLDivElement | null>(null);
  const workspaceRef = useRef<HTMLElement | null>(null);
  const screenRef = useRef<HTMLElement | null>(null);
  const dragCleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    return () => { dragCleanupRef.current?.(); };
  }, []);

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
    mergeWithPrevious,
    mergeWithNext,
    deleteUtterance,
    deleteSelectedUtterances,
  });

  const { createUtteranceFromSelectionRouted } = useTranscriptionSegmentCreationController({
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
        message: '请先选择一个句段再执行合并',
        i18nKey: 'transcription.error.validation.mergeTargetSelectionRequired',
        setErrorState: ({ message, meta }) => setSaveState({ kind: 'error', message, errorMeta: meta }),
      });
    },
    splitUtterance: splitRouted,
    selectAllBefore,
    selectAllAfter,
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
    zoomPercent,
    setZoomPercent,
    zoomMode,
    setZoomMode,
    clearUtteranceSelection,
    createUtteranceFromSelection: createUtteranceFromSelectionRouted,
    setUtteranceSelection,
    resolveNoteIndicatorTarget,
    tierContainerRef,
  });

  const selectionSnapshot = useMemo(() => buildTranscriptionSelectionSnapshot({
    selectedTimelineUnit,
    selectedTimelineSegment,
    selectedTimelineOwnerUtterance: selectedTimelineOwnerUtterance ?? null,
    selectedTimelineRowMeta,
    selectedLayerId,
    layers,
    segmentContentByLayer,
    getUtteranceTextForLayer,
    formatTime,
  }), [
    formatTime,
    getUtteranceTextForLayer,
    layers,
    segmentContentByLayer,
    selectedLayerId,
    selectedTimelineOwnerUtterance,
    selectedTimelineRowMeta,
    selectedTimelineSegment,
    selectedTimelineUnit,
  ]);

  const setAiPanelContext = useAiPanelContextUpdater();

  const {
    aiPanelMode,
    setAiPanelMode,
    aiSidebarError,
    setAiSidebarError,
    embeddingProviderConfig,
    setEmbeddingProviderConfig,
    aiToolDecisionLogs,
    aiChat,
    lexemeMatches,
    observerResult,
    actionableObserverRecommendations,
    selectedAiWarning,
    selectedTranslationGapCount,
    aiCurrentTask,
    aiVisibleCards,
    handleJumpToTranslationGap,
    handleExecuteObserverRecommendation,
  } = useTranscriptionAiController({
    utterances,
    selectedUtterance: selectedUtterance ?? null,
    selectedTimelineOwnerUtterance: selectedTimelineOwnerUtterance ?? null,
    ...(selectedTimelineMedia ? { selectedTimelineMedia } : {}),
    selectedLayerId,
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
    createNextUtterance: _createNextUtterance,
    splitUtterance,
    deleteUtterance,
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
  });

  seekToTimeRef.current = (timeSeconds) => {
    player.seekTo(timeSeconds);
  };

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
    layerRailRows,
    selectedTimelineUtteranceId,
    onSetNotePopover: setNotePopover,
    onSetSidebarError: setAiSidebarError,
    onRevealSchemaLayer: (layerId) => {
      setIsLayerRailCollapsed(false);
      setLayerRailTab('layers');
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

  waveformInteractionHandlerRefs.handleWaveformRegionAltPointerDownRef.current = handleWaveformRegionAltPointerDown;
  waveformInteractionHandlerRefs.handleWaveformRegionClickRef.current = handleWaveformRegionClick;
  waveformInteractionHandlerRefs.handleWaveformRegionDoubleClickRef.current = handleWaveformRegionDoubleClick;
  waveformInteractionHandlerRefs.handleWaveformRegionCreateRef.current = handleWaveformRegionCreate;
  waveformInteractionHandlerRefs.handleWaveformRegionContextMenuRef.current = handleWaveformRegionContextMenu;
  waveformInteractionHandlerRefs.handleWaveformRegionUpdateRef.current = handleWaveformRegionUpdate;
  waveformInteractionHandlerRefs.handleWaveformRegionUpdateEndRef.current = handleWaveformRegionUpdateEnd;
  waveformInteractionHandlerRefs.handleWaveformTimeUpdateRef.current = handleWaveformTimeUpdate;
  splitAtTimeRef.current = handleSplitAtTimeRequest;
  zoomToSegmentRef.current = handleZoomToSegmentRequest;

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
    selectedTranslationGapCount,
    handleJumpToTranslationGap,
    setAiPanelContext,
    selectedTimelineUnit,
    saveSegmentContentForLayer,
    selectedLayerId,
    translationLayers,
    layers,
    saveUtteranceText,
    saveTextTranslationForUtterance,
    setSaveState,
    ...(nextUtteranceIdForVoiceDictation ? { nextUtteranceIdForVoiceDictation } : {}),
    selectUtterance,
    aiChatEnabled: aiChat.enabled,
    aiChatSettings: aiChat.settings,
    pushUndo,
    setUtterances,
  });

  usePanelAutoCollapse({
    hoverExpandEnabled,
    isLayerRailCollapsed,
    setIsLayerRailCollapsed,
    listMainRef,
    isAiPanelCollapsed,
    setIsAiPanelCollapsed,
    workspaceRef,
  });

  // ---- Keybinding system (from hook) ----
  // toggleVoice is wired via ref to break the forward-declaration cycle.
  const toggleVoiceRef = useRef<(() => void) | undefined>(undefined);
  const {
    handlePlayPauseAction: _handlePlayPauseAction,
    handleGlobalPlayPauseAction,
    handleWaveformKeyDown,
    navigateUtteranceFromInput,
    executeAction,
  } = useKeybindingActions({
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
    toggleVoice: useCallback(() => toggleVoiceRef.current?.(), []),
  });

  // JKL shuttle — global broadcast-standard playback control + frame stepping
  useJKLShuttle(player);

  // Wire executeActionRef back into downstream controllers that read the latest action executor.
  executeActionRef.current = executeAction;

  const observerRecommendationsForSidebar = useMemo(() => actionableObserverRecommendations.map((item) => ({
    ...item,
    ...(item.actionType !== undefined ? { actionType: item.actionType } : {}),
    ...(item.targetUtteranceId !== undefined ? { targetUtteranceId: item.targetUtteranceId } : {}),
    ...(item.targetForm !== undefined ? { targetForm: item.targetForm } : {}),
    ...(item.targetPos !== undefined ? { targetPos: item.targetPos } : {}),
    ...(item.targetConfidence !== undefined ? { targetConfidence: item.targetConfidence } : {}),
  })), [actionableObserverRecommendations]);

  const {
    aiChatContextValue,
    assistantRuntimeProps,
    analysisRuntimeProps,
    pdfRuntimeProps,
  } = useTranscriptionAssistantSidebarController({
    aiChatContextInput: {
      selectedUtterance: selectedTimelineOwnerUtterance ?? null,
      selectedRowMeta: selectedTimelineRowMeta,
      lexemeMatches,
      aiChatEnabled: aiChat.enabled,
      aiProviderLabel: aiChat.providerLabel,
      aiChatSettings: aiChat.settings,
      aiMessages: aiChat.messages,
      aiIsStreaming: aiChat.isStreaming,
      aiLastError: aiChat.lastError,
      aiConnectionTestStatus: aiChat.connectionTestStatus,
      aiConnectionTestMessage: aiChat.connectionTestMessage,
      aiContextDebugSnapshot: aiChat.contextDebugSnapshot,
      aiPendingToolCall: aiChat.pendingToolCall,
      aiTaskSession: aiChat.taskSession,
      aiInteractionMetrics: aiChat.metrics,
      aiSessionMemory: aiChat.sessionMemory,
      aiToolDecisionLogs,
      observerStage: observerResult.stage,
      observerRecommendations: observerRecommendationsForSidebar,
      onUpdateAiChatSettings: aiChat.updateSettings,
      onTestAiConnection: aiChat.testConnection,
      onSendAiMessage: aiChat.send,
      onStopAiMessage: aiChat.stop,
      onClearAiMessages: aiChat.clear,
      onConfirmPendingToolCall: aiChat.confirmPendingToolCall,
      onCancelPendingToolCall: aiChat.cancelPendingToolCall,
      onJumpToCitation: handleJumpToCitation,
    },
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
      formatLayerRailLabel,
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

  const { handleLayerRailResizeStart, handleAiPanelResizeStart } = usePanelResize({
    isLayerRailCollapsed,
    layerRailWidth,
    setLayerRailWidth,
    listMainRef,
    isAiPanelCollapsed,
    aiPanelWidth,
    setAiPanelWidth,
    workspaceRef,
    dragCleanupRef,
    isHubCollapsed,
    hubHeight,
    setHubHeight,
    screenRef,
  });

  // ── Import / Export (extracted hook) ──

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
    handleImportFile,
  } = useImportExport({
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

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (
        target.tagName === 'INPUT'
        || target.tagName === 'TEXTAREA'
        || target.tagName === 'SELECT'
        || target.isContentEditable
      )) {
        return;
      }
      const hasMod = event.metaKey || event.ctrlKey;
      if (!hasMod || !event.shiftKey || event.altKey) return;
      if (event.key.toLowerCase() !== 'b') return;
      event.preventDefault();
      setShowBatchOperationPanel((prev) => !prev);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

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
      speakerSaving,
      activeSpeakerFilterKey,
      setActiveSpeakerFilterKey,
      speakerDialogState: baseSpeakerDialogState,
      speakerReferenceStats,
      speakerReferenceStatsReady,
      selectedSpeakerSummary,
      handleSelectSpeakerUtterances,
      handleClearSpeakerAssignments,
      handleExportSpeakerSegments,
      handleRenameSpeaker,
      handleMergeSpeaker,
      handleDeleteSpeaker,
      handleDeleteUnusedSpeakers,
      handleAssignSpeakerToUtterances,
      handleAssignSpeakerToSelected,
      handleCreateSpeakerAndAssign,
      handleCreateSpeakerOnly,
      refreshSpeakers,
      refreshSpeakerReferenceStats,
        closeSpeakerDialog: closeSpeakerDialogBase,
        updateSpeakerDialogDraftName: updateSpeakerDialogDraftNameBase,
        updateSpeakerDialogTargetKey: updateSpeakerDialogTargetKeyBase,
        confirmSpeakerDialog: confirmSpeakerDialogBase,
  } = useSpeakerActions({
      utterances,
      setUtterances,
      speakers,
      setSpeakers,
      utterancesOnCurrentMedia,
      activeUtteranceUnitId: selectedTimelineUtteranceId,
      selectedUtteranceIds,
      selectedBatchUtterances,
      isReady: state.phase === 'ready',
      setUtteranceSelection,
      data,
      setSaveState,
      getUtteranceTextForLayer,
      formatTime,
      syncBatchSpeakerId: false,
      speakerScopeOverride: {
        speakerFilterOptions: speakerFilterOptionsForActions,
      },
      speakerFilterOptionsOverride: speakerFilterOptionsForActions,
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

  const speakerByIdMap = useMemo(
    () => new Map(speakerOptions.map((speaker) => [speaker.id, speaker] as const)),
    [speakerOptions],
  );
  const speakerNameById = useMemo(() => {
    const next: Record<string, string> = {};
    for (const speaker of speakerOptions) {
      next[speaker.id] = speaker.name;
    }
    return next;
  }, [speakerOptions]);
  const openSpeakerManagementPanel = useCallback((draftName = '') => {
    setLayerRailTab('layers');
    setIsLayerRailCollapsed(false);
    setSpeakerDraftName(draftName);
    layerAction.setLayerActionPanel('speaker-management');
  }, [layerAction, setIsLayerRailCollapsed, setLayerRailTab, setSpeakerDraftName]);
    const {
      speakerSavingRouted,
      selectedSpeakerSummaryForActions,
      speakerDialogStateRouted,
      closeSpeakerDialogRouted,
      updateSpeakerDialogDraftNameRouted,
      updateSpeakerDialogTargetKeyRouted,
      confirmSpeakerDialogRouted,
      handleAssignSpeakerToSegments,
      handleSelectSpeakerUnitsRouted,
      handleClearSpeakerAssignmentsRouted,
      handleExportSpeakerSegmentsRouted,
      handleAssignSpeakerToSelectedRouted,
      handleClearSpeakerOnSelectedRouted,
      handleCreateSpeakerAndAssignRouted,
      speakerQuickActions,
      selectedSpeakerIdsForTrackLock,
      selectedSpeakerNamesForTrackLock,
    } = useSpeakerActionRoutingController({
      activeSpeakerManagementLayer,
      segmentsByLayer,
      segmentContentByLayer,
      resolveExplicitSpeakerKeyForSegment,
      resolveSpeakerKeyForSegment,
      selectedBatchSegmentsForSpeakerActions,
      selectedUnitIdsForSpeakerActions,
      segmentByIdForSpeakerActions,
      selectedUtteranceIdsForSpeakerActionsSet,
      resolveSpeakerActionUtteranceIds,
      selectedBatchUtterances,
      selectedSpeakerSummary,
      utterancesOnCurrentMedia,
      getUtteranceSpeakerKey,
      speakerFilterOptionsForActions,
      speakerOptions,
      speakerByIdMap,
      speakerDraftName,
      setSpeakerDraftName,
      batchSpeakerId,
      setBatchSpeakerId,
      speakerSaving,
      setActiveSpeakerFilterKey,
      speakerDialogStateBase: baseSpeakerDialogState,
      closeSpeakerDialogBase,
      updateSpeakerDialogDraftNameBase,
      updateSpeakerDialogTargetKeyBase,
      confirmSpeakerDialogBase,
      handleSelectSpeakerUtterances,
      handleClearSpeakerAssignments,
      handleExportSpeakerSegments,
      handleAssignSpeakerToUtterances,
      handleAssignSpeakerToSelected,
      handleCreateSpeakerAndAssign,
      refreshSpeakers,
      refreshSpeakerReferenceStats,
      selectedTimelineUnit,
      selectTimelineUnit,
      setSelectedUtteranceIds: _setSelectedUtteranceIds,
      formatTime,
      pushUndo,
      undo,
      reloadSegments,
      refreshSegmentUndoSnapshot,
      updateSegmentsLocally,
      setSaveState,
      setUtterances,
      setSpeakers,
      openSpeakerManagementPanel,
    });
  const {
    speakerFocusOptions,
    resolvedSpeakerFocusTargetKey,
    resolvedSpeakerFocusTargetName,
    cycleSpeakerFocusMode,
    handleSpeakerFocusTargetChange,
  } = useSpeakerFocusController({
    speakerFocusMode,
    setSpeakerFocusMode,
    speakerFocusTargetKey,
    setSpeakerFocusTargetKey,
    speakerFocusTargetMemoryByMediaRef,
    utterancesOnCurrentMedia,
    segmentSpeakerAssignmentsOnCurrentMedia,
    speakerOptions,
    selectedTimelineMediaId: selectedTimelineMedia?.id ?? null,
    selectedTimelineUnit,
    selectedUtterance: selectedUtterance ?? null,
    segmentByIdForSpeakerActions,
    resolveSpeakerKeyForSegment,
    getUtteranceSpeakerKey,
    speakerByIdMap,
  });

  const { handleAnnotationClick, renderAnnotationItem, renderLaneLabel } = useTimelineAnnotationHelpers({
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
      onOverlapCycleToast: (index, total, utteranceId) => {
        setOverlapCycleToast({ index, total, nonce: Date.now() });
        const nextTelemetry = updateOverlapCycleTelemetry(overlapCycleTelemetryRef.current, {
          utteranceId,
          index,
          total,
        });
        overlapCycleTelemetryRef.current = nextTelemetry;
        log.info('Overlap cycle telemetry update', {
          event: 'transcription.overlap_cycle',
          cycleCount: nextTelemetry.cycleCount,
          avgStep: nextTelemetry.avgStep,
          avgCandidateTotal: nextTelemetry.avgCandidateTotal,
        });
      },
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

  const timelineContentViewModel = useTranscriptionTimelineContentViewModel({
    selectedMediaUrl: selectedMediaUrl ?? null,
    playerIsReady: player.isReady,
    playerDuration: player.duration,
    layersCount: layers.length,
    locale,
    importFileRef,
    layerActionSetCreateTranscription: () => layerAction.setLayerActionPanel('create-transcription'),
    mediaLanesPropsInput: {
      zoomPxPerSec,
      lassoRect,
      transcriptionLayers,
      translationLayers,
      timelineRenderUtterances,
      flashLayerRowId,
      focusedLayerRowId,
      activeUtteranceUnitId: selectedTimelineUtteranceId,
      selectedTimelineUnit,
      defaultTranscriptionLayerId,
      renderAnnotationItem,
      allLayersOrdered: orderedLayers,
      onReorderLayers: reorderLayers,
      deletableLayers,
      onFocusLayer: handleFocusLayerRow,
      layerLinks,
      showConnectors: showAllLayerConnectors,
      onToggleConnectors: handleToggleAllLayerConnectors,
      laneHeights: timelineLaneHeights,
      onLaneHeightChange: handleTimelineLaneHeightChange,
      trackDisplayMode: transcriptionTrackMode,
      onToggleTrackDisplayMode: handleToggleTrackDisplayMode,
      onSetTrackDisplayMode: setTrackDisplayMode,
      laneLockMap: effectiveLaneLockMap,
      onLockSelectedSpeakersToLane: handleLockSelectedSpeakersToLane,
      onUnlockSelectedSpeakers: handleUnlockSelectedSpeakers,
      onResetTrackAutoLayout: handleResetTrackAutoLayout,
      selectedSpeakerNamesForLock: selectedSpeakerNamesForTrackLock,
      speakerSortKeyById,
      speakerLayerLayout,
      speakerFocusMode,
      ...(resolvedSpeakerFocusTargetKey ? { speakerFocusSpeakerKey: resolvedSpeakerFocusTargetKey } : {}),
      activeSpeakerFilterKey,
      speakerQuickActions,
      onLaneLabelWidthResize: handleLaneLabelWidthResizeStart,
      segmentsByLayer,
      segmentContentByLayer,
      saveSegmentContentForLayer,
      translationAudioByLayer,
      mediaItems: _mediaItems,
      recording,
      recordingUtteranceId,
      recordingLayerId: _recordingLayerId,
      startRecordingForUtterance: _startRecordingForUtterance,
      stopRecording: _stopRecording,
      deleteVoiceTranslation,
    },
    textOnlyPropsInput: {
      transcriptionLayers,
      translationLayers,
      utterancesOnCurrentMedia: filteredUtterancesOnCurrentMedia,
      segmentsByLayer,
      segmentContentByLayer,
      saveSegmentContentForLayer,
      selectedTimelineUnit,
      flashLayerRowId,
      focusedLayerRowId,
      defaultTranscriptionLayerId: defaultTranscriptionLayerId ?? '',
      scrollContainerRef: tierContainerRef,
      handleAnnotationClick,
      allLayersOrdered: orderedLayers,
      onReorderLayers: reorderLayers,
      deletableLayers,
      onFocusLayer: handleFocusLayerRow,
      navigateUtteranceFromInput,
      layerLinks,
      showConnectors: showAllLayerConnectors,
      onToggleConnectors: handleToggleAllLayerConnectors,
      laneHeights: timelineLaneHeights,
      onLaneHeightChange: handleTimelineLaneHeightChange,
      trackDisplayMode: transcriptionTrackMode,
      onToggleTrackDisplayMode: handleToggleTrackDisplayMode,
      onSetTrackDisplayMode: setTrackDisplayMode,
      laneLockMap: effectiveLaneLockMap,
      onLockSelectedSpeakersToLane: handleLockSelectedSpeakersToLane,
      onUnlockSelectedSpeakers: handleUnlockSelectedSpeakers,
      onResetTrackAutoLayout: handleResetTrackAutoLayout,
      selectedSpeakerNamesForLock: selectedSpeakerNamesForTrackLock,
      speakerLayerLayout,
      activeUtteranceUnitId: selectedTimelineUtteranceId,
      speakerFocusMode,
      ...(resolvedSpeakerFocusTargetKey ? { speakerFocusSpeakerKey: resolvedSpeakerFocusTargetKey } : {}),
      activeSpeakerFilterKey,
      speakerVisualByUtteranceId: speakerVisualByTimelineUnitId,
      speakerQuickActions,
      onLaneLabelWidthResize: handleLaneLabelWidthResizeStart,
      translationAudioByLayer,
      mediaItems: _mediaItems,
      recording,
      recordingUtteranceId,
      recordingLayerId: _recordingLayerId,
      startRecordingForUtterance: _startRecordingForUtterance,
      stopRecording: _stopRecording,
      deleteVoiceTranslation,
    },
  });

  const {
    toolbarProps,
    timelineTopProps,
    timelineContentProps,
    aiSidebarProps,
    dialogsProps,
  } = useTranscriptionSectionViewModels({
    locale,
    selectedTimelineMediaFilename: selectedTimelineMedia?.filename ?? null,
    player,
    globalLoopPlayback,
    setGlobalLoopPlayback,
    handleGlobalPlayPauseAction,
    canUndo,
    canRedo,
    undoLabel,
    hasSelectedTimelineMedia: Boolean(selectedTimelineMedia),
    hasActiveTextId: Boolean(activeTextId),
    selectedTimelineUnit: selectedTimelineUnit ?? null,
    notePopoverOpen: Boolean(notePopover),
    showExportMenu,
    importFileRef,
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
    lowConfidenceCount,
    selectedMediaUrl: selectedMediaUrl ?? null,
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
    rulerView: rulerView ?? null,
    zoomPxPerSec,
    isTimelineLaneHeaderCollapsed,
    toggleTimelineLaneHeader,
    waveCanvasRef,
    tierContainerRef,
    showSearch,
    searchableItems,
    activeLayerIdForEdits,
    selectedTimelineUtteranceId,
    searchOverlayRequest,
    manualSelectTsRef,
    selectUtterance,
    handleSearchReplace,
    setShowSearch,
    setSearchOverlayRequest,
    timelineContentProps: timelineContentViewModel,
    sidebarSectionsInput: {
      locale,
      isAiPanelCollapsed,
      hubSidebarTab,
      setHubSidebarTab,
      aiChatContextValue,
      analysisTab,
      setAnalysisTab,
      assistantRuntimeProps,
      analysisRuntimeProps,
      selectedAiWarning,
      selectedTranslationGapCount,
      aiSidebarError,
      speakerDialogState: speakerDialogStateRouted,
      speakerSaving: speakerSavingRouted,
      closeSpeakerDialog: closeSpeakerDialogRouted,
      confirmSpeakerDialog: confirmSpeakerDialogRouted,
      updateSpeakerDialogDraftName: updateSpeakerDialogDraftNameRouted,
      updateSpeakerDialogTargetKey: updateSpeakerDialogTargetKeyRouted,
      showProjectSetup,
      setShowProjectSetup,
      handleProjectSetupSubmit,
      showAudioImport,
      setShowAudioImport,
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
    },
  });

  // ═══════════════════════════════════════════════════════
  // JSX RETURN
  // ═══════════════════════════════════════════════════════

  return (
    <section className="transcription-screen" ref={screenRef}>
      {state.phase === 'loading' && <p className="hint">{t(locale, 'transcription.status.loading')}</p>}
      {state.phase === 'error' && <p className="error">{tf(locale, 'transcription.status.dbError', { message: state.message })}</p>}

      {state.phase === 'ready' && (
        <>
          <Suspense fallback={null}>
            <RecoveryBanner
              locale={locale}
              recoveryAvailable={recoveryAvailable}
              recoveryDiffSummary={recoveryDiffSummary}
              onApply={() => {
                const snap = recoveryDataRef.current;
                if (!snap) return;
                fireAndForget((async () => {
                  const ok = await applyRecovery(snap);
                  if (ok) hideRecoveryBanner();
                })());
              }}
              onDismiss={() => {
                fireAndForget(dismissRecovery());
                hideRecoveryBanner();
              }}
            />
          </Suspense>
          <section className="transcription-waveform">
            <Suspense fallback={null}>
              <TranscriptionPageToolbar {...toolbarProps} />
            </Suspense>
          </section>

          {/* Editor workspace: left side for row editing, right side for AI guidance. */}
          <ToastProvider>
            <main
              ref={workspaceRef}
              className={`transcription-workspace ${isAiPanelCollapsed ? 'transcription-workspace-ai-collapsed' : ''}`}
              style={{
                '--transcription-ai-width': `${aiPanelWidth}px`,
                '--transcription-ai-visible-width': `${isAiPanelCollapsed ? 0 : aiPanelWidth}px`,
                '--transcription-rail-width': `${isLayerRailCollapsed ? 0 : layerRailWidth}px`,
              } as React.CSSProperties}
            >
              <section
                className={`transcription-list-panel ${isTimelineLaneHeaderCollapsed ? 'transcription-list-panel-lane-header-collapsed' : ''}`}
                style={{ '--lane-label-width': isTimelineLaneHeaderCollapsed ? '0px' : `${laneLabelWidth}px`, '--video-left-panel-width': videoLayoutMode === 'left' ? `${videoRightPanelWidth + 8}px` : '0px' } as React.CSSProperties}
              >
                <WaveformAreaSection
                  containerRef={waveformAreaRef}
                  className={`transcription-waveform-area ${snapGuide.nearSide ? 'transcription-waveform-area-snapping' : ''} ${segMarkStart !== null ? 'transcription-waveform-area-marking' : ''} ${isResizingWaveform ? 'waveform-area-resizing' : ''}`}
                  style={{ '--waveform-height': `${waveformHeight}px` } as React.CSSProperties}
                  tabIndex={0}
                  onKeyDown={handleWaveformKeyDown}
                  onFocus={handleWaveformAreaFocus}
                  onBlur={handleWaveformAreaBlur}
                  onMouseMove={handleWaveformAreaMouseMove}
                  onMouseLeave={handleWaveformAreaMouseLeave}
                  onWheel={handleWaveformAreaWheel}
                >
                  {hoverTime && (
                    <WaveformHoverTooltip
                      time={hoverTime.time}
                      x={hoverTime.x}
                      y={hoverTime.y}
                      utterances={utterancesOnCurrentMedia}
                      getUtteranceTextForLayer={getUtteranceTextForLayer}
                      formatTime={formatTime}
                    />
                  )}
{selectedMediaUrl && (
                    <WaveformLeftStatusStrip
                      zoomPercent={zoomPercent}
                      snapEnabled={snapEnabled}
                      onSnapToggle={toggleSnapEnabled}
                      playbackRate={player.playbackRate}
                      currentTime={player.currentTime}
                      selectedUtteranceDuration={selectedTimelineUnitForTime
                        ? selectedTimelineUnitForTime.endTime - selectedTimelineUnitForTime.startTime
                        : null}
                      amplitudeScale={amplitudeScale}
                      onAmplitudeChange={setAmplitudeScale}
                      onAmplitudeReset={() => setAmplitudeScale(1)}
                      selectedMediaIsVideo={selectedMediaIsVideo}
                      videoLayoutMode={videoLayoutMode}
                      onVideoLayoutModeChange={setVideoLayoutMode}
                      onLaneLabelWidthResize={handleLaneLabelWidthResizeStart}
                      formatTime={formatTime}
                    />
                  )}
                  <div className="waveform-content-offset">
                    {selectedMediaUrl ? (
                      <>
                        <VideoPreviewSection
                          selectedMediaIsVideo={selectedMediaIsVideo}
                          selectedMediaUrl={selectedMediaUrl}
                          videoLayoutMode={videoLayoutMode}
                          videoPreviewHeight={videoPreviewHeight}
                          videoRightPanelWidth={videoRightPanelWidth}
                          waveformRegions={waveformRegions}
                          selectedUtteranceIds={selectedUtteranceIds}
                          activeUtteranceUnitId={selectedTimelineUtteranceId}
                          segmentLoopPlayback={segmentLoopPlayback}
                          subSelectionRange={subSelectionRange}
                          isResizingVideoPreview={isResizingVideoPreview}
                          isResizingVideoRightPanel={isResizingVideoRightPanel}
                          onVideoPreviewResizeStart={handleVideoPreviewResizeStart}
                          onVideoRightPanelResizeStart={handleVideoRightPanelResizeStart}
                          waveformStripHeight={waveformHeight}
                          waveCanvasRef={waveCanvasRef}
                          playerWaveformRef={player.waveformRef}
                          onSeek={player.seekTo}
                          onPlayRegion={player.playRegion}
                          waveformOverlay={(
                            <>
                              {waveLassoRect ? (
                                <div
                                  className={`wave-lasso-rect ${waveLassoRect.mode === 'create' ? 'wave-lasso-rect-create' : 'wave-lasso-rect-select'}`}
                                  style={{
                                    left: waveLassoRect.x,
                                    top: waveLassoRect.y,
                                    width: Math.max(2, waveLassoRect.w),
                                    height: Math.max(2, waveLassoRect.h),
                                  }}
                                >
                                  {waveLassoRect.mode === 'select' && (
                                    <div className="wave-lasso-hint">
                                      {tf(locale, 'transcription.wave.selectionHint', { count: waveLassoHintCount })}
                                    </div>
                                  )}
                                </div>
                              ) : null}
                              {waveformNoteIndicators.map(({ uttId, leftPx, widthPx, count, layerId }) => (
                                <div
                                  key={`note-${uttId}`}
                                  style={{
                                    position: 'absolute', top: 0, left: leftPx + widthPx - 26,
                                    width: 16, height: '100%', pointerEvents: 'auto', zIndex: 6,
                                    display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
                                    paddingBottom: 2, cursor: 'pointer',
                                  }}
                                  onPointerDown={(e) => { e.stopPropagation(); e.preventDefault(); }}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setNotePopover({ x: e.clientX, y: e.clientY, uttId, ...(layerId ? { layerId } : {}) });
                                  }}
                                >
                                  <NoteDocumentIcon
                                    ariaLabel={`${count} 条备注`}
                                    title={`${count} 条备注`}
                                    style={{ width: 16, height: 16, color: '#93c5fd', opacity: 0.92 }}
                                  />
                                </div>
                              ))}
                              {snapGuide.visible && player.duration > 0 && rulerView && (() => {
                                const windowSec = rulerView.end - rulerView.start;
                                if (windowSec <= 0) return null;
                                const pctL = ((snapGuide.left ?? 0) - rulerView.start) / windowSec * 100;
                                const pctR = typeof snapGuide.right === 'number' ? (snapGuide.right - rulerView.start) / windowSec * 100 : null;
                                return (
                                  <>
                                    <div
                                      className={`snap-line snap-line-left ${snapGuide.nearSide === 'left' || snapGuide.nearSide === 'both' ? 'snap-line-near' : ''}`}
                                      style={{ left: `${pctL}%` }}
                                    >
                                      <span>L</span>
                                    </div>
                                    {pctR !== null && (
                                      <div
                                        className={`snap-line snap-line-right ${snapGuide.nearSide === 'right' || snapGuide.nearSide === 'both' ? 'snap-line-near' : ''}`}
                                        style={{ left: `${pctR}%` }}
                                      >
                                        <span>R</span>
                                      </div>
                                    )}
                                  </>
                                );
                              })()}
                            </>
                          )}
                        />
                        {!selectedMediaIsVideo && selectedWaveformTimelineItem && player.isReady && (
                          <RegionActionOverlay
                            utteranceStartTime={selectedWaveformTimelineItem.startTime}
                            utteranceEndTime={selectedWaveformTimelineItem.endTime}
                            zoomPxPerSec={zoomPxPerSec}
                            scrollLeft={waveformScrollLeft}
                            waveAreaWidth={player.instanceRef.current?.getWidth() ?? 9999}
                            isPlaying={player.isPlaying}
                            segmentPlaybackRate={segmentPlaybackRate}
                            segmentLoopPlayback={segmentLoopPlayback}
                            onPlaybackRateChange={handleSegmentPlaybackRateChange}
                            onToggleLoop={handleToggleSelectedWaveformLoop}
                            onTogglePlay={handleToggleSelectedWaveformPlay}
                          />
                        )}
                      </>
                    ) : (
                      <div className="wave-empty transcription-wave-empty" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                        {!selectedMediaUrl ? (
                          <button
                            className="transcription-import-media-btn"
                            onClick={() => mediaFileInputRef.current?.click()}
                          >
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                              <polyline points="17 8 12 3 7 8"/>
                              <line x1="12" y1="3" x2="12" y2="15"/>
                            </svg>
                            {t(locale, 'transcription.wave.emptyImportMedia')}
                          </button>
                        ) : (
                          t(locale, 'transcription.wave.emptyNoMedia')
                        )}
                      </div>
                    )}
                    {segMarkStart !== null && (
                      <div className="seg-mark-status">
                        ✦ {tf(locale, 'transcription.wave.markingHint', { start: formatTime(segMarkStart) })}
                      </div>
                    )}
                  </div>
                </WaveformAreaSection>
                {selectedMediaUrl ? (
                  <div
                    className={`transcription-waveform-resize-handle ${isResizingWaveform ? 'transcription-waveform-resize-handle-resizing' : ''}`}
                    onPointerDown={handleWaveformResizeStart}
                    role="separator"
                    aria-orientation="horizontal"
                    title="拖动调整波形区高度"
                  >
                    <div className="transcription-waveform-resize-dots" />
                  </div>
                ) : null}
                <Suspense fallback={null}>
                  <TranscriptionPageTimelineTop {...timelineTopProps} />
                </Suspense>
                <TimelineMainSection
                  containerRef={listMainRef}
                  className={`transcription-list-main ${isLayerRailCollapsed ? 'transcription-list-main-rail-collapsed' : ''} ${isTimelineLaneHeaderCollapsed ? 'transcription-list-main-lane-header-collapsed' : ''}`}
                >
                  <TimelineRailSection>
                    <Suspense fallback={null}>
                      <TranscriptionPageLayerRail
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
                          isCollapsed: isLayerRailCollapsed,
                          layerRailTab,
                          onTabChange: setLayerRailTab,
                          layerRailRows: orderedLayers,
                          focusedLayerRowId,
                          flashLayerRowId,
                          onFocusLayer: handleFocusLayerRow,
                          transcriptionLayers,
                          translationLayers,
                          layerLinks,
                          toggleLayerLink,
                          deletableLayers,
                          layerCreateMessage,
                          layerAction,
                          onReorderLayers: reorderLayers,
                        }}
                        isLayerRailCollapsed={isLayerRailCollapsed}
                        hoverExpandEnabled={hoverExpandEnabled}
                        onLayerRailResizeStart={handleLayerRailResizeStart}
                        onLayerRailToggle={handleLayerRailToggle}
                        resizeLabel={t(locale, 'transcription.panel.resizeLayerRail')}
                        expandLabel={t(locale, 'transcription.panel.expandLayerRail')}
                        collapseLabel={t(locale, 'transcription.panel.collapseLayerRail')}
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
                        <Suspense fallback={null}>
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
                      hoverExpandEnabled={hoverExpandEnabled}
                      activeUtteranceUnitId={selectedTimelineUtteranceId}
                      utterancesOnCurrentMedia={utterancesOnCurrentMedia}
                      fitPxPerSec={fitPxPerSec}
                      maxZoomPercent={maxZoomPercent}
                      onZoomToPercent={(percent, mode) => zoomToPercent(percent, undefined, mode)}
                      onZoomToUtterance={zoomToUtterance}
                      onSnapEnabledChange={setSnapEnabled}
                      onAutoScrollEnabledChange={setAutoScrollEnabled}
                      onHoverExpandEnabledChange={setHoverExpandEnabled}
                    />
                    <div className="toolbar-sep" style={{ margin: '0 6px' }} />
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
                    <div className="toolbar-sep" style={{ margin: '0 6px' }} />
                    <ObserverStatusSection
                      observerStage={observerResult.stage}
                      recommendations={actionableObserverRecommendations || []}
                      onExecuteRecommendation={handleExecuteObserverRecommendation}
                    />
                  </ToolbarLeftSection>
                  <ToolbarRightSection
                    canUndo={canUndo}
                    undoLabel={undoLabel}
                    undoHistory={undoHistory}
                    isHistoryVisible={showUndoHistory}
                    onToggleHistoryVisible={setShowUndoHistory}
                    onJumpToHistoryIndex={(idx) => fireAndForget(undoToHistoryIndex(idx))}
                  />
                </BottomToolbarSection>
              </section>

              <div className="transcription-ai-panel-handle-cluster">
                <div
                  className="transcription-ai-panel-hover-zone"
                  onMouseEnter={() => {
                    if (isAiPanelCollapsed && hoverExpandEnabled) handleAiPanelToggle();
                  }}
                  style={{ display: isAiPanelCollapsed ? undefined : 'none', pointerEvents: hoverExpandEnabled ? 'auto' : 'none' }}
                />
                <div
                  className="transcription-ai-panel-resizer"
                  onPointerDown={handleAiPanelResizeStart}
                  role="separator"
                  aria-orientation="vertical"
                  aria-label={t(locale, 'transcription.panel.resizeAiPanel')}
                />
                <button
                  type="button"
                  className="transcription-ai-panel-toggle"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={handleAiPanelToggle}
                  onMouseEnter={() => {
                    if (isAiPanelCollapsed && hoverExpandEnabled) handleAiPanelToggle();
                  }}
                  aria-label={isAiPanelCollapsed
                    ? t(locale, 'transcription.panel.expandAiPanel')
                    : t(locale, 'transcription.panel.collapseAiPanel')}
                >
                  <span className="transcription-panel-toggle-icon" aria-hidden="true">
                    <span
                      className={`transcription-panel-toggle-triangle ${isAiPanelCollapsed ? 'transcription-panel-toggle-triangle-left' : 'transcription-panel-toggle-triangle-right'}`}
                    />
                  </span>
                </button>
              </div>

              <AiPanelContext.Provider value={aiPanelContextValue}>
                <Suspense fallback={null}>
                  <TranscriptionPageAiSidebar {...aiSidebarProps} />
                </Suspense>
              </AiPanelContext.Provider>

              <Suspense fallback={null}>
                <TranscriptionPageDialogs {...dialogsProps} />
              </Suspense>
              <Suspense fallback={null}>
                <TranscriptionPagePdfRuntime {...pdfRuntimeProps} />
              </Suspense>
            </main>
          </ToastProvider>

          <Suspense fallback={null}>
            <TranscriptionPageBatchOps
              showBatchOperationPanel={showBatchOperationPanel}
              selectedUtteranceIds={selectedUtteranceIds}
              selectedBatchUtterances={selectedBatchUtterances}
              utterancesOnCurrentMedia={utterancesOnCurrentMedia}
              selectedBatchUtteranceTextById={selectedBatchUtteranceTextById}
              batchPreviewLayerOptions={batchPreviewLayerOptions}
              batchPreviewTextByLayerId={batchPreviewTextByLayerId}
              defaultBatchPreviewLayerId={defaultBatchPreviewLayerId}
              onBatchClose={() => setShowBatchOperationPanel(false)}
              onBatchOffset={handleBatchOffset}
              onBatchScale={handleBatchScale}
              onBatchSplitByRegex={handleBatchSplitByRegex}
              onBatchMerge={handleBatchMerge}
              onBatchJumpToUtterance={selectUtterance}
            />
          </Suspense>
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
          runDeleteSelection={runDeleteSelection}
          runMergeSelection={runMergeSelection}
          runSelectBefore={runSelectBefore}
          runSelectAfter={runSelectAfter}
          runDeleteOne={runDeleteOne}
          runMergePrev={runMergePrev}
          runMergeNext={runMergeNext}
          runSplitAtTime={runSplitAtTime}
          getCurrentTime={() => player.instanceRef.current?.getCurrentTime() ?? 0}
          onOpenNoteFromMenu={(x, y, uttId, layerId) => {
            if (layerId) {
              setNotePopover({ x, y, uttId, layerId });
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
          onAssignSpeakerFromMenu={(unitIds, kind, speakerId) => {
            if (kind === 'segment') {
              fireAndForget(handleAssignSpeakerToSegments(Array.from(unitIds), speakerId));
              return;
            }
            fireAndForget(handleAssignSpeakerToUtterances(resolveSpeakerActionUtteranceIds(unitIds), speakerId));
          }}
          onOpenSpeakerManagementPanelFromMenu={() => openSpeakerManagementPanel()}
        />
      </Suspense>
    </section>
  );
}

// Alias for the original name expected by consumers
export { TranscriptionPageOrchestrator as TranscriptionPage };
