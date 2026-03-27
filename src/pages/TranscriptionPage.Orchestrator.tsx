/**
 * TranscriptionPage - Orchestrator
 *
 * Single source of truth for ALL hooks, state, and useEffect hooks.
 * Renders all sub-components in the correct layout positions.
 */

import { AiAssistantHubContext } from '../contexts/AiAssistantHubContext';
import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { detectVadSegments, loadAudioBuffer } from '../services/VadService';
import {
  Merge as _Merge,
  Pause as _Pause,
} from 'lucide-react';
import type { AiPanelMode, AnalysisBottomTab } from '../components/AiAnalysisPanel';
import type { VoiceAgentWidgetProps } from '../components/VoiceAgentWidget';
import { TranscriptionPageToolbar } from './TranscriptionPage.Toolbar';
import { TranscriptionPageBatchOps } from './TranscriptionPage.BatchOps';
import { TranscriptionPageDialogs } from './TranscriptionPage.Dialogs';
import { TranscriptionPageTimelineContent } from './TranscriptionPage.TimelineContent';
import { TranscriptionPageLayerRail } from './TranscriptionPage.LayerRail';
import { TranscriptionPageTimelineTop } from './TranscriptionPage.TimelineTop';
import { TranscriptionOverlays } from '../components/TranscriptionOverlays';
import {
  TimelineRailSection,
  TimelineScrollSection,
  VideoPreviewSection,
} from '../components/transcription/TranscriptionTimelineSections';
import type { VideoLayoutMode } from '../components/transcription/TranscriptionTimelineSections';
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
import { LinguisticService } from '../services/LinguisticService';
import { db as appDb, getDb, type JieyuDatabase, type LayerSegmentContentDocType, type LayerSegmentDocType, type SegmentLinkDocType, type UtteranceDocType } from '../db';
import { TranscriptionEditorContext } from '../contexts/TranscriptionEditorContext';
import { useAiPanelContextUpdater, AiPanelContext } from '../contexts/AiPanelContext';
import { ToastProvider } from '../contexts/ToastContext';
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
import { useImportExport } from '../hooks/useImportExport';
import { useLayerActionPanel } from '../hooks/useLayerActionPanel';
import { useAiPanelLogic, taskToPersona } from '../hooks/useAiPanelLogic';
import { useNoteHandlers } from '../hooks/useNoteHandlers';
import { useTimelineAnnotationHelpers } from '../hooks/useTimelineAnnotationHelpers';
import { useAiToolCallHandler } from '../hooks/useAiToolCallHandler';
import { useMediaImport } from '../hooks/useMediaImport';
import { useTranscriptionUIState } from './TranscriptionPage.UIState';
import { resolveLanguageQuery, SUPPORTED_VOICE_LANGS } from '../utils/langMapping';
import { useTimelineResize } from '../hooks/useTimelineResize';
import { useDialogs } from '../hooks/useDialogs';
import { useLayerSegments, getLayerEditMode, layerUsesOwnSegments } from '../hooks/useLayerSegments';
import { useLayerSegmentContents } from '../hooks/useLayerSegmentContents';
import { LayerSegmentationV2Service } from '../services/LayerSegmentationV2Service';
import { usePanelResize } from '../hooks/usePanelResize';
import { usePanelAutoCollapse } from '../hooks/usePanelAutoCollapse';
import { usePanelToggles } from '../hooks/usePanelToggles';
import { useRecoveryBanner } from '../hooks/useRecoveryBanner';
import { usePdfPreview } from '../hooks/usePdfPreview';
import { useVoiceDock } from '../hooks/useVoiceDock';
import { useAiEmbeddingState } from '../hooks/useAiEmbeddingState';
import { useAiAssistantHubContextValue } from '../hooks/useAiAssistantHubContextValue';
import { useEmbeddingContextValue } from '../hooks/useEmbeddingContextValue';
import { VoiceAgentProvider } from '../contexts/VoiceAgentContext';
import { useVoiceAgentContextValue } from '../hooks/useVoiceAgentContextValue';
import { AiChatProvider } from '../contexts/AiChatContext';
import { useAiChatContextValue } from '../hooks/useAiChatContextValue';
import { useSpeakerActions, getUtteranceSpeakerKey } from '../hooks/useSpeakerActions';
import { DEFAULT_TIMELINE_LANE_HEIGHT } from '../hooks/useTimelineLaneHeightResize';
import type { AiObserverRecommendation } from '../components/transcription/toolbar/ObserverStatus';
import { detectLocale, t, tf } from '../i18n';
import { createLogger } from '../observability/logger';
import { fireAndForget } from '../utils/fireAndForget';
import { reportActionError } from '../utils/actionErrorReporter';
import { reportValidationError } from '../utils/validationErrorReporter';
import { formatLayerRailLabel, formatTime, newId } from '../utils/transcriptionFormatters';
import { buildSpeakerLayerLayoutWithOptions } from '../utils/speakerLayerLayout';
import {
  INITIAL_OVERLAP_CYCLE_TELEMETRY,
  updateOverlapCycleTelemetry,
} from '../utils/overlapCycleTelemetry';
import {
  getTrackEntityState,
  loadTrackEntityStateMap,
  saveTrackEntityStateMap,
  upsertTrackEntityState,
  loadTrackEntityStateMapFromDb,
  saveTrackEntityStateToDb,
} from '../services/TrackEntityStore';
import { EmbeddingService } from '../ai/embeddings/EmbeddingService';
import { EmbeddingSearchService } from '../ai/embeddings/EmbeddingSearchService';
import { createEmbeddingProvider, testEmbeddingProvider } from '../ai/embeddings/EmbeddingProviderCatalog';
import type { EmbeddingProviderKind } from '../ai/embeddings/EmbeddingProvider';
import { getGlobalTaskRunner } from '../ai/tasks/taskRunnerSingleton';
import { extractUtteranceIdFromNote, getPdfPageFromHash, isDirectPdfCitationRef, splitPdfCitationRef } from '../utils/citationJumpUtils';
import { ToastController } from './TranscriptionPage.ToastController';
import {
  loadEmbeddingProviderConfig,
  saveEmbeddingProviderConfig,
} from './TranscriptionPage.helpers';

const log = createLogger('TranscriptionPage');

const TranscriptionPageAiSidebar = lazy(async () => import('./TranscriptionPage.AiSidebar').then((module) => ({
  default: module.TranscriptionPageAiSidebar,
})));

const RecoveryBanner = lazy(async () => import('../components/RecoveryBanner').then((module) => ({
  default: module.RecoveryBanner,
})));

function TranscriptionPageOrchestrator() {
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
  const selectedTimelineUtteranceId = selectedTimelineUnit?.kind === 'utterance'
    ? selectedTimelineUnit.unitId
    : '';

  // 独立边界层 segments 加载 | Load segments for independent-boundary layers
  const { segmentsByLayer, reloadSegments } = useLayerSegments(layers, selectedUtteranceMedia?.id, defaultTranscriptionLayerId);
  const { segmentContentByLayer, reloadSegmentContents } = useLayerSegmentContents(
    layers,
    selectedUtteranceMedia?.id,
    segmentsByLayer,
    defaultTranscriptionLayerId,
  );

  const independentLayerIds = useMemo(() => new Set(
    layers.filter((layer) => layerUsesOwnSegments(layer, defaultTranscriptionLayerId)).map((layer) => layer.id),
  ), [layers, defaultTranscriptionLayerId]);

  const segmentUndoSnapshotRef = useRef<{ segments: LayerSegmentDocType[]; contents: LayerSegmentContentDocType[]; links: SegmentLinkDocType[] }>({
    segments: [],
    contents: [],
    links: [],
  });

  const loadLinksBySegmentIds = useCallback(async (db: JieyuDatabase, segmentIds: string[]): Promise<SegmentLinkDocType[]> => {
    if (segmentIds.length === 0) return [];
    const [sourceLinks, targetLinks] = await Promise.all([
      db.dexie.segment_links.where('sourceSegmentId').anyOf(segmentIds).toArray(),
      db.dexie.segment_links.where('targetSegmentId').anyOf(segmentIds).toArray(),
    ]);
    const linkById = new Map<string, SegmentLinkDocType>();
    for (const link of sourceLinks) linkById.set(link.id, link);
    for (const link of targetLinks) linkById.set(link.id, link);
    return [...linkById.values()];
  }, []);

  const refreshSegmentUndoSnapshot = useCallback(async () => {
    if (independentLayerIds.size === 0) {
      segmentUndoSnapshotRef.current = { segments: [], contents: [], links: [] };
      return;
    }
    const db = await getDb();
    const layerIds = [...independentLayerIds];
    const [allSegments, allContents] = await Promise.all([
      db.dexie.layer_segments.where('layerId').anyOf(layerIds).toArray(),
      db.dexie.layer_segment_contents.where('layerId').anyOf(layerIds).toArray(),
    ]);
    // 收集属于 independent 层的所有 segment 的关联 links（索引查询）
    const relevantLinks = await loadLinksBySegmentIds(db, allSegments.map((s) => s.id));
    segmentUndoSnapshotRef.current = {
      segments: allSegments,
      contents: allContents,
      links: relevantLinks,
    };
  }, [independentLayerIds, loadLinksBySegmentIds]);

  useEffect(() => {
    fireAndForget(refreshSegmentUndoSnapshot());
  }, [refreshSegmentUndoSnapshot]);

  // 注入 undo 系统的 segment 快照/恢复回调 | Inject segment snapshot/restore callbacks into undo system
  segmentUndoRef.current = {
    snapshotLayerSegments: () => {
      return {
        segments: [...segmentUndoSnapshotRef.current.segments],
        contents: [...segmentUndoSnapshotRef.current.contents],
        links: [...segmentUndoSnapshotRef.current.links],
      };
    },
    restoreLayerSegments: async (segments, contents, links) => {
      const db = await getDb();
      const targetLayerIds = new Set<string>([
        ...independentLayerIds,
        ...segments.map((s) => s.layerId),
        ...contents.map((c) => c.layerId),
      ]);
      const layerIds = [...targetLayerIds];
      // 收集所有涉及 segmentId（用于清理关联 links）
      const segmentIds = new Set<string>(segments.map((s) => s.id));
      if (layerIds.length > 0) {
        await db.dexie.transaction('rw', db.dexie.layer_segments, db.dexie.layer_segment_contents, db.dexie.segment_links, async () => {
          await db.dexie.layer_segment_contents.where('layerId').anyOf(layerIds).delete();
          await db.dexie.layer_segments.where('layerId').anyOf(layerIds).delete();
          if (segments.length) await db.dexie.layer_segments.bulkPut(segments);
          if (contents.length) await db.dexie.layer_segment_contents.bulkPut(contents);
          // 清理旧 links（source 或 target 属于这些 segment）
          const staleLinks = await loadLinksBySegmentIds(db, [...segmentIds]);
          if (staleLinks.length > 0) {
            await db.dexie.segment_links.bulkDelete(staleLinks.map((l) => l.id));
          }
          // 恢复快照 links
          if (links.length > 0) await db.dexie.segment_links.bulkPut(links);
        });
      }
      await reloadSegments();
      await reloadSegmentContents();
      await refreshSegmentUndoSnapshot();
    },
  };

  const saveSegmentContentForLayer = useCallback(async (segmentId: string, layerId: string, value: string) => {
    const layer = layers.find((item) => item.id === layerId);
    if (!layer) return;
    const now = new Date().toISOString();
    const trimmed = value.trim();
    const existing = segmentContentByLayer.get(layerId)?.get(segmentId);
    const db = await getDb();

    if (!trimmed) {
      if (existing) {
        await db.collections.layer_segment_contents.remove(existing.id);
      }
      await reloadSegmentContents();
      return;
    }

    const segment = (segmentsByLayer.get(layerId) ?? []).find((item) => item.id === segmentId);
    if (!segment) return;
    const next: LayerSegmentContentDocType = {
      id: existing?.id ?? `segc_${layerId}_${segmentId}`,
      textId: segment.textId,
      segmentId,
      layerId,
      modality: 'text',
      text: trimmed,
      sourceType: 'human',
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    await db.collections.layer_segment_contents.insert(next);
    await reloadSegmentContents();
    await refreshSegmentUndoSnapshot();
  }, [layers, refreshSegmentUndoSnapshot, reloadSegmentContents, segmentContentByLayer, segmentsByLayer]);

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
    setSelectedLayerId(id);
    if (flashLayerRowId && flashLayerRowId !== id) {
      setFlashLayerRowId('');
    }
  }, [flashLayerRowId, setSelectedLayerId]);

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
    let resolvedTextId = input.textId?.trim() || activeTextId || (await getActiveTextId()) || '';
    if (!resolvedTextId) {
      const result = await LinguisticService.createProject({
        titleZh: '未命名项目',
        titleEn: 'Untitled Project',
        primaryLanguageId: input.languageId?.trim() || 'und',
      });
      resolvedTextId = result.textId;
      setActiveTextId(resolvedTextId);
    }
    return createLayer(layerType, {
      ...input,
      ...(resolvedTextId ? { textId: resolvedTextId } : {}),
    }, modality);
  }, [activeTextId, createLayer, getActiveTextId, setActiveTextId]);

  const layerAction = useLayerActionPanel({
    createLayer: createLayerWithActiveContext,
    deleteLayer,
    deleteLayerWithoutConfirm: deleteLayerWithoutConfirm ?? deleteLayer,
    checkLayerHasContent: checkLayerHasContent ?? (async () => 0),
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

  // Media import hook
  const { mediaFileInputRef, handleDirectMediaImport } = useMediaImport({
    activeTextId,
    getActiveTextId,
    addMediaItem,
    setSaveState,
    setActiveTextId,
    tf: (key: string, opts?: Record<string, unknown>) => tf(locale, key as Parameters<typeof tf>[1], opts as Parameters<typeof tf>[2]),
  });

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
    // 独立段选中时从 segmentContentByLayer 取文本 | For segment selection, read text from segmentContentByLayer
    const selectedSegmentForCtx = selectedTimelineUnit?.kind === 'segment'
      ? segmentsByLayer.get(selectedTimelineUnit.layerId)?.find((s) => s.id === selectedTimelineUnit.unitId)
      : undefined;
    const selectedText = selectedUtterance
      ? getUtteranceTextForLayer(selectedUtterance)
      : (segmentContentByLayer.get(selectedTimelineUnit?.layerId ?? '')?.get(selectedTimelineUnit?.unitId ?? '')?.text ?? '');
    const selectedUnitForTime = selectedUtterance ?? selectedSegmentForCtx;
    const selectionTimeRange = selectedUnitForTime
      ? `${formatTime(selectedUnitForTime.startTime)}-${formatTime(selectedUnitForTime.endTime)}`
      : undefined;
    const selectedLayer = layers.find((layer) => layer.id === selectedLayerId) ?? null;
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
        ...(selectedUtterance?.id ? { activeUtteranceUnitId: selectedUtterance.id } : {}),
        ...(selectedTimelineUnit?.kind === 'segment' ? { activeSegmentUnitId: selectedTimelineUnit.unitId } : {}),
        ...(selectedUnitForTime ? { selectedUtteranceStartSec: selectedUnitForTime.startTime, selectedUtteranceEndSec: selectedUnitForTime.endTime } : {}),
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
  }, [aiConfidenceAvg, formatTime, getUtteranceTextForLayer, layers, segmentContentByLayer, segmentsByLayer, selectedLayerId, selectedTimelineUnit, selectedUtterance, state, undoHistory, utterances.length]);

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
            return { requiresConfirmation: false, riskSummary: `未找到匹配"${languageQuery}"的${layerType === 'translation' ? '翻译' : '转写'}层`, impactPreview: [] };
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
    const { resolveVoiceIntentWithLlmUsingConfig } = await import('../services/VoiceIntentLlmResolver');
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
  const [laneLabelWidth, setLaneLabelWidth] = useState<number>(() => {
    try {
      const stored = localStorage.getItem('jieyu:lane-label-width');
      if (stored) {
        const parsed = Math.min(Math.max(Number(stored), 40), 180);
        if (!isNaN(parsed)) return parsed;
      }
    } catch (e) { console.warn('[TranscriptionPage] Failed to read lane-label-width from localStorage, using default', e); }
    return 64;
  });
  // Ref for resize handle closure access — initialized after laneLabelWidth
  const laneLabelWidthRef = useRef<number>(laneLabelWidth);
  // Keep ref in sync with state (for resize handle closure access)
  useEffect(() => { laneLabelWidthRef.current = laneLabelWidth; }, [laneLabelWidth]);

  const [showAllLayerConnectors, setShowAllLayerConnectors] = useState(false);
  const [timelineLaneHeights, setTimelineLaneHeights] = useState<Record<string, number>>(() => {
    try {
      const stored = localStorage.getItem('jieyu:lane-heights');
      if (stored) { const parsed: unknown = JSON.parse(stored); if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as Record<string, number>; }
    } catch (error) {
      log.warn('Failed to read lane heights from localStorage, fallback to default', {
        storageKey: 'jieyu:lane-heights',
        error: error instanceof Error ? error.message : String(error),
      });
    }
    return {};
  });
  const [waveformHeight, setWaveformHeight] = useState<number>(() => {
    try {
      const stored = localStorage.getItem('jieyu:waveform-height');
      if (stored) return Math.min(Math.max(Number(stored), 80), 400);
    } catch (error) {
      log.warn('Failed to read waveform height from localStorage, fallback to default', {
        storageKey: 'jieyu:waveform-height',
        error: error instanceof Error ? error.message : String(error),
      });
    }
    return 180;
  });
  const waveformResizeRef = useRef<{ startY: number; startHeight: number; startAmplitude: number } | null>(null);
  const [isResizingWaveform, setIsResizingWaveform] = useState(false);
  /** 视频预览面板高度（可拖动调整）| Video preview panel height (drag-resizable) */
  const [videoPreviewHeight, setVideoPreviewHeight] = useState<number>(() => {
    try {
      const stored = localStorage.getItem('jieyu:video-preview-height');
      if (stored) return Math.min(Math.max(Number(stored), 120), 600);
    } catch (error) {
      log.warn('Failed to read video preview height from localStorage, fallback to default', {
        storageKey: 'jieyu:video-preview-height',
        error: error instanceof Error ? error.message : String(error),
      });
    }
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
    } catch (error) {
      log.warn('Failed to read video right panel width from localStorage, fallback to default', {
        storageKey: 'jieyu:video-right-panel-width',
        error: error instanceof Error ? error.message : String(error),
      });
    }
    return 360;
  });
  /** 视频布局模式（上方/右侧/左侧），持久化到 localStorage | Video layout mode (top/right/left), persisted to localStorage */
  const [videoLayoutMode, setVideoLayoutMode] = useState<VideoLayoutMode>(() => {
    try {
      const stored = localStorage.getItem('jieyu:video-layout-mode');
      return (stored === 'right' || stored === 'left') ? stored as VideoLayoutMode : 'top';
    } catch (error) {
      log.warn('Failed to read video layout mode from localStorage, fallback to default', {
        storageKey: 'jieyu:video-layout-mode',
        error: error instanceof Error ? error.message : String(error),
      });
      return 'top';
    }
  });
  /** 波形增益倍率 | Waveform amplitude scale via barHeight, persisted to localStorage */
  const [amplitudeScale, setAmplitudeScale] = useState<number>(() => {
    try {
      const stored = localStorage.getItem('jieyu:amplitude-scale');
      if (stored) return Math.min(Math.max(Number(stored), 0.25), 4);
    } catch (error) {
      log.warn('Failed to read amplitude scale from localStorage, fallback to default', {
        storageKey: 'jieyu:amplitude-scale',
        error: error instanceof Error ? error.message : String(error),
      });
    }
    return 1;
  });
  /** 播放时自动滚动到当前语段 | Auto-scroll timeline rows to playhead during playback */
  const [autoScrollEnabled, setAutoScrollEnabled] = useState(true);
  /** 清洁标注模式开关 | Focus / Clean annotation mode */
  const [isFocusMode, setIsFocusMode] = useState(false);
  /** 快捷键面板开关 | Keyboard shortcuts panel visibility */
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [snapEnabled, setSnapEnabled] = useState(false);
  const [hoverExpandEnabled, setHoverExpandEnabled] = useState(true);
  const [hoverTime, setHoverTime] = useState<{ time: number; x: number; y: number } | null>(null);
  const [speakerFocusMode, setSpeakerFocusMode] = useState<'all' | 'focus-soft' | 'focus-hard'>('all');
  const [speakerFocusTargetKey, setSpeakerFocusTargetKey] = useState<string | null>(null);
  const [overlapCycleToast, setOverlapCycleToast] = useState<{ index: number; total: number; nonce: number } | null>(null);
  const [lockConflictToast, setLockConflictToast] = useState<{ count: number; speakers: string[]; nonce: number } | null>(null);
  const speakerFocusTargetMemoryByMediaRef = useRef<Record<string, string | null>>({});
  const overlapCycleTelemetryRef = useRef(INITIAL_OVERLAP_CYCLE_TELEMETRY);
  const trackEntityStateByMediaRef = useRef<ReturnType<typeof loadTrackEntityStateMap> | null>(null);
  const trackEntityHydratedKeyRef = useRef<string | null>(null);
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
    activeUtteranceUnitId: selectedTimelineUtteranceId,
    focusedLayerRowId,
    utterances,
    transcriptionLayers,
    translationLayers,
    updateTokenPos,
    batchUpdateTokenPosByForm,
    selectUtterance,
    setSaveState,
  });

  // 路由拆分/合并：独立边界层 → segment 操作，默认 → utterance 操作 | Routed split/merge: independent layers → segment ops, default → utterance ops
  const activeLayerIdForEdits = selectedLayerId || focusedLayerRowId;

  const splitRouted = useCallback(async (id: string, splitTime: number) => {
    const layer = layers.find((l) => l.id === activeLayerIdForEdits);
    const editMode = getLayerEditMode(layer, defaultTranscriptionLayerId);
    switch (editMode) {
      case 'independent-segment':
      case 'time-subdivision': {
        pushUndo('拆分句段');
        const splitResult = await LayerSegmentationV2Service.splitSegment(id, splitTime);
        await reloadSegments();
        await refreshSegmentUndoSnapshot();
        // 自动选中拆分后的右段 | Auto-select the right segment after split
        selectTimelineUnit({ layerId: activeLayerIdForEdits, unitId: splitResult.second.id, kind: 'segment' });
        return;
      }
      case 'utterance':
        await splitUtterance(id, splitTime);
        return;
    }
  }, [activeLayerIdForEdits, defaultTranscriptionLayerId, layers, pushUndo, refreshSegmentUndoSnapshot, reloadSegments, selectTimelineUnit, splitUtterance]);

  const mergeWithPreviousRouted = useCallback(async (id: string) => {
    const layer = layers.find((l) => l.id === activeLayerIdForEdits);
    const editMode = getLayerEditMode(layer, defaultTranscriptionLayerId);
    switch (editMode) {
      case 'independent-segment':
      case 'time-subdivision': {
        // getLayerEditMode(undefined) → 'utterance', 不会进此分支，但 TS 无法推断 | TS can't infer layer is defined here
        if (!layer) return;
        const segs = segmentsByLayer.get(layer.id);
        if (!segs) return;
        const idx = segs.findIndex((s) => s.id === id);
        if (idx <= 0) return;
        const prevSeg = segs[idx - 1]!;
        const curSeg = segs[idx]!;
        // 时间细分层：验证合并后不超出父 utterance 范围 | Time-subdivision: validate merged bounds stay within parent
        if (editMode === 'time-subdivision') {
          const parentUtt = utterancesOnCurrentMedia.find(
            (u) => u.startTime <= curSeg.startTime + 0.01 && u.endTime >= curSeg.endTime - 0.01,
          );
          if (parentUtt) {
            const mergedStart = prevSeg.startTime;
            const mergedEnd = curSeg.endTime;
            if (mergedStart < parentUtt.startTime - 0.001 || mergedEnd > parentUtt.endTime + 0.001) {
              setSaveState({ kind: 'error', message: '合并后会超出父句段范围，无法完成。' });
              return;
            }
          }
        }
        pushUndo('向前合并句段');
        try {
          await LayerSegmentationV2Service.mergeAdjacentSegments(prevSeg.id, id);
          await reloadSegments();
          await refreshSegmentUndoSnapshot();
          // 自动选中合并结果 | Auto-select merged result
          selectTimelineUnit({ layerId: activeLayerIdForEdits, unitId: prevSeg.id, kind: 'segment' });
        } catch (error) {
          setSaveState({
            kind: 'error',
            message: error instanceof Error ? error.message : '合并句段失败，请稍后重试。',
          });
        }
        return;
      }
      case 'utterance':
        await mergeWithPrevious(id);
        return;
    }
  }, [activeLayerIdForEdits, defaultTranscriptionLayerId, layers, segmentsByLayer, pushUndo, refreshSegmentUndoSnapshot, reloadSegments, mergeWithPrevious, setSaveState, utterancesOnCurrentMedia]);

  const mergeWithNextRouted = useCallback(async (id: string) => {
    const layer = layers.find((l) => l.id === activeLayerIdForEdits);
    const editMode = getLayerEditMode(layer, defaultTranscriptionLayerId);
    switch (editMode) {
      case 'independent-segment':
      case 'time-subdivision': {
        // getLayerEditMode(undefined) → 'utterance', 不会进此分支，但 TS 无法推断 | TS can't infer layer is defined here
        if (!layer) return;
        const segs = segmentsByLayer.get(layer.id);
        if (!segs) return;
        const idx = segs.findIndex((s) => s.id === id);
        if (idx < 0 || idx >= segs.length - 1) return;
        const curSeg = segs[idx]!;
        const nextSeg = segs[idx + 1]!;
        // 时间细分层：验证合并后不超出父 utterance 范围 | Time-subdivision: validate merged bounds stay within parent
        if (editMode === 'time-subdivision') {
          const parentUtt = utterancesOnCurrentMedia.find(
            (u) => u.startTime <= curSeg.startTime + 0.01 && u.endTime >= curSeg.endTime - 0.01,
          );
          if (parentUtt) {
            const mergedStart = curSeg.startTime;
            const mergedEnd = nextSeg.endTime;
            if (mergedStart < parentUtt.startTime - 0.001 || mergedEnd > parentUtt.endTime + 0.001) {
              setSaveState({ kind: 'error', message: '合并后会超出父句段范围，无法完成。' });
              return;
            }
          }
        }
        pushUndo('向后合并句段');
        try {
          await LayerSegmentationV2Service.mergeAdjacentSegments(id, nextSeg.id);
          await reloadSegments();
          await refreshSegmentUndoSnapshot();
          // 自动选中合并结果 | Auto-select merged result
          selectTimelineUnit({ layerId: activeLayerIdForEdits, unitId: id, kind: 'segment' });
        } catch (error) {
          setSaveState({
            kind: 'error',
            message: error instanceof Error ? error.message : '合并句段失败，请稍后重试。',
          });
        }
        return;
      }
      case 'utterance':
        await mergeWithNext(id);
        return;
    }
  }, [activeLayerIdForEdits, defaultTranscriptionLayerId, layers, segmentsByLayer, pushUndo, refreshSegmentUndoSnapshot, reloadSegments, mergeWithNext, setSaveState, utterancesOnCurrentMedia]);

  const deleteUtteranceRouted = useCallback(async (id: string) => {
    const layer = layers.find((l) => l.id === activeLayerIdForEdits);
    const editMode = getLayerEditMode(layer, defaultTranscriptionLayerId);
    switch (editMode) {
      case 'independent-segment':
      case 'time-subdivision':
        pushUndo('删除句段');
        try {
          await LayerSegmentationV2Service.deleteSegment(id);
          await reloadSegments();
          await refreshSegmentUndoSnapshot();
          selectTimelineUnit(null);
        } catch (error) {
          setSaveState({
            kind: 'error',
            message: error instanceof Error ? error.message : '删除句段失败，请稍后重试。',
          });
        }
        return;
      case 'utterance':
        await deleteUtterance(id);
        return;
    }
  }, [activeLayerIdForEdits, defaultTranscriptionLayerId, deleteUtterance, layers, pushUndo, refreshSegmentUndoSnapshot, reloadSegments, selectTimelineUnit, setSaveState]);

  const deleteSelectedUtterancesRouted = useCallback(async (ids: Set<string>) => {
    const layer = layers.find((l) => l.id === activeLayerIdForEdits);
    const editMode = getLayerEditMode(layer, defaultTranscriptionLayerId);
    switch (editMode) {
      case 'independent-segment':
      case 'time-subdivision': {
        if (ids.size === 0) return;
        try {
          // pushUndo 在 try 内：仅当操作启动后才进入撤销栈，避免空条目 | pushUndo inside try: only commit undo entry when operation actually starts
          pushUndo(`删除 ${ids.size} 个句段`);
          for (const id of ids) {
            await LayerSegmentationV2Service.deleteSegment(id);
          }
          await reloadSegments();
          await refreshSegmentUndoSnapshot();
          selectTimelineUnit(null);
        } catch (error) {
          // 重新加载以反映部分删除的实际 DB 状态 | Reload to reflect actual DB state after partial deletion
          await reloadSegments();
          setSaveState({
            kind: 'error',
            message: error instanceof Error ? error.message : '批量删除句段失败，请稍后重试。',
          });
        }
        return;
      }
      case 'utterance':
        await deleteSelectedUtterances(ids);
        return;
    }
  }, [activeLayerIdForEdits, defaultTranscriptionLayerId, deleteSelectedUtterances, layers, pushUndo, refreshSegmentUndoSnapshot, reloadSegments, selectTimelineUnit, setSaveState]);

  // 统一建段入口路由：独立边界/时间细分 → segment 操作，默认 → utterance 操作
  // Unified create routing: independent-segment/time-subdivision → segment ops, utterance → utterance ops
  const createUtteranceFromSelectionRouted = useCallback(async (start: number, end: number) => {
    const layer = layers.find((l) => l.id === activeLayerIdForEdits);
    const editMode = getLayerEditMode(layer, defaultTranscriptionLayerId);
    if (editMode === 'independent-segment' || editMode === 'time-subdivision') {
      if (!selectedUtteranceMedia) {
        setSaveState({ kind: 'error', message: '请先导入并选择音频。' });
        return;
      }
      const minSpan = 0.05;
      const gap = 0.02;
      const rawStart = Math.max(0, Math.min(start, end));
      const rawEnd = Math.max(start, end);
      if (!layer) {
        console.error('未找到目标转写层');
        return;
      }
      const layerSegments = segmentsByLayer.get(layer.id);
      const siblings = [...(layerSegments ?? [])].sort((a, b) => a.startTime - b.startTime);
      const insertionIndex = siblings.findIndex((item) => item.startTime > rawStart);
      const prev = insertionIndex < 0
        ? siblings[siblings.length - 1]
        : insertionIndex === 0
          ? undefined
          : siblings[insertionIndex - 1];
      const next = insertionIndex < 0 ? undefined : siblings[insertionIndex];
      const lowerBound = Math.max(0, prev ? prev.endTime + gap : 0);
      const mediaDuration = typeof selectedUtteranceMedia.duration === 'number'
        ? selectedUtteranceMedia.duration
        : Number.POSITIVE_INFINITY;
      const upperBound = Math.min(mediaDuration, next ? next.startTime - gap : Number.POSITIVE_INFINITY);
      const boundedStart = Math.max(lowerBound, rawStart);
      const normalizedEnd = Math.max(boundedStart + minSpan, rawEnd);
      const boundedEnd = Math.min(upperBound, normalizedEnd);
      if (!Number.isFinite(boundedEnd) || boundedEnd - boundedStart < minSpan) {
        setSaveState({ kind: 'error', message: '选区与现有句段重叠，无法创建。请在空白区重新拖拽。' });
        return;
      }
      const finalStart = Number(boundedStart.toFixed(3));
      const finalEnd = Number(boundedEnd.toFixed(3));
      const now = new Date().toISOString();
      pushUndo('新建句段');
      const newSeg: LayerSegmentDocType = {
        id: newId('seg'),
        textId: selectedUtteranceMedia.textId,
        mediaId: selectedUtteranceMedia.id,
        layerId: layer.id,
        startTime: finalStart,
        endTime: finalEnd,
        createdAt: now,
        updatedAt: now,
      };
      if (editMode === 'time-subdivision') {
        // 时间细分：查找父 utterance 并裁剪 | Time subdivision: find parent utterance and clip
        const parentUtt = utterancesOnCurrentMedia.find(
          (u) => u.startTime <= finalStart + 0.01 && u.endTime >= finalEnd - 0.01,
        );
        if (!parentUtt) {
          setSaveState({ kind: 'error', message: '所选区间未落在任何句段范围内，无法在时间细分层创建。' });
          return;
        }
        await LayerSegmentationV2Service.createSegmentWithParentConstraint(
          newSeg, parentUtt.id, parentUtt.startTime, parentUtt.endTime,
        );
      } else {
        // 独立层：查找重叠的 utterance 并关联，使说话人指派等功能可正常工作
        // Independent layer: find overlapping utterance and link it so speaker assignment etc. works
        const overlappingUtt = utterancesOnCurrentMedia.find(
          (u) => u.startTime <= finalEnd - 0.01 && u.endTime >= finalStart + 0.01,
        );
        if (overlappingUtt) {
          newSeg.utteranceId = overlappingUtt.id;
        }
        await LayerSegmentationV2Service.createSegment(newSeg);
      }
      await reloadSegments();
      await refreshSegmentUndoSnapshot();
      // 自动选中新建段 | Auto-select newly created segment
      selectTimelineUnit({ layerId: layer.id, unitId: newSeg.id, kind: 'segment' });
      setSaveState({ kind: 'done', message: `已在当前层新建独立段 ${formatTime(finalStart)} - ${formatTime(finalEnd)}` });
      return;
    }
    const resolvedLayerId = activeLayerIdForEdits;
    await createUtteranceFromSelection(start, end, {
      ...(speakerFocusTargetKey ? { speakerId: speakerFocusTargetKey } : {}),
      ...(resolvedLayerId ? { focusedLayerId: resolvedLayerId } : {}),
    });
  }, [
    activeLayerIdForEdits,
    createUtteranceFromSelection,
    layers,
    reloadSegments,
    refreshSegmentUndoSnapshot,
    segmentsByLayer,
    selectedUtteranceMedia,
    setSaveState,
    selectTimelineUnit,
    speakerFocusTargetKey,
    pushUndo,
    utterancesOnCurrentMedia,
  ]);

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

  // ---- Player (WaveSurfer) ----

  const activeWaveformLayer = useMemo(
    () => layers.find((item) => item.id === activeLayerIdForEdits),
    [activeLayerIdForEdits, layers],
  );
  const useIndependentWaveformRegions = Boolean(activeWaveformLayer && layerUsesOwnSegments(activeWaveformLayer, defaultTranscriptionLayerId));
  const waveformTimelineItems = useMemo(() => {
    if (useIndependentWaveformRegions && activeWaveformLayer) {
      const segments = segmentsByLayer.get(activeWaveformLayer.id) ?? [];
      return [...segments].sort((a, b) => a.startTime - b.startTime);
    }
    return utterancesOnCurrentMedia;
  }, [activeWaveformLayer, segmentsByLayer, useIndependentWaveformRegions, utterancesOnCurrentMedia]);
  const waveformRegions = useMemo(() =>
    waveformTimelineItems.map((item) => ({
      id: item.id,
      start: item.startTime,
      end: item.endTime,
    })),
    [waveformTimelineItems],
  );
  const selectedWaveformRegionId = useIndependentWaveformRegions
    ? (selectedTimelineUnit?.kind === 'segment' && selectedTimelineUnit.layerId === activeLayerIdForEdits
      ? selectedTimelineUnit.unitId
      : '')
    : (selectedTimelineUnit?.kind === 'utterance' && selectedTimelineUnit.layerId === activeLayerIdForEdits
      ? selectedTimelineUnit.unitId
      : '');
  const waveformActiveRegionIds = useMemo(() => {
    if (useIndependentWaveformRegions) {
      // Lasso 多选时 segment ID 存入 selectedUtteranceIds（非空则优先使用）
      // Single-click uses selectSegment → clears selectedUtteranceIds; lasso populates it | Single-click clears it, lasso fills it
      if (selectedUtteranceIds.size > 0) return selectedUtteranceIds;
      return selectedWaveformRegionId ? new Set([selectedWaveformRegionId]) : new Set<string>();
    }
    return selectedUtteranceIds;
  }, [selectedUtteranceIds, selectedWaveformRegionId, useIndependentWaveformRegions]);
  const waveformPrimaryRegionId = selectedWaveformRegionId;

  // --- 百分比 → px/s 换算 ---
  // 用 ref 追踪 duration 使得计算可以在 useWaveSurfer 调用前进行
  const lastDurationRef = useRef(0);
  const containerWidth = waveCanvasRef.current?.clientWidth || 800;

  // Refs for waveform lasso effect (avoid effect dependency churn)
  const zoomPxPerSecRef = useRef(0);
  const previousSelectedUtteranceIdRef = useRef(selectedTimelineUnit?.kind === 'utterance' ? selectedTimelineUnit.unitId : '');
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
    activeRegionIds: waveformActiveRegionIds,
    primaryRegionId: waveformPrimaryRegionId,
    waveformFocused,
    segmentLoop: segmentLoopPlayback,
    globalLoop: globalLoopPlayback,
    segmentPlaybackRate,
    autoScrollDuringPlayback: !shouldDisableAutoScroll,
    enableEmptyDragCreate: useIndependentWaveformRegions,
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
      if (useIndependentWaveformRegions) {
        if (event.shiftKey) {
          // 范围选 segment | Range-select segments
          const anchor = selectedTimelineUnit?.kind === 'segment'
            ? selectedTimelineUnit.unitId
            : regionId;
          selectSegmentRange(anchor, regionId, waveformTimelineItems);
        } else if (event.metaKey || event.ctrlKey) {
          // 切换多选 segment | Toggle segment multi-selection
          toggleSegmentSelection(regionId);
        } else {
          selectTimelineUnit({ layerId: activeLayerIdForEdits, unitId: regionId, kind: 'segment' });
        }
        return;
      }
      if (event.shiftKey) {
        const anchor = selectedTimelineUnit?.kind === 'utterance'
          ? selectedTimelineUnit.unitId
          : regionId;
        selectUtteranceRange(anchor, regionId);
      } else if (event.metaKey || event.ctrlKey) {
        toggleUtteranceSelection(regionId);
      } else {
        selectTimelineUnit({ layerId: activeLayerIdForEdits, unitId: regionId, kind: 'utterance' });
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
      const item = waveformTimelineItems.find((u) => u.id === regionId);
      if (item) {
        const bounds = useIndependentWaveformRegions && activeWaveformLayer
          ? {
            left: (() => {
              const siblings = waveformTimelineItems.filter((s) => s.id !== regionId);
              const prev = [...siblings]
                .filter((s) => s.startTime < start)
                .sort((a, b) => b.startTime - a.startTime)[0];
              return prev ? prev.endTime + 0.02 : 0;
            })(),
            right: (() => {
              const siblings = waveformTimelineItems.filter((s) => s.id !== regionId);
              const next = [...siblings]
                .filter((s) => s.startTime > start)
                .sort((a, b) => a.startTime - b.startTime)[0];
              return next ? next.startTime - 0.02 : undefined;
            })(),
          }
          : getNeighborBounds(item.id, item.mediaId, start);
        // 时间细分层：叠加父 utterance 范围限制 | Time-subdivision: overlay parent utterance bounds
        if (activeWaveformLayer && getLayerEditMode(activeWaveformLayer, defaultTranscriptionLayerId) === 'time-subdivision') {
          const parentUtt = utterancesOnCurrentMedia.find(
            (u) => u.startTime <= bounds.left + 0.01 && u.endTime >= (bounds.right ?? Infinity) - 0.01,
          );
          if (parentUtt) {
            bounds.left = Math.max(bounds.left, parentUtt.startTime);
            bounds.right = bounds.right !== undefined ? Math.min(bounds.right, parentUtt.endTime) : parentUtt.endTime;
          }
        }
        setSnapGuide(makeSnapGuide(bounds, start, end));
      }
    },
    onRegionUpdateEnd: (regionId, start, end) => {
      endTimingGesture(regionId);
      setDragPreview(null);
      manualSelectTsRef.current = Date.now();
      if (useIndependentWaveformRegions) {
        selectTimelineUnit({ layerId: activeLayerIdForEdits, unitId: regionId, kind: 'segment' });
      } else {
        selectTimelineUnit({ layerId: activeLayerIdForEdits, unitId: regionId, kind: 'utterance' });
      }
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
      const item = waveformTimelineItems.find((u) => u.id === regionId);
      if (item) {
        const bounds = useIndependentWaveformRegions && activeWaveformLayer
          ? {
            left: (() => {
              const siblings = waveformTimelineItems.filter((s) => s.id !== regionId);
              const prev = [...siblings]
                .filter((s) => s.startTime < finalStart)
                .sort((a, b) => b.startTime - a.startTime)[0];
              return prev ? prev.endTime + 0.02 : 0;
            })(),
            right: (() => {
              const siblings = waveformTimelineItems.filter((s) => s.id !== regionId);
              const next = [...siblings]
                .filter((s) => s.startTime > finalStart)
                .sort((a, b) => a.startTime - b.startTime)[0];
              return next ? next.startTime - 0.02 : undefined;
            })(),
          }
          : getNeighborBounds(item.id, item.mediaId, finalStart);
        // 时间细分层：叠加父 utterance 范围限制 | Time-subdivision: overlay parent utterance bounds
        if (activeWaveformLayer && getLayerEditMode(activeWaveformLayer, defaultTranscriptionLayerId) === 'time-subdivision') {
          const parentUtt = utterancesOnCurrentMedia.find(
            (u) => u.startTime <= bounds.left + 0.01 && u.endTime >= (bounds.right ?? Infinity) - 0.01,
          );
          if (parentUtt) {
            bounds.left = Math.max(bounds.left, parentUtt.startTime);
            bounds.right = bounds.right !== undefined ? Math.min(bounds.right, parentUtt.endTime) : parentUtt.endTime;
          }
        }
        setSnapGuide(makeSnapGuide(bounds, finalStart, finalEnd));
      }
      let subdivisionClampedInRegionUpdate = false;
      // 时间细分层：保存前裁剪至父 utterance 范围 | Time-subdivision: clamp to parent before save
      if (activeWaveformLayer && getLayerEditMode(activeWaveformLayer, defaultTranscriptionLayerId) === 'time-subdivision') {
        const beforeClampStart = finalStart;
        const beforeClampEnd = finalEnd;
        const parentUtt = utterancesOnCurrentMedia.find(
          (u) => u.startTime <= finalStart + 0.01 && u.endTime >= finalEnd - 0.01,
        );
        if (parentUtt) {
          const clampedStart = Math.max(finalStart, parentUtt.startTime);
          const clampedEnd = Math.min(finalEnd, parentUtt.endTime);
          subdivisionClampedInRegionUpdate = Math.abs(clampedStart - beforeClampStart) > 0.0005
            || Math.abs(clampedEnd - beforeClampEnd) > 0.0005;
          // 硬阻断：超出父 utterance 边界时拒绝保存 | Hard block: reject save when exceeding parent utterance bounds
          if (beforeClampStart < parentUtt.startTime - 0.0005 || beforeClampEnd > parentUtt.endTime + 0.0005) {
            setSaveState({ kind: 'error', message: '无法将时间细分区间拖动到父句段范围之外。' });
            setSnapGuide({ visible: false });
            return;
          }
          finalStart = clampedStart;
          finalEnd = clampedEnd;
        }
      }
      if (useIndependentWaveformRegions && activeWaveformLayer) {
        fireAndForget((async () => {
          await LayerSegmentationV2Service.updateSegment(regionId, {
            startTime: Number(finalStart.toFixed(3)),
            endTime: Number(finalEnd.toFixed(3)),
            updatedAt: new Date().toISOString(),
          });
          await reloadSegments();
          if (subdivisionClampedInRegionUpdate) {
            setSaveState({ kind: 'done', message: '已按父句段边界自动修正时间细分区间。' });
          }
        })());
      } else {
        fireAndForget(saveUtteranceTiming(regionId, finalStart, finalEnd));
      }
    },
    onRegionCreate: (start, end) => {
      fireAndForget(createUtteranceFromSelectionRouted(start, end));
    },
    onRegionContextMenu: (regionId, x, y) => {
      if (player.isPlaying) {
        player.stop();
      }
      if (useIndependentWaveformRegions) {
        selectTimelineUnit({ layerId: activeLayerIdForEdits, unitId: regionId, kind: 'segment' });
      } else {
        selectTimelineUnit({ layerId: activeLayerIdForEdits, unitId: regionId, kind: 'utterance' });
      }
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
      setCtxMenu({ x, y, utteranceId: regionId, layerId: activeLayerIdForEdits, splitTime });
    },
    onTimeUpdate: (time) => {
      if (Date.now() - manualSelectTsRef.current < 600) return;
      if (creatingSegmentRef.current) return;
      if (markingModeRef.current) return;
      // Binary search on sorted utterances
      const arr = waveformTimelineItems;
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
      if (!hit) return;
      if (hit.id !== selectedWaveformRegionId) {
        selectTimelineUnit({
          layerId: activeLayerIdForEdits,
          unitId: hit.id,
          kind: useIndependentWaveformRegions ? 'segment' : 'utterance',
        });
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
        uttId: utteranceId ?? selectedTimelineUtteranceId,
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
          uttId: utteranceId ?? selectedTimelineUtteranceId,
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
    selectedTimelineUtteranceId,
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
    timelineItems: waveformTimelineItems,
    selectedUtteranceIds,
    selectedUtteranceUnitId: selectedTimelineUtteranceId,
    zoomPxPerSec,
    skipSeekForIdRef,
    clearUtteranceSelection,
    createUtteranceFromSelection: createUtteranceFromSelectionRouted,
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

  // 路由邻居边界：独立边界层查 segmentsByLayer，默认查 utterances | Routed neighbor bounds: independent layers → segmentsByLayer, default → utterances
  const getNeighborBoundsRouted = useCallback((itemId: string, mediaId: string | undefined, probeStart: number, layerId?: string) => {
    if (layerId) {
      const layer = layers.find((l) => l.id === layerId);
      if (layer && layerUsesOwnSegments(layer, defaultTranscriptionLayerId)) {
        const segs = segmentsByLayer.get(layer.id) ?? [];
        const siblings = segs
          .filter((s) => s.id !== itemId)
          .sort((a, b) => a.startTime - b.startTime);
        const timeline = [...siblings, { id: itemId, startTime: probeStart, endTime: probeStart + 0.1 }].sort(
          (a, b) => a.startTime - b.startTime,
        );
        const idx = timeline.findIndex((s) => s.id === itemId);
        const prev = idx > 0 ? timeline[idx - 1] : undefined;
        const next = idx >= 0 && idx < timeline.length - 1 ? timeline[idx + 1] : undefined;
        let left = prev ? prev.endTime + 0.02 : 0;
        let right: number | undefined = next ? next.startTime - 0.02 : undefined;
        // 时间细分层：额外限制在父 utterance 范围内 | Time-subdivision: also clamp to parent utterance bounds
        if (getLayerEditMode(layer, defaultTranscriptionLayerId) === 'time-subdivision') {
          const parentUtt = utterancesOnCurrentMedia.find(
            (u) => u.startTime <= probeStart + 0.01 && u.endTime >= probeStart - 0.01,
          );
          if (parentUtt) {
            left = Math.max(left, parentUtt.startTime);
            right = right !== undefined ? Math.min(right, parentUtt.endTime) : parentUtt.endTime;
          }
        }
        return { left, right };
      }
    }
    return getNeighborBounds(itemId, mediaId, probeStart);
  }, [layers, segmentsByLayer, getNeighborBounds, defaultTranscriptionLayerId, utterancesOnCurrentMedia]);

  // 路由保存：独立边界层写 layer_segments，默认层写 utterances | Routed save: independent layers → layer_segments, default → utterances
  const saveTimingRouted = useCallback(async (id: string, start: number, end: number, layerId?: string) => {
    if (layerId) {
      const layer = layers.find((l) => l.id === layerId);
      if (layer && layerUsesOwnSegments(layer, defaultTranscriptionLayerId)) {
        let finalStart = start;
        let finalEnd = end;
        let subdivisionClampedInResize = false;
        if (getLayerEditMode(layer, defaultTranscriptionLayerId) === 'time-subdivision') {
          const parentUtt = utterancesOnCurrentMedia.find(
            (u) => u.startTime <= finalStart + 0.01 && u.endTime >= finalEnd - 0.01,
          );
          if (parentUtt) {
            const beforeClampStart = finalStart;
            const beforeClampEnd = finalEnd;
            finalStart = Math.max(finalStart, parentUtt.startTime);
            finalEnd = Math.min(finalEnd, parentUtt.endTime);
            subdivisionClampedInResize = Math.abs(finalStart - beforeClampStart) > 0.0005
              || Math.abs(finalEnd - beforeClampEnd) > 0.0005;
          }
        }
        await LayerSegmentationV2Service.updateSegment(id, {
          startTime: Number(finalStart.toFixed(3)),
          endTime: Number(finalEnd.toFixed(3)),
          updatedAt: new Date().toISOString(),
        });
        await reloadSegments();
        if (subdivisionClampedInResize) {
          setSaveState({ kind: 'done', message: '已按父句段边界自动修正时间细分区间。' });
        }
        return;
      }
    }
    await saveUtteranceTiming(id, start, end);
  }, [layers, defaultTranscriptionLayerId, utterancesOnCurrentMedia, reloadSegments, saveUtteranceTiming, setSaveState]);

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

  useEffect(() => {
    aiAudioTimeRef.current = player.currentTime;
  }, [player.currentTime]);

  // ---- Page-only derived values ----

  // 独立段选中时从 segmentContentByLayer 取文本 | For segment selection, read text from segmentContentByLayer
  const selectedUtteranceText = selectedUtterance
    ? getUtteranceTextForLayer(selectedUtterance)
    : (selectedTimelineUnit?.kind === 'segment'
      ? (segmentContentByLayer.get(selectedTimelineUnit.layerId)?.get(selectedTimelineUnit.unitId)?.text ?? '')
      : '');

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

  useEffect(() => {
    if (!layerCreateMessage) return;
    const timer = window.setTimeout(() => {
      setLayerCreateMessage('');
    }, 3200);
    return () => window.clearTimeout(timer);
  }, [layerCreateMessage, setLayerCreateMessage]);

  usePanelAutoCollapse({
    hoverExpandEnabled,
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
    const currentSelectedUtteranceId = selectedTimelineUnit?.kind === 'utterance'
      ? selectedTimelineUnit.unitId
      : '';
    const prev = previousSelectedUtteranceIdRef.current;
    if (prev !== currentSelectedUtteranceId && segmentLoopPlayback) {
      setSegmentLoopPlayback(false);
    }
    if (prev !== currentSelectedUtteranceId) {
      setSegmentPlaybackRate(1);
    }
    previousSelectedUtteranceIdRef.current = currentSelectedUtteranceId;
  }, [selectedTimelineUnit, segmentLoopPlayback]);

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

  // Wire executeActionRef so useAiToolCallHandler (called earlier) can access executeAction.
  executeActionRef.current = executeAction;

  // ---- Voice Agent ----
  // insertDictation: write dictated text to the active translation or transcription layer
  const handleVoiceDictation = useCallback((text: string) => {
    // 独立层 segment 选中时直接写入 segment content | When a segment is selected on an independent layer, write to segment content
    if (selectedTimelineUnit?.kind === 'segment') {
      fireAndForget(saveSegmentContentForLayer(selectedTimelineUnit.unitId, selectedTimelineUnit.layerId, text));
      return;
    }
    if (!selectedUtterance) {
      reportValidationError({
        message: '请先选择要填充的句段',
        i18nKey: 'transcription.error.validation.voiceDictationUtteranceRequired',
        setErrorState: ({ message, meta }) => setSaveState({ kind: 'error', message, errorMeta: meta }),
      });
      return;
    }
    // Resolve target layer — prefer explicit selection, then first translation
    let targetLayerId: string | undefined = selectedLayerId;
    if (!targetLayerId) {
      targetLayerId = translationLayers[0]?.id;
    }
    if (!targetLayerId) {
      reportValidationError({
        message: '无可用层，请先创建转写或翻译层',
        i18nKey: 'transcription.error.validation.voiceDictationLayerRequired',
        setErrorState: ({ message, meta }) => setSaveState({ kind: 'error', message, errorMeta: meta }),
      });
      return;
    }
    const targetLayer = layers.find((l) => l.id === targetLayerId);
    if (!targetLayer) return;

    if (targetLayer.layerType === 'transcription') {
      fireAndForget(saveUtteranceText(selectedUtterance.id, text, targetLayerId));
    } else {
      fireAndForget(saveTextTranslationForUtterance(selectedUtterance.id, text, targetLayerId));
    }
  }, [selectedTimelineUnit, selectedUtterance, selectedLayerId, layers, translationLayers, saveUtteranceText, saveTextTranslationForUtterance, saveSegmentContentForLayer, setSaveState]);

  // V2: Handle analysis result — write AI analysis text to the current utterance's notes field
  const handleVoiceAnalysisResult = useCallback((utteranceId: string | null, analysisText: string) => {
    if (!utteranceId) {
      reportValidationError({
        message: '请先选择要分析的句段',
        i18nKey: 'transcription.error.validation.voiceAnalysisUtteranceRequired',
        setErrorState: ({ message, meta }) => setSaveState({ kind: 'error', message, errorMeta: meta }),
      });
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
        reportValidationError({
          message: '未找到目标句段',
          i18nKey: 'transcription.error.validation.voiceAnalysisTargetMissing',
          setErrorState: ({ message, meta }) => setSaveState({ kind: 'error', message, errorMeta: meta }),
        });
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
      reportActionError({
        actionLabel: '保存分析结果',
        error: err,
        i18nKey: 'transcription.error.action.voiceAnalysisSaveFailed',
        setErrorState: ({ message, meta }) => setSaveState({ kind: 'error', message, errorMeta: meta }),
      });
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
    activeUtteranceUnitId: selectedTimelineUtteranceId || null,
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
    aiPanelMode,
    aiCurrentTask,
    aiVisibleCards,
    selectedTranslationGapCount,
    onJumpToTranslationGap: handleJumpToTranslationGap,
    onChangeAiPanelMode: setAiPanelMode,
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
    aiPanelMode,
    aiCurrentTask,
    aiVisibleCards,
    selectedTranslationGapCount,
    handleJumpToTranslationGap,
  ]);

  useEffect(() => {
    setAiPanelContext(aiPanelContextValue);
  }, [aiPanelContextValue, setAiPanelContext]);

  const embeddingContextValue = useEmbeddingContextValue({
    selectedUtterance: selectedUtterance ?? null,
    aiEmbeddingBusy,
    aiEmbeddingProgressLabel,
    aiEmbeddingLastResult,
    aiEmbeddingTasks,
    aiEmbeddingMatches,
    aiEmbeddingLastError,
    aiEmbeddingWarning,
    aiEmbeddingBuildStartedAt: null,
    embeddingProviderKind: embeddingProviderConfig.kind,
    embeddingProviderConfig,
    onSetEmbeddingProviderKind: (kind) => {
      setEmbeddingProviderConfig((prev) => ({ ...prev, kind }));
    },
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
  });
  const voiceAgentContextValue = useVoiceAgentContextValue({
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
    voiceEnabled: featureFlags.voiceAgentEnabled,
    onVoiceToggle: voiceAgent.toggle,
    onVoiceSwitchMode: voiceAgent.switchMode,
    onVoiceConfirm: voiceAgent.confirmPending,
    onVoiceCancel: voiceAgent.cancelPending,
    onVoiceSetSafeMode: voiceAgent.setSafeMode,
  });
  const aiChatContextValue = useAiChatContextValue({
    selectedUtterance: selectedUtterance ?? null,
    selectedRowMeta,
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
    observerRecommendations: useMemo(
      () => actionableObserverRecommendations.map((item) => ({ ...item })),
      [actionableObserverRecommendations],
    ),
    onUpdateAiChatSettings: aiChat.updateSettings,
    onTestAiConnection: aiChat.testConnection,
    onSendAiMessage: aiChat.send,
    onStopAiMessage: aiChat.stop,
    onClearAiMessages: aiChat.clear,
    onConfirmPendingToolCall: aiChat.confirmPendingToolCall,
    onCancelPendingToolCall: aiChat.cancelPendingToolCall,
    onJumpToCitation: handleJumpToCitation,
  });
  const aiAssistantHubContextValue = useAiAssistantHubContextValue(aiChatContextValue, voiceAgentContextValue);
  const voiceWidgetProps: VoiceAgentWidgetProps = {
    listening: voiceAgent.listening,
    speechActive: voiceAgent.speechActive,
    mode: voiceAgent.mode,
    interimText: voiceAgent.interimText,
    finalText: voiceAgent.finalText,
    confidence: voiceAgent.confidence,
    error: voiceAgent.error,
    lastIntent: voiceAgent.lastIntent,
    pendingConfirm: voiceAgent.pendingConfirm,
    safeMode: voiceAgent.safeMode,
    wakeWordEnabled: voiceAgent.wakeWordEnabled,
    wakeWordEnergyLevel: voiceAgent.wakeWordEnergyLevel,
    corpusLang: effectiveVoiceCorpusLang,
    langOverride: voiceCorpusLangOverride,
    detectedLang: voiceAgent.detectedLang,
    engine: voiceAgent.engine,
    isRecording: voiceAgent.isRecording,
    energyLevel: voiceAgent.energyLevel,
    agentState: voiceAgent.agentState,
    recordingDuration: voiceAgent.recordingDuration,
    session: voiceAgent.session,
    commercialProviderKind: voiceAgent.commercialProviderKind,
    commercialProviderConfig: voiceAgent.commercialProviderConfig,
    targetSummary: voiceTargetSummary,
    statusSummary: voiceStatusSummary,
    environmentSummary: voiceEnvironmentSummary,
    selectionSummary: voiceSelectionSummary,
    onToggle: handleVoiceAssistantIconClick,
    onMicPointerDown: handleMicPointerDown,
    onMicPointerUp: handleMicPointerUp,
    onSwitchMode: voiceAgent.switchMode,
    onSwitchEngine: handleVoiceSwitchEngine,
    onConfirm: voiceAgent.confirmPending,
    onCancel: voiceAgent.cancelPending,
    onSetSafeMode: voiceAgent.setSafeMode,
    onSetWakeWordEnabled: voiceAgent.setWakeWordEnabled,
    onSetLangOverride: handleVoiceSetLangOverride,
    onSetCommercialProviderKind: voiceAgent.setCommercialProviderKind,
    onCommercialConfigChange: handleVoiceCommercialConfigChange,
    onTestCommercialProvider: voiceAgent.testCommercialProvider,
  };

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

  const handleLaneLabelWidthResizeStart = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (isTimelineLaneHeaderCollapsed) return;

    const startX = e.clientX;
    const startWidth = laneLabelWidth;
    const minWidth = 40;
    const maxWidth = 180;

    const onMove = (ev: PointerEvent) => {
      const dx = ev.clientX - startX;
      const next = Math.max(minWidth, Math.min(maxWidth, startWidth + dx));
      laneLabelWidthRef.current = next;
      setLaneLabelWidth(next);
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      try {
        localStorage.setItem('jieyu:lane-label-width', String(laneLabelWidthRef.current));
      } catch (e) { console.warn('[TranscriptionPage] Failed to save lane-label-width to localStorage', e); }
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }, [isTimelineLaneHeaderCollapsed, laneLabelWidth]);

  const handleWaveformResizeStart = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    waveformResizeRef.current = {
      startY: e.clientY,
      startHeight: waveformHeight,
      startAmplitude: amplitudeScale,
    };
    setIsResizingWaveform(true);
  }, [waveformHeight, amplitudeScale]);

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

  // ── Delete confirmation dialogs ──
  const [audioDeleteConfirm, setAudioDeleteConfirm] = useState<{ filename: string } | null>(null);
  const [projectDeleteConfirm, setProjectDeleteConfirm] = useState<boolean>(false);

  // ── VAD 自动分段 | VAD auto-segmentation ──
  const [autoSegmentBusy, setAutoSegmentBusy] = useState(false);

  const handleAutoSegment = useCallback(() => {
    if (!selectedMediaUrl || autoSegmentBusy) return;
    setAutoSegmentBusy(true);
    fireAndForget((async () => {
      try {
        const audioBuf = await loadAudioBuffer(selectedMediaUrl);
        const segments = detectVadSegments(audioBuf);
        // 过滤已被现有句段覆盖的区间 | Skip time ranges already covered by existing utterances
        const existing = utterancesOnCurrentMedia;
        const newSegs = segments.filter((seg) => {
          return !existing.some(
            (u) => u.startTime < seg.end - 0.05 && u.endTime > seg.start + 0.05,
          );
        });
        for (const seg of newSegs) {
          await createUtteranceFromSelectionRouted(seg.start, seg.end);
        }
        setSaveState({ kind: 'done', message: `VAD 完成，新建 ${newSegs.length} 个句段 | VAD complete: ${newSegs.length} new segments` });
      } catch (err) {
        log.error('VAD auto-segment failed', { error: err instanceof Error ? err.message : String(err) });
        setSaveState({ kind: 'error', message: 'VAD 分段失败 | VAD segmentation failed' });
      } finally {
        setAutoSegmentBusy(false);
      }
    })());
  }, [selectedMediaUrl, autoSegmentBusy, utterancesOnCurrentMedia, createUtteranceFromSelectionRouted]);

  const handleDeleteCurrentAudio = useCallback(() => {
    if (!selectedUtteranceMedia) return;
    setAudioDeleteConfirm({ filename: selectedUtteranceMedia.filename });
  }, [selectedUtteranceMedia]);

  const handleConfirmAudioDelete = useCallback(() => {
    if (!selectedUtteranceMedia) return;
    setAudioDeleteConfirm(null);
    fireAndForget((async () => {
      try {
        await LinguisticService.deleteAudio(selectedUtteranceMedia.id);
        await loadSnapshot();
        selectTimelineUnit(null);
        setSaveState({ kind: 'done', message: t(locale, 'transcription.action.audioDeleted') });
      } catch (error) {
        log.error('Failed to delete current audio', {
          mediaId: selectedUtteranceMedia.id,
          error: error instanceof Error ? error.message : String(error),
        });
        reportActionError({
          actionLabel: t(locale, 'transcription.action.confirmDeleteAudio'),
          error,
          fallbackI18nKey: 'transcription.action.audioDeleteFailed',
          setErrorState: ({ message, meta }) => setSaveState({ kind: 'error', message, errorMeta: meta }),
          fallbackMessage: tf(locale, 'transcription.action.audioDeleteFailed', {
            message: error instanceof Error ? error.message : String(error),
          }),
        });
      }
    })());
  }, [loadSnapshot, locale, selectedUtteranceMedia, selectTimelineUnit, setSaveState]);

  const handleDeleteCurrentProject = useCallback(() => {
    if (!activeTextId) return;
    setProjectDeleteConfirm(true);
  }, [activeTextId]);

  const handleConfirmProjectDelete = useCallback(() => {
    if (!activeTextId) return;
    setProjectDeleteConfirm(false);
    fireAndForget((async () => {
      try {
        await LinguisticService.deleteProject(activeTextId);
        setActiveTextId(null);
        selectTimelineUnit(null);
        await loadSnapshot();
        setSaveState({ kind: 'done', message: t(locale, 'transcription.action.projectDeleted') });
      } catch (error) {
        log.error('Failed to delete current project', {
          textId: activeTextId,
          error: error instanceof Error ? error.message : String(error),
        });
        reportActionError({
          actionLabel: t(locale, 'transcription.action.confirmDeleteProject'),
          error,
          fallbackI18nKey: 'transcription.action.projectDeleteFailed',
          setErrorState: ({ message, meta }) => setSaveState({ kind: 'error', message, errorMeta: meta }),
          fallbackMessage: tf(locale, 'transcription.action.projectDeleteFailed', {
            message: error instanceof Error ? error.message : String(error),
          }),
        });
      }
    })());
  }, [activeTextId, loadSnapshot, locale, selectTimelineUnit, setSaveState]);

  // ── Dialog callbacks for TranscriptionPageDialogs ──
  const handleProjectSetupSubmit = useCallback(async (input: { titleZh: string; titleEn: string; primaryLanguageId: string }) => {
    const result = await LinguisticService.createProject(input);
    setActiveTextId(result.textId);
    setSaveState({ kind: 'done', message: tfB('transcription.action.projectCreated', { title: input.titleZh }) });
    setShowAudioImport(true);
    await loadSnapshot();
  }, [loadSnapshot, setSaveState]);

  const handleAudioImport = useCallback(async (file: File, duration: number) => {
    let textId = activeTextId ?? (await getActiveTextId());
    if (!textId) {
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
    } as import('../db').MediaItemDocType);
    setSaveState({ kind: 'done', message: tfB('transcription.action.audioImported', { filename: file.name }) });
  }, [activeTextId, getActiveTextId, addMediaItem, setSaveState]);

  // ── Batch operation callbacks for TranscriptionPageBatchOps ──
  const handleBatchOffset = useCallback(async (deltaSec: number) => {
    await offsetSelectedTimes(selectedUtteranceIds, deltaSec);
  }, [offsetSelectedTimes, selectedUtteranceIds]);

  const handleBatchScale = useCallback(async (factor: number, anchorTime?: number) => {
    await scaleSelectedTimes(selectedUtteranceIds, factor, anchorTime);
  }, [scaleSelectedTimes, selectedUtteranceIds]);

  const handleBatchSplitByRegex = useCallback(async (pattern: string, flags?: string) => {
    await splitByRegex(selectedUtteranceIds, pattern, flags);
  }, [splitByRegex, selectedUtteranceIds]);

  const handleBatchMerge = useCallback(async () => {
    await mergeSelectedUtterances(selectedUtteranceIds);
  }, [mergeSelectedUtterances, selectedUtteranceIds]);

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
    try {
      localStorage.setItem('jieyu:lane-heights', JSON.stringify(timelineLaneHeights));
    } catch (error) {
      log.warn('Failed to persist lane heights to localStorage', {
        storageKey: 'jieyu:lane-heights',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }, [timelineLaneHeights]);

  // 持久化波形高度到 localStorage | Persist waveform height to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('jieyu:waveform-height', String(waveformHeight));
    } catch (error) {
      log.warn('Failed to persist waveform height to localStorage', {
        storageKey: 'jieyu:waveform-height',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }, [waveformHeight]);

  // 持久化增益倍率到 localStorage | Persist amplitude scale to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('jieyu:amplitude-scale', String(amplitudeScale));
    } catch (error) {
      log.warn('Failed to persist amplitude scale to localStorage', {
        storageKey: 'jieyu:amplitude-scale',
        error: error instanceof Error ? error.message : String(error),
      });
    }
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
    } catch (error) {
      log.warn('Failed to persist video preview height to localStorage', {
        storageKey: 'jieyu:video-preview-height',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }, [videoPreviewHeight]);

  useEffect(() => {
    try {
      localStorage.setItem('jieyu:video-layout-mode', videoLayoutMode);
    } catch (error) {
      log.warn('Failed to persist video layout mode to localStorage', {
        storageKey: 'jieyu:video-layout-mode',
        value: videoLayoutMode,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }, [videoLayoutMode]);

  useEffect(() => {
    try {
      localStorage.setItem('jieyu:video-right-panel-width', String(videoRightPanelWidth));
    } catch (error) {
      log.warn('Failed to persist video right panel width to localStorage', {
        storageKey: 'jieyu:video-right-panel-width',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }, [videoRightPanelWidth]);

  const speakerActionUtteranceIdByUnitId = useMemo(() => {
    const map = new Map<string, string>();
    for (const utterance of utterancesOnCurrentMedia) {
      map.set(utterance.id, utterance.id);
    }
    for (const segments of segmentsByLayer.values()) {
      for (const segment of segments) {
        if (!segment.utteranceId) continue;
        map.set(segment.id, segment.utteranceId);
      }
    }
    return map;
  }, [segmentsByLayer, utterancesOnCurrentMedia]);

  const resolveSpeakerActionUtteranceIds = useCallback((ids: Iterable<string>) => {
    const unique = new Set<string>();
    for (const rawId of ids) {
      const id = rawId.trim();
      if (!id) continue;
      const resolved = speakerActionUtteranceIdByUnitId.get(id);
      if (!resolved) continue;
      unique.add(resolved);
    }
    return Array.from(unique);
  }, [speakerActionUtteranceIdByUnitId]);

  const selectedUtteranceIdsForSpeakerActionsSet = useMemo(() => {
    if (selectedUtteranceIds.size > 0) {
      return new Set(resolveSpeakerActionUtteranceIds(selectedUtteranceIds));
    }
    if (selectedTimelineUnit?.kind === 'utterance' || selectedTimelineUnit?.kind === 'segment') {
      return new Set(resolveSpeakerActionUtteranceIds([selectedTimelineUnit.unitId]));
    }
    return new Set<string>();
  }, [resolveSpeakerActionUtteranceIds, selectedTimelineUnit, selectedUtteranceIds]);

  const selectedBatchUtterances = useMemo(
      () => utterancesOnCurrentMedia
          .filter((utt) => selectedUtteranceIdsForSpeakerActionsSet.has(utt.id))
          .sort((a, b) => a.startTime - b.startTime),
      [selectedUtteranceIdsForSpeakerActionsSet, utterancesOnCurrentMedia],
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
      speakerDialogState,
      speakerVisualByUtteranceId,
      speakerFilterOptions,
      selectedSpeakerSummary,
      handleSelectSpeakerUtterances,
      handleClearSpeakerAssignments,
      handleExportSpeakerSegments,
      handleRenameSpeaker,
      handleMergeSpeaker,
      handleDeleteSpeaker,
      handleAssignSpeakerToUtterances,
      handleCreateSpeakerAndAssignToUtterances,
      handleAssignSpeakerToSelected,
      handleCreateSpeakerAndAssign,
      handleCreateSpeakerOnly,
      closeSpeakerDialog,
      updateSpeakerDialogDraftName,
      updateSpeakerDialogTargetKey,
      confirmSpeakerDialog,
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

  const hasOverlappingUtterancesOnCurrentMedia = useMemo(() => {
    if (utterancesOnCurrentMedia.length < 2) return false;
    const sorted = [...utterancesOnCurrentMedia].sort((a, b) => {
      if (a.startTime !== b.startTime) return a.startTime - b.startTime;
      if (a.endTime !== b.endTime) return a.endTime - b.endTime;
      return a.id.localeCompare(b.id);
    });
    for (let i = 1; i < sorted.length; i += 1) {
      if (sorted[i]!.startTime < sorted[i - 1]!.endTime) {
        return true;
      }
    }
    return false;
  }, [utterancesOnCurrentMedia]);
  const hasOverlappingSegmentsOnActiveLayer = useMemo(() => {
    const activeLayer = layers.find((item) => item.id === activeLayerIdForEdits);
    if (!activeLayer || !layerUsesOwnSegments(activeLayer, defaultTranscriptionLayerId)) return false;
    const segments = segmentsByLayer.get(activeLayer.id) ?? [];
    if (segments.length < 2) return false;
    const sorted = [...segments].sort((a, b) => {
      if (a.startTime !== b.startTime) return a.startTime - b.startTime;
      if (a.endTime !== b.endTime) return a.endTime - b.endTime;
      return a.id.localeCompare(b.id);
    });
    for (let i = 1; i < sorted.length; i += 1) {
      if (sorted[i]!.startTime < sorted[i - 1]!.endTime) {
        return true;
      }
    }
    return false;
  }, [activeLayerIdForEdits, defaultTranscriptionLayerId, layers, segmentsByLayer]);

  // Handle automatic track mode switching when overlapping segments are created or detected
  useEffect(() => {
    if (transcriptionTrackMode === 'single' && (hasOverlappingUtterancesOnCurrentMedia || hasOverlappingSegmentsOnActiveLayer)) {
      setTranscriptionTrackMode('multi-auto');
    }
  }, [hasOverlappingSegmentsOnActiveLayer, hasOverlappingUtterancesOnCurrentMedia, setTranscriptionTrackMode, transcriptionTrackMode]);

  const speakerSortKeyById = useMemo(() => {
    const sorted = [...utterancesOnCurrentMedia].sort((a, b) => {
      if (a.startTime !== b.startTime) return a.startTime - b.startTime;
      if (a.endTime !== b.endTime) return a.endTime - b.endTime;
      return a.id.localeCompare(b.id);
    });
    const next: Record<string, number> = {};
    let order = 0;
    for (const utterance of sorted) {
      const key = getUtteranceSpeakerKey(utterance);
      if (key in next) continue;
      next[key] = order;
      order += 1;
    }
    return next;
  }, [utterancesOnCurrentMedia]);

  const [laneLockMap, setLaneLockMap] = useState<Record<string, number>>({});
  const trackEntityProjectKey = activeTextId?.trim() || '__no-project__';
  const trackEntityMediaId = selectedUtteranceMedia?.id ?? null;
  const trackEntityScopedKey = trackEntityMediaId ? `${trackEntityProjectKey}::${trackEntityMediaId}` : null;

  // ── DB hydration: load track entities from DB when project changes ──────────
  useEffect(() => {
    if (!activeTextId) return;
    let cancelled = false;

    loadTrackEntityStateMapFromDb(activeTextId).then((dbStateMap) => {
      if (cancelled) return;
      trackEntityStateByMediaRef.current = dbStateMap;

      // Hydrate UI state from loaded DB map
      if (trackEntityScopedKey) {
        const saved = dbStateMap[trackEntityScopedKey] ?? null;
        setLaneLockMap(saved?.laneLockMap ?? {});
        setTranscriptionTrackMode(saved?.mode ?? 'single');
      }
    });

    return () => {
      cancelled = true;
    };
  }, [activeTextId]);

  // ── In-memory hydration for media switch (uses already-loaded DB map) ───────
  useEffect(() => {
    if (!trackEntityScopedKey) {
      trackEntityHydratedKeyRef.current = null;
      setLaneLockMap({});
      setTranscriptionTrackMode('single');
      return;
    }
    // Wait for DB hydration to complete (ref is non-null after DB load)
    if (trackEntityStateByMediaRef.current === null) return;
    const saved = getTrackEntityState(trackEntityStateByMediaRef.current, trackEntityScopedKey);
    if (!saved) {
      setLaneLockMap({});
      setTranscriptionTrackMode('single');
      trackEntityHydratedKeyRef.current = trackEntityScopedKey;
      return;
    }
    setLaneLockMap(saved.laneLockMap);
    setTranscriptionTrackMode(saved.mode);
    trackEntityHydratedKeyRef.current = trackEntityScopedKey;
  }, [setTranscriptionTrackMode, trackEntityScopedKey]);

  // ── Persist: write to DB (and LocalStorage for backward compat) ────────────
  useEffect(() => {
    if (!trackEntityScopedKey || !activeTextId) return;
    if (trackEntityHydratedKeyRef.current !== trackEntityScopedKey) return;
    const next = upsertTrackEntityState(
      trackEntityStateByMediaRef.current ?? {},
      trackEntityScopedKey,
      { mode: transcriptionTrackMode, laneLockMap },
    );
    trackEntityStateByMediaRef.current = next;
    // LocalStorage write (fire-and-forget, backward compat during migration window)
    saveTrackEntityStateMap(next, typeof window !== 'undefined' ? window.localStorage : undefined);
    // DB write (primary store)
    void saveTrackEntityStateToDb(activeTextId, trackEntityScopedKey, next[trackEntityScopedKey]!);
  }, [laneLockMap, trackEntityScopedKey, transcriptionTrackMode, activeTextId]);

  const speakerLayerLayout = useMemo(() => buildSpeakerLayerLayoutWithOptions(timelineRenderUtterances, {
    ...(laneLockMap ? { laneLockMap } : {}),
    ...(speakerSortKeyById ? { speakerSortKeyById } : {}),
  }), [laneLockMap, speakerSortKeyById, timelineRenderUtterances]);

  const setTrackDisplayMode = useCallback((mode: typeof transcriptionTrackMode) => {
    setTranscriptionTrackMode(mode);
  }, [setTranscriptionTrackMode]);

  const handleToggleTrackDisplayMode = useCallback(() => {
    setTranscriptionTrackMode((prev) => {
      if (prev === 'single') return 'multi-auto';
      if (prev === 'multi-auto') return 'single';
      return 'multi-auto';
    });
  }, [setTranscriptionTrackMode]);

  const selectedUtteranceIdsForSpeakerActions = useMemo(
    () => Array.from(selectedUtteranceIdsForSpeakerActionsSet),
    [selectedUtteranceIdsForSpeakerActionsSet],
  );

    const speakerQuickActions = useMemo(() => ({
      selectedCount: selectedUtteranceIdsForSpeakerActions.length,
      speakerOptions: speakerOptions.map((speaker) => ({ id: speaker.id, name: speaker.name })),
      onAssignToSelection: (speakerId: string) => {
        fireAndForget(handleAssignSpeakerToUtterances(selectedUtteranceIdsForSpeakerActions, speakerId));
      },
      onClearSelection: () => {
        fireAndForget(handleAssignSpeakerToUtterances(selectedUtteranceIdsForSpeakerActions, undefined));
      },
      onCreateAndAssignToSelection: (name: string) => {
        fireAndForget(handleCreateSpeakerAndAssignToUtterances(name, selectedUtteranceIdsForSpeakerActions));
      },
    }), [handleAssignSpeakerToUtterances, handleCreateSpeakerAndAssignToUtterances, selectedUtteranceIdsForSpeakerActions, speakerOptions]);

  const speakerNameById = useMemo(() => {
    const next: Record<string, string> = {};
    for (const speaker of speakerOptions) {
      next[speaker.id] = speaker.name;
    }
    return next;
  }, [speakerOptions]);

  const selectedSpeakerIdsForTrackLock = useMemo(() => {
    const utteranceMap = new Map(utterancesOnCurrentMedia.map((utterance) => [utterance.id, utterance]));
    const unique = new Set<string>();
    for (const utteranceId of selectedUtteranceIdsForSpeakerActions) {
      const utterance = utteranceMap.get(utteranceId);
      if (!utterance) continue;
      unique.add(getUtteranceSpeakerKey(utterance));
    }
    return Array.from(unique);
  }, [selectedUtteranceIdsForSpeakerActions, utterancesOnCurrentMedia]);

  const selectedSpeakerNamesForTrackLock = useMemo(
    () => selectedSpeakerIdsForTrackLock.map((id) => speakerNameById[id] ?? id),
    [selectedSpeakerIdsForTrackLock, speakerNameById],
  );

  const speakerFocusOptions = useMemo(() => {
    const idsOnCurrentMedia = new Set(utterancesOnCurrentMedia.map((item) => getUtteranceSpeakerKey(item)));
    return speakerOptions
      .filter((speaker) => idsOnCurrentMedia.has(speaker.id))
      .map((speaker) => ({ key: speaker.id, name: speaker.name }));
  }, [speakerOptions, utterancesOnCurrentMedia]);

  const speakerFocusOptionKeySet = useMemo(
    () => new Set(speakerFocusOptions.map((item) => item.key)),
    [speakerFocusOptions],
  );

  const speakerFocusMediaKey = selectedUtteranceMedia?.id ?? '__no-media__';

  const setSpeakerFocusTargetForCurrentMedia = useCallback((nextKey: string | null) => {
    speakerFocusTargetMemoryByMediaRef.current[speakerFocusMediaKey] = nextKey;
    setSpeakerFocusTargetKey(nextKey);
  }, [speakerFocusMediaKey]);

  const resolvedSpeakerFocusTargetKey = useMemo(() => {
    if (speakerFocusTargetKey && speakerFocusTargetKey.trim().length > 0) {
      return speakerFocusOptionKeySet.has(speakerFocusTargetKey) ? speakerFocusTargetKey : null;
    }
    const selectedUtteranceUnitId = selectedTimelineUnit?.kind === 'utterance'
      ? selectedTimelineUnit.unitId
      : '';
    const selected = selectedUtteranceUnitId
      ? utterancesOnCurrentMedia.find((item) => item.id === selectedUtteranceUnitId)
      : undefined;
    if (!selected) return null;
    const selectedKey = getUtteranceSpeakerKey(selected);
    return speakerFocusOptionKeySet.has(selectedKey) ? selectedKey : null;
  }, [selectedTimelineUnit, speakerFocusOptionKeySet, speakerFocusTargetKey, utterancesOnCurrentMedia]);

  const resolvedSpeakerFocusTargetName = useMemo(
    () => resolvedSpeakerFocusTargetKey ? (speakerNameById[resolvedSpeakerFocusTargetKey] ?? resolvedSpeakerFocusTargetKey) : undefined,
    [resolvedSpeakerFocusTargetKey, speakerNameById],
  );

  const cycleSpeakerFocusMode = useCallback(() => {
    setSpeakerFocusMode((prev) => {
      if (prev === 'all') {
        if (!resolvedSpeakerFocusTargetKey) {
          const firstWithSpeaker = utterancesOnCurrentMedia.find((item) => getUtteranceSpeakerKey(item) !== 'unknown-speaker');
          if (firstWithSpeaker) {
            setSpeakerFocusTargetForCurrentMedia(getUtteranceSpeakerKey(firstWithSpeaker));
          }
        }
        return 'focus-soft';
      }
      if (prev === 'focus-soft') return 'focus-hard';
      return 'all';
    });
  }, [resolvedSpeakerFocusTargetKey, setSpeakerFocusTargetForCurrentMedia, utterancesOnCurrentMedia]);

  const handleSpeakerFocusTargetChange = useCallback((speakerKey: string) => {
    const normalized = speakerKey.trim();
    if (normalized.length === 0) {
      setSpeakerFocusTargetForCurrentMedia(null);
      setSpeakerFocusMode('all');
      return;
    }
    setSpeakerFocusTargetForCurrentMedia(normalized);
  }, [setSpeakerFocusTargetForCurrentMedia]);

  useEffect(() => {
    const saved = speakerFocusTargetMemoryByMediaRef.current[speakerFocusMediaKey];
    setSpeakerFocusTargetKey(saved ?? null);
  }, [speakerFocusMediaKey]);

  useEffect(() => {
    if (!speakerFocusTargetKey || speakerFocusTargetKey.trim().length === 0) return;
    if (speakerFocusOptionKeySet.has(speakerFocusTargetKey)) return;
    setSpeakerFocusTargetForCurrentMedia(null);
  }, [setSpeakerFocusTargetForCurrentMedia, speakerFocusOptionKeySet, speakerFocusTargetKey]);

  useEffect(() => {
    if (speakerFocusMode === 'all') return;
    if (resolvedSpeakerFocusTargetKey) return;
    setSpeakerFocusMode('all');
  }, [resolvedSpeakerFocusTargetKey, speakerFocusMode]);

  const handleLockSelectedSpeakersToLane = useCallback((laneIndex: number) => {
    if (!Number.isInteger(laneIndex) || laneIndex < 0) return;
    if (selectedSpeakerIdsForTrackLock.length === 0) return;
    setLaneLockMap((prev) => {
      const next = { ...prev };
      for (const speakerId of selectedSpeakerIdsForTrackLock) {
        next[speakerId] = laneIndex;
      }
      return next;
    });
    setTranscriptionTrackMode('multi-locked');
  }, [selectedSpeakerIdsForTrackLock, setTranscriptionTrackMode]);

  const handleUnlockSelectedSpeakers = useCallback(() => {
    if (selectedSpeakerIdsForTrackLock.length === 0) return;
    setLaneLockMap((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const speakerId of selectedSpeakerIdsForTrackLock) {
        if (!(speakerId in next)) continue;
        delete next[speakerId];
        changed = true;
      }
      return changed ? next : prev;
    });
  }, [selectedSpeakerIdsForTrackLock]);

  const handleResetTrackAutoLayout = useCallback(() => {
    const hadConflict = speakerLayerLayout.lockConflictCount > 0;
    const conflictSpeakers = speakerLayerLayout.lockConflictSpeakerIds.map((id) => speakerNameById[id] ?? id);
    setLaneLockMap({});
    setTranscriptionTrackMode('multi-auto');
    if (hadConflict) {
      setLockConflictToast({
        count: speakerLayerLayout.lockConflictCount,
        speakers: conflictSpeakers,
        nonce: Date.now(),
      });
    }
  }, [setTranscriptionTrackMode, speakerLayerLayout.lockConflictCount, speakerLayerLayout.lockConflictSpeakerIds, speakerNameById]);

  const trackModeLabel = useMemo(() => {
    if (transcriptionTrackMode === 'single') return '单轨';
    if (transcriptionTrackMode === 'multi-locked') return '多轨·锁定';
    return '多轨·自动';
  }, [transcriptionTrackMode]);

  const trackLockDiagnostics = useMemo(() => {
    const speakerNames = speakerLayerLayout.lockConflictSpeakerIds.map((id) => speakerNameById[id] ?? id);
    return {
      count: speakerLayerLayout.lockConflictCount,
      speakerNames,
    };
  }, [speakerLayerLayout.lockConflictCount, speakerLayerLayout.lockConflictSpeakerIds, speakerNameById]);

  const handleOpenLockConflictDetails = useCallback(() => {
    if (trackLockDiagnostics.count <= 0) return;
    setLockConflictToast({
      count: trackLockDiagnostics.count,
      speakers: trackLockDiagnostics.speakerNames,
      nonce: Date.now(),
    });
  }, [trackLockDiagnostics.count, trackLockDiagnostics.speakerNames]);

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
      noteCounts,
      handleNoteClick,
      speakerVisualByUtteranceId,
      independentLayerIds,
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
      deleteLayerWithoutConfirm,
      checkLayerHasContent,
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
      deleteLayerWithoutConfirm,
      checkLayerHasContent,
  ]);

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
            <TranscriptionPageToolbar
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
              canUndo={canUndo}
              canRedo={canRedo}
              undoLabel={undoLabel}
              canDeleteAudio={Boolean(selectedUtteranceMedia)}
              canDeleteProject={Boolean(activeTextId)}
              canToggleNotes={Boolean((selectedTimelineUnit?.kind === 'utterance' && selectedTimelineUnit.unitId) || notePopover)}
              canOpenUttOpsMenu={Boolean(selectedTimelineUnit?.unitId)}
              notePopoverOpen={Boolean(notePopover)}
              showExportMenu={showExportMenu}
              importFileRef={importFileRef}
              exportMenuRef={exportMenuRef}
              onRefresh={() => { void loadSnapshot(); }}
              onUndo={() => { void undo(); }}
              onRedo={() => { void redo(); }}
              onOpenProjectSetup={() => setShowProjectSetup(true)}
              onOpenAudioImport={() => setShowAudioImport(true)}
              onDeleteCurrentAudio={handleDeleteCurrentAudio}
              onDeleteCurrentProject={handleDeleteCurrentProject}
              exportCallbacks={{
                onToggleExportMenu: () => setShowExportMenu((value) => !value),
                onExportEaf: handleExportEaf,
                onExportTextGrid: handleExportTextGrid,
                onExportTrs: handleExportTrs,
                onExportFlextext: handleExportFlextext,
                onExportToolbox: handleExportToolbox,
                onExportJyt: handleExportJyt,
                onExportJym: handleExportJym,
                onImportFile: (file) => { void handleImportFile(file); },
              }}
              onToggleNotes={toggleNotes}
              onOpenUttOpsMenu={(x, y) => setUttOpsMenu({ x, y })}
              lowConfidenceCount={lowConfidenceCount}
              trackModeLabel={trackModeLabel}
              laneLockCount={Object.keys(laneLockMap).length}
              lockConflictCount={trackLockDiagnostics.count}
              lockConflictSpeakerNames={trackLockDiagnostics.speakerNames}
              onOpenLockConflictDetails={handleOpenLockConflictDetails}
              speakerFocusMode={speakerFocusMode}
              {...(resolvedSpeakerFocusTargetName ? { speakerFocusTargetName: resolvedSpeakerFocusTargetName } : {})}
              speakerFocusOptions={speakerFocusOptions}
              speakerFocusTargetKey={speakerFocusTargetKey ?? ''}
              onSpeakerFocusTargetKeyChange={handleSpeakerFocusTargetChange}
              onCycleSpeakerFocusMode={cycleSpeakerFocusMode}
              {...(selectedMediaUrl ? { onAutoSegment: handleAutoSegment } : {})}
              autoSegmentBusy={autoSegmentBusy}
            />
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
{selectedMediaUrl && (
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
                          onVideoPreviewResizeStart={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            videoPreviewResizeRef.current = { startY: e.clientY, startHeight: videoPreviewHeight };
                            setIsResizingVideoPreview(true);
                          }}
                          onVideoRightPanelResizeStart={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
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
                <TranscriptionPageTimelineTop
                  headerProps={{
                    duration: player.duration,
                    utterances: utterancesOnCurrentMedia,
                    rulerView: rulerView ?? null,
                    onSeek: player.seekTo,
                    isReady: player.isReady,
                    currentTime: player.currentTime,
                    zoomPxPerSec,
                    isLaneHeaderCollapsed: isTimelineLaneHeaderCollapsed,
                    onToggleLaneHeader: () => setIsTimelineLaneHeaderCollapsed((v) => !v),
                    instanceRef: player.instanceRef,
                    waveCanvasRef,
                    tierContainerRef,
                  }}
                  showSearch={showSearch}
                  searchProps={{
                    items: searchableItems,
                    currentLayerId: selectedLayerId || undefined,
                    currentUtteranceId: selectedTimelineUtteranceId || undefined,
                    onNavigate: (id) => {
                      manualSelectTsRef.current = Date.now();
                      if (player.isPlaying) {
                        player.stop();
                      }
                      selectUtterance(id);
                    },
                    onReplace: handleSearchReplace,
                    onClose: () => setShowSearch(false),
                  }}
                />
                <TimelineMainSection
                  containerRef={listMainRef}
                  className={`transcription-list-main ${isLayerRailCollapsed ? 'transcription-list-main-rail-collapsed' : ''} ${isTimelineLaneHeaderCollapsed ? 'transcription-list-main-lane-header-collapsed' : ''}`}
                >
                  <TimelineRailSection>
                    <TranscriptionPageLayerRail
                      speakerManagement={{
                        speakerOptions,
                        speakerDraftName,
                        setSpeakerDraftName,
                        batchSpeakerId,
                        setBatchSpeakerId,
                        speakerSaving,
                        activeSpeakerFilterKey,
                        setActiveSpeakerFilterKey,
                        speakerDialogState,
                        speakerVisualByUtteranceId,
                        speakerFilterOptions,
                        selectedSpeakerSummary,
                        selectedUtteranceIds,
                        handleSelectSpeakerUtterances,
                        handleClearSpeakerAssignments,
                        handleExportSpeakerSegments,
                        handleRenameSpeaker,
                        handleMergeSpeaker,
                        handleDeleteSpeaker,
                        handleAssignSpeakerToSelected,
                        handleCreateSpeakerAndAssign,
                        handleCreateSpeakerOnly,
                        closeSpeakerDialog,
                        updateSpeakerDialogDraftName,
                        updateSpeakerDialogTargetKey,
                        confirmSpeakerDialog,
                      }}
                      sidebarProps={{
                        isCollapsed: isLayerRailCollapsed,
                        layerRailTab,
                        onTabChange: setLayerRailTab,
                        layerRailRows,
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
                      <TranscriptionPageTimelineContent
                        selectedMediaUrl={selectedMediaUrl ?? null}
                        playerIsReady={player.isReady}
                        playerDuration={player.duration}
                        layersCount={layers.length}
                        mediaLanesProps={{
                          playerDuration: player.duration,
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
                          allLayersOrdered: layerRailRows,
                          onReorderLayers: reorderLayers,
                          deletableLayers,
                          onFocusLayer: handleFocusLayerRow,
                          layerLinks,
                          showConnectors: showAllLayerConnectors,
                          onToggleConnectors: () => setShowAllLayerConnectors((prev) => !prev),
                          laneHeights: timelineLaneHeights,
                          onLaneHeightChange: handleTimelineLaneHeightChange,
                          trackDisplayMode: transcriptionTrackMode,
                          onToggleTrackDisplayMode: handleToggleTrackDisplayMode,
                          onSetTrackDisplayMode: setTrackDisplayMode,
                          laneLockMap,
                          onLockSelectedSpeakersToLane: handleLockSelectedSpeakersToLane,
                          onUnlockSelectedSpeakers: handleUnlockSelectedSpeakers,
                          onResetTrackAutoLayout: handleResetTrackAutoLayout,
                          selectedSpeakerNamesForLock: selectedSpeakerNamesForTrackLock,
                          speakerSortKeyById,
                          speakerLayerLayout,
                          speakerFocusMode,
                          ...(resolvedSpeakerFocusTargetKey ? { speakerFocusSpeakerKey: resolvedSpeakerFocusTargetKey } : {}),
                          speakerQuickActions,
                          onLaneLabelWidthResize: handleLaneLabelWidthResizeStart,
                          segmentsByLayer,
                          segmentContentByLayer,
                          saveSegmentContentForLayer,
                        }}
                        textOnlyProps={{
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
                          allLayersOrdered: layerRailRows,
                          onReorderLayers: reorderLayers,
                          deletableLayers,
                          onFocusLayer: handleFocusLayerRow,
                          navigateUtteranceFromInput,
                          layerLinks,
                          showConnectors: showAllLayerConnectors,
                          onToggleConnectors: () => setShowAllLayerConnectors((prev) => !prev),
                          laneHeights: timelineLaneHeights,
                          onLaneHeightChange: handleTimelineLaneHeightChange,
                          trackDisplayMode: transcriptionTrackMode,
                          onToggleTrackDisplayMode: handleToggleTrackDisplayMode,
                          onSetTrackDisplayMode: setTrackDisplayMode,
                          laneLockMap,
                          onLockSelectedSpeakersToLane: handleLockSelectedSpeakersToLane,
                          onUnlockSelectedSpeakers: handleUnlockSelectedSpeakers,
                          onResetTrackAutoLayout: handleResetTrackAutoLayout,
                          selectedSpeakerNamesForLock: selectedSpeakerNamesForTrackLock,
                          speakerFocusMode,
                          ...(resolvedSpeakerFocusTargetKey ? { speakerFocusSpeakerKey: resolvedSpeakerFocusTargetKey } : {}),
                          speakerVisualByUtteranceId,
                          speakerQuickActions,
                          onLaneLabelWidthResize: handleLaneLabelWidthResizeStart,
                        }}
                        emptyStateProps={{
                          locale,
                          layersCount: layers.length,
                          hasSelectedMedia: Boolean(selectedMediaUrl),
                          onCreateTranscriptionLayer: () => layerAction.setLayerActionPanel('create-transcription'),
                          onOpenImportFile: () => importFileRef.current?.click(),
                        }}
                      />
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
                <VoiceAgentProvider value={voiceAgentContextValue}>
                  <AiChatProvider value={aiChatContextValue}>
                    <AiAssistantHubContext.Provider value={aiAssistantHubContextValue}>
                      <ToastController
                        voiceAgent={voiceAgent}
                        saveState={saveState}
                        recording={recording}
                        recordingUtteranceId={recordingUtteranceId}
                        recordingError={recordingError}
                        overlapCycleToast={overlapCycleToast}
                        lockConflictToast={lockConflictToast}
                        tf={tfB}
                      />
                      <Suspense fallback={null}>
                        <TranscriptionPageAiSidebar
                          locale={locale}
                          isAiPanelCollapsed={isAiPanelCollapsed}
                          hubSidebarTab={hubSidebarTab}
                          onHubSidebarTabChange={setHubSidebarTab}
                          featureVoiceAgentEnabled={featureFlags.voiceAgentEnabled}
                          assistantVoiceExpanded={assistantVoiceExpanded}
                          onAssistantVoicePanelToggle={handleAssistantVoicePanelToggle}
                          voiceWidgetProps={voiceWidgetProps}
                          analysisTab={analysisTab}
                          onAnalysisTabChange={setAnalysisTab}
                          embeddingContextValue={embeddingContextValue}
                        />
                      </Suspense>
                    </AiAssistantHubContext.Provider>
                  </AiChatProvider>
                </VoiceAgentProvider>
              </AiPanelContext.Provider>

              <TranscriptionPageDialogs
                speakerDialogState={speakerDialogState}
                speakerSaving={speakerSaving}
                onCloseSpeakerDialog={closeSpeakerDialog}
                onConfirmSpeakerDialog={confirmSpeakerDialog}
                onDraftNameChange={updateSpeakerDialogDraftName}
                onTargetSpeakerChange={updateSpeakerDialogTargetKey}
                showProjectSetup={showProjectSetup}
                onCloseProjectSetup={() => setShowProjectSetup(false)}
                onSubmitProjectSetup={handleProjectSetupSubmit}
                showAudioImport={showAudioImport}
                onCloseAudioImport={() => setShowAudioImport(false)}
                onImportAudio={handleAudioImport}
                mediaFileInputRef={mediaFileInputRef}
                onDirectMediaImport={handleDirectMediaImport}
                audioDeleteConfirm={audioDeleteConfirm}
                onCancelAudioDelete={() => setAudioDeleteConfirm(null)}
                onConfirmAudioDelete={handleConfirmAudioDelete}
                projectDeleteConfirm={projectDeleteConfirm}
                onCancelProjectDelete={() => setProjectDeleteConfirm(false)}
                onConfirmProjectDelete={handleConfirmProjectDelete}
                showShortcuts={showShortcuts}
                onCloseShortcuts={() => setShowShortcuts(false)}
                isFocusMode={isFocusMode}
                onExitFocusMode={() => setIsFocusMode(false)}
                locale={locale}
                pdfPreview={pdfPreview}
                pdfPreviewDragging={pdfPreviewDragging}
                pdfPreviewPos={pdfPreviewPos}
                pdfPreviewRef={pdfPreviewRef}
                onPdfPreviewDragStart={handlePdfPreviewDragStart}
                onPdfPreviewPageChange={handlePdfPreviewPageChange}
                onPdfPreviewOpenExternal={handlePdfPreviewOpenExternal}
                onPdfPreviewClose={handleClosePdfPreview}
              />
            </main>
          </ToastProvider>

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
        </>
      )}
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
        speakerFilterOptions={speakerFilterOptions}
        onAssignSpeakerFromMenu={(utteranceIds, speakerId) => {
          fireAndForget(handleAssignSpeakerToUtterances(resolveSpeakerActionUtteranceIds(utteranceIds), speakerId));
        }}
        onCreateSpeakerAndAssignFromMenu={(name, utteranceIds) => {
          fireAndForget(handleCreateSpeakerAndAssignToUtterances(name, resolveSpeakerActionUtteranceIds(utteranceIds)));
        }}
      />
    </section>
  );
}

// Alias for the original name expected by consumers
export { TranscriptionPageOrchestrator as TranscriptionPage };
