import { AiAssistantHubContext } from '../contexts/AiAssistantHubContext';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Focus,
  Maximize2,
  Merge as _Merge,
  Pause as _Pause,
  Play,
  Repeat,
  Undo2,
  Square,
} from 'lucide-react';
import { AiAnalysisPanel } from '../components/AiAnalysisPanel';
import { AiChatCard } from '../components/ai/AiChatCard';
import type { AiPanelMode, AnalysisBottomTab } from '../components/AiAnalysisPanel';
import { VoiceAgentWidget } from '../components/VoiceAgentWidget';
import { AudioImportDialog } from '../components/AudioImportDialog';
import { BatchOperationPanel } from '../components/BatchOperationPanel';
import { ProjectSetupDialog } from '../components/ProjectSetupDialog';
import { SearchReplaceOverlay } from '../components/SearchReplaceOverlay';
import { WaveformToolbar } from '../components/WaveformToolbar';
import { TimeRuler } from '../components/TimeRuler';
import { LayerRailSidebar } from '../components/LayerRailSidebar';
import { TranscriptionToolbarActions } from '../components/TranscriptionToolbarActions';
import { TranscriptionOverlays } from '../components/TranscriptionOverlays';
import { TranscriptionTimelineTextOnly } from '../components/TranscriptionTimelineTextOnly';
import { TranscriptionTimelineMediaLanes } from '../components/TranscriptionTimelineMediaLanes';
import { RecoveryBanner } from '../components/RecoveryBanner';
import { PdfPreviewSection } from '../components/PdfPreviewSection';
import { LinguisticService } from '../../services/LinguisticService';
import { db as appDb, getDb, type JieyuDatabase, type UtteranceDocType } from '../../db';
import { TranscriptionEditorContext } from '../contexts/TranscriptionEditorContext';
import { useAiPanelContextUpdater, AiPanelContext } from '../contexts/AiPanelContext';
import { snapToZeroCrossing } from '../services/AudioAnalysisService';
import { useTranscriptionData } from '../hooks/useTranscriptionData';
import { useRecording } from '../hooks/useRecording';
import { useUtteranceOps } from '../hooks/useUtteranceOps';
import { useLasso, type SubSelectDrag } from '../hooks/useLasso';
import { useWaveSurfer } from '../hooks/useWaveSurfer';
import { useZoom } from '../hooks/useZoom';
import { useKeybindingActions } from '../hooks/useKeybindingActions';
import { useAiChat, type AiChatToolCall, type AiToolRiskCheckResult } from '../hooks/useAiChat';
import { useVoiceAgent } from '../hooks/useVoiceAgent';
import { featureFlags } from '../ai/config/featureFlags';
import { DEFAULT_VOICE_INTENT_RESOLVER_CONFIG } from '../ai/config/voiceIntentResolver';
import { resolveVoiceIntentWithLlmUsingConfig } from '../services/VoiceIntentLlmResolver';
import { useImportExport } from '../hooks/useImportExport';
import { useLayerActionPanel } from '../hooks/useLayerActionPanel';
import { useAiPanelLogic, taskToPersona } from '../hooks/useAiPanelLogic';
import { useNoteHandlers } from '../hooks/useNoteHandlers';
import { useTimelineAnnotationHelpers } from '../hooks/useTimelineAnnotationHelpers';
import { useAiToolCallHandler } from '../hooks/useAiToolCallHandler';
import { useTimelineResize } from '../hooks/useTimelineResize';
import { useDialogs } from '../hooks/useDialogs';
import { usePanelResize } from '../hooks/usePanelResize';
import { usePanelAutoCollapse } from '../hooks/usePanelAutoCollapse';
import { usePanelToggles } from '../hooks/usePanelToggles';
import { useRecoveryBanner } from '../hooks/useRecoveryBanner';
import { usePdfPreview } from '../hooks/usePdfPreview';
import { useVoiceDock } from '../hooks/useVoiceDock';
import { useAiEmbeddingState } from '../hooks/useAiEmbeddingState';
import { useAiAssistantHubContextValue } from '../hooks/useAiAssistantHubContextValue';
import { detectLocale, t, tf } from '../i18n';
import { fireAndForget } from '../utils/fireAndForget';
import { formatLanguageLabel, formatLayerRailLabel, formatTime } from '../utils/transcriptionFormatters';
import { EmbeddingService } from '../ai/embeddings/EmbeddingService';
import { EmbeddingSearchService } from '../ai/embeddings/EmbeddingSearchService';
import { createEmbeddingProvider, testEmbeddingProvider } from '../ai/embeddings/EmbeddingProviderCatalog';
import type { EmbeddingProviderKind } from '../ai/embeddings/EmbeddingProvider';
import { getGlobalTaskRunner } from '../ai/tasks/taskRunnerSingleton';
import { extractUtteranceIdFromNote, getPdfPageFromHash, isDirectPdfCitationRef, splitPdfCitationRef } from '../utils/citationJumpUtils';
import { applyVoiceCommercialConfigChange } from '../utils/voiceCommercialConfigSync';

// ─── Storage keys ─────────────────────────────────────────────────────────────

const EMBEDDING_PROVIDER_STORAGE_KEY = 'jieyu.embeddingProvider';

// ─── Persistence helpers ───────────────────────────────────────────────────────

function loadEmbeddingProviderConfig(): { kind: EmbeddingProviderKind; baseUrl?: string; apiKey?: string; model?: string } {
  try {
    const raw = window.localStorage.getItem(EMBEDDING_PROVIDER_STORAGE_KEY);
    if (raw) return JSON.parse(raw) as { kind: EmbeddingProviderKind; baseUrl?: string; apiKey?: string; model?: string };
  } catch { /* ignore */ }
  return { kind: 'local' };
}

function saveEmbeddingProviderConfig(cfg: { kind: EmbeddingProviderKind; baseUrl?: string; apiKey?: string; model?: string }): void {
  try {
    window.localStorage.setItem(EMBEDDING_PROVIDER_STORAGE_KEY, JSON.stringify(cfg));
  } catch { /* ignore */ }
}

export function TranscriptionPage() {
  const locale = detectLocale();
  // ---- Data layer (from hook) ----
  const data = useTranscriptionData();
  const {
    state,
    utterances,
    anchors,
    layers,
    translations,
    layerLinks,
    mediaItems: _mediaItems,
    selectedUtteranceId,
    setSelectedUtteranceId,
    selectedUtteranceIds,
    setUtteranceSelection,
    setSelectedMediaId: _setSelectedMediaId,
    selectedLayerId,
    setSelectedLayerId,
    saveState,
    setSaveState,
    layerCreateMessage,
    utteranceDrafts,
    setUtteranceDrafts,
    translationDrafts,
    setTranslationDrafts,
    focusedTranslationDraftKeyRef,
    snapGuide,
    setSnapGuide,
    translationLayers,
    transcriptionLayers,
    defaultTranscriptionLayerId,
    layerRailRows,
    deletableLayers,
    selectedUtterance,
    selectedUtteranceMedia,
    selectedMediaUrl,
    utterancesOnCurrentMedia,
    aiConfidenceAvg,
    translationTextByLayer,
    getUtteranceTextForLayer,
    selectedRowMeta,
    loadSnapshot,
    addMediaItem,
    saveVoiceTranslation,
    saveUtteranceText,
    saveUtteranceTiming,
    saveTextTranslationForUtterance,
    createNextUtterance: _createNextUtterance,
    createUtteranceFromSelection,
    deleteUtterance,
    mergeWithPrevious,
    mergeWithNext,
    splitUtterance,
    selectUtterance,
    toggleUtteranceSelection,
    selectUtteranceRange,
    selectAllBefore,
    selectAllAfter,
    selectAllUtterances,
    clearUtteranceSelection,
    setSelectedUtteranceIds: _setSelectedUtteranceIds,
    deleteSelectedUtterances,
    offsetSelectedTimes,
    scaleSelectedTimes,
    splitByRegex,
    mergeSelectedUtterances,
    createLayer,
    deleteLayer,
    toggleLayerLink,
    getNeighborBounds,
    makeSnapGuide,
    clearAutoSaveTimer,
    scheduleAutoSave,
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
  } = data;

  // ---- Recovery banner ----
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

  // ---- Page-only UI state ----
  const [focusedLayerRowId, setFocusedLayerRowId] = useState<string>('');
  const [flashLayerRowId, setFlashLayerRowId] = useState<string>('');
  const {
    pdfPreview,
    setPdfPreview,
    pdfPreviewPos,
    pdfPreviewDragging,
    pdfPreviewRef,
    openPdfPreview,
    handlePdfPreviewPageChange,
    handlePdfPreviewOpenExternal,
    handlePdfPreviewDragStart,
  } = usePdfPreview();
  const pdfCitationObjectUrlRef = useRef<string | null>(null);

  const cleanupPdfCitationObjectUrl = useCallback(() => {
    const current = pdfCitationObjectUrlRef.current;
    if (!current) return;
    URL.revokeObjectURL(current);
    pdfCitationObjectUrlRef.current = null;
  }, []);

  const handleClosePdfPreview = useCallback(() => {
    setPdfPreview(null);
    cleanupPdfCitationObjectUrl();
  }, [cleanupPdfCitationObjectUrl, setPdfPreview]);

  const openPdfPreviewWithManagedObjectUrl = useCallback((
    sourceUrl: string,
    title: string,
    page: number | null,
    hashSuffix = '',
    searchSnippet?: string,
  ) => {
    if (!sourceUrl.startsWith('blob:')) {
      cleanupPdfCitationObjectUrl();
    }
    openPdfPreview(sourceUrl, title, page, hashSuffix, searchSnippet);
  }, [cleanupPdfCitationObjectUrl, openPdfPreview]);

  useEffect(() => () => {
    cleanupPdfCitationObjectUrl();
  }, [cleanupPdfCitationObjectUrl]);

  const handleFocusLayerRow = useCallback((id: string) => {
    setFocusedLayerRowId(id);
    if (flashLayerRowId && flashLayerRowId !== id) {
      setFlashLayerRowId('');
    }
  }, [flashLayerRowId]);

  const {
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
  } = usePanelToggles();

  const [analysisTab, setAnalysisTab] = useState<AnalysisBottomTab>('embedding');
  const [hubSidebarTab, setHubSidebarTab] = useState<'assistant' | 'analysis'>('assistant');
  const [assistantVoiceExpanded, setAssistantVoiceExpanded] = useState(false);

  const {
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
  } = useDialogs(utterances);

  const {
    effectiveVoiceCorpusLang,
    voiceCorpusLangOverride,
    handleVoiceSetLangOverride,
    handleCommercialConfigChange,
    commercialProviderKind,
    setCommercialProviderKind,
    commercialProviderConfig,
    setCommercialProviderConfig,
    localWhisperConfig,
  } = useVoiceDock({
    activeTextPrimaryLanguageId,
    getActiveTextPrimaryLanguageId,
  });

  const createLayerWithActiveContext = useCallback(async (
    ...args: Parameters<typeof createLayer>
  ): Promise<boolean> => {
    const [layerType, input, modality] = args;
    const resolvedTextId = input.textId?.trim() || activeTextId || (await getActiveTextId()) || '';
    return createLayer(layerType, {
      ...input,
      ...(resolvedTextId ? { textId: resolvedTextId } : {}),
    }, modality);
  }, [activeTextId, createLayer, getActiveTextId]);

  const layerAction = useLayerActionPanel({
    createLayer: createLayerWithActiveContext,
    deleteLayer,
    deletableLayers,
    focusedLayerRowId,
    isLayerRailCollapsed,
  });
  const [waveformFocused, setWaveformFocused] = useState(false);
  const [segmentLoopPlayback, setSegmentLoopPlayback] = useState(false);
  const [globalLoopPlayback, setGlobalLoopPlayback] = useState(false);
  const [segmentPlaybackRate, setSegmentPlaybackRate] = useState(1);
  const [aiPanelMode, setAiPanelMode] = useState<AiPanelMode>('auto');
  const aiDerivedPersonaRef = useRef<'transcription' | 'glossing' | 'review'>('transcription');
  const aiObserverStageRef = useRef<string>('');
  const aiRecommendationRef = useRef<string[]>([]);
  const aiLexemeSummaryRef = useRef<string[]>([]);
  const aiAudioTimeRef = useRef(0);
  const [embeddingProviderConfig, setEmbeddingProviderConfig] = useState<{ kind: EmbeddingProviderKind; baseUrl?: string; apiKey?: string; model?: string }>(() => loadEmbeddingProviderConfig());
  const embeddingProvider = useMemo(() => createEmbeddingProvider(embeddingProviderConfig), [embeddingProviderConfig]);
  const taskRunner = useMemo(() => getGlobalTaskRunner(), []);
  const embeddingService = useMemo(() => new EmbeddingService(embeddingProvider, taskRunner), [embeddingProvider, taskRunner]);
  const embeddingSearchService = useMemo(() => new EmbeddingSearchService(embeddingProvider), [embeddingProvider]);

  // Persist embedding provider config to localStorage when it changes
  useEffect(() => {
    saveEmbeddingProviderConfig(embeddingProviderConfig);
  }, [embeddingProviderConfig]);

  const {
    aiEmbeddingBusy,
    aiEmbeddingProgressLabel,
    aiEmbeddingLastResult,
    aiEmbeddingTasks,
    aiEmbeddingMatches,
    aiEmbeddingLastError,
    aiEmbeddingWarning,
    aiToolDecisionLogs,
    setAiEmbeddingLastError,
    refreshEmbeddingTasks,
    refreshAiToolDecisionLogs,
    handleCancelAiTask,
    handleRetryAiTask,
    handleBuildUtteranceEmbeddings,
    handleBuildNotesEmbeddings,
    handleBuildPdfEmbeddings,
    handleFindSimilarUtterances,
  } = useAiEmbeddingState({
    locale,
    taskRunner,
    embeddingService,
    embeddingSearchService,
    selectedUtterance,
    utterancesOnCurrentMedia,
    getUtteranceTextForLayer,
    formatTime,
  });

  useEffect(() => {
    if (state.phase !== 'ready') return;
    fireAndForget(refreshEmbeddingTasks());
  }, [refreshEmbeddingTasks, state.phase]);

  const handleAiToolCall = useAiToolCallHandler({
    utterances,
    selectedUtterance,
    selectedUtteranceMedia,
    selectedLayerId,
    transcriptionLayers,
    translationLayers,
    layerLinks,
    createLayer: createLayerWithActiveContext,
    createNextUtterance: _createNextUtterance,
    deleteUtterance,
    deleteLayer,
    toggleLayerLink,
    saveUtteranceText,
    saveTextTranslationForUtterance,
  });

  const buildAiPromptContext = useCallback(() => {
    const selectedText = selectedUtterance ? getUtteranceTextForLayer(selectedUtterance) : '';
    const selectionTimeRange = selectedUtterance
      ? `${formatTime(selectedUtterance.startTime)}-${formatTime(selectedUtterance.endTime)}`
      : undefined;

    return {
      shortTerm: {
        page: 'transcription',
        ...(selectedUtterance?.id ? { selectedUtteranceId: selectedUtterance.id } : {}),
        selectedText,
        ...(selectionTimeRange ? { selectionTimeRange } : {}),
        audioTimeSec: aiAudioTimeRef.current,
        recentEdits: undoHistory.slice(0, 5).map((item) => String(item)),
      },
      longTerm: {
        projectStats: {
          utteranceCount: state.phase === 'ready' ? state.utteranceCount : utterances.length,
          translationLayerCount: state.phase === 'ready' ? state.translationLayerCount : translationLayers.length,
          aiConfidenceAvg,
        },
        observerStage: aiObserverStageRef.current,
        topLexemes: aiLexemeSummaryRef.current,
        recommendations: aiRecommendationRef.current,
      },
    };
  }, [aiConfidenceAvg, getUtteranceTextForLayer, selectedUtterance, state, translationLayers.length, undoHistory, utterances.length]);

  const handleAiToolRiskCheck = useCallback((call: AiChatToolCall): AiToolRiskCheckResult | null => {
    if (call.name !== 'delete_transcription_segment') return null;

    const utteranceId = String(call.arguments.utteranceId ?? '').trim();
    if (!utteranceId) return null;

    const targetUtterance = utterances.find((item) => item.id === utteranceId);
    if (!targetUtterance) return null;

    const transcriptionText = getUtteranceTextForLayer(targetUtterance).trim();
    const translationLayerCountWithText = translations.filter((item) => {
      if (item.utteranceId !== utteranceId) return false;
      if (!(item.modality === 'text' || item.modality === 'mixed')) return false;
      return typeof item.text === 'string' && item.text.trim().length > 0;
    }).length;

    const hasAnyContent = transcriptionText.length > 0 || translationLayerCountWithText > 0;
    if (!hasAnyContent) {
      return { requiresConfirmation: false };
    }

    return {
      requiresConfirmation: true,
      riskSummary: `将删除 1 条包含内容的句段（目标：${utteranceId}）`,
      impactPreview: [
        `转写内容：${transcriptionText.length > 0 ? '有' : '无'}`,
        `翻译内容：${translationLayerCountWithText} 个层有文本`,
        '删除后在当前应用内不可恢复',
      ],
    };
  }, [getUtteranceTextForLayer, translations, utterances]);

  const aiChat = useAiChat({
    onToolCall: handleAiToolCall,
    onToolRiskCheck: handleAiToolRiskCheck,
    systemPersonaKey: aiDerivedPersonaRef.current,
    getContext: buildAiPromptContext,
    maxContextChars: 2400,
    historyCharBudget: 6000,
    embeddingSearchService,
  });

  const voiceIntentResolverConfig = DEFAULT_VOICE_INTENT_RESOLVER_CONFIG;

  const handleResolveVoiceIntentWithLlm = useCallback(async ({
    text,
    mode,
    session,
  }: {
    text: string;
    mode: 'command' | 'dictation' | 'analysis';
    session: { entries: Array<{ intent: { type: string }; sttText: string }> };
  }) => {
    if (!featureFlags.aiChatEnabled || !aiChat.enabled) {
      return null;
    }
    return resolveVoiceIntentWithLlmUsingConfig({
      transcript: text,
      mode,
      settings: aiChat.settings,
      recentContext: session.entries
        .slice(-4)
        .map((entry) => `[${entry.intent.type}] ${entry.sttText}`),
    }, voiceIntentResolverConfig);
  }, [aiChat.enabled, aiChat.settings, voiceIntentResolverConfig]);

  const handleTestEmbeddingProvider = useCallback(async (): Promise<{ available: boolean; error?: string }> => {
    return testEmbeddingProvider(embeddingProviderConfig);
  }, [embeddingProviderConfig]);

  useEffect(() => {
    fireAndForget(refreshAiToolDecisionLogs());
  }, [aiChat.pendingToolCall, refreshAiToolDecisionLogs]);

  const waveformAreaRef = useRef<HTMLDivElement | null>(null);

  const utteranceRowRef = useRef<Record<string, HTMLDivElement | null>>({});
  const waveCanvasRef = useRef<HTMLDivElement | null>(null);
  const [zoomPercent, setZoomPercent] = useState(100);
  const [zoomMode, setZoomMode] = useState<'fit-all' | 'fit-selection' | 'custom'>('fit-all');
  const [snapEnabled, setSnapEnabled] = useState(false);
  const [hoverTime, setHoverTime] = useState<{ time: number; x: number; y: number } | null>(null);
  const [segMarkStart, setSegMarkStart] = useState<number | null>(null);
  const [dragPreview, setDragPreview] = useState<{ id: string; start: number; end: number } | null>(null);
  const skipSeekForIdRef = useRef<string | null>(null);
  /** True while an async createUtteranceFromSelection is in flight.
   *  Prevents onTimeUpdate from changing selection & consuming skipSeekForIdRef. */
  const creatingSegmentRef = useRef(false);
  /** True from Enter step-1 (mark start) until Escape.
   *  Suppresses onTimeUpdate auto-selection during continuous segment creation. */
  const markingModeRef = useRef(false);
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
    setSelectedUtteranceId,
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

  // Context menu state
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; utteranceId: string; layerId: string; splitTime: number } | null>(null);
  const [uttOpsMenu, setUttOpsMenu] = useState<{ x: number; y: number } | null>(null);
  const [showBatchOperationPanel, setShowBatchOperationPanel] = useState(false);

  // ---- Notes (extracted hook) ----
  const {
    notePopover,
    setNotePopover,
    currentNotes,
    addNote,
    updateNote,
    deleteNote,
    noteCounts,
    uttNoteCounts,
    toggleNotes,
    handleNoteClick,
    handleOpenWordNote,
    handleOpenMorphemeNote,
    handleUpdateTokenPos,
    handleBatchUpdateTokenPosByForm,
    handleExecuteRecommendation,
  } = useNoteHandlers({
    selectedUtteranceId,
    focusedLayerRowId,
    utterances,
    transcriptionLayers,
    translationLayers,
    updateTokenPos,
    batchUpdateTokenPosByForm,
    selectUtterance,
    setSaveState,
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
    deleteUtterance,
    deleteSelectedUtterances,
    mergeSelectedUtterances,
    mergeWithPrevious,
    mergeWithNext,
    splitUtterance,
    selectAllBefore,
    selectAllAfter,
  });

  // ---- Player (WaveSurfer) ----

  const waveformRegions = useMemo(() =>
    utterancesOnCurrentMedia.map((item) => ({
      id: item.id,
      start: item.startTime,
      end: item.endTime,
    })),
    [utterancesOnCurrentMedia],
  );

  // --- 百分比 → px/s 换算 ---
  // 用 ref 追踪 duration 使得计算可以在 useWaveSurfer 调用前进行
  const lastDurationRef = useRef(0);
  const containerWidth = waveCanvasRef.current?.clientWidth || 800;

  // Refs for waveform lasso effect (avoid effect dependency churn)
  const zoomPxPerSecRef = useRef(0);
  const previousSelectedUtteranceIdRef = useRef(selectedUtteranceId);
  const safeDur = lastDurationRef.current;
  const fitPxPerSec = safeDur > 0 ? containerWidth / safeDur : 40;
  const zoomPxPerSec = fitPxPerSec * (zoomPercent / 100);
  zoomPxPerSecRef.current = zoomPxPerSec;
  const maxZoomPercent = Math.max(200, Math.ceil((2000 / fitPxPerSec) * 100));
  const isFitZoomMode = zoomMode === 'fit-all' || zoomMode === 'fit-selection';
  const shouldDisableAutoScroll = segmentLoopPlayback && isFitZoomMode;

  // Sub-selection state (shared between useLasso and useWaveSurfer)
  const [subSelectionRange, setSubSelectionRange] = useState<{ start: number; end: number } | null>(null);
  const subSelectDragRef = useRef<SubSelectDrag | null>(null);

  const player = useWaveSurfer({
    mediaUrl: selectedMediaUrl,
    regions: waveformRegions,
    activeRegionIds: selectedUtteranceIds,
    primaryRegionId: selectedUtteranceId,
    waveformFocused,
    segmentLoop: segmentLoopPlayback,
    globalLoop: globalLoopPlayback,
    segmentPlaybackRate,
    autoScrollDuringPlayback: !shouldDisableAutoScroll,
    enableEmptyDragCreate: false,
    zoomLevel: zoomPxPerSec,
    startMarker: segMarkStart ?? undefined,
    subSelection: subSelectionRange,
    onRegionAltPointerDown: (regionId, time, pointerId, _clientX) => {
      // Begin sub-range drag
      subSelectDragRef.current = { active: false, regionId, anchorTime: time, pointerId };
      // Capture pointer on waveCanvasRef so we get pointermove/up
      waveCanvasRef.current?.setPointerCapture(pointerId);
    },
    onRegionClick: (regionId, clickTime, event) => {
      if (player.isPlaying) {
        player.stop();
      }
      setSubSelectionRange(null);
      manualSelectTsRef.current = Date.now();
      player.seekTo(clickTime);
      if (event.shiftKey) {
        const anchor = selectedUtteranceId || regionId;
        selectUtteranceRange(anchor, regionId);
      } else if (event.metaKey || event.ctrlKey) {
        toggleUtteranceSelection(regionId);
      } else {
        selectUtterance(regionId);
      }
    },
    onRegionDblClick: (_regionId, start, end) => {
      zoomToUtterance(start, end);
    },
    onRegionUpdate: (regionId, start, end) => {
      // Stop playback when the user starts dragging a boundary — playing
      // while adjusting boundaries leads to stale segmentBounds and confusing
      // behavior (playback ignoring the new boundary).
      if (player.isPlaying) {
        player.stop();
      }
      beginTimingGesture(regionId);
      setDragPreview({ id: regionId, start, end });
      const item = utterancesOnCurrentMedia.find((u) => u.id === regionId);
      if (item) {
        const bounds = getNeighborBounds(item.id, item.mediaId, start);
        setSnapGuide(makeSnapGuide(bounds, start, end));
      }
    },
    onRegionUpdateEnd: (regionId, start, end) => {
      endTimingGesture(regionId);
      setDragPreview(null);
      manualSelectTsRef.current = Date.now();
      setSelectedUtteranceId(regionId);
      // Snap to zero-crossing if enabled
      let finalStart = start;
      let finalEnd = end;
      if (snapEnabled) {
        const ws = player.instanceRef.current;
        const buf = ws?.getDecodedData();
        if (buf) {
          const snapped = snapToZeroCrossing(buf, start, end);
          finalStart = snapped.start;
          finalEnd = snapped.end;
        }
      }
      const item = utterancesOnCurrentMedia.find((u) => u.id === regionId);
      if (item) {
        const bounds = getNeighborBounds(item.id, item.mediaId, finalStart);
        setSnapGuide(makeSnapGuide(bounds, finalStart, finalEnd));
      }
      fireAndForget(saveUtteranceTiming(regionId, finalStart, finalEnd));
    },
    onRegionCreate: (start, end) => {
      fireAndForget(createUtteranceFromSelection(start, end));
    },
    onRegionContextMenu: (regionId, x, y) => {
      if (player.isPlaying) {
        player.stop();
      }
      setSelectedUtteranceId(regionId);
      // Convert click clientX → waveform time
      const ws = player.instanceRef.current;
      let splitTime = ws?.getCurrentTime() ?? 0;
      if (ws) {
        const wrapper = ws.getWrapper();
        const scrollParent = wrapper?.parentElement;
        if (wrapper && scrollParent) {
          const rect = scrollParent.getBoundingClientRect();
          const pxOffset = x - rect.left + scrollParent.scrollLeft;
          const totalWidth = wrapper.scrollWidth;
          const dur = ws.getDuration() || 1;
          splitTime = Math.max(0, Math.min(dur, (pxOffset / totalWidth) * dur));
        }
      }
      setCtxMenu({ x, y, utteranceId: regionId, layerId: '', splitTime });
    },
    onTimeUpdate: (time) => {
      if (Date.now() - manualSelectTsRef.current < 600) return;
      if (creatingSegmentRef.current) return;
      if (markingModeRef.current) return;
      // Binary search on sorted utterances
      const arr = utterancesOnCurrentMedia;
      let lo = 0, hi = arr.length - 1;
      let hit: typeof arr[0] | undefined;
      while (lo <= hi) {
        const mid = (lo + hi) >>> 1;
        const m = arr[mid];
        if (!m) break;
        if (time < m.startTime) { hi = mid - 1; }
        else if (time > m.endTime) { lo = mid + 1; }
        else { hit = m; break; }
      }
      if (hit && hit.id !== selectedUtteranceId) {
        setSelectedUtteranceId(hit.id);
      }
    },
  });

  const handleJumpToEmbeddingMatch = useCallback((utteranceId: string) => {
    if (!utteranceId) return;
    const target = utterances.find((item) => item.id === utteranceId);
    selectUtterance(utteranceId);
    if (!target) return;
    manualSelectTsRef.current = Date.now();
    player.seekTo(target.startTime);
  }, [player, selectUtterance, utterances]);

  const handleJumpToCitation = useCallback(async (
    citationType: 'utterance' | 'note' | 'pdf' | 'schema',
    refId: string,
    citationRef?: { snippet?: string },
  ) => {
    if (!refId) return;
    if (citationType === 'utterance') {
      handleJumpToEmbeddingMatch(refId);
      return;
    }
    if (citationType === 'note') {
      const note = await appDb.user_notes.get(refId);
      if (!note) {
        setAiEmbeddingLastError(locale === 'zh-CN' ? '未找到引用的笔记。' : 'Referenced note was not found.');
        return;
      }

      const utteranceId = extractUtteranceIdFromNote(note);

      if (utteranceId) {
        handleJumpToEmbeddingMatch(utteranceId);
      }

      // 打开笔记弹层，至少展示该笔记所附着的目标 | Open note popover near top-right as a visible landing.
      setNotePopover({
        x: Math.max(40, window.innerWidth - 360),
        y: 100,
        uttId: utteranceId ?? selectedUtteranceId ?? '',
        noteTarget: {
          targetType: note.targetType,
          targetId: note.targetId,
          ...(note.parentTargetId ? { parentTargetId: note.parentTargetId } : {}),
          ...(typeof note.targetIndex === 'number' ? { targetIndex: note.targetIndex } : {}),
        },
      });
      return;
    }

    if (citationType === 'schema') {
      const targetLayer = layerRailRows.find((item) => item.id === refId || item.key === refId);
      if (!targetLayer) {
        setAiEmbeddingLastError(locale === 'zh-CN'
          ? '未找到引用的层定义。'
          : 'Referenced layer schema was not found.');
        return;
      }

      // 聚焦到层面板并高亮目标层，作为 schema 引用的落点。 | Focus layer rail and highlight target layer as schema citation landing.
      setIsLayerRailCollapsed(false);
      setLayerRailTab('layers');
      setSelectedLayerId(targetLayer.id);
      setFocusedLayerRowId(targetLayer.id);
      setFlashLayerRowId(targetLayer.id);
      return;
    }

    if (citationType === 'pdf') {
      const { baseRef, hashSuffix } = splitPdfCitationRef(refId);
      const page = getPdfPageFromHash(hashSuffix);
      const displayTitle = baseRef.split('/').pop() || baseRef || 'PDF';

      // 优先直接打开 URL 形式引用 | Prefer direct URL-like PDF citations.
      if (isDirectPdfCitationRef(refId)) {
        const snippet = citationRef?.snippet?.trim();
        openPdfPreviewWithManagedObjectUrl(baseRef || refId.trim(), displayTitle, page, hashSuffix, snippet);
        return;
      }

      const resolveMediaLink = (media: { url?: string; details?: Record<string, unknown> } | undefined): string | null => {
        if (!media) return null;
        if (typeof media.url === 'string' && media.url.trim()) return media.url;
        const details = media.details;
        if (!details) return null;
        const detailUrl = details.url;
        if (typeof detailUrl === 'string' && detailUrl.trim()) return detailUrl;
        const pdfBlob = details.pdfBlob;
        if (pdfBlob instanceof Blob) {
          cleanupPdfCitationObjectUrl();
          const url = URL.createObjectURL(pdfBlob);
          pdfCitationObjectUrlRef.current = url;
          return url;
        }
        return null;
      };

      // 支持 refId=media_id 或 filename 的文档定位 | Resolve PDF citation by media id or filename.
      let media = await appDb.media_items.get(baseRef);
      if (!media) {
        const allMedia = await appDb.media_items.toArray();
        media = allMedia.find((item) => {
          const details = item.details as Record<string, unknown> | undefined;
          const mime = typeof details?.mimeType === 'string' ? details.mimeType.toLowerCase() : '';
          const isPdf = item.filename.toLowerCase().endsWith('.pdf') || mime.includes('pdf');
          if (!isPdf) return false;
          return item.filename === baseRef || item.id === baseRef;
        });
      }

      const mediaLink = resolveMediaLink(media);
      if (mediaLink) {
        const snippet = citationRef?.snippet?.trim();
        openPdfPreviewWithManagedObjectUrl(mediaLink, media?.filename || displayTitle, page, hashSuffix, snippet);
        return;
      }

      // 若无文档链接，再退化到 note 落点定位。 | Fall back to note landing when no direct PDF link is available.
      let note = await appDb.user_notes.get(refId);
      if (!note) {
        const related = (await appDb.user_notes.toArray()).find((item) => item.targetId === refId || item.targetId === baseRef);
        note = related;
      }

      if (note) {
        const utteranceId = extractUtteranceIdFromNote(note);

        if (utteranceId) {
          handleJumpToEmbeddingMatch(utteranceId);
        }

        setNotePopover({
          x: Math.max(40, window.innerWidth - 360),
          y: 100,
          uttId: utteranceId ?? selectedUtteranceId ?? '',
          noteTarget: {
            targetType: note.targetType,
            targetId: note.targetId,
            ...(note.parentTargetId ? { parentTargetId: note.parentTargetId } : {}),
            ...(typeof note.targetIndex === 'number' ? { targetIndex: note.targetIndex } : {}),
          },
        });
        return;
      }

      setAiEmbeddingLastError(locale === 'zh-CN'
        ? '未找到可打开的 PDF 引用目标。'
        : 'No openable PDF citation target was found.');
      return;
    }

    setAiEmbeddingLastError(locale === 'zh-CN'
      ? `当前暂不支持跳转到 ${citationType} 引用。`
      : `Jump for ${citationType} citation is not supported yet.`);
  }, [
    handleJumpToEmbeddingMatch,
    layerRailRows,
    locale,
    selectedUtteranceId,
    setFlashLayerRowId,
    setFocusedLayerRowId,
    setIsLayerRailCollapsed,
    setLayerRailTab,
    setNotePopover,
    openPdfPreviewWithManagedObjectUrl,
    setSelectedLayerId,
    cleanupPdfCitationObjectUrl,
  ]);

  // 同步 duration 到 ref（供下次渲染的 zoom 计算使用）
  if (player.duration > 0 && player.duration !== lastDurationRef.current) {
    lastDurationRef.current = player.duration;
  }

  // ---- Waveform region note indicators (rendered outside Shadow DOM via React) ----
  const [waveformScrollLeft, setWaveformScrollLeft] = useState(0);

  // Subscribe to WaveSurfer's scroll event so note indicators reposition when
  // the waveform auto-scrolls during playback (much cheaper than tracking
  // player.currentTime which fires at 60 fps).
  useEffect(() => {
    if (!player.isReady) return;
    const ws = player.instanceRef.current;
    if (!ws) return;
    const onScroll = () => setWaveformScrollLeft(ws.getScroll());
    ws.on('scroll', onScroll);
    return () => { ws.un('scroll', onScroll); };
  }, [player.isReady]);

  const waveformNoteIndicators = useMemo(() => {
    if (!player.isReady) return [];
    const ws = player.instanceRef.current;
    if (!ws) return [];
    const result: { uttId: string; leftPx: number; widthPx: number; count: number }[] = [];
    for (const utt of utterancesOnCurrentMedia) {
      const count = uttNoteCounts.get(utt.id) ?? 0;
      if (count <= 0) continue;
      const leftPx = utt.startTime * zoomPxPerSec - waveformScrollLeft;
      const widthPx = (utt.endTime - utt.startTime) * zoomPxPerSec;
      result.push({ uttId: utt.id, leftPx, widthPx, count });
    }
    return result;
  }, [player.isReady, utterancesOnCurrentMedia, uttNoteCounts, zoomPxPerSec, waveformScrollLeft]);

  // ---- Lasso / sub-selection (from hook) ----
  const {
    waveLassoRect,
    waveLassoHintCount,
    lassoRect,
    handleLassoPointerDown,
    handleLassoPointerMove,
    handleLassoPointerUp,
  } = useLasso({
    waveCanvasRef,
    tierContainerRef,
    playerInstanceRef: player.instanceRef,
    playerIsReady: player.isReady,
    selectedMediaUrl,
    utterancesOnCurrentMedia,
    selectedUtteranceIds,
    selectedUtteranceId,
    zoomPxPerSec,
    skipSeekForIdRef,
    clearUtteranceSelection,
    createUtteranceFromSelection,
    setUtteranceSelection,
    playerSeekTo: player.seekTo,
    subSelectionRange,
    setSubSelectionRange,
    subSelectDragRef,
  });

  // ---- Zoom (from hook) ----
  const { rulerView, zoomToPercent, zoomToUtterance } = useZoom({
    waveCanvasRef,
    tierContainerRef,
    playerInstanceRef: player.instanceRef,
    playerIsReady: player.isReady,
    playerDuration: player.duration,
    playerCurrentTime: player.currentTime,
    playerIsPlaying: player.isPlaying,
    selectedMediaUrl,
    zoomPercent,
    setZoomPercent,
    setZoomMode,
    fitPxPerSec,
    maxZoomPercent,
    zoomPxPerSec,
  });

  const { timelineResizeTooltip, startTimelineResizeDrag } = useTimelineResize({
    zoomPxPerSec,
    manualSelectTsRef,
    player,
    selectUtterance,
    setSelectedLayerId,
    setFocusedLayerRowId,
    beginTimingGesture,
    endTimingGesture,
    getNeighborBounds,
    makeSnapGuide,
    snapEnabled,
    setSnapGuide,
    setDragPreview,
    saveUtteranceTiming,
  });

  useEffect(() => {
    aiAudioTimeRef.current = player.currentTime;
  }, [player.currentTime]);

  // ---- Page-only derived values ----

  const selectedUtteranceText = selectedUtterance ? getUtteranceTextForLayer(selectedUtterance) : '';

  const {
    lexemeMatches,
    observerResult,
    actionableObserverRecommendations,
    selectedAiWarning,
    selectedTranslationGapCount,
    aiCurrentTask,
    aiVisibleCards,
    handleJumpToTranslationGap,
  } = useAiPanelLogic({
    utterances,
    selectedUtterance,
    selectedUtteranceText,
    translationLayers,
    translationDrafts,
    translationTextByLayer,
    aiChatConnectionTestStatus: aiChat.connectionTestStatus,
    aiPanelMode,
    selectUtterance,
    setSaveState,
  });
  const setAiPanelContext = useAiPanelContextUpdater();

  // Sync derived persona key to ref (read by useAiChat via useLatest)
  aiDerivedPersonaRef.current = taskToPersona(aiCurrentTask);

  useEffect(() => {
    aiObserverStageRef.current = observerResult.stage;
    aiRecommendationRef.current = actionableObserverRecommendations
      .slice(0, 4)
      .map((item) => `${item.title}: ${item.detail}`);
    aiLexemeSummaryRef.current = lexemeMatches
      .slice(0, 6)
      .map((item) => Object.values(item.lemma)[0] ?? item.id);
  }, [actionableObserverRecommendations, lexemeMatches, observerResult.stage]);

  // Keep focused layer rail row in sync with available layers.
  useEffect(() => {
    if (layerRailRows.length === 0) {
      if (focusedLayerRowId) {
        setFocusedLayerRowId('');
      }
      return;
    }

    const exists = layerRailRows.some((item) => item.id === focusedLayerRowId);
    if (!exists) {
      const fallback = layerRailRows.find((item) => item.id === selectedLayerId)?.id ?? layerRailRows[0]?.id ?? '';
      setFocusedLayerRowId(fallback);
    }
  }, [focusedLayerRowId, layerRailRows, selectedLayerId]);

  useEffect(() => {
    if (!layerCreateMessage.startsWith('已创建') || layerRailRows.length === 0) return;
    const latestCreatedLayer = [...layerRailRows].sort((a, b) => {
      const at = Date.parse(a.updatedAt || a.createdAt || '');
      const bt = Date.parse(b.updatedAt || b.createdAt || '');
      return bt - at;
    })[0];
    if (!latestCreatedLayer) return;
    setLayerRailTab('layers');
    setFocusedLayerRowId(latestCreatedLayer.id);
    setFlashLayerRowId(latestCreatedLayer.id);
  }, [layerCreateMessage, layerRailRows, setLayerRailTab]);

  usePanelAutoCollapse({
    isLayerRailCollapsed,
    setIsLayerRailCollapsed,
    listMainRef,
    isAiPanelCollapsed,
    setIsAiPanelCollapsed,
    workspaceRef,
  });

  // Any target switch clears segment-loop mode, so the next play is manual non-loop by default.
  // Also reset segment playback rate to 1x for the new segment.
  useEffect(() => {
    const prev = previousSelectedUtteranceIdRef.current;
    if (prev !== selectedUtteranceId && segmentLoopPlayback) {
      setSegmentLoopPlayback(false);
    }
    if (prev !== selectedUtteranceId) {
      setSegmentPlaybackRate(1);
    }
    previousSelectedUtteranceIdRef.current = selectedUtteranceId;
  }, [selectedUtteranceId, segmentLoopPlayback]);

  // Seek waveform to selected utterance's start.
  // Use a ref for isPlaying to avoid changing the dep array size and to prevent
  // re-running the effect when playback stops (which would yank the cursor).
  const isPlayingRef = useRef(player.isPlaying);
  isPlayingRef.current = player.isPlaying;
  useEffect(() => {
    if (!selectedUtterance || !player.isReady) return;
    if (skipSeekForIdRef.current) {
      skipSeekForIdRef.current = null;
      return;
    }
    // Don't yank the cursor while audio is playing (e.g. during
    // Enter-based continuous segment creation).
    if (isPlayingRef.current) return;
    player.seekTo(selectedUtterance.startTime);
  }, [selectedUtterance?.id, player.isReady, player.seekTo]);

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
    selectedUtterance,
    selectedUtteranceId,
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
    createUtteranceFromSelection,
    selectUtterance,
    selectAllUtterances,
    setSelectedUtteranceId,
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

  // ---- Voice Agent ----
  // insertDictation: write dictated text to the active translation or transcription layer
  const handleVoiceDictation = useCallback((text: string) => {
    if (!selectedUtterance) {
      setSaveState({ kind: 'error', message: '请先选择要填充的句段' });
      return;
    }
    // Resolve target layer — prefer explicit selection, then default transcription, then first translation
    let targetLayerId: string | undefined = selectedLayerId;
    if (!targetLayerId) {
      targetLayerId = defaultTranscriptionLayerId;
    }
    if (!targetLayerId) {
      targetLayerId = translationLayers[0]?.id;
    }
    if (!targetLayerId) {
      setSaveState({ kind: 'error', message: '无可用层，请先创建转写或翻译层' });
      return;
    }
    const targetLayer = layers.find((l) => l.id === targetLayerId);
    if (!targetLayer) return;

    if (targetLayer.layerType === 'transcription') {
      fireAndForget(saveUtteranceText(selectedUtterance.id, text, targetLayerId));
    } else {
      fireAndForget(saveTextTranslationForUtterance(selectedUtterance.id, text, targetLayerId));
    }
  }, [selectedUtterance, selectedLayerId, defaultTranscriptionLayerId, layers, translationLayers, saveUtteranceText, saveTextTranslationForUtterance, setSaveState]);

  // V2: Handle analysis result — write AI analysis text to the current utterance's notes field
  const handleVoiceAnalysisResult = useCallback((utteranceId: string | null, analysisText: string) => {
    if (!utteranceId) {
      setSaveState({ kind: 'error', message: '请先选择要分析的句段' });
      return;
    }
    const trimmed = analysisText.trim();
    if (!trimmed) return;

    data.pushUndo('AI 分析填充');
    const now = new Date().toISOString();
    getDb().then(async (db: JieyuDatabase) => {
      const utterances = await db.collections.utterances.find().exec();
      const target = utterances.find((u) => u.id === utteranceId);
      if (!target) {
        setSaveState({ kind: 'error', message: '未找到目标句段' });
        return;
      }
      const doc = target.toJSON() as UtteranceDocType;
      const existingNotes = doc.notes ?? {};
      const updated: UtteranceDocType = {
        ...doc,
        notes: { ...existingNotes, eng: trimmed },
        updatedAt: now,
      };
      await db.collections.utterances.insert(updated);
      data.setUtterances((prev) =>
        prev.map((u) => (u.id === utteranceId ? updated : u))
      );
      setSaveState({ kind: 'done', message: 'AI 分析结果已保存到句段备注' });
    }).catch((err: unknown) => {
      setSaveState({ kind: 'error', message: `保存分析结果失败: ${err instanceof Error ? err.message : String(err)}` });
    });
  }, [data.pushUndo, setSaveState, data]);

  const voiceAgentOptions: Parameters<typeof useVoiceAgent>[0] = {
    corpusLang: effectiveVoiceCorpusLang,
    langOverride: voiceCorpusLangOverride,
    executeAction,
    sendToAiChat: (text: string) => {
      // V2: Wire analysis result fill-back — set up callback before send so the
      // AI response is captured and written to the utterance notes when streaming ends.
      void (async () => {
        const utteranceId = selectedUtterance?.id ?? null;
        voiceAgent.setAnalysisFillCallback?.(utteranceId, (analysisText) => {
          handleVoiceAnalysisResult(utteranceId, analysisText);
        });
        // Also register via aiChat.onMessageComplete so the result fires when streaming finishes
        await aiChat.send(text);
      })();
    },
    resolveIntentWithLlm: handleResolveVoiceIntentWithLlm,
    insertDictation: handleVoiceDictation,
    // whisper-local uses whisper-server (port 3040), not Ollama (port 11434)
    ...(localWhisperConfig.baseUrl ? { whisperServerUrl: localWhisperConfig.baseUrl } : {}),
    ...(localWhisperConfig.model ? { whisperServerModel: localWhisperConfig.model } : {}),
    commercialProviderKind: commercialProviderKind,
    commercialProviderConfig,
  };
  const voiceAgent = useVoiceAgent(voiceAgentOptions);
  const voiceTargetSummary = useMemo(() => {
    const rowLabel = selectedRowMeta ? `第 ${selectedRowMeta.rowNumber} 句` : (selectedUtterance ? '当前句段' : '未选择句段');

    if (voiceAgent.mode === 'command') {
      return '当前页面操作';
    }

    if (voiceAgent.mode === 'analysis') {
      return selectedUtterance ? `${rowLabel} / AI 分析备注` : '未选择句段';
    }

    const targetLayerId = selectedLayerId ?? defaultTranscriptionLayerId ?? translationLayers[0]?.id;
    const targetLayer = targetLayerId ? layers.find((layer) => layer.id === targetLayerId) : undefined;
    const layerLabel = targetLayer ? formatLayerRailLabel(targetLayer) : '未选择层';
    return `${layerLabel} / ${rowLabel}`;
  }, [voiceAgent.mode, selectedRowMeta, selectedUtterance, selectedLayerId, defaultTranscriptionLayerId, translationLayers, layers]);

  const voiceStatusSummary = useMemo(() => {
    switch (voiceAgent.agentState) {
      case 'listening':
        return voiceAgent.mode === 'dictation' ? '正在听写，请直接说出要写入的内容。' : '正在监听，请开始说话。';
      case 'routing':
        return '已识别语音，正在判断意图。';
      case 'executing':
        if (voiceAgent.mode === 'dictation') return '正在将识别结果写入文本框。';
        if (voiceAgent.mode === 'analysis') return '正在准备发送到 AI 分析。';
        return '正在执行语音操作。';
      case 'ai-thinking':
        return '正在等待 AI 处理结果。';
      case 'idle':
      default:
        return voiceAgent.listening ? '语音通道已开启，等待下一句输入。' : '就绪，点击麦克风开始语音交互。';
    }
  }, [voiceAgent.agentState, voiceAgent.mode, voiceAgent.listening]);

  const voiceEnvironmentSummary = useMemo(() => {
    const currentLanguage = voiceCorpusLangOverride === '__auto__'
      ? '自动检测'
      : formatLanguageLabel(voiceCorpusLangOverride ?? effectiveVoiceCorpusLang);
    const currentEngine = voiceAgent.engine === 'web-speech'
      ? 'Web Speech'
      : voiceAgent.engine === 'whisper-local'
        ? 'Ollama Whisper'
        : '商业模型';
    const detectedLanguage = voiceCorpusLangOverride === '__auto__' && voiceAgent.detectedLang
      ? ` · 已识别 ${formatLanguageLabel(voiceAgent.detectedLang)}`
      : '';
    return `${currentLanguage} · ${currentEngine}${detectedLanguage}`;
  }, [voiceCorpusLangOverride, effectiveVoiceCorpusLang, voiceAgent.engine, voiceAgent.detectedLang]);
  const voiceSelectionSummary = useMemo(() => {
    if (selectedRowMeta) {
      return `${formatTime(selectedRowMeta.start)} - ${formatTime(selectedRowMeta.end)}`;
    }
    if (selectedUtterance) {
      return `${formatTime(selectedUtterance.startTime)} - ${formatTime(selectedUtterance.endTime)}`;
    }
    return '未定位句段';
  }, [selectedRowMeta, selectedUtterance]);
  const prevAiStreamingRef = useRef(false);

  useEffect(() => {
    const wasStreaming = prevAiStreamingRef.current;
    const isStreaming = aiChat.isStreaming;

    if (!wasStreaming && isStreaming) {
      voiceAgent.notifyAiStreamStarted?.();
    }

    if (wasStreaming && !isStreaming) {
      // V2: Find the most recent assistant message and pass it to notifyAiStreamFinished
      // so that analysis mode can capture the AI response for utterance fill-back.
      const latestAssistant = aiChat.messages.find((m) => m.role === 'assistant' && m.status === 'done');
      voiceAgent.notifyAiStreamFinished?.(latestAssistant?.content);
    }

    prevAiStreamingRef.current = isStreaming;
  }, [aiChat.isStreaming, aiChat.messages, voiceAgent]);

  const ensureWhisperLocalReady = useCallback(async (): Promise<boolean> => {
    const result = await voiceAgent.testWhisperLocal();
    if (!result.available) {
      voiceAgent.setExternalError(result.error ?? '本地 Whisper 不可用');
      return false;
    }
    voiceAgent.setExternalError(null);
    return true;
  }, [voiceAgent]);

  const handleVoiceCommercialConfigChange = useCallback((config: {
    apiKey?: string;
    baseUrl?: string;
    model?: string;
    appId?: string;
    accessToken?: string;
  }) => {
    applyVoiceCommercialConfigChange(config, handleCommercialConfigChange, voiceAgent.setCommercialProviderConfig);
  }, [handleCommercialConfigChange, voiceAgent]);

  // Sync voice agent commercial provider state back to page-level state
  useEffect(() => {
    setCommercialProviderKind(voiceAgent.commercialProviderKind);
  }, [voiceAgent.commercialProviderKind]);

  useEffect(() => {
    setCommercialProviderConfig(voiceAgent.commercialProviderConfig);
  }, [voiceAgent.commercialProviderConfig]);

  // Wire toggleVoiceRef so the keybinding can toggle voice without circular deps.
  useEffect(() => {
    toggleVoiceRef.current = featureFlags.voiceAgentEnabled ? voiceAgent.toggle : undefined;
  }, [voiceAgent.toggle]);

  const handleVoiceAssistantIconClick = useCallback(() => {
    void (async () => {
      if (voiceAgent.listening) {
        voiceAgent.toggle();
        return;
      }
      if (voiceAgent.engine === 'whisper-local') {
        const ready = await ensureWhisperLocalReady();
        if (!ready) return;
      }
      voiceAgent.toggle();
    })();
  }, [ensureWhisperLocalReady, voiceAgent]);

  const handleVoiceSwitchEngine = useCallback((engine: 'web-speech' | 'whisper-local' | 'commercial') => {
    void (async () => {
      if (engine === 'whisper-local') {
        const ready = await ensureWhisperLocalReady();
        if (!ready) return;
      }
      voiceAgent.switchEngine(engine);
    })();
  }, [ensureWhisperLocalReady, voiceAgent]);

  // Press-and-hold for whisper-local push-to-talk recording
  const handleMicPointerDown = useCallback((event: React.PointerEvent<HTMLButtonElement>) => {
    void event;
    if (voiceAgent.listening && voiceAgent.engine === 'whisper-local') {
      void (async () => {
        const ready = await ensureWhisperLocalReady();
        if (!ready) return;
        void voiceAgent.startRecording();
      })();
    }
  }, [ensureWhisperLocalReady, voiceAgent]);

  const handleMicPointerUp = useCallback(() => {
    if (voiceAgent.listening && voiceAgent.engine === 'whisper-local') {
      void voiceAgent.stopRecording();
    }
  }, [voiceAgent.listening, voiceAgent.engine, voiceAgent.stopRecording]);

  const handleAssistantVoicePanelToggle = useCallback(() => {
    setAssistantVoiceExpanded((value) => !value);
  }, []);

  useEffect(() => {
    if (voiceAgent.listening || voiceAgent.isRecording || Boolean(voiceAgent.pendingConfirm) || Boolean(voiceAgent.error)) {
      setAssistantVoiceExpanded(true);
    }
  }, [voiceAgent.listening, voiceAgent.isRecording, voiceAgent.pendingConfirm, voiceAgent.error]);

  const aiPanelContextValue = useMemo(() => ({
    dbName: state.phase === 'ready' ? state.dbName : '',
    utteranceCount: state.phase === 'ready' ? state.utteranceCount : utterances.length,
    translationLayerCount: state.phase === 'ready' ? state.translationLayerCount : translationLayers.length,
    aiConfidenceAvg,
    selectedUtterance: selectedUtterance ?? null,
    selectedRowMeta,
    selectedAiWarning,
    lexemeMatches,
    onOpenWordNote: handleOpenWordNote,
    onOpenMorphemeNote: handleOpenMorphemeNote,
    onUpdateTokenPos: handleUpdateTokenPos,
    onBatchUpdateTokenPosByForm: handleBatchUpdateTokenPosByForm,
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
    aiToolDecisionLogs,
    onUpdateAiChatSettings: aiChat.updateSettings,
    onTestAiConnection: aiChat.testConnection,
    onSendAiMessage: aiChat.send,
    onStopAiMessage: aiChat.stop,
    onClearAiMessages: aiChat.clear,
    onConfirmPendingToolCall: aiChat.confirmPendingToolCall,
    onCancelPendingToolCall: aiChat.cancelPendingToolCall,
    aiPanelMode,
    aiCurrentTask,
    aiVisibleCards,
    selectedTranslationGapCount,
    onJumpToTranslationGap: handleJumpToTranslationGap,
    onChangeAiPanelMode: setAiPanelMode,
    observerStage: observerResult.stage,
    observerRecommendations: actionableObserverRecommendations,
    onExecuteRecommendation: handleExecuteRecommendation,
    aiEmbeddingBusy,
    aiEmbeddingProgressLabel,
    aiEmbeddingLastResult,
    aiEmbeddingTasks,
    aiEmbeddingMatches,
    aiEmbeddingLastError,
    aiEmbeddingWarning,
    embeddingProviderKind: embeddingProviderConfig.kind,
    embeddingProviderConfig,
    onSetEmbeddingProviderKind: (kind: EmbeddingProviderKind) => setEmbeddingProviderConfig((prev) => ({ ...prev, kind })),
    onTestEmbeddingProvider: handleTestEmbeddingProvider,
    onBuildUtteranceEmbeddings: handleBuildUtteranceEmbeddings,
    onBuildNotesEmbeddings: handleBuildNotesEmbeddings,
    onBuildPdfEmbeddings: handleBuildPdfEmbeddings,
    onFindSimilarUtterances: handleFindSimilarUtterances,
    onRefreshEmbeddingTasks: refreshEmbeddingTasks,
    onJumpToEmbeddingMatch: handleJumpToEmbeddingMatch,
    onJumpToCitation: handleJumpToCitation,
    onCancelAiTask: handleCancelAiTask,
    onRetryAiTask: handleRetryAiTask,
    // Voice Agent
    voiceEnabled: featureFlags.voiceAgentEnabled,
    voiceListening: voiceAgent.listening,
    voiceSpeechActive: voiceAgent.speechActive,
    voiceMode: voiceAgent.mode,
    voiceInterimText: voiceAgent.interimText,
    voiceFinalText: voiceAgent.finalText,
    voiceConfidence: voiceAgent.confidence,
    voiceError: voiceAgent.error,
    voiceSafeMode: voiceAgent.safeMode,
    voicePendingConfirm: voiceAgent.pendingConfirm,
    voiceCorpusLang: effectiveVoiceCorpusLang,
    voiceLangOverride: voiceCorpusLangOverride,
    onVoiceToggle: voiceAgent.toggle,
    onVoiceSwitchMode: voiceAgent.switchMode,
    onVoiceConfirm: voiceAgent.confirmPending,
    onVoiceCancel: voiceAgent.cancelPending,
    onVoiceSetSafeMode: voiceAgent.setSafeMode,
    onVoiceSetLangOverride: handleVoiceSetLangOverride,
  }), [
    state,
    utterances.length,
    translationLayers.length,
    aiConfidenceAvg,
    selectedUtterance,
    selectedRowMeta,
    selectedAiWarning,
    lexemeMatches,
    handleOpenWordNote,
    handleOpenMorphemeNote,
    handleUpdateTokenPos,
    handleBatchUpdateTokenPosByForm,
    aiChat.enabled,
    aiChat.providerLabel,
    aiChat.settings,
    aiChat.messages,
    aiChat.isStreaming,
    aiChat.lastError,
    aiChat.connectionTestStatus,
    aiChat.connectionTestMessage,
    aiChat.contextDebugSnapshot,
    aiChat.pendingToolCall,
    aiToolDecisionLogs,
    aiChat.updateSettings,
    aiChat.testConnection,
    aiChat.send,
    aiChat.stop,
    aiChat.clear,
    aiChat.confirmPendingToolCall,
    aiChat.cancelPendingToolCall,
    aiPanelMode,
    aiCurrentTask,
    aiVisibleCards,
    selectedTranslationGapCount,
    handleJumpToTranslationGap,
    observerResult.stage,
    actionableObserverRecommendations,
    handleExecuteRecommendation,
    aiEmbeddingBusy,
    aiEmbeddingProgressLabel,
    aiEmbeddingLastResult,
    aiEmbeddingTasks,
    aiEmbeddingMatches,
    aiEmbeddingLastError,
    aiEmbeddingWarning,
    handleTestEmbeddingProvider,
    handleBuildUtteranceEmbeddings,
    handleBuildNotesEmbeddings,
    handleBuildPdfEmbeddings,
    handleFindSimilarUtterances,
    refreshEmbeddingTasks,
    handleJumpToEmbeddingMatch,
    handleJumpToCitation,
    handleCancelAiTask,
    handleRetryAiTask,
    embeddingProviderConfig,
    voiceAgent.listening,
    voiceAgent.speechActive,
    voiceAgent.mode,
    voiceAgent.interimText,
    voiceAgent.finalText,
    voiceAgent.confidence,
    voiceAgent.error,
    voiceAgent.safeMode,
    voiceAgent.pendingConfirm,
    effectiveVoiceCorpusLang,
    voiceCorpusLangOverride,
    voiceAgent.toggle,
    voiceAgent.switchMode,
    voiceAgent.confirmPending,
    voiceAgent.cancelPending,
    voiceAgent.setSafeMode,
    handleVoiceSetLangOverride,
  ]);

  useEffect(() => {
    setAiPanelContext(aiPanelContextValue);
  }, [aiPanelContextValue, setAiPanelContext]);

  const aiAssistantHubContextValue = useAiAssistantHubContextValue(aiPanelContextValue);

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

  useEffect(() => {
    if (!selectedUtterance) return;
    const row = utteranceRowRef.current[selectedUtterance.id];
    row?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [selectedUtterance?.id]);

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
    selectedUtteranceMedia,
    utterancesOnCurrentMedia,
    anchors,
    layers,
    translations,
    defaultTranscriptionLayerId,
    loadSnapshot,
    setSaveState,
  });

  const handleDeleteCurrentAudio = useCallback(() => {
    if (!selectedUtteranceMedia) return;
    if (!window.confirm(tf(locale, 'transcription.action.confirmDeleteAudio', { filename: selectedUtteranceMedia.filename }))) return;
    fireAndForget((async () => {
      await LinguisticService.deleteAudio(selectedUtteranceMedia.id);
      await loadSnapshot();
      setSelectedUtteranceId('');
      setSaveState({ kind: 'done', message: t(locale, 'transcription.action.audioDeleted') });
    })());
  }, [loadSnapshot, locale, selectedUtteranceMedia, setSaveState, setSelectedUtteranceId]);

  const handleDeleteCurrentProject = useCallback(() => {
    if (!activeTextId) return;
    if (!window.confirm(t(locale, 'transcription.action.confirmDeleteProject'))) return;
    fireAndForget((async () => {
      await LinguisticService.deleteProject(activeTextId);
      setActiveTextId(null);
      setSelectedUtteranceId('');
      await loadSnapshot();
      setSaveState({ kind: 'done', message: t(locale, 'transcription.action.projectDeleted') });
    })());
  }, [activeTextId, loadSnapshot, locale, setSaveState, setSelectedUtteranceId]);

  // ── Search / Replace ──

  const searchableItems = useMemo(() => {
    const items: Array<{ utteranceId: string; layerId?: string; text: string }> = [];

    if (transcriptionLayers.length === 0) {
      for (const utt of utterancesOnCurrentMedia) {
        items.push({ utteranceId: utt.id, text: getUtteranceTextForLayer(utt) });
      }
    } else {
      for (const layer of transcriptionLayers) {
        for (const utt of utterancesOnCurrentMedia) {
          const text = getUtteranceTextForLayer(utt, layer.id);
          if (text) items.push({ utteranceId: utt.id, layerId: layer.id, text });
        }
      }
    }

    for (const layer of translationLayers) {
      const layerMap = translationTextByLayer.get(layer.id);
      if (!layerMap) continue;
      for (const utt of utterancesOnCurrentMedia) {
        const tr = layerMap.get(utt.id);
        if (tr?.text) items.push({ utteranceId: utt.id, layerId: layer.id, text: tr.text });
      }
    }
    return items;
  }, [getUtteranceTextForLayer, transcriptionLayers, translationLayers, translationTextByLayer, utterancesOnCurrentMedia]);

  const handleSearchReplace = useCallback(
    (utteranceId: string, layerId: string | undefined, _oldText: string, newText: string) => {
      if (layerId) {
        const targetLayer = layers.find((layer) => layer.id === layerId);
        if (targetLayer?.layerType === 'transcription') {
          fireAndForget(saveUtteranceText(utteranceId, newText, layerId));
        } else {
          fireAndForget(saveTextTranslationForUtterance(utteranceId, newText, layerId));
        }
      } else {
        fireAndForget(saveUtteranceText(utteranceId, newText));
      }
    },
    [layers, saveTextTranslationForUtterance, saveUtteranceText],
  );

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

  const timelineRenderUtterances = useMemo(() => {
    if (!rulerView || player.duration <= 0) return utterancesOnCurrentMedia;
    const viewSpan = Math.max(0, rulerView.end - rulerView.start);
    const buffer = Math.max(1, viewSpan * 0.45);
    const left = Math.max(0, rulerView.start - buffer);
    const right = Math.min(player.duration, rulerView.end + buffer);
    return utterancesOnCurrentMedia.filter((utt) => utt.endTime >= left && utt.startTime <= right);
  }, [utterancesOnCurrentMedia, rulerView, player.duration]);

  const { handleAnnotationClick, renderAnnotationItem, renderLaneLabel } = useTimelineAnnotationHelpers({
    manualSelectTsRef,
    player,
    selectedUtteranceId,
    selectUtteranceRange,
    toggleUtteranceSelection,
    selectUtterance,
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
    noteCounts,
    handleNoteClick,
  });

  const selectedBatchUtterances = useMemo(
    () => utterancesOnCurrentMedia
      .filter((utt) => selectedUtteranceIds.has(utt.id))
      .sort((a, b) => a.startTime - b.startTime),
    [selectedUtteranceIds, utterancesOnCurrentMedia],
  );

  const selectedBatchUtteranceTextById = useMemo(() => {
    const next: Record<string, string> = {};
    for (const utt of selectedBatchUtterances) {
      next[utt.id] = getUtteranceTextForLayer(utt) || '';
    }
    return next;
  }, [getUtteranceTextForLayer, selectedBatchUtterances]);

  const batchPreviewLayerOptions = useMemo(
    () => transcriptionLayers.map((layer) => ({
      id: layer.id,
      label: formatLayerRailLabel(layer),
    })),
    [transcriptionLayers],
  );

  const batchPreviewTextByLayerId = useMemo(() => {
    const next: Record<string, Record<string, string>> = {};
    for (const layer of transcriptionLayers) {
      const layerMap: Record<string, string> = {};
      for (const utt of utterancesOnCurrentMedia) {
        layerMap[utt.id] = getUtteranceTextForLayer(utt, layer.id) || '';
      }
      next[layer.id] = layerMap;
    }
    return next;
  }, [getUtteranceTextForLayer, transcriptionLayers, utterancesOnCurrentMedia]);

  const defaultBatchPreviewLayerId = useMemo(() => {
    if (transcriptionLayers.some((layer) => layer.id === selectedLayerId)) {
      return selectedLayerId;
    }
    return transcriptionLayers[0]?.id;
  }, [selectedLayerId, transcriptionLayers]);

  const editorContextValue = useMemo(() => ({
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
    getUtteranceTextForLayer,
    renderLaneLabel,
  }), [
    utteranceDrafts,
    setUtteranceDrafts,
    translationDrafts,
    setTranslationDrafts,
    translationTextByLayer,
    scheduleAutoSave,
    clearAutoSaveTimer,
    saveUtteranceText,
    saveTextTranslationForUtterance,
    getUtteranceTextForLayer,
    renderLaneLabel,
  ]);

  return (
    <section className="transcription-screen" ref={screenRef}>
      {state.phase === 'loading' && <p className="hint">{t(locale, 'transcription.status.loading')}</p>}
      {state.phase === 'error' && <p className="error">{tf(locale, 'transcription.status.dbError', { message: state.message })}</p>}

      {state.phase === 'ready' && (
        <>
          <RecoveryBanner
            locale={locale}
            recoveryAvailable={recoveryAvailable}
            recoveryDiffSummary={recoveryDiffSummary}
            onApply={() => {
              const snap = recoveryDataRef.current;
              if (snap) fireAndForget(applyRecovery(snap));
              hideRecoveryBanner();
            }}
            onDismiss={() => {
              fireAndForget(dismissRecovery());
              hideRecoveryBanner();
            }}
          />
          <section className="transcription-waveform">
            <WaveformToolbar
              filename={selectedUtteranceMedia?.filename ?? t(locale, 'transcription.media.unbound')}
              isReady={player.isReady}
              isPlaying={player.isPlaying}
              playbackRate={player.playbackRate}
              onPlaybackRateChange={player.setPlaybackRate}
              volume={player.volume}
              onVolumeChange={player.setVolume}
              loop={globalLoopPlayback}
              onLoopChange={setGlobalLoopPlayback}
              onTogglePlayback={handleGlobalPlayPauseAction}
              onSeek={player.seekBySeconds}
            >
              <TranscriptionToolbarActions
                canUndo={canUndo}
                canRedo={canRedo}
                undoLabel={undoLabel}
                canDeleteAudio={Boolean(selectedUtteranceMedia)}
                canDeleteProject={Boolean(activeTextId)}
                canToggleNotes={Boolean(selectedUtteranceId)}
                canOpenUttOpsMenu={Boolean(selectedUtteranceId)}
                notePopoverOpen={Boolean(notePopover)}
                showExportMenu={showExportMenu}
                exportMenuRef={exportMenuRef}
                importFileRef={importFileRef}
                onRefresh={() => fireAndForget(loadSnapshot())}
                onUndo={() => fireAndForget(undo())}
                onRedo={() => fireAndForget(redo())}
                onOpenProjectSetup={() => setShowProjectSetup(true)}
                onOpenAudioImport={() => setShowAudioImport(true)}
                onDeleteCurrentAudio={handleDeleteCurrentAudio}
                onDeleteCurrentProject={handleDeleteCurrentProject}
                onToggleExportMenu={() => setShowExportMenu((v) => !v)}
                onExportEaf={handleExportEaf}
                onExportTextGrid={handleExportTextGrid}
                onExportTrs={handleExportTrs}
                onExportFlextext={handleExportFlextext}
                onExportToolbox={handleExportToolbox}
                onExportJyt={handleExportJyt}
                onExportJym={handleExportJym}
                onImportFile={(file) => { fireAndForget(handleImportFile(file)); }}
                onToggleNotes={toggleNotes}
                onOpenUttOpsMenu={(x, y) => setUttOpsMenu({ x, y })}
              />
            </WaveformToolbar>
          </section>

          {/* Editor workspace: left side for row editing, right side for AI guidance. */}
          <main
            ref={workspaceRef}
            className={`transcription-workspace ${isAiPanelCollapsed ? 'transcription-workspace-ai-collapsed' : ''}`}
            style={{
              '--transcription-ai-width': `${aiPanelWidth}px`,
              '--transcription-ai-visible-width': `${isAiPanelCollapsed ? 0 : aiPanelWidth}px`,
              '--transcription-rail-width': `${isLayerRailCollapsed ? 0 : layerRailWidth}px`,
            } as React.CSSProperties}
          >
            <section className="transcription-list-panel">
              <div
                ref={waveformAreaRef}
                className={`transcription-waveform-area ${snapGuide.nearSide ? 'transcription-waveform-area-snapping' : ''} ${segMarkStart !== null ? 'transcription-waveform-area-marking' : ''}`}
                tabIndex={0}
              onKeyDown={handleWaveformKeyDown}
              onFocus={() => setWaveformFocused(true)}
              onBlur={() => setWaveformFocused(false)}
              onMouseMove={(e) => {
                const el = waveCanvasRef.current;
                if (!el || !player.isReady) { setHoverTime(null); return; }
                const rect = el.getBoundingClientRect();
                if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom + 30) {
                  setHoverTime(null); return;
                }
                const ws = player.instanceRef.current;
                const scrollLeft = ws ? ws.getScroll() : 0;
                const time = (scrollLeft + (e.clientX - rect.left)) / zoomPxPerSec;
                setHoverTime({ time: Math.max(0, Math.min(time, player.duration)), x: e.clientX, y: rect.top - 4 });
              }}
              onMouseLeave={() => setHoverTime(null)}
            >
              {hoverTime && (
                <div className="waveform-hover-tooltip" style={{ left: hoverTime.x, top: hoverTime.y }}>
                  {formatTime(hoverTime.time)}
                </div>
              )}
              {selectedMediaUrl ? (
                <>
                  <div
                    ref={(el) => {
                      waveCanvasRef.current = el;
                      player.waveformRef.current = el;
                    }}
                    className="wave-canvas transcription-wave-canvas"
                  />
                  {waveLassoRect && (
                    <div
                      className={`wave-lasso-rect ${waveLassoRect.mode === 'create' ? 'wave-lasso-rect-create' : 'wave-lasso-rect-select'}`}
                      style={{
                        left: waveLassoRect.x,
                        top: waveLassoRect.y,
                        width: waveLassoRect.w,
                        height: waveLassoRect.h,
                      }}
                    >
                      {waveLassoRect.mode === 'select' && (
                        <div className="wave-lasso-hint">
                          {tf(locale, 'transcription.wave.selectionHint', { count: waveLassoHintCount })}
                        </div>
                      )}
                    </div>
                  )}
                  {waveformNoteIndicators.map(({ uttId, leftPx, widthPx }) => (
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
                        setNotePopover({ x: e.clientX, y: e.clientY, uttId, layerId: '' });
                      }}
                    >
                      <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ width: 16, height: 16, color: '#93c5fd' }}>
                        <path d="M4.5 1.5h5l3 3v8a1 1 0 0 1-1 1h-7a1 1 0 0 1-1-1v-10a1 1 0 0 1 1-1z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
                        <path d="M6.5 7h3M6.5 9.5h3" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
                      </svg>
                    </div>
                  ))}
                  {selectedUtterance && player.isReady && (() => {
                    const ws = player.instanceRef.current;
                    const scrollLeft = ws ? ws.getScroll() : 0;
                    const leftPx = selectedUtterance.startTime * zoomPxPerSec - scrollLeft;
                    const widthPx = (selectedUtterance.endTime - selectedUtterance.startTime) * zoomPxPerSec;
                    // Hide if region is scrolled out of view or too narrow
                    if (leftPx + widthPx < 0 || leftPx > (ws?.getWidth() ?? 9999)) return null;
                    const showSpeedSlider = widthPx >= 160;
                    const showLoopBtn = widthPx >= 72;
                    return (
                      <div
                        className="region-action-overlay"
                        style={{ left: Math.max(0, leftPx) }}
                      >
                        {showSpeedSlider && (
                          <div className="segment-speed-control" onPointerDown={(e) => e.stopPropagation()}>
                          <input
                            type="range"
                            className="segment-speed-slider"
                            min={0.25}
                            max={2}
                            step={0.05}
                            value={segmentPlaybackRate}
                            onChange={(e) => {
                              const rate = Number(e.target.value);
                              setSegmentPlaybackRate(rate);
                              // If segment is currently playing, apply immediately
                              const ws = player.instanceRef.current;
                              if (ws && player.isPlaying) {
                                ws.setPlaybackRate(rate);
                              }
                            }}
                            title={tf(locale, 'transcription.wave.segmentSpeed', { rate: segmentPlaybackRate.toFixed(2) })}
                          />
                          <span
                            className={`segment-speed-label${segmentPlaybackRate !== 1 ? ' segment-speed-label-reset' : ''}`}
                            title={segmentPlaybackRate !== 1 ? t(locale, 'transcription.wave.segmentSpeedReset') : t(locale, 'transcription.wave.segmentSpeedNormal')}
                            onClick={() => {
                              setSegmentPlaybackRate(1);
                              const ws = player.instanceRef.current;
                              if (ws && player.isPlaying) {
                                ws.setPlaybackRate(1);
                              }
                            }}
                          >{segmentPlaybackRate === 1 ? '1x' : `${segmentPlaybackRate.toFixed(segmentPlaybackRate % 0.25 === 0 ? 1 : 2)}x`}</span>
                        </div>
                        )}
                        {showLoopBtn && (
                        <button
                          className={`region-action-btn ${segmentLoopPlayback ? 'region-action-btn-active' : ''}`}
                          title={segmentLoopPlayback ? t(locale, 'transcription.wave.loopOn') : t(locale, 'transcription.wave.loopOff')}
                          onPointerDown={(e) => e.stopPropagation()}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (segmentLoopPlayback) {
                              setSegmentLoopPlayback(false);
                              player.stop();
                            } else {
                              setSegmentLoopPlayback(true);
                              const s = subSelectionRange ?? { start: selectedUtterance.startTime, end: selectedUtterance.endTime };
                              player.playRegion(s.start, s.end, true);
                            }
                          }}
                        >
                          <Repeat size={13} />
                        </button>
                        )}
                        <button
                          className="region-action-btn"
                          title={player.isPlaying ? t(locale, 'transcription.wave.stop') : t(locale, 'transcription.wave.play')}
                          onPointerDown={(e) => e.stopPropagation()}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (player.isPlaying) {
                              player.stop();
                            } else {
                              const s = subSelectionRange ?? { start: selectedUtterance.startTime, end: selectedUtterance.endTime };
                              player.playRegion(s.start, s.end, true);
                            }
                          }}
                        >
                          {player.isPlaying ? <Square size={13} /> : <Play size={13} />}
                        </button>
                      </div>
                    );
                  })()}
                </>
              ) : (
                <div className="wave-empty transcription-wave-empty">
                  {!selectedMediaUrl
                    ? t(locale, 'transcription.wave.emptyTextOnly')
                    : t(locale, 'transcription.wave.emptyNoMedia')}
                </div>
              )}
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
              {segMarkStart !== null && (
                <div className="seg-mark-status">
                  ✦ {tf(locale, 'transcription.wave.markingHint', { start: formatTime(segMarkStart) })}
                </div>
              )}
            </div>
            {player.isReady && player.duration > 0 && rulerView && (
              <TimeRuler
                duration={player.duration}
                currentTime={player.currentTime}
                rulerView={rulerView}
                zoomPxPerSec={zoomPxPerSec}
                seekTo={player.seekTo}
                instanceRef={player.instanceRef}
                waveCanvasRef={waveCanvasRef}
                tierContainerRef={tierContainerRef}
              />
            )}
              {showSearch && (
                <SearchReplaceOverlay
                  items={searchableItems}
                  currentLayerId={selectedLayerId || undefined}
                  currentUtteranceId={selectedUtteranceId || undefined}
                  onNavigate={(id) => {
                    manualSelectTsRef.current = Date.now();
                    if (player.isPlaying) {
                      player.stop();
                    }
                    selectUtterance(id);
                  }}
                  onReplace={handleSearchReplace}
                  onClose={() => setShowSearch(false)}
                />
              )}
              <div
                ref={listMainRef}
                className={`transcription-list-main ${isLayerRailCollapsed ? 'transcription-list-main-rail-collapsed' : ''}`}
              >
                <LayerRailSidebar
                  isCollapsed={isLayerRailCollapsed}
                  layerRailTab={layerRailTab}
                  onTabChange={setLayerRailTab}
                  layerRailRows={layerRailRows}
                  focusedLayerRowId={focusedLayerRowId}
                  flashLayerRowId={flashLayerRowId}
                  onFocusLayer={handleFocusLayerRow}
                  transcriptionLayers={transcriptionLayers}
                  translationLayers={translationLayers}
                  layerLinks={layerLinks}
                  toggleLayerLink={toggleLayerLink}
                  deletableLayers={deletableLayers}
                  layerCreateMessage={layerCreateMessage}
                  layerAction={layerAction}
                />
                <div
                  className="transcription-layer-rail-resizer"
                  onPointerDown={handleLayerRailResizeStart}
                  role="separator"
                  aria-orientation="vertical"
                  aria-label={t(locale, 'transcription.panel.resizeLayerRail')}
                />
                <button
                  type="button"
                  className="transcription-layer-rail-toggle"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={handleLayerRailToggle}
                  aria-label={isLayerRailCollapsed
                    ? t(locale, 'transcription.panel.expandLayerRail')
                    : t(locale, 'transcription.panel.collapseLayerRail')}
                >
                  <span className="transcription-panel-toggle-icon" aria-hidden="true">
                    <span
                      className={`transcription-panel-toggle-triangle ${isLayerRailCollapsed ? 'transcription-panel-toggle-triangle-right' : 'transcription-panel-toggle-triangle-left'}`}
                    />
                  </span>
                </button>

                <div
                  className="timeline-scroll"
                  ref={tierContainerRef}
                  onPointerDown={handleLassoPointerDown}
                  onPointerMove={handleLassoPointerMove}
                  onPointerUp={handleLassoPointerUp}
                  onScroll={(e) => {
                    const ws = player.instanceRef.current;
                    if (ws) {
                      ws.setScroll(e.currentTarget.scrollLeft);
                    }
                    setWaveformScrollLeft(e.currentTarget.scrollLeft);
                  }}
                >
                  <TranscriptionEditorContext.Provider value={editorContextValue}>
                  {selectedMediaUrl && player.isReady && player.duration > 0 ? (
                    <TranscriptionTimelineMediaLanes
                      playerDuration={player.duration}
                      zoomPxPerSec={zoomPxPerSec}
                      lassoRect={lassoRect}
                      transcriptionLayers={transcriptionLayers}
                      translationLayers={translationLayers}
                      timelineRenderUtterances={timelineRenderUtterances}
                      flashLayerRowId={flashLayerRowId}
                      defaultTranscriptionLayerId={defaultTranscriptionLayerId}
                      renderAnnotationItem={renderAnnotationItem}
                    />
                  ) : layers.length > 0 ? (
                    <TranscriptionTimelineTextOnly
                      transcriptionLayers={transcriptionLayers}
                      translationLayers={translationLayers}
                      utterancesOnCurrentMedia={utterancesOnCurrentMedia}
                      selectedUtteranceId={selectedUtteranceId}
                      flashLayerRowId={flashLayerRowId}
                      defaultTranscriptionLayerId={defaultTranscriptionLayerId ?? ''}
                      scrollContainerRef={tierContainerRef}
                      handleAnnotationClick={handleAnnotationClick}
                    />
                  ) : (
                    <div className="timeline-empty-state">
                      {layers.length === 0
                        ? t(locale, 'transcription.timeline.empty.noLayer')
                        : selectedMediaUrl
                          ? t(locale, 'transcription.timeline.empty.noUtteranceWithWave')
                          : t(locale, 'transcription.timeline.empty.startWork')}
                    </div>
                  )}
                  </TranscriptionEditorContext.Provider>
                </div>
              </div>
              {timelineResizeTooltip && (
                <div
                  className="timeline-resize-tooltip"
                  style={{ left: timelineResizeTooltip.x, top: timelineResizeTooltip.y - 16 }}
                >
                  {formatTime(timelineResizeTooltip.start)} - {formatTime(timelineResizeTooltip.end)}
                </div>
              )}
              <div className="transcription-list-toolbar transcription-list-toolbar-zoom-only">
                <div className="transcription-list-toolbar-left">
                  <div className="waveform-zoom-bar waveform-zoom-bar-bottom">
                    <button className="icon-btn" onClick={() => zoomToPercent(100, undefined, 'fit-all')} title={t(locale, 'transcription.zoom.fitAll')}>
                      <Maximize2 size={14} />
                    </button>
                    <button
                      className="icon-btn"
                      onClick={() => {
                        const sel = utterancesOnCurrentMedia.find((u) => u.id === selectedUtteranceId);
                        if (sel) zoomToUtterance(sel.startTime, sel.endTime);
                      }}
                      title={t(locale, 'transcription.zoom.fitSelection')}
                      disabled={!selectedUtteranceId}
                    >
                      <Focus size={14} />
                    </button>
                    <button
                      className="icon-btn"
                      onClick={() => zoomToPercent(Math.round((100 / fitPxPerSec) * 100), undefined, 'custom')}
                      title="1:1 (100px/s)"
                    >
                      <span style={{ fontSize: 11, fontWeight: 600 }}>1:1</span>
                    </button>
                    <span style={{ width: 1, height: 14, background: '#d1d5db', margin: '0 2px' }} />
                    <button
                      className={`icon-btn${snapEnabled ? ' icon-btn-active' : ''}`}
                      onClick={() => setSnapEnabled((v) => !v)}
                      title={snapEnabled ? t(locale, 'transcription.zoom.snapOn') : t(locale, 'transcription.zoom.snapOff')}
                    >
                      <span style={{ fontSize: 10, fontWeight: 600 }}>ZC</span>
                    </button>
                    <span style={{ width: 1, height: 14, background: '#d1d5db', margin: '0 2px' }} />
                    <input
                      type="range"
                      className="waveform-zoom-slider"
                      min={0}
                      max={1000}
                      step={1}
                      value={Math.round(Math.log(zoomPercent / 100) / Math.log(maxZoomPercent / 100) * 1000)}
                      onChange={(e) => {
                        const pos = Number(e.target.value);
                        const pct = 100 * Math.pow(maxZoomPercent / 100, pos / 1000);
                        zoomToPercent(pct, undefined, 'custom');
                      }}
                      title={tf(locale, 'transcription.zoom.scale', { percent: zoomPercent })}
                    />
                    <span className="waveform-zoom-value">{zoomPercent}%</span>
                  </div>
                  <span style={{ width: 1, height: 14, background: '#d1d5db', margin: '0 6px', flexShrink: 0 }} />
                  <div className="transcription-ai-observer-status-bar">
                    <span className="transcription-ai-observer-stage-label">
                      {t(locale, 'ai.observer.currentStage')}
                      {(observerResult.stage && (observerResult.stage === 'collecting' ? t(locale, 'ai.stages.collecting')
                        : observerResult.stage === 'transcribing' ? t(locale, 'ai.stages.transcribing')
                        : observerResult.stage === 'glossing' ? t(locale, 'ai.stages.glossing')
                        : observerResult.stage === 'reviewing' ? t(locale, 'ai.stages.reviewing')
                        : t(locale, 'ai.stages.collecting'))) ?? t(locale, 'ai.stages.collecting')}
                    </span>
                    {actionableObserverRecommendations && actionableObserverRecommendations.length > 0 && (
                      <div className="transcription-ai-observer-recs-inline">
                        {actionableObserverRecommendations.map((item) => (
                          <button
                            key={item.id}
                            type="button"
                            className="transcription-ai-observer-rec-btn"
                            onClick={() => handleExecuteRecommendation(item)}
                            title={item.detail}
                          >
                            {item.actionLabel ?? item.title}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <div className="transcription-list-toolbar-right">
                  {canUndo && undoLabel && (
                    <>
                      <button
                        type="button"
                        className="transcription-undo-chip"
                        title={tf(locale, 'transcription.undo.next', { label: undoLabel })}
                        onClick={() => setShowUndoHistory((v) => !v)}
                      >
                        <Undo2 size={13} />
                        <span className="transcription-undo-chip-label">{tf(locale, 'transcription.undo.current', { label: undoLabel })}</span>
                      </button>
                      {showUndoHistory && (
                        <div className="transcription-undo-history">
                          <div className="transcription-undo-history-title">{t(locale, 'transcription.undo.historyTitle')}</div>
                          {undoHistory.map((label, idx) => (
                            <button
                              key={`${label}-${idx}`}
                              type="button"
                              className="transcription-undo-history-item"
                              onClick={() => {
                                fireAndForget(undoToHistoryIndex(idx));
                                setShowUndoHistory(false);
                              }}
                              title={tf(locale, 'transcription.undo.jumpTo', { label })}
                            >
                              {idx + 1}. {label}
                            </button>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            </section>

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

            <AiPanelContext.Provider value={aiPanelContextValue}>
              <AiAssistantHubContext.Provider value={aiAssistantHubContextValue}>
                <aside className={`transcription-ai-panel ${isAiPanelCollapsed ? 'transcription-ai-panel-collapsed' : ''}`}>
                  <div className="transcription-hub-sidebar-tabs" role="tablist">
                    <button
                      type="button"
                      role="tab"
                      aria-selected={hubSidebarTab === 'assistant'}
                      className={`transcription-hub-sidebar-tab ${hubSidebarTab === 'assistant' ? 'is-active' : ''}`}
                      onClick={() => setHubSidebarTab('assistant')}
                    >
                      {locale === 'zh-CN' ? '助手' : 'Assistant'}
                    </button>
                    <button
                      type="button"
                      role="tab"
                      aria-selected={hubSidebarTab === 'analysis'}
                      className={`transcription-hub-sidebar-tab ${hubSidebarTab === 'analysis' ? 'is-active' : ''}`}
                      onClick={() => setHubSidebarTab('analysis')}
                    >
                      {locale === 'zh-CN' ? 'AI 分析' : 'AI Analysis'}
                    </button>
                  </div>

                  {hubSidebarTab === 'assistant' ? (
                    <div className="transcription-hub-assistant-panel">
                      <div className="transcription-hub-assistant-chat-section">
                        <AiChatCard
                          embedded
                          voiceDrawer={featureFlags.voiceAgentEnabled ? (
                            <VoiceAgentWidget
                              listening={voiceAgent.listening}
                              speechActive={voiceAgent.speechActive}
                              mode={voiceAgent.mode}
                              interimText={voiceAgent.interimText}
                              finalText={voiceAgent.finalText}
                              confidence={voiceAgent.confidence}
                              error={voiceAgent.error}
                              lastIntent={voiceAgent.lastIntent}
                              pendingConfirm={voiceAgent.pendingConfirm}
                              safeMode={voiceAgent.safeMode}
                              wakeWordEnabled={voiceAgent.wakeWordEnabled}
                              wakeWordEnergyLevel={voiceAgent.wakeWordEnergyLevel}
                              corpusLang={effectiveVoiceCorpusLang}
                              langOverride={voiceCorpusLangOverride}
                              detectedLang={voiceAgent.detectedLang}
                              engine={voiceAgent.engine}
                              isRecording={voiceAgent.isRecording}
                              energyLevel={voiceAgent.energyLevel}
                              agentState={voiceAgent.agentState}
                              recordingDuration={voiceAgent.recordingDuration}
                              session={voiceAgent.session}
                              commercialProviderKind={voiceAgent.commercialProviderKind}
                              commercialProviderConfig={voiceAgent.commercialProviderConfig}
                              targetSummary={voiceTargetSummary}
                              statusSummary={voiceStatusSummary}
                              environmentSummary={voiceEnvironmentSummary}
                              selectionSummary={voiceSelectionSummary}
                              onToggle={handleVoiceAssistantIconClick}
                              onMicPointerDown={handleMicPointerDown}
                              onMicPointerUp={handleMicPointerUp}
                              onSwitchMode={voiceAgent.switchMode}
                              onSwitchEngine={handleVoiceSwitchEngine}
                              onConfirm={voiceAgent.confirmPending}
                              onCancel={voiceAgent.cancelPending}
                              onSetSafeMode={voiceAgent.setSafeMode}
                              onSetWakeWordEnabled={voiceAgent.setWakeWordEnabled}
                              onSetLangOverride={handleVoiceSetLangOverride}
                              onSetCommercialProviderKind={voiceAgent.setCommercialProviderKind}
                              onCommercialConfigChange={handleVoiceCommercialConfigChange}
                              onTestCommercialProvider={voiceAgent.testCommercialProvider}
                            />
                          ) : undefined}
                          voiceEntry={featureFlags.voiceAgentEnabled ? {
                            enabled: true,
                            expanded: assistantVoiceExpanded,
                            listening: voiceAgent.listening,
                            statusText: voiceAgent.listening
                              ? (locale === 'zh-CN' ? '监听中' : 'Listening')
                              : (locale === 'zh-CN' ? '待命' : 'Standby'),
                            onTogglePanel: handleAssistantVoicePanelToggle,
                          } : undefined}
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="transcription-hub-sidebar-panel-body">
                      <AiAnalysisPanel isCollapsed={false} activeTab={analysisTab} onChangeActiveTab={setAnalysisTab} />
                    </div>
                  )}
                </aside>
              </AiAssistantHubContext.Provider>
            </AiPanelContext.Provider>
          </main>

          <PdfPreviewSection
            locale={locale}
            pdfPreview={pdfPreview}
            pdfPreviewDragging={pdfPreviewDragging}
            pdfPreviewPos={pdfPreviewPos}
            pdfPreviewRef={pdfPreviewRef}
            onDragStart={handlePdfPreviewDragStart}
            onChangePage={handlePdfPreviewPageChange}
            onOpenExternal={handlePdfPreviewOpenExternal}
            onClose={handleClosePdfPreview}
          />

          <div className="transcription-toast-container">
            {saveState.kind === 'saving' && <div className="transcription-toast transcription-toast-info">{t(locale, 'transcription.toast.saving')}</div>}
            {saveState.kind === 'done' && <div className="transcription-toast transcription-toast-success">{saveState.message}</div>}
            {saveState.kind === 'error' && <div className="transcription-toast transcription-toast-error">{saveState.message}</div>}
            {recording && (
              <div className="transcription-toast transcription-toast-recording">{tf(locale, 'transcription.toast.recording', { id: recordingUtteranceId ?? t(locale, 'transcription.toast.recordingUnknownRow') })}</div>
            )}
            {recordingError && <div className="transcription-toast transcription-toast-error">{recordingError}</div>}
          </div>

          <ProjectSetupDialog
            isOpen={showProjectSetup}
            onClose={() => setShowProjectSetup(false)}
            onSubmit={async (input) => {
              const result = await LinguisticService.createProject(input);
              setActiveTextId(result.textId);
              setSaveState({ kind: 'done', message: tf(locale, 'transcription.action.projectCreated', { title: input.titleZh }) });
              setShowAudioImport(true);
              await loadSnapshot();
            }}
          />

          <AudioImportDialog
            isOpen={showAudioImport}
            onClose={() => setShowAudioImport(false)}
            onImport={async (file, duration) => {
              let textId = activeTextId ?? (await getActiveTextId());
              if (!textId) {
                // 无项目时自动创建默认项目
                const baseName = file.name.replace(/\.[^.]+$/, '');
                const result = await LinguisticService.createProject({
                  titleZh: baseName,
                  titleEn: baseName,
                  primaryLanguageId: 'und',
                });
                textId = result.textId;
                setActiveTextId(textId);
              }
              const blob = new Blob([await file.arrayBuffer()], { type: file.type });
              const { mediaId } = await LinguisticService.importAudio({
                textId,
                audioBlob: blob,
                filename: file.name,
                duration,
              });
              addMediaItem({
                id: mediaId,
                textId,
                filename: file.name,
                duration,
                details: { audioBlob: blob },
                isOfflineCached: true,
                createdAt: new Date().toISOString(),
              } as import('../../db').MediaItemDocType);
              setSaveState({ kind: 'done', message: tf(locale, 'transcription.action.audioImported', { filename: file.name }) });
            }}
          />

          {showBatchOperationPanel && (
            <BatchOperationPanel
              selectedCount={selectedUtteranceIds.size}
              selectedUtterances={selectedBatchUtterances}
              allUtterancesOnMedia={utterancesOnCurrentMedia}
              utteranceTextById={selectedBatchUtteranceTextById}
              previewLayerOptions={batchPreviewLayerOptions}
              previewTextByLayerId={batchPreviewTextByLayerId}
              {...(defaultBatchPreviewLayerId ? { defaultPreviewLayerId: defaultBatchPreviewLayerId } : {})}
              onClose={() => setShowBatchOperationPanel(false)}
              onOffset={async (deltaSec) => {
                await offsetSelectedTimes(selectedUtteranceIds, deltaSec);
              }}
              onScale={async (factor, anchorTime) => {
                await scaleSelectedTimes(selectedUtteranceIds, factor, anchorTime);
              }}
              onSplitByRegex={async (pattern, flags) => {
                await splitByRegex(selectedUtteranceIds, pattern, flags);
              }}
              onMerge={async () => {
                await mergeSelectedUtterances(selectedUtteranceIds);
              }}
              onJumpToUtterance={(id) => {
                setSelectedUtteranceId(id);
              }}
            />
          )}
        </>
      )}
      <TranscriptionOverlays
        ctxMenu={ctxMenu}
        onCloseCtxMenu={() => setCtxMenu(null)}
        uttOpsMenu={uttOpsMenu}
        onCloseUttOpsMenu={() => setUttOpsMenu(null)}
        selectedUtteranceId={selectedUtteranceId}
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
      />
    </section>
  );
}
