import { AiAssistantHubContext } from '../contexts/AiAssistantHubContext';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Merge as _Merge,
  Pause as _Pause,
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
import { WaveformOverviewBar } from '../components/WaveformOverviewBar';
import { ShortcutsPanel } from '../components/ShortcutsPanel';
import { LayerRailSidebar } from '../components/LayerRailSidebar';
import { TranscriptionToolbarActions } from '../components/TranscriptionToolbarActions';
import { TranscriptionOverlays } from '../components/TranscriptionOverlays';
import { TranscriptionTimelineTextOnly } from '../components/TranscriptionTimelineTextOnly';
import { TranscriptionTimelineMediaLanes } from '../components/TranscriptionTimelineMediaLanes';
import {
  TimelineHeaderSection,
  TimelineRailSection,
  TimelineScrollSection,
  VideoPreviewSection,
} from '../components/transcription/TranscriptionTimelineSections';
import type { VideoLayoutMode } from '../components/transcription/TranscriptionTimelineSections';
import { RecoveryBanner } from '../components/RecoveryBanner';
import { PdfPreviewSection } from '../components/PdfPreviewSection';
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
import { SpeakerAssignPanel } from '../components/transcription/SpeakerAssignPanel';
import { LinguisticService } from '../../services/LinguisticService';
import { db as appDb, getDb, type JieyuDatabase, type UtteranceDocType } from '../../db';
import { TranscriptionEditorContext } from '../contexts/TranscriptionEditorContext';
import { useAiPanelContextUpdater, AiPanelContext } from '../contexts/AiPanelContext';
import { ToastProvider, useToast } from '../contexts/ToastContext';
import { snapToZeroCrossing } from '../services/AudioAnalysisService';
import { useTranscriptionData } from '../hooks/useTranscriptionData';
import { useRecording } from '../hooks/useRecording';
import { useUtteranceOps } from '../hooks/useUtteranceOps';
import { useLasso, type SubSelectDrag } from '../hooks/useLasso';
import { useWaveSurfer } from '../hooks/useWaveSurfer';
import { useZoom } from '../hooks/useZoom';
import { useKeybindingActions } from '../hooks/useKeybindingActions';
import { useJKLShuttle } from '../hooks/useJKLShuttle';
import { useAiChat, type AiChatToolCall, type AiToolRiskCheckResult } from '../hooks/useAiChat';
import { useVoiceInteraction } from '../hooks/useVoiceInteraction';
import { featureFlags } from '../ai/config/featureFlags';
import { DEFAULT_VOICE_INTENT_RESOLVER_CONFIG } from '../ai/config/voiceIntentResolver';
import { resolveVoiceIntentWithLlmUsingConfig } from '../services/VoiceIntentLlmResolver';
import { useImportExport } from '../hooks/useImportExport';
import { useLayerActionPanel } from '../hooks/useLayerActionPanel';
import { useAiPanelLogic, taskToPersona } from '../hooks/useAiPanelLogic';
import { useNoteHandlers } from '../hooks/useNoteHandlers';
import { useTimelineAnnotationHelpers } from '../hooks/useTimelineAnnotationHelpers';
import { useAiToolCallHandler } from '../hooks/useAiToolCallHandler';
import { resolveLanguageQuery, SUPPORTED_VOICE_LANGS } from '../utils/langMapping';
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
import { useSpeakerManagement, getUtteranceSpeakerKey } from '../hooks/useSpeakerManagement';
import { DEFAULT_TIMELINE_LANE_HEIGHT } from '../hooks/useTimelineLaneHeightResize';
import type { AiObserverRecommendation } from '../components/transcription/toolbar/ObserverStatus';
import { detectLocale, t, tf } from '../i18n';
import { fireAndForget } from '../utils/fireAndForget';
import { formatLayerRailLabel, formatTime } from '../utils/transcriptionFormatters';
import { EmbeddingService } from '../ai/embeddings/EmbeddingService';
import { EmbeddingSearchService } from '../ai/embeddings/EmbeddingSearchService';
import { createEmbeddingProvider, testEmbeddingProvider } from '../ai/embeddings/EmbeddingProviderCatalog';
import type { EmbeddingProviderKind } from '../ai/embeddings/EmbeddingProvider';
import { getGlobalTaskRunner } from '../ai/tasks/taskRunnerSingleton';
import { extractUtteranceIdFromNote, getPdfPageFromHash, isDirectPdfCitationRef, splitPdfCitationRef } from '../utils/citationJumpUtils';

// ─── Storage keys ─────────────────────────────────────────────────────────────

const EMBEDDING_PROVIDER_STORAGE_KEY = 'jieyu.embeddingProvider';
// ─── Persistence helpers ───────────────────────────────────────────────────────

// ── ToastController — bridges TranscriptionPage state to ToastProvider ─────────────

interface ToastControllerProps {
  /** Subset of useVoiceAgent return value needed for toast routing */
  voiceAgent: {
    agentState: string;
    mode: string;
    listening: boolean;
    isRecording: boolean;
  };
  saveState: { kind: string; message?: string };
  recording: boolean;
  recordingUtteranceId: string | null;
  recordingError: string | null;
  /** i18n function for recording toast message */
  tf: (key: string, opts?: Record<string, unknown>) => string;
}

function ToastController({
  voiceAgent,
  saveState,
  recording,
  recordingUtteranceId,
  recordingError,
  tf,
}: ToastControllerProps) {
  const { showToast, showSaveState, showVoiceState } = useToast();

  // SaveState changes → toast
  useEffect(() => {
    showSaveState(saveState as Parameters<typeof showSaveState>[0]);
  }, [saveState, showSaveState]);

  // Recording error → error toast
  useEffect(() => {
    if (recordingError) {
      showToast(recordingError, 'error', 0);
    }
  }, [recordingError, showToast]);

  // Recording active → persistent recording toast
  useEffect(() => {
    if (recording) {
      showToast(
        tf('transcription.toast.recording', {
          id: recordingUtteranceId ?? tf('transcription.toast.recordingUnknownRow'),
        }),
        'recording',
        0,
      );
    }
  }, [recording, recordingUtteranceId, showToast, tf]);

  // Voice agent state → toast
  useEffect(() => {
    if (voiceAgent.listening || voiceAgent.agentState !== 'idle') {
      showVoiceState(
        voiceAgent.agentState as Parameters<typeof showVoiceState>[0],
        voiceAgent.listening,
      );
    } else {
      showVoiceState(null);
    }
  }, [voiceAgent.agentState, voiceAgent.listening, showVoiceState]);

  // TaskRunner stale task recovery → alert toast
  useEffect(() => {
    const handler = (e: Event) => {
      const count = (e as CustomEvent<{ count: number }>).detail?.count ?? 0;
      if (count > 0) {
        showToast(`已自动清理 ${count} 个过期任务`, 'info');
      }
    };
    window.addEventListener('taskrunner:stale-recovered', handler);
    return () => window.removeEventListener('taskrunner:stale-recovered', handler);
  }, [showToast]);

  // This component renders nothing — it only manages side-effects via the toast context.
  return null;
}

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
  /** Pre-bound tf for components that need (key, params) without locale */
  const tfB = (key: string, opts?: Record<string, unknown>) => tf(locale, key as Parameters<typeof tf>[1], opts as Parameters<typeof tf>[2]);
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
    selectedMediaIsVideo,
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
    reorderLayers,
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
    updateTokenGloss,
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

  // Pre-declare executeActionRef before useAiToolCallHandler; populated after useKeybindingActions.
  const executeActionRef = useRef<((actionId: string) => void) | undefined>(undefined);

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
    splitUtterance,
    deleteUtterance,
    deleteLayer,
    toggleLayerLink,
    saveUtteranceText,
    saveTextTranslationForUtterance,
    updateTokenPos,
    batchUpdateTokenPosByForm,
    updateTokenGloss,
    ...(executeActionRef.current ? { executeAction: executeActionRef.current } : {}),
    getSegments: () => utterancesOnCurrentMedia,
    navigateTo: selectUtterance,
  });

  const buildAiPromptContext = useCallback(() => {
    const selectedText = selectedUtterance ? getUtteranceTextForLayer(selectedUtterance) : '';
    const selectionTimeRange = selectedUtterance
      ? `${formatTime(selectedUtterance.startTime)}-${formatTime(selectedUtterance.endTime)}`
      : undefined;
    const selectedLayer = layers.find((layer) => layer.id === selectedLayerId)
      ?? translationLayers.find((layer) => layer.id === selectedLayerId)
      ?? null;
    const selectedLayerType: 'transcription' | 'translation' | undefined = selectedLayer
      ? (selectedLayer.layerType === 'translation' ? 'translation' : 'transcription')
      : undefined;
    const selectedTranslationLayerId = selectedLayerType === 'translation'
      ? selectedLayer?.id
      : undefined;
    const selectedTranscriptionLayerId = selectedLayerType === 'transcription'
      ? selectedLayer?.id
      : undefined;

    return {
      shortTerm: {
        page: 'transcription',
        ...(selectedUtterance?.id ? { selectedUtteranceId: selectedUtterance.id } : {}),
        ...(selectedUtterance ? { selectedUtteranceStartSec: selectedUtterance.startTime, selectedUtteranceEndSec: selectedUtterance.endTime } : {}),
        ...(selectedLayer?.id ? { selectedLayerId: selectedLayer.id } : {}),
        ...(selectedLayerType ? { selectedLayerType } : {}),
        ...(selectedTranslationLayerId ? { selectedTranslationLayerId } : {}),
        ...(selectedTranscriptionLayerId ? { selectedTranscriptionLayerId } : {}),
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
  }, [aiConfidenceAvg, formatTime, getUtteranceTextForLayer, layers, selectedLayerId, selectedUtterance, state, translationLayers, undoHistory, utterances.length]);

  const handleAiToolRiskCheck = useCallback((call: AiChatToolCall): AiToolRiskCheckResult | null => {
    // ── delete_layer 层存在性预检 | Pre-check layer existence for delete_layer ──
    if (call.name === 'delete_layer') {
      const layerId = String(call.arguments.layerId ?? '').trim();
      if (layerId) {
        // 精确 ID 匹配 | Exact ID match
        const exists = transcriptionLayers.some((l) => l.id === layerId)
          || translationLayers.some((l) => l.id === layerId);
        if (!exists) {
          return { requiresConfirmation: false, riskSummary: `未找到目标层：${layerId}`, impactPreview: [] };
        }
      } else {
        // layerType + languageQuery 模糊匹配 | Fuzzy match by layerType + languageQuery
        const layerType = String(call.arguments.layerType ?? '').trim().toLowerCase();
        const languageQuery = String(call.arguments.languageQuery ?? '').trim();
        if (layerType && languageQuery) {
          const pool = layerType === 'translation' ? translationLayers
            : layerType === 'transcription' ? transcriptionLayers : [];
          const code = resolveLanguageQuery(languageQuery);
          // 尝试用 ISO 639-3 code 和原始查询匹配层字段 | Try matching layer fields with ISO code and raw query
          const matchTokens = [languageQuery.toLowerCase(), ...(code ? [code] : [])];
          const entry = code ? SUPPORTED_VOICE_LANGS.flatMap((g) => g.langs).find((l) => l.code === code) : undefined;
          if (entry) entry.label.split(/\s*\/\s*/).forEach((p) => matchTokens.push(p.trim().toLowerCase()));
          const matched = pool.filter((layer) => {
            const fields = [layer.languageId, layer.key, layer.name.zho, layer.name.eng]
              .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
              .map((v) => v.trim().toLowerCase());
            return matchTokens.some((t) => fields.some((f) => f.includes(t) || t.includes(f)));
          });
          if (matched.length === 0) {
            return { requiresConfirmation: false, riskSummary: `未找到匹配“${languageQuery}”的${layerType === 'translation' ? '翻译' : '转写'}层`, impactPreview: [] };
          }
          if (matched.length > 1) {
            return { requiresConfirmation: false, riskSummary: `匹配到多个${layerType === 'translation' ? '翻译' : '转写'}层，请改用 layerId 精确指定。`, impactPreview: [] };
          }
        }
      }
      return null; // 继续默认确认流程 | Continue default confirmation flow
    }

    if (call.name !== 'delete_transcription_segment') return null;

    const utteranceId = String(call.arguments.utteranceId ?? '').trim();
    if (!utteranceId) return null;

    const targetUtterance = utterances.find((item) => item.id === utteranceId);
    if (!targetUtterance) return null;

    const sortedByTime = [...utterances].sort((a, b) => a.startTime - b.startTime);
    const rowIndex = Math.max(0, sortedByTime.findIndex((item) => item.id === utteranceId)) + 1;
    const timeRange = `${formatTime(targetUtterance.startTime)}-${formatTime(targetUtterance.endTime)}`;

    const transcriptionText = getUtteranceTextForLayer(targetUtterance).trim();
    const transcriptionPreview = transcriptionText.length > 0
      ? (transcriptionText.length > 18 ? `${transcriptionText.slice(0, 18)}...` : transcriptionText)
      : '（无转写文本）';
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
      riskSummary: `将删除第 ${rowIndex} 条句段（${timeRange}）`,
      impactPreview: [
        `内容预览：${transcriptionPreview}`,
        `关联影响：${translationLayerCountWithText} 个翻译层包含文本，删除后会失去关联`,
        '可通过撤销（Undo）恢复',
      ],
    };
  }, [formatTime, getUtteranceTextForLayer, transcriptionLayers, translationLayers, translations, utterances]);

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
    const resolved = await resolveVoiceIntentWithLlmUsingConfig({
      transcript: text,
      mode,
      settings: aiChat.settings,
      recentContext: session.entries
        .slice(-4)
        .map((entry) => `[${entry.intent.type}] ${entry.sttText}`),
    }, voiceIntentResolverConfig);
    if (resolved.ok) {
      return resolved.intent;
    }
    throw new Error(resolved.message);
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
  const [isTimelineLaneHeaderCollapsed, setIsTimelineLaneHeaderCollapsed] = useState(false);
  const [showAllLayerConnectors, setShowAllLayerConnectors] = useState(false);
  const [timelineLaneHeights, setTimelineLaneHeights] = useState<Record<string, number>>(() => {
    try {
      const stored = localStorage.getItem('jieyu:lane-heights');
      if (stored) { const parsed: unknown = JSON.parse(stored); if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as Record<string, number>; }
    } catch {}
    return {};
  });
  const [waveformHeight, setWaveformHeight] = useState<number>(() => {
    try {
      const stored = localStorage.getItem('jieyu:waveform-height');
      if (stored) return Math.min(Math.max(Number(stored), 80), 400);
    } catch {}
    return 180;
  });
  const waveformResizeRef = useRef<{ startY: number; startHeight: number; startAmplitude: number } | null>(null);
  const [isResizingWaveform, setIsResizingWaveform] = useState(false);
  /** 视频预览面板高度（可拖动调整）| Video preview panel height (drag-resizable) */
  const [videoPreviewHeight, setVideoPreviewHeight] = useState<number>(() => {
    try {
      const stored = localStorage.getItem('jieyu:video-preview-height');
      if (stored) return Math.min(Math.max(Number(stored), 120), 600);
    } catch {}
    return 220;
  });
  const videoPreviewResizeRef = useRef<{ startY: number; startHeight: number } | null>(null);
  const [isResizingVideoPreview, setIsResizingVideoPreview] = useState(false);
  const videoRightPanelResizeRef = useRef<{ startX: number; startWidth: number; factor: number } | null>(null);
  const [isResizingVideoRightPanel, setIsResizingVideoRightPanel] = useState(false);
  const [videoRightPanelWidth, setVideoRightPanelWidth] = useState<number>(() => {
    try {
      const stored = localStorage.getItem('jieyu:video-right-panel-width');
      if (stored) return Math.min(Math.max(Number(stored), 260), 720);
    } catch {}
    return 360;
  });
  /** 视频布局模式（上方/右侧/左侧），持久化到 localStorage | Video layout mode (top/right/left), persisted to localStorage */
  const [videoLayoutMode, setVideoLayoutMode] = useState<VideoLayoutMode>(() => {
    try {
      const stored = localStorage.getItem('jieyu:video-layout-mode');
      return (stored === 'right' || stored === 'left') ? stored as VideoLayoutMode : 'top';
    } catch {
      return 'top';
    }
  });
  /** 波形增益倍率 | Waveform amplitude scale via barHeight, persisted to localStorage */
  const [amplitudeScale, setAmplitudeScale] = useState<number>(() => {
    try {
      const stored = localStorage.getItem('jieyu:amplitude-scale');
      if (stored) return Math.min(Math.max(Number(stored), 0.25), 4);
    } catch {}
    return 1;
  });
  /** 播放时自动滚动到当前语段 | Auto-scroll timeline rows to playhead during playback */
  const [autoScrollEnabled, setAutoScrollEnabled] = useState(true);
  /** 清洁标注模式开关 | Focus / Clean annotation mode */
  const [isFocusMode, setIsFocusMode] = useState(false);
  /** 快捷键面板开关 | Keyboard shortcuts panel visibility */
  const [showShortcuts, setShowShortcuts] = useState(false);
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
    onMergeTargetMissing: () => {
      setSaveState({ kind: 'error', message: '请先选择一个句段再执行合并' });
    },
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
    waveformHeight,
    amplitudeScale,
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
  useEffect(() => {
    if (player.duration > 0 && player.duration !== lastDurationRef.current) {
      lastDurationRef.current = player.duration;
    }
  }, [player.duration]);

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

  const handleExecuteObserverRecommendation = useCallback((item: AiObserverRecommendation) => {
    const match = actionableObserverRecommendations.find((candidate) => candidate.id === item.id);
    if (!match) return;
    fireAndForget(handleExecuteRecommendation(match));
  }, [actionableObserverRecommendations, handleExecuteRecommendation]);

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

  // JKL shuttle — global broadcast-standard playback control + frame stepping
  useJKLShuttle(player);

  // Wire executeActionRef so useAiToolCallHandler (called earlier) can access executeAction.
  executeActionRef.current = executeAction;

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

  const {
    voiceAgent,
    assistantVoiceExpanded,
    voiceTargetSummary,
    voiceStatusSummary,
    voiceEnvironmentSummary,
    voiceSelectionSummary,
    handleVoiceCommercialConfigChange,
    handleVoiceAssistantIconClick,
    handleVoiceSwitchEngine,
    handleMicPointerDown,
    handleMicPointerUp,
    handleAssistantVoicePanelToggle,
  } = useVoiceInteraction({
    effectiveVoiceCorpusLang,
    voiceCorpusLangOverride,
    executeAction,
    handleResolveVoiceIntentWithLlm,
    handleVoiceDictation,
    onVoiceAnalysisResult: handleVoiceAnalysisResult,
    selectedUtteranceId: selectedUtterance?.id ?? null,
    selectedUtterance: selectedUtterance ?? null,
    selectedRowMeta,
    selectedLayerId,
    ...(defaultTranscriptionLayerId !== undefined ? { defaultTranscriptionLayerId } : {}),
    translationLayers,
    layers,
    formatLayerRailLabel,
    formatTime,
    aiChatSend: aiChat.send,
    aiIsStreaming: aiChat.isStreaming,
    aiMessages: aiChat.messages,
    localWhisperConfig,
    commercialProviderKind,
    commercialProviderConfig,
    onCommercialConfigChange: handleCommercialConfigChange,
    setCommercialProviderKind,
    setCommercialProviderConfig,
    featureVoiceEnabled: featureFlags.voiceAgentEnabled,
    toggleVoiceRef,
  });

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
    aiTaskSession: aiChat.taskSession,
    aiInteractionMetrics: aiChat.metrics,
    aiSessionMemory: aiChat.sessionMemory,
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
    if (!autoScrollEnabled) return;
    if (!selectedUtterance) return;
    const row = utteranceRowRef.current[selectedUtterance.id];
    row?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [autoScrollEnabled, selectedUtterance?.id]);

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

  // 清洁标注模式快捷键：Cmd+Shift+F 切换，Escape 退出 | Focus mode: Mod+Shift+F to toggle, Escape to exit
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const hasMod = event.metaKey || event.ctrlKey;
      if (hasMod && event.shiftKey && !event.altKey && event.key.toLowerCase() === 'f') {
        // Only if Cmd+F search is not intended (search is just Cmd+F, not Cmd+Shift+F)
        event.preventDefault();
        setIsFocusMode((prev) => !prev);
        return;
      }
      if (event.key === 'Escape') {
        // Exit focus mode on Escape regardless of focus target
        setIsFocusMode((prev) => { if (prev) { event.preventDefault(); return false; } return prev; });
      }
      if (event.key === '?' && !event.ctrlKey && !event.metaKey) {
        const target = event.target as HTMLElement | null;
        if (!target || (target.tagName !== 'INPUT' && target.tagName !== 'TEXTAREA' && !target.isContentEditable)) {
          event.preventDefault();
          setShowShortcuts((prev) => !prev);
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    const layerIds = new Set(layers.map((layer) => layer.id));
    setTimelineLaneHeights((prev) => {
      const next = Object.fromEntries(
        Object.entries(prev).filter(([layerId]) => layerIds.has(layerId)),
      );
      return Object.keys(next).length === Object.keys(prev).length ? prev : next;
    });
  }, [layers]);

  const handleTimelineLaneHeightChange = useCallback((layerId: string, nextHeight: number) => {
    setTimelineLaneHeights((prev) => {
      if (nextHeight === DEFAULT_TIMELINE_LANE_HEIGHT) {
        if (!(layerId in prev)) return prev;
        const next = { ...prev };
        delete next[layerId];
        return next;
      }
      if (prev[layerId] === nextHeight) return prev;
      return { ...prev, [layerId]: nextHeight };
    });
  }, []);

  // 持久化层高到 localStorage | Persist lane heights to localStorage
  useEffect(() => {
    try { localStorage.setItem('jieyu:lane-heights', JSON.stringify(timelineLaneHeights)); } catch {}
  }, [timelineLaneHeights]);

  // 持久化波形高度到 localStorage | Persist waveform height to localStorage
  useEffect(() => {
    try { localStorage.setItem('jieyu:waveform-height', String(waveformHeight)); } catch {}
  }, [waveformHeight]);

  // 持久化增益倍率到 localStorage | Persist amplitude scale to localStorage
  useEffect(() => {
    try { localStorage.setItem('jieyu:amplitude-scale', String(amplitudeScale)); } catch {}
  }, [amplitudeScale]);

  // 波形区域高度拖拽调整 | Waveform area height resize via drag
  useEffect(() => {
    if (!isResizingWaveform) return;
    const handleMove = (e: PointerEvent): void => {
      const drag = waveformResizeRef.current;
      if (!drag) return;
      const nextHeight = Math.min(Math.max(Math.round(drag.startHeight + e.clientY - drag.startY), 80), 400);
      setWaveformHeight(nextHeight);

      // 任意媒体模式下拖动同调幅度倍率 | In both video and audio modes, drag also updates amplitude scale.
      if (drag.startHeight > 0) {
        const ratio = nextHeight / drag.startHeight;
        const nextAmplitude = Math.min(
          Math.max(Number((drag.startAmplitude * ratio).toFixed(2)), 0.25),
          4,
        );
        setAmplitudeScale(nextAmplitude);
      }
    };
    const stop = (): void => {
      waveformResizeRef.current = null;
      setIsResizingWaveform(false);
    };
    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', stop);
    window.addEventListener('pointercancel', stop);
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'ns-resize';
    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', stop);
      window.removeEventListener('pointercancel', stop);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };
  }, [isResizingWaveform]);

  // 视频预览面板高度拖拽调整 | Video preview height resize via drag
  useEffect(() => {
    if (!isResizingVideoPreview) return;
    const handleMove = (e: PointerEvent): void => {
      const drag = videoPreviewResizeRef.current;
      if (!drag) return;
      const next = Math.min(Math.max(Math.round(drag.startHeight + e.clientY - drag.startY), 120), 600);
      setVideoPreviewHeight(next);
    };
    const stop = (): void => {
      videoPreviewResizeRef.current = null;
      setIsResizingVideoPreview(false);
    };
    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', stop);
    window.addEventListener('pointercancel', stop);
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'ns-resize';
    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', stop);
      window.removeEventListener('pointercancel', stop);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };
  }, [isResizingVideoPreview]);

  // 右侧/左侧视频面板宽度拖拽调整 | Side video panel width resize via drag
  useEffect(() => {
    if (!isResizingVideoRightPanel) return;
    const handleMove = (e: PointerEvent): void => {
      const drag = videoRightPanelResizeRef.current;
      if (!drag) return;
      // factor=1: 右侧（向左拉大）; factor=-1: 左侧（向右拉大）
      // factor=1: right layout (drag left = bigger); factor=-1: left layout (drag right = bigger)
      const next = Math.min(Math.max(Math.round(drag.startWidth + drag.factor * (drag.startX - e.clientX)), 260), 720);
      setVideoRightPanelWidth(next);
    };
    const stop = (): void => {
      videoRightPanelResizeRef.current = null;
      setIsResizingVideoRightPanel(false);
    };
    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', stop);
    window.addEventListener('pointercancel', stop);
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'ew-resize';
    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', stop);
      window.removeEventListener('pointercancel', stop);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };
  }, [isResizingVideoRightPanel]);

  // 切换到非侧边布局时，强制结束拖拽状态，避免游标残留 | Force-stop side resize state when leaving side layout to avoid cursor residue
  useEffect(() => {
    if (videoLayoutMode === 'right' || videoLayoutMode === 'left') return;
    videoRightPanelResizeRef.current = null;
    setIsResizingVideoRightPanel(false);
  }, [videoLayoutMode]);

  // Persist video preview height to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('jieyu:video-preview-height', String(videoPreviewHeight));
    } catch {}
  }, [videoPreviewHeight]);

  useEffect(() => {
    try {
      localStorage.setItem('jieyu:video-layout-mode', videoLayoutMode);
    } catch {}
  }, [videoLayoutMode]);

  useEffect(() => {
    try {
      localStorage.setItem('jieyu:video-right-panel-width', String(videoRightPanelWidth));
    } catch {}
  }, [videoRightPanelWidth]);

    const selectedBatchUtterances = useMemo(
        () => utterancesOnCurrentMedia
            .filter((utt) => selectedUtteranceIds.has(utt.id))
            .sort((a, b) => a.startTime - b.startTime),
        [selectedUtteranceIds, utterancesOnCurrentMedia],
    );

    const {
        speakerOptions,
        speakerDraftName,
        setSpeakerDraftName,
        batchSpeakerId,
        setBatchSpeakerId,
        speakerSaving,
        activeSpeakerFilterKey,
        setActiveSpeakerFilterKey,
        speakerVisualByUtteranceId,
        speakerFilterOptions,
        selectedSpeakerSummary,
        handleSelectSpeakerUtterances,
        handleClearSpeakerAssignments,
        handleExportSpeakerSegments,
        handleRenameSpeaker,
        handleMergeSpeaker,
        handleAssignSpeakerToSelected,
        handleCreateSpeakerAndAssign,
    } = useSpeakerManagement({
        utterancesOnCurrentMedia,
        selectedUtteranceId,
        selectedUtteranceIds,
        selectedBatchUtterances,
        isReady: state.phase === 'ready',
        setUtteranceSelection,
        data,
        loadSnapshot,
        setSaveState,
        getUtteranceTextForLayer,
        formatTime,
    });

    const filteredUtterancesOnCurrentMedia = useMemo(() => {
        if (activeSpeakerFilterKey === 'all') return utterancesOnCurrentMedia;
        return utterancesOnCurrentMedia.filter((utterance) => getUtteranceSpeakerKey(utterance) === activeSpeakerFilterKey);
    }, [activeSpeakerFilterKey, utterancesOnCurrentMedia]);

    const timelineRenderUtterances = useMemo(() => {
        if (!rulerView || player.duration <= 0) return filteredUtterancesOnCurrentMedia;
        const viewSpan = Math.max(0, rulerView.end - rulerView.start);
        const buffer = Math.max(1, viewSpan * 0.45);
        const left = Math.max(0, rulerView.start - buffer);
        const right = Math.min(player.duration, rulerView.end + buffer);
        return filteredUtterancesOnCurrentMedia.filter((utt) => utt.endTime >= left && utt.startTime <= right);
    }, [filteredUtterancesOnCurrentMedia, rulerView, player.duration]);

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
        speakerVisualByUtteranceId,
    });

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
        createLayer: createLayerWithActiveContext,
        deleteLayer,
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
        createLayerWithActiveContext,
        deleteLayer,
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
                              canToggleNotes={Boolean(selectedUtteranceId || notePopover)}
                              canOpenUttOpsMenu={Boolean(selectedUtteranceId)}
                              notePopoverOpen={Boolean(notePopover)}
                              showExportMenu={showExportMenu}
                              importFileRef={importFileRef}
                              exportMenuRef={exportMenuRef}
                              onRefresh={() => {
                                void loadSnapshot();
                              }}
                              onUndo={() => {
                                void undo();
                              }}
                              onRedo={() => {
                                void redo();
                              }}
                              onOpenProjectSetup={() => setShowProjectSetup(true)}
                              onOpenAudioImport={() => setShowAudioImport(true)}
                              onDeleteCurrentAudio={handleDeleteCurrentAudio}
                              onDeleteCurrentProject={handleDeleteCurrentProject}
                              onToggleExportMenu={() => setShowExportMenu((value) => !value)}
                              onExportEaf={handleExportEaf}
                              onExportTextGrid={handleExportTextGrid}
                              onExportTrs={handleExportTrs}
                              onExportFlextext={handleExportFlextext}
                              onExportToolbox={handleExportToolbox}
                              onExportJyt={handleExportJyt}
                              onExportJym={handleExportJym}
                              onImportFile={(file) => {
                                void handleImportFile(file);
                              }}
                              onToggleNotes={toggleNotes}
                              onOpenUttOpsMenu={(x, y) => setUttOpsMenu({ x, y })}
                            />
                          </WaveformToolbar>
          </section>
          <WaveformOverviewBar
            duration={player.duration}
            utterances={utterancesOnCurrentMedia}
            rulerView={rulerView ?? null}
            onSeek={player.seekTo}
            isReady={player.isReady}
          />

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
              style={{ '--lane-label-width': isTimelineLaneHeaderCollapsed ? '0px' : '64px', '--video-left-panel-width': videoLayoutMode === 'left' ? `${videoRightPanelWidth + 8}px` : '0px' } as React.CSSProperties}
            >
              <WaveformAreaSection
                containerRef={waveformAreaRef}
                className={`transcription-waveform-area ${snapGuide.nearSide ? 'transcription-waveform-area-snapping' : ''} ${segMarkStart !== null ? 'transcription-waveform-area-marking' : ''} ${isResizingWaveform ? 'waveform-area-resizing' : ''}`}
                style={{ '--waveform-height': `${waveformHeight}px` } as React.CSSProperties}
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
                onWheel={(e) => {
                  // Ctrl+Wheel → zoom in/out at cursor position
                  if (e.ctrlKey) {
                    e.preventDefault();
                    e.stopPropagation();
                    const delta = e.deltaY > 0 ? -10 : 10;
                    setZoomPercent((prev) => Math.min(800, Math.max(10, prev + delta)));
                    return;
                  }
                  // Alt+Wheel → change waveform amplitude
                  if (e.altKey) {
                    e.preventDefault();
                    e.stopPropagation();
                    const delta = e.deltaY > 0 ? -0.1 : 0.1;
                    setAmplitudeScale((prev) => Math.min(4, Math.max(0.25, prev + delta)));
                  }
                }}
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
              <WaveformLeftStatusStrip
                zoomPercent={zoomPercent}
                snapEnabled={snapEnabled}
                onSnapToggle={() => setSnapEnabled((v) => !v)}
                playbackRate={player.playbackRate}
                currentTime={player.currentTime}
                selectedUtteranceDuration={selectedUtterance
                  ? selectedUtterance.endTime - selectedUtterance.startTime
                  : null}
                amplitudeScale={amplitudeScale}
                onAmplitudeChange={setAmplitudeScale}
                onAmplitudeReset={() => setAmplitudeScale(1)}
                selectedMediaIsVideo={selectedMediaIsVideo}
                videoLayoutMode={videoLayoutMode}
                onVideoLayoutModeChange={setVideoLayoutMode}
                formatTime={formatTime}
              />
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
                    selectedUtteranceId={selectedUtteranceId}
                    segmentLoopPlayback={segmentLoopPlayback}
                    subSelectionRange={subSelectionRange}
                    isResizingVideoPreview={isResizingVideoPreview}
                    isResizingVideoRightPanel={isResizingVideoRightPanel}
                    onVideoPreviewResizeStart={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      videoPreviewResizeRef.current = { startY: e.clientY, startHeight: videoPreviewHeight };
                      setIsResizingVideoPreview(true);
                    }}
                    onVideoRightPanelResizeStart={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      // factor=1: 右侧布局（向左拖 = 变宽）; factor=-1: 左侧布局（向右拖 = 变宽）
                      // factor=1: right layout; factor=-1: left layout (mirror direction)
                      videoRightPanelResizeRef.current = {
                        startX: e.clientX,
                        startWidth: videoRightPanelWidth,
                        factor: videoLayoutMode === 'left' ? -1 : 1,
                      };
                      setIsResizingVideoRightPanel(true);
                    }}
                    waveformStripHeight={waveformHeight}
                    waveCanvasRef={waveCanvasRef}
                    playerWaveformRef={player.waveformRef}
                    onSeek={player.seekTo}
                    onPlayRegion={player.playRegion}
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

                  {!selectedMediaIsVideo && selectedUtterance && player.isReady && (
                    <RegionActionOverlay
                      utteranceStartTime={selectedUtterance.startTime}
                      utteranceEndTime={selectedUtterance.endTime}
                      zoomPxPerSec={zoomPxPerSec}
                      scrollLeft={waveformScrollLeft}
                      waveAreaWidth={player.instanceRef.current?.getWidth() ?? 9999}
                      isPlaying={player.isPlaying}
                      segmentPlaybackRate={segmentPlaybackRate}
                      segmentLoopPlayback={segmentLoopPlayback}
                      onPlaybackRateChange={(rate) => {
                        setSegmentPlaybackRate(rate);
                        const ws = player.instanceRef.current;
                        if (ws && player.isPlaying) ws.setPlaybackRate(rate);
                      }}
                      onToggleLoop={() => {
                        if (segmentLoopPlayback) {
                          setSegmentLoopPlayback(false);
                          player.stop();
                        } else {
                          setSegmentLoopPlayback(true);
                          const s = subSelectionRange ?? { start: selectedUtterance.startTime, end: selectedUtterance.endTime };
                          player.playRegion(s.start, s.end, true);
                        }
                      }}
                      onTogglePlay={() => {
                        if (player.isPlaying) {
                          player.stop();
                        } else {
                          const s = subSelectionRange ?? { start: selectedUtterance.startTime, end: selectedUtterance.endTime };
                          player.playRegion(s.start, s.end, true);
                        }
                      }}
                    />
                  )}
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
              <div
                className="waveform-area-resize-handle"
                onPointerDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  waveformResizeRef.current = {
                    startY: e.clientY,
                    startHeight: waveformHeight,
                    startAmplitude: amplitudeScale,
                  };
                  setIsResizingWaveform(true);
                }}
                role="separator"
                aria-orientation="horizontal"
              />
              </div>
            </WaveformAreaSection>
            <TimelineHeaderSection
              duration={player.duration}
              utterances={utterancesOnCurrentMedia}
              rulerView={rulerView ?? null}
              onSeek={player.seekTo}
              isReady={player.isReady}
              currentTime={player.currentTime}
              zoomPxPerSec={zoomPxPerSec}
              isLaneHeaderCollapsed={isTimelineLaneHeaderCollapsed}
              onToggleLaneHeader={() => setIsTimelineLaneHeaderCollapsed((v) => !v)}
              instanceRef={player.instanceRef}
              waveCanvasRef={waveCanvasRef}
              tierContainerRef={tierContainerRef}
            />
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
              <TimelineMainSection
                containerRef={listMainRef}
                className={`transcription-list-main ${isLayerRailCollapsed ? 'transcription-list-main-rail-collapsed' : ''} ${isTimelineLaneHeaderCollapsed ? 'transcription-list-main-lane-header-collapsed' : ''}`}
              >
                <TimelineRailSection>
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
                    onReorderLayers={reorderLayers}
                    speakerFilterOptions={speakerFilterOptions}
                    activeSpeakerFilterKey={activeSpeakerFilterKey}
                    onSpeakerFilterChange={setActiveSpeakerFilterKey}
                    onSelectSpeakerUtterances={handleSelectSpeakerUtterances}
                    onClearSpeakerAssignments={handleClearSpeakerAssignments}
                    onExportSpeakerSegments={handleExportSpeakerSegments}
                    onRenameSpeaker={handleRenameSpeaker}
                    onMergeSpeaker={handleMergeSpeaker}
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
                    title={isLayerRailCollapsed
                      ? t(locale, 'transcription.panel.expandLayerRail')
                      : t(locale, 'transcription.panel.collapseLayerRail')}
                  >
                    {isLayerRailCollapsed
                      ? <ChevronRight size={14} aria-hidden="true" />
                      : <ChevronLeft size={14} aria-hidden="true" />}
                  </button>
                </TimelineRailSection>

                <TimelineScrollSection
                  containerRef={tierContainerRef}
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
                      focusedLayerRowId={focusedLayerRowId}
                      defaultTranscriptionLayerId={defaultTranscriptionLayerId}
                      renderAnnotationItem={renderAnnotationItem}
                      allLayersOrdered={layerRailRows}
                      onReorderLayers={reorderLayers}
                      deletableLayers={deletableLayers}
                      onFocusLayer={handleFocusLayerRow}
                      layerLinks={layerLinks}
                      showConnectors={showAllLayerConnectors}
                      onToggleConnectors={() => setShowAllLayerConnectors((prev) => !prev)}
                      laneHeights={timelineLaneHeights}
                      onLaneHeightChange={handleTimelineLaneHeightChange}
                    />
                  ) : layers.length > 0 ? (
                    <TranscriptionTimelineTextOnly
                      transcriptionLayers={transcriptionLayers}
                      translationLayers={translationLayers}
                      utterancesOnCurrentMedia={filteredUtterancesOnCurrentMedia}
                      selectedUtteranceId={selectedUtteranceId}
                      flashLayerRowId={flashLayerRowId}
                      focusedLayerRowId={focusedLayerRowId}
                      defaultTranscriptionLayerId={defaultTranscriptionLayerId ?? ''}
                      scrollContainerRef={tierContainerRef}
                      handleAnnotationClick={handleAnnotationClick}
                      allLayersOrdered={layerRailRows}
                      onReorderLayers={reorderLayers}
                      deletableLayers={deletableLayers}
                      onFocusLayer={handleFocusLayerRow}
                      navigateUtteranceFromInput={navigateUtteranceFromInput}
                      layerLinks={layerLinks}
                      showConnectors={showAllLayerConnectors}
                      onToggleConnectors={() => setShowAllLayerConnectors((prev) => !prev)}
                      laneHeights={timelineLaneHeights}
                      onLaneHeightChange={handleTimelineLaneHeightChange}
                      speakerVisualByUtteranceId={speakerVisualByUtteranceId}
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
                    selectedUtteranceId={selectedUtteranceId}
                    utterancesOnCurrentMedia={utterancesOnCurrentMedia}
                    fitPxPerSec={fitPxPerSec}
                    maxZoomPercent={maxZoomPercent}
                    onZoomToPercent={(percent, mode) => zoomToPercent(percent, undefined, mode)}
                    onZoomToUtterance={zoomToUtterance}
                    onSnapEnabledChange={setSnapEnabled}
                    onAutoScrollEnabledChange={setAutoScrollEnabled}
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
                  <ToastController
                    voiceAgent={voiceAgent}
                    saveState={saveState}
                    recording={recording}
                    recordingUtteranceId={recordingUtteranceId}
                    recordingError={recordingError}
                    tf={tfB}
                  />
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

          {selectedUtteranceIds.size > 0 && (
            <SpeakerAssignPanel
              selectedCount={selectedUtteranceIds.size}
              summary={selectedSpeakerSummary}
              batchSpeakerId={batchSpeakerId}
              speakerOptions={speakerOptions}
              speakerDraftName={speakerDraftName}
              speakerSaving={speakerSaving}
              onBatchSpeakerIdChange={setBatchSpeakerId}
              onAssign={() => { fireAndForget(handleAssignSpeakerToSelected()); }}
              onDraftNameChange={setSpeakerDraftName}
              onCreateAndAssign={() => { fireAndForget(handleCreateSpeakerAndAssign()); }}
            />
          )}
          </main>
          </ToastProvider>

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
      {/* 清洁焦点模式退出提示 | Focus mode exit badge */}
      {isFocusMode && (
        <div className="focus-mode-badge" onClick={() => setIsFocusMode(false)}>
          焦点模式 — 点击或 ⌘⇧F 退出
        </div>
      )}
      {/* 快捷键面板 | Keyboard shortcuts panel */}
      {showShortcuts && (
        <ShortcutsPanel onClose={() => setShowShortcuts(false)} />
      )}
    </section>
  );
}
