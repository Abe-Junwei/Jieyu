/**
 * TranscriptionPage - Orchestrator
 *
 * Single source of truth for ALL hooks, state, and useEffect hooks.
 * Renders all sub-components in the correct layout positions.
 */

import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { detectVadSegments, loadAudioBuffer } from '../services/VadService';
import {
  Merge as _Merge,
  Pause as _Pause,
} from 'lucide-react';
import type { AiPanelMode, AnalysisBottomTab } from '../components/AiAnalysisPanel';
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
import { NoteDocumentIcon } from '../components/NoteDocumentIcon';
import { TrackFocusToolbarControls } from '../components/transcription/toolbar/TrackFocusToolbarControls';
import { LinguisticService } from '../services/LinguisticService';
import {
  getDb,
  type LayerSegmentContentDocType,
} from '../db';
import { TranscriptionEditorContext } from '../contexts/TranscriptionEditorContext';
import { useAiPanelContextUpdater, AiPanelContext } from '../contexts/AiPanelContext';
import { ToastProvider } from '../contexts/ToastContext';
import { useTranscriptionData } from '../hooks/useTranscriptionData';
import { useRecording } from '../hooks/useRecording';
import { useUtteranceOps } from '../hooks/useUtteranceOps';
import { useLasso, type SubSelectDrag } from '../hooks/useLasso';
import { useWaveSurfer } from '../hooks/useWaveSurfer';
import { useZoom } from '../hooks/useZoom';
import { useKeybindingActions } from '../hooks/useKeybindingActions';
import { useJKLShuttle } from '../hooks/useJKLShuttle';
import { useAiChat, type AiChatToolCall, type AiToolRiskCheckResult } from '../hooks/useAiChat';
import { useImportExport } from '../hooks/useImportExport';
import { useLayerActionPanel } from '../hooks/useLayerActionPanel';
import { useAiPanelLogic, taskToPersona } from '../hooks/useAiPanelLogic';
import { useNoteHandlers } from '../hooks/useNoteHandlers';
import { useTimelineAnnotationHelpers } from '../hooks/useTimelineAnnotationHelpers';
import { useAiToolCallHandler } from '../hooks/useAiToolCallHandler';
import { useMediaImport } from '../hooks/useMediaImport';
import { useTranscriptionUIState } from './TranscriptionPage.UIState';
import { resolveLanguageQuery, SUPPORTED_VOICE_LANGS } from '../utils/langMapping';
import {
  APP_SHELL_OPEN_SEARCH_EVENT,
  type AppShellOpenSearchDetail,
} from '../utils/appShellEvents';
import { useTimelineResize } from '../hooks/useTimelineResize';
import { useDialogs } from '../hooks/useDialogs';
import { useLayerSegments, getLayerEditMode, layerUsesOwnSegments, resolveSegmentTimelineSourceLayer } from '../hooks/useLayerSegments';
import { useLayerSegmentContents } from '../hooks/useLayerSegmentContents';
import { LayerSegmentationV2Service } from '../services/LayerSegmentationV2Service';
import { usePanelResize } from '../hooks/usePanelResize';
import { usePanelAutoCollapse } from '../hooks/usePanelAutoCollapse';
import { usePanelToggles } from '../hooks/usePanelToggles';
import { useRecoveryBanner } from '../hooks/useRecoveryBanner';
import { useAiChatContextValue } from '../hooks/useAiChatContextValue';
import { useSpeakerActions, getUtteranceSpeakerKey } from '../hooks/useSpeakerActions';
import {
  isSegmentTimelineUnit,
  isUtteranceTimelineUnit,
  resolveTimelineLayerIdFallback,
} from '../hooks/transcriptionTypes';
import { DEFAULT_TIMELINE_LANE_HEIGHT } from '../hooks/useTimelineLaneHeightResize';
import type { AiObserverRecommendation } from '../components/transcription/toolbar/ObserverStatus';
import { detectLocale, t, tf } from '../i18n';
import { createLogger } from '../observability/logger';
import { fireAndForget } from '../utils/fireAndForget';
import { reportActionError } from '../utils/actionErrorReporter';
import { reportValidationError } from '../utils/validationErrorReporter';
import { formatLayerRailLabel, formatTime } from '../utils/transcriptionFormatters';
import { buildLayerLinkConnectorLayout } from '../utils/layerLinkConnector';
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
import {
  type LayerSegmentGraphSnapshot,
  restoreLayerSegmentGraphSnapshot,
  snapshotLayerSegmentGraphByLayerIds,
} from '../services/LayerSegmentGraphService';
import type { EmbeddingProviderKind } from '../ai/embeddings/EmbeddingProvider';
import { createDeferredEmbeddingSearchService } from '../ai/embeddings/DeferredEmbeddingSearchService';
import { listRecentAiToolDecisionLogs } from '../ai/auditReplay';
import {
  loadEmbeddingProviderConfig,
} from './TranscriptionPage.helpers';
import { buildTranscriptionAiPromptContext } from './TranscriptionPage.aiPromptContext';
import {
  createPdfPreviewOpenRequest,
} from './TranscriptionPage.runtimeProps';
import { useTranscriptionRuntimeProps } from './useTranscriptionRuntimeProps';
import { useSpeakerFocusController } from './useSpeakerFocusController';
import { useWaveformRuntimeController } from './useWaveformRuntimeController';
import { useBatchOperationController } from './useBatchOperationController';
import { useSpeakerActionScopeController } from './useSpeakerActionScopeController';
import { useSpeakerActionRoutingController } from './useSpeakerActionRoutingController';
import { useTranscriptionAssistantController } from './useTranscriptionAssistantController';
import { useTranscriptionSegmentCreationController } from './useTranscriptionSegmentCreationController';
import { useTranscriptionSegmentMutationController } from './useTranscriptionSegmentMutationController';
import { useTranscriptionTimelineController } from './useTranscriptionTimelineController';
import { useTranscriptionTimelineInteractionController } from './useTranscriptionTimelineInteractionController';
import { useTrackDisplayController } from './useTrackDisplayController';
import { useWaveformSelectionController } from './useWaveformSelectionController';
import { resolveNextUtteranceIdForDictation } from './voiceDictationFlow';

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
  const layerById = useMemo(() => new Map(layers.map((layer) => [layer.id, layer] as const)), [layers]);
  const mediaItemById = useMemo(() => new Map(_mediaItems.map((item) => [item.id, item] as const)), [_mediaItems]);
  const selectedTimelineSegment = useMemo(
    () => (isSegmentTimelineUnit(selectedTimelineUnit)
      ? (segmentsByLayer.get(selectedTimelineUnit.layerId)?.find((segment) => segment.id === selectedTimelineUnit.unitId) ?? null)
      : null),
    [segmentsByLayer, selectedTimelineUnit],
  );
  const selectedTimelineOwnerUtterance = useMemo(() => {
    if (selectedUtterance) return selectedUtterance;
    if (!selectedTimelineSegment) return null;

    const explicitOwnerId = selectedTimelineSegment.utteranceId?.trim();
    if (explicitOwnerId) {
      return utterances.find((item) => item.id === explicitOwnerId) ?? null;
    }

    return utterances.find((item) => {
      if (selectedTimelineSegment.mediaId && item.mediaId !== selectedTimelineSegment.mediaId) {
        return false;
      }
      return item.startTime <= selectedTimelineSegment.endTime - 0.01
        && item.endTime >= selectedTimelineSegment.startTime + 0.01;
    }) ?? null;
  }, [selectedTimelineSegment, selectedUtterance, utterances]);
  const selectedTimelineMedia = useMemo(() => {
    if (selectedUtteranceMedia) return selectedUtteranceMedia;
    const mediaId = selectedTimelineSegment?.mediaId ?? selectedTimelineOwnerUtterance?.mediaId ?? '';
    return mediaId ? mediaItemById.get(mediaId) : undefined;
  }, [mediaItemById, selectedTimelineOwnerUtterance?.mediaId, selectedTimelineSegment?.mediaId, selectedUtteranceMedia]);
  const selectedTimelineUnitForTime = selectedTimelineSegment ?? selectedTimelineOwnerUtterance ?? null;
  const selectedTimelineRowMeta = useMemo(() => {
    if (!selectedTimelineOwnerUtterance) return null;

    const rowIndex = utterancesOnCurrentMedia.findIndex((item) => item.id === selectedTimelineOwnerUtterance.id);
    if (rowIndex >= 0) {
      const row = utterancesOnCurrentMedia[rowIndex];
      if (!row) return null;
      return {
        rowNumber: rowIndex + 1,
        start: row.startTime,
        end: row.endTime,
      };
    }

    const sameMediaRows = [...utterances]
      .filter((item) => item.mediaId === selectedTimelineOwnerUtterance.mediaId)
      .sort((a, b) => a.startTime - b.startTime);
    const fallbackIndex = sameMediaRows.findIndex((item) => item.id === selectedTimelineOwnerUtterance.id);
    const fallbackRow = fallbackIndex >= 0 ? sameMediaRows[fallbackIndex] : undefined;
    if (!fallbackRow) return null;
    return {
      rowNumber: fallbackIndex + 1,
      start: fallbackRow.startTime,
      end: fallbackRow.endTime,
    };
  }, [selectedTimelineOwnerUtterance, utterances, utterancesOnCurrentMedia]);
  const nextUtteranceIdForVoiceDictation = useMemo(() => {
    return resolveNextUtteranceIdForDictation({
      utteranceIdsOnCurrentMedia: utterancesOnCurrentMedia.map((item) => item.id),
      activeUtteranceId: selectedTimelineOwnerUtterance?.id,
    });
  }, [selectedTimelineOwnerUtterance?.id, utterancesOnCurrentMedia]);

  const independentLayerIds = useMemo(() => new Set(
    layers.filter((layer) => layerUsesOwnSegments(layer, defaultTranscriptionLayerId)).map((layer) => layer.id),
  ), [layers, defaultTranscriptionLayerId]);
  const noteTimelineUnitIds = useMemo(() => {
    const ids = new Set<string>();
    for (const utterance of utterances) {
      ids.add(utterance.id);
    }
    for (const segments of segmentsByLayer.values()) {
      for (const segment of segments) {
        ids.add(segment.id);
      }
    }
    return [...ids];
  }, [segmentsByLayer, utterances]);
  const segmentTimelineLayerIds = useMemo(() => new Set(
    layers
      .filter((layer) => Boolean(resolveSegmentTimelineSourceLayer(layer, layerById, defaultTranscriptionLayerId)))
      .map((layer) => layer.id),
  ), [defaultTranscriptionLayerId, layerById, layers]);

  const segmentUndoSnapshotRef = useRef<LayerSegmentGraphSnapshot>({
    segments: [],
    contents: [],
    links: [],
  });

  const refreshSegmentUndoSnapshot = useCallback(async () => {
    if (independentLayerIds.size === 0) {
      segmentUndoSnapshotRef.current = { segments: [], contents: [], links: [] };
      return;
    }
    const db = await getDb();
    segmentUndoSnapshotRef.current = await snapshotLayerSegmentGraphByLayerIds(db, [...independentLayerIds]);
  }, [independentLayerIds]);

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
      await restoreLayerSegmentGraphSnapshot(db, { segments, contents, links }, [...independentLayerIds]);
      await reloadSegments();
      await reloadSegmentContents();
      await refreshSegmentUndoSnapshot();
    },
  };

  const saveSegmentContentForLayer = useCallback(async (segmentId: string, layerId: string, value: string) => {
    const layer = layerById.get(layerId);
    if (!layer) return;
    const sourceLayer = resolveSegmentTimelineSourceLayer(layer, layerById, defaultTranscriptionLayerId);
    if (!sourceLayer) return;
    const now = new Date().toISOString();
    const trimmed = value.trim();
    const existing = segmentContentByLayer.get(layerId)?.get(segmentId);

    if (!trimmed) {
      if (existing) {
        await LayerSegmentationV2Service.deleteSegmentContent(existing.id);
      }
      await reloadSegmentContents();
      return;
    }

    const segment = (segmentsByLayer.get(sourceLayer.id) ?? []).find((item) => item.id === segmentId);
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
    await LayerSegmentationV2Service.upsertSegmentContent(next);
    await reloadSegmentContents();
    await refreshSegmentUndoSnapshot();
  }, [defaultTranscriptionLayerId, layerById, refreshSegmentUndoSnapshot, reloadSegmentContents, resolveSegmentTimelineSourceLayer, segmentContentByLayer, segmentsByLayer]);

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
  const [showAllLayerConnectors, setShowAllLayerConnectors] = useState(true);
  const [layerConnectorVisibilityTouched, setLayerConnectorVisibilityTouched] = useState(false);
  const [pdfPreviewRequest, setPdfPreviewRequest] = useState<import('./TranscriptionPage.PdfRuntime').PdfPreviewOpenRequest | null>(null);
  const pdfPreviewRequestNonceRef = useRef(0);

  const openPdfPreviewRequest = useCallback((input: {
    title: string;
    page: number | null;
    sourceUrl?: string;
    sourceBlob?: Blob;
    hashSuffix?: string;
    searchSnippet?: string;
  }) => {
    pdfPreviewRequestNonceRef.current += 1;
    setPdfPreviewRequest(createPdfPreviewOpenRequest({
      nonce: pdfPreviewRequestNonceRef.current,
      title: input.title,
      page: input.page,
      ...(input.sourceUrl ? { sourceUrl: input.sourceUrl } : {}),
      ...(input.sourceBlob ? { sourceBlob: input.sourceBlob } : {}),
      ...(input.hashSuffix ? { hashSuffix: input.hashSuffix } : {}),
      ...(input.searchSnippet ? { searchSnippet: input.searchSnippet } : {}),
    }));
  }, []);

  const handleFocusLayerRow = useCallback((id: string) => {
    setFocusedLayerRowId(id);
    setSelectedLayerId(id);
    if (flashLayerRowId && flashLayerRowId !== id) {
      setFlashLayerRowId('');
    }
  }, [flashLayerRowId, setSelectedLayerId]);

  const hasAnyLayerConnectors = useMemo(
    () => buildLayerLinkConnectorLayout(orderedLayers, layerLinks).maxColumns > 0,
    [layerLinks, orderedLayers],
  );

  useEffect(() => {
    if (!hasAnyLayerConnectors) {
      setShowAllLayerConnectors(false);
      return;
    }
    if (!layerConnectorVisibilityTouched) {
      setShowAllLayerConnectors(true);
    }
  }, [hasAnyLayerConnectors, layerConnectorVisibilityTouched]);

  const handleToggleAllLayerConnectors = useCallback(() => {
    if (!hasAnyLayerConnectors) return;
    setLayerConnectorVisibilityTouched(true);
    setShowAllLayerConnectors((prev) => !prev);
  }, [hasAnyLayerConnectors]);

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
  const [searchOverlayRequest, setSearchOverlayRequest] = useState<AppShellOpenSearchDetail | null>(null);

  const openSearchFromRequest = useCallback((detail: AppShellOpenSearchDetail = {}) => {
    setSearchOverlayRequest(detail);
    setShowSearch(true);
  }, [setShowSearch]);

  useEffect(() => {
    if (!appSearchRequest) return;
    openSearchFromRequest(appSearchRequest);
    onConsumeAppSearchRequest?.();
  }, [appSearchRequest, onConsumeAppSearchRequest, openSearchFromRequest]);

  useEffect(() => {
    const handleOpenSearch = (event: Event) => {
      const detail = (event as CustomEvent<AppShellOpenSearchDetail>).detail ?? {};
      openSearchFromRequest(detail);
    };
    window.addEventListener(APP_SHELL_OPEN_SEARCH_EVENT, handleOpenSearch as EventListener);
    return () => window.removeEventListener(APP_SHELL_OPEN_SEARCH_EVENT, handleOpenSearch as EventListener);
  }, [openSearchFromRequest]);

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
  const embeddingSearchService = useMemo(
    () => createDeferredEmbeddingSearchService(() => embeddingProviderConfig),
    [embeddingProviderConfig],
  );
  const [aiToolDecisionLogs, setAiToolDecisionLogs] = useState<Array<{
    id: string;
    toolName: string;
    decision: string;
    requestId?: string;
    timestamp: string;
  }>>([]);
  const [aiSidebarError, setAiSidebarError] = useState<string | null>(null);

  const refreshAiToolDecisionLogs = useCallback(async () => {
    const normalized = await listRecentAiToolDecisionLogs(6);
    setAiToolDecisionLogs(normalized);
  }, []);

  // Media import hook
  const { mediaFileInputRef, handleDirectMediaImport } = useMediaImport({
    activeTextId,
    getActiveTextId,
    addMediaItem,
    setSaveState,
    setActiveTextId,
    tf: (key: string, opts?: Record<string, unknown>) => tf(locale, key as Parameters<typeof tf>[1], opts as Parameters<typeof tf>[2]),
  });

  // Pre-declare executeActionRef before useAiToolCallHandler; populated after useKeybindingActions.
  const executeActionRef = useRef<((actionId: string) => void) | undefined>(undefined);
  const openSearchRef = useRef<typeof openSearchFromRequest | undefined>(undefined);
  const seekToTimeRef = useRef<((timeSeconds: number) => void) | undefined>(undefined);
  const splitAtTimeRef = useRef<((timeSeconds: number) => boolean) | undefined>(undefined);
  const zoomToSegmentRef = useRef<((segmentId: string, zoomLevel?: number) => boolean) | undefined>(undefined);
  const handleWaveformRegionAltPointerDownRef = useRef<((regionId: string, time: number, pointerId: number, clientX: number) => void) | undefined>(undefined);
  const handleWaveformRegionClickRef = useRef<((regionId: string, clickTime: number, event: MouseEvent) => void) | undefined>(undefined);
  const handleWaveformRegionDoubleClickRef = useRef<((regionId: string, start: number, end: number) => void) | undefined>(undefined);
  const handleWaveformRegionCreateRef = useRef<((start: number, end: number) => void) | undefined>(undefined);
  const handleWaveformRegionContextMenuRef = useRef<((regionId: string, x: number, y: number) => void) | undefined>(undefined);
  const handleWaveformRegionUpdateRef = useRef<((regionId: string, start: number, end: number) => void) | undefined>(undefined);
  const handleWaveformRegionUpdateEndRef = useRef<((regionId: string, start: number, end: number) => void) | undefined>(undefined);
  const handleWaveformTimeUpdateRef = useRef<((time: number) => void) | undefined>(undefined);
  openSearchRef.current = openSearchFromRequest;

  const handleAiToolCall = useAiToolCallHandler({
    utterances,
    selectedUtterance: selectedTimelineOwnerUtterance ?? undefined,
    selectedUtteranceMedia: selectedTimelineMedia,
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
    openSearch: (detail) => openSearchRef.current?.(detail),
    seekToTime: (timeSeconds) => seekToTimeRef.current?.(timeSeconds),
    splitAtTime: (timeSeconds) => splitAtTimeRef.current?.(timeSeconds) ?? false,
    zoomToSegment: (segmentId, zoomLevel) => zoomToSegmentRef.current?.(segmentId, zoomLevel) ?? false,
  });

  const buildAiPromptContext = useCallback(() => {
    return buildTranscriptionAiPromptContext({
      selectedTimelineUnit,
      selectedUtterance: selectedUtterance ?? null,
      selectedLayerId,
      layers,
      segmentsByLayer,
      segmentContentByLayer,
      getUtteranceTextForLayer,
      formatTime,
      utteranceCount: state.phase === 'ready' ? state.utteranceCount : utterances.length,
      translationLayerCount: state.phase === 'ready' ? state.translationLayerCount : translationLayers.length,
      aiConfidenceAvg,
      observerStage: aiObserverStageRef.current,
      topLexemes: aiLexemeSummaryRef.current,
      recommendations: aiRecommendationRef.current,
      audioTimeSec: aiAudioTimeRef.current,
      recentEdits: undoHistory.slice(0, 5).map((item) => String(item)),
    });
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
    const translationLayerCountWithContent = translations.filter((item) => {
      if (item.utteranceId !== utteranceId) return false;
      if (typeof item.translationAudioMediaId === 'string' && item.translationAudioMediaId.trim().length > 0) {
        return true;
      }
      if (!(item.modality === 'text' || item.modality === 'mixed')) return false;
      return typeof item.text === 'string' && item.text.trim().length > 0;
    }).length;

    const hasAnyContent = transcriptionText.length > 0 || translationLayerCountWithContent > 0;
    if (!hasAnyContent) {
      return { requiresConfirmation: false };
    }

    return {
      requiresConfirmation: true,
      riskSummary: `将删除第 ${rowIndex} 条句段（${timeRange}）`,
      impactPreview: [
        `内容预览：${transcriptionPreview}`,
        `关联影响：${translationLayerCountWithContent} 个翻译层包含内容，删除后会失去关联`,
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

  useEffect(() => {
    fireAndForget(refreshAiToolDecisionLogs());
  }, [aiChat.pendingToolCall, refreshAiToolDecisionLogs]);

  const waveformAreaRef = useRef<HTMLDivElement | null>(null);

  const utteranceRowRef = useRef<Record<string, HTMLDivElement | null>>({});
  const waveCanvasRef = useRef<HTMLDivElement | null>(null);
  const {
    waveformHeight,
    amplitudeScale,
    setAmplitudeScale,
    isResizingWaveform,
    handleWaveformResizeStart,
  } = useWaveformRuntimeController();
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

  // 路由拆分/合并：独立边界层 → segment 操作，默认 → utterance 操作 | Routed split/merge: independent layers → segment ops, default → utterance ops
  const activeLayerIdForEdits = resolveTimelineLayerIdFallback({
    selectedLayerId,
    focusedLayerId: focusedLayerRowId,
    selectedTimelineUnitLayerId: selectedTimelineUnit?.layerId,
    defaultTranscriptionLayerId,
    firstTranscriptionLayerId: transcriptionLayers[0]?.id,
  });
  const resolveSegmentRoutingForLayer = useCallback((layerId?: string) => {
    const layer = layerId ? layerById.get(layerId) : undefined;
    const segmentSourceLayer = resolveSegmentTimelineSourceLayer(layer, layerById, defaultTranscriptionLayerId);
    return {
      layer,
      segmentSourceLayer,
      sourceLayerId: segmentSourceLayer?.id ?? '',
      usesSegmentTimeline: Boolean(segmentSourceLayer),
      editMode: getLayerEditMode(segmentSourceLayer ?? layer, defaultTranscriptionLayerId),
    };
  }, [defaultTranscriptionLayerId, layerById]);

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

  // ---- Player (WaveSurfer) ----

  const {
    useSegmentWaveformRegions,
    waveformTimelineItems,
    waveformRegions,
    selectedWaveformRegionId,
    waveformActiveRegionIds,
    waveformPrimaryRegionId,
    selectedWaveformTimelineItem,
  } = useWaveformSelectionController({
    activeLayerIdForEdits,
    layers,
    layerById,
    ...(defaultTranscriptionLayerId !== undefined ? { defaultTranscriptionLayerId } : {}),
    segmentsByLayer,
    utterancesOnCurrentMedia,
    selectedTimelineUnit,
    selectedUtteranceIds,
  });

  // --- 百分比 → px/s 换算 ---
  // 用 ref 追踪 duration 使得计算可以在 useWaveSurfer 调用前进行
  const lastDurationRef = useRef(0);
  const containerWidth = waveCanvasRef.current?.clientWidth || 800;

  // Refs for waveform lasso effect (avoid effect dependency churn)
  const zoomPxPerSecRef = useRef(0);
  const previousSelectedTimelineUnitIdRef = useRef(selectedTimelineUnit?.unitId ?? '');
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
    enableEmptyDragCreate: useSegmentWaveformRegions,
    zoomLevel: zoomPxPerSec,
    startMarker: segMarkStart ?? undefined,
    subSelection: subSelectionRange,
    waveformHeight,
    amplitudeScale,
    onRegionAltPointerDown: (regionId, time, pointerId, _clientX) => {
      handleWaveformRegionAltPointerDownRef.current?.(regionId, time, pointerId, _clientX);
    },
    onRegionClick: (regionId, clickTime, event) => {
      handleWaveformRegionClickRef.current?.(regionId, clickTime, event);
    },
    onRegionDblClick: (_regionId, start, end) => {
      handleWaveformRegionDoubleClickRef.current?.(_regionId, start, end);
    },
    onRegionUpdate: (regionId, start, end) => {
      handleWaveformRegionUpdateRef.current?.(regionId, start, end);
    },
    onRegionUpdateEnd: (regionId, start, end) => {
      handleWaveformRegionUpdateEndRef.current?.(regionId, start, end);
    },
    onRegionCreate: (start, end) => {
      handleWaveformRegionCreateRef.current?.(start, end);
    },
    onRegionContextMenu: (regionId, x, y) => {
      handleWaveformRegionContextMenuRef.current?.(regionId, x, y);
    },
    onTimeUpdate: (time) => {
      handleWaveformTimeUpdateRef.current?.(time);
    },
  });

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
    const result: { uttId: string; leftPx: number; widthPx: number; count: number; layerId?: string }[] = [];
    for (const item of waveformTimelineItems) {
      const noteIndicator = resolveNoteIndicatorTarget(item.id, activeLayerIdForEdits || undefined);
      if (!noteIndicator) continue;
      const leftPx = item.startTime * zoomPxPerSec - waveformScrollLeft;
      const widthPx = (item.endTime - item.startTime) * zoomPxPerSec;
      result.push({
        uttId: item.id,
        leftPx,
        widthPx,
        count: noteIndicator.count,
        ...(noteIndicator.layerId ? { layerId: noteIndicator.layerId } : {}),
      });
    }
    return result;
  }, [activeLayerIdForEdits, player.isReady, resolveNoteIndicatorTarget, waveformScrollLeft, waveformTimelineItems, zoomPxPerSec]);

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
    selectedUtteranceUnitId: selectedWaveformRegionId,
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

  handleWaveformRegionAltPointerDownRef.current = handleWaveformRegionAltPointerDown;
  handleWaveformRegionClickRef.current = handleWaveformRegionClick;
  handleWaveformRegionDoubleClickRef.current = handleWaveformRegionDoubleClick;
  handleWaveformRegionCreateRef.current = handleWaveformRegionCreate;
  handleWaveformRegionContextMenuRef.current = handleWaveformRegionContextMenu;
  handleWaveformRegionUpdateRef.current = handleWaveformRegionUpdate;
  handleWaveformRegionUpdateEndRef.current = handleWaveformRegionUpdateEnd;
  handleWaveformTimeUpdateRef.current = handleWaveformTimeUpdate;
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

  useEffect(() => {
    aiAudioTimeRef.current = player.currentTime;
  }, [player.currentTime]);

  // ---- Page-only derived values ----

  // 独立段选中时从 segmentContentByLayer 取文本 | For segment selection, read text from segmentContentByLayer
  const selectedUtteranceText = selectedUtterance
    ? getUtteranceTextForLayer(selectedUtterance)
    : (isSegmentTimelineUnit(selectedTimelineUnit)
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
    selectedUtterance: selectedTimelineOwnerUtterance ?? undefined,
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
  const handledLayerCreateMessageRef = useRef('');

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
    if (handledLayerCreateMessageRef.current === layerCreateMessage) return;
    const latestCreatedLayer = [...layerRailRows].sort((a, b) => {
      const at = Date.parse(a.updatedAt || a.createdAt || '');
      const bt = Date.parse(b.updatedAt || b.createdAt || '');
      return bt - at;
    })[0];
    if (!latestCreatedLayer) return;
    handledLayerCreateMessageRef.current = layerCreateMessage;
    setLayerRailTab((prev) => (prev === 'layers' ? prev : 'layers'));
    setFocusedLayerRowId((prev) => (prev === latestCreatedLayer.id ? prev : latestCreatedLayer.id));
    setFlashLayerRowId((prev) => (prev === latestCreatedLayer.id ? prev : latestCreatedLayer.id));
  }, [layerCreateMessage, layerRailRows, setLayerRailTab]);

  useEffect(() => {
    if (!layerCreateMessage) {
      handledLayerCreateMessageRef.current = '';
      return;
    }
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
    const currentSelectedTimelineUnitId = selectedTimelineUnit?.unitId ?? '';
    const prev = previousSelectedTimelineUnitIdRef.current;
    if (prev !== currentSelectedTimelineUnitId && segmentLoopPlayback) {
      setSegmentLoopPlayback(false);
    }
    if (prev !== currentSelectedTimelineUnitId) {
      setSegmentPlaybackRate(1);
    }
    previousSelectedTimelineUnitIdRef.current = currentSelectedTimelineUnitId;
  }, [selectedTimelineUnit, segmentLoopPlayback]);

  // Seek waveform to selected utterance's start.
  // Use a ref for isPlaying to avoid changing the dep array size and to prevent
  // re-running the effect when playback stops (which would yank the cursor).
  const isPlayingRef = useRef(player.isPlaying);
  isPlayingRef.current = player.isPlaying;
  useEffect(() => {
    if (!selectedTimelineUnitForTime || !player.isReady) return;
    if (skipSeekForIdRef.current) {
      skipSeekForIdRef.current = null;
      return;
    }
    // Don't yank the cursor while audio is playing (e.g. during
    // Enter-based continuous segment creation).
    if (isPlayingRef.current) return;
    player.seekTo(selectedTimelineUnitForTime.startTime);
  }, [player.isReady, player.seekTo, selectedTimelineUnitForTime]);

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

  // Wire executeActionRef so useAiToolCallHandler (called earlier) can access executeAction.
  executeActionRef.current = executeAction;

  const aiChatContextValue = useAiChatContextValue({
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

  const {
    assistantRuntimeProps,
    analysisRuntimeProps,
    pdfRuntimeProps,
  } = useTranscriptionRuntimeProps({
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
    selectedTimelineOwnerUtterance: selectedTimelineOwnerUtterance ?? null,
    selectedTimelineRowMeta,
    selectedLayerId,
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

  useEffect(() => {
    if (!autoScrollEnabled) return;
    if (!selectedTimelineOwnerUtterance) return;
    const row = utteranceRowRef.current[selectedTimelineOwnerUtterance.id];
    row?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [autoScrollEnabled, selectedTimelineOwnerUtterance?.id]);

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
    if (!selectedTimelineMedia) return;
    setAudioDeleteConfirm({ filename: selectedTimelineMedia.filename });
  }, [selectedTimelineMedia]);

  const handleConfirmAudioDelete = useCallback(() => {
    if (!selectedTimelineMedia) return;
    setAudioDeleteConfirm(null);
    fireAndForget((async () => {
      try {
        await LinguisticService.deleteAudio(selectedTimelineMedia.id);
        await loadSnapshot();
        selectTimelineUnit(null);
        setSaveState({ kind: 'done', message: t(locale, 'transcription.action.audioDeleted') });
      } catch (error) {
        log.error('Failed to delete current audio', {
          mediaId: selectedTimelineMedia.id,
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
  }, [loadSnapshot, locale, selectedTimelineMedia, selectTimelineUnit, setSaveState]);

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

  // ── Search / Replace ──

  const searchableItems = useMemo(() => {
    const items: Array<{ utteranceId: string; layerId?: string; layerKind?: 'transcription' | 'translation' | 'gloss'; text: string }> = [];

    if (transcriptionLayers.length === 0) {
      for (const utt of utterancesOnCurrentMedia) {
        items.push({ utteranceId: utt.id, layerKind: 'transcription', text: getUtteranceTextForLayer(utt) });
      }
    } else {
      for (const layer of transcriptionLayers) {
        for (const utt of utterancesOnCurrentMedia) {
          const text = getUtteranceTextForLayer(utt, layer.id);
          if (text) items.push({ utteranceId: utt.id, layerId: layer.id, layerKind: 'transcription', text });
        }
      }
    }

    for (const layer of translationLayers) {
      const layerMap = translationTextByLayer.get(layer.id);
      if (!layerMap) continue;
      for (const utt of utterancesOnCurrentMedia) {
        const tr = layerMap.get(utt.id);
        if (tr?.text) items.push({ utteranceId: utt.id, layerId: layer.id, layerKind: 'translation', text: tr.text });
      }
    }
    return items;
  }, [getUtteranceTextForLayer, transcriptionLayers, translationLayers, translationTextByLayer, utterancesOnCurrentMedia]);

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

  const [laneLockMap, setLaneLockMap] = useState<Record<string, number>>({});
  const trackEntityProjectKey = activeTextId?.trim() || '__no-project__';
  const trackEntityMediaId = selectedTimelineMedia?.id ?? null;
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

  // ── Persist: write to DB (and LocalStorage for backward compat) ────────────
  useEffect(() => {
    if (!trackEntityScopedKey || !activeTextId) return;
    if (trackEntityHydratedKeyRef.current !== trackEntityScopedKey) return;
    const next = upsertTrackEntityState(
      trackEntityStateByMediaRef.current ?? {},
      trackEntityScopedKey,
      { mode: transcriptionTrackMode, laneLockMap: effectiveLaneLockMap },
    );
    trackEntityStateByMediaRef.current = next;
    saveTrackEntityStateMap(next, typeof window !== 'undefined' ? window.localStorage : undefined);
    void saveTrackEntityStateToDb(activeTextId, trackEntityScopedKey, next[trackEntityScopedKey]!);
  }, [activeTextId, effectiveLaneLockMap, trackEntityScopedKey, transcriptionTrackMode]);

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
              <TranscriptionPageToolbar
                filename={selectedTimelineMedia?.filename ?? t(locale, 'transcription.media.unbound')}
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
                canDeleteAudio={Boolean(selectedTimelineMedia)}
                canDeleteProject={Boolean(activeTextId)}
                canToggleNotes={Boolean((isUtteranceTimelineUnit(selectedTimelineUnit) && selectedTimelineUnit.unitId) || notePopover)}
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
                {...(selectedMediaUrl ? { onAutoSegment: handleAutoSegment } : {})}
                autoSegmentBusy={autoSegmentBusy}
              />
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
                                const s = subSelectionRange ?? {
                                  start: selectedWaveformTimelineItem.startTime,
                                  end: selectedWaveformTimelineItem.endTime,
                                };
                                player.playRegion(s.start, s.end, true);
                              }
                            }}
                            onTogglePlay={() => {
                              if (player.isPlaying) {
                                player.stop();
                              } else {
                                const s = subSelectionRange ?? {
                                  start: selectedWaveformTimelineItem.startTime,
                                  end: selectedWaveformTimelineItem.endTime,
                                };
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
                <Suspense fallback={null}>
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
                      currentLayerId: activeLayerIdForEdits || undefined,
                      currentUtteranceId: selectedTimelineUtteranceId || undefined,
                      ...(searchOverlayRequest?.query !== undefined ? { initialQuery: searchOverlayRequest.query } : {}),
                      ...(searchOverlayRequest?.scope !== undefined ? { initialScope: searchOverlayRequest.scope } : {}),
                      ...(searchOverlayRequest?.layerKinds !== undefined ? { initialLayerKinds: searchOverlayRequest.layerKinds } : {}),
                      onNavigate: (id) => {
                        manualSelectTsRef.current = Date.now();
                        if (player.isPlaying) {
                          player.stop();
                        }
                        selectUtterance(id);
                      },
                      onReplace: handleSearchReplace,
                      onClose: () => {
                        setShowSearch(false);
                        setSearchOverlayRequest(null);
                      },
                    }}
                  />
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
                    onScroll={(e) => {
                      const ws = player.instanceRef.current;
                      if (ws) {
                        ws.setScroll(e.currentTarget.scrollLeft);
                      }
                      setWaveformScrollLeft(e.currentTarget.scrollLeft);
                    }}
                  >
                    <TranscriptionEditorContext.Provider value={editorContextValue}>
                        <Suspense fallback={null}>
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
                            }}
                            emptyStateProps={{
                              locale,
                              layersCount: layers.length,
                              hasSelectedMedia: Boolean(selectedMediaUrl),
                              onCreateTranscriptionLayer: () => layerAction.setLayerActionPanel('create-transcription'),
                              onOpenImportFile: () => importFileRef.current?.click(),
                            }}
                          />
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
                  <TranscriptionPageAiSidebar
                    locale={locale}
                    isAiPanelCollapsed={isAiPanelCollapsed}
                    hubSidebarTab={hubSidebarTab}
                    onHubSidebarTabChange={setHubSidebarTab}
                    aiChatContextValue={aiChatContextValue}
                    analysisTab={analysisTab}
                    onAnalysisTabChange={setAnalysisTab}
                    assistantRuntimeProps={assistantRuntimeProps}
                    analysisRuntimeProps={analysisRuntimeProps}
                  />
                </Suspense>
              </AiPanelContext.Provider>

              <Suspense fallback={null}>
                <TranscriptionPageDialogs
                  speakerDialogState={speakerDialogStateRouted}
                  speakerSaving={speakerSavingRouted}
                  onCloseSpeakerDialog={closeSpeakerDialogRouted}
                  onConfirmSpeakerDialog={confirmSpeakerDialogRouted}
                  onDraftNameChange={updateSpeakerDialogDraftNameRouted}
                  onTargetSpeakerChange={updateSpeakerDialogTargetKeyRouted}
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
                />
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
