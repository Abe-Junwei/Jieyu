import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AiPanelMode } from '../components/AiAnalysisPanel';
import type { AiObserverRecommendation } from '../components/transcription/toolbar/ObserverStatus';
import type { LayerDocType, LayerLinkDocType, LayerSegmentDocType, UtteranceDocType } from '../db';
import { useAiChat } from '../hooks/useAiChat';
import { useAiPanelLogic, taskToPersona, type ActionableRecommendation } from '../hooks/useAiPanelLogic';
import { useAiToolCallHandler } from '../hooks/useAiToolCallHandler';
import { materializePendingToolCallTargets } from '../hooks/useAiToolCallHandler.segmentTargeting';
import type { EmbeddingProviderKind } from '../ai/embeddings/EmbeddingProvider';
import { createDeferredEmbeddingSearchService } from '../ai/embeddings/DeferredEmbeddingSearchService';
import { listRecentAiToolDecisionLogs } from '../ai/auditReplay';
import { buildTranscriptionAiPromptContext } from './TranscriptionPage.aiPromptContext';
import { loadEmbeddingProviderConfig } from './TranscriptionPage.helpers';
import { fireAndForget } from '../utils/fireAndForget';
import { loadOrthographyRuntime } from '../utils/loadOrthographyRuntime';
import { createTranscriptionAiToolRiskCheck } from './transcriptionAiToolRiskCheck';
import { buildAiSegmentTargetDescriptors, resolveAiSegmentTargetScopeUtterances } from './useTranscriptionAiController.segmentTargets';
import { buildWaveformAnalysisPromptSummary } from '../utils/waveformAnalysisOverlays';
import { vadCache } from '../services/vad/VadCacheService';
import type {
  UseTranscriptionAiControllerInput,
  UseTranscriptionAiControllerResult,
} from './transcriptionAiController.types';
import { useTranscriptionAiAcousticRuntime } from './useTranscriptionAiAcousticRuntime';

export type {
  UseTranscriptionAiControllerInput,
  UseTranscriptionAiControllerResult,
} from './transcriptionAiController.types';

const TOOL_DECISION_LOG_REFRESH_ERROR_PREFIX = '\u5237\u65b0 AI \u5de5\u5177\u5ba1\u8ba1\u65e5\u5fd7\u5931\u8d25\uff1a';

export function useTranscriptionAiController(
  input: UseTranscriptionAiControllerInput,
): UseTranscriptionAiControllerResult {
  const {
    transcriptionLayers,
    translationLayers,
    locale,
    formatTime,
    getUtteranceTextForLayer,
    translationTextByLayer,
    handleExecuteRecommendation,
  } = input;
  const [aiPanelMode, setAiPanelMode] = useState<AiPanelMode>('auto');
  const [aiDerivedPersona, setAiDerivedPersona] = useState<'transcription' | 'glossing' | 'review'>('transcription');
  const aiObserverStageRef = useRef<string>('');
  const aiRecommendationRef = useRef<string[]>([]);
  const aiLexemeSummaryRef = useRef<string[]>([]);
  const aiAudioTimeRef = useRef(0);
  const [internalEmbeddingProviderConfig, setInternalEmbeddingProviderConfig] = useState<{ kind: EmbeddingProviderKind; baseUrl?: string; apiKey?: string; model?: string }>(() => loadEmbeddingProviderConfig());
  const embeddingProviderConfig = input.embeddingProviderConfig ?? internalEmbeddingProviderConfig;
  const setEmbeddingProviderConfig = input.setEmbeddingProviderConfig ?? setInternalEmbeddingProviderConfig;
  const embeddingSearchService = useMemo(
    () => createDeferredEmbeddingSearchService(() => embeddingProviderConfig),
    [embeddingProviderConfig],
  );
  const [aiToolDecisionLogs, setAiToolDecisionLogs] = useState<Array<{ id: string; toolName: string; decision: string; requestId?: string; timestamp: string }>>([]);
  const [internalAiSidebarError, setInternalAiSidebarError] = useState<string | null>(null);
  const aiSidebarError = input.aiSidebarError ?? internalAiSidebarError;
  const setAiSidebarError = input.setAiSidebarError ?? setInternalAiSidebarError;

  const {
    acousticRuntimeStatus,
    acousticSummary,
    acousticDetail,
    handleJumpToAcousticHotspot,
  } = useTranscriptionAiAcousticRuntime({
    selectedMediaUrl: input.selectedMediaUrl,
    selectedTimelineMediaId: input.selectedTimelineMedia?.id,
    selectionStartSec: input.selectionSnapshot.selectedUnitStartSec,
    selectionEndSec: input.selectionSnapshot.selectedUnitEndSec,
    seekToTimeRef: input.seekToTimeRef,
    configOverride: input.acousticConfigOverride,
  });

  const refreshAiToolDecisionLogs = useCallback(async () => {
    try {
      const normalized = await listRecentAiToolDecisionLogs(6);
      setAiToolDecisionLogs(normalized);
      setAiSidebarError((prev) => (prev?.startsWith(TOOL_DECISION_LOG_REFRESH_ERROR_PREFIX) ? null : prev));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setAiSidebarError(`${TOOL_DECISION_LOG_REFRESH_ERROR_PREFIX}${message}`);
    }
  }, []);

  const segmentTargetScopeUtterances = resolveAiSegmentTargetScopeUtterances({
    utterances: input.utterances,
    utterancesOnCurrentMedia: input.utterancesOnCurrentMedia,
    ...(input.selectedTimelineMedia ? { selectedTimelineMedia: input.selectedTimelineMedia } : {}),
  });

  const segmentTargetDescriptors = buildAiSegmentTargetDescriptors({
    utteranceTargets: segmentTargetScopeUtterances,
    selectedLayerId: input.selectedLayerId,
    ...(input.activeLayerIdForEdits !== undefined ? { activeLayerIdForEdits: input.activeLayerIdForEdits } : {}),
    ...(input.segmentsByLayer !== undefined ? { segmentsByLayer: input.segmentsByLayer } : {}),
    ...(input.segmentContentByLayer !== undefined ? { segmentContentByLayer: input.segmentContentByLayer } : {}),
    ...(input.resolveSegmentRoutingForLayer !== undefined ? { resolveSegmentRoutingForLayer: input.resolveSegmentRoutingForLayer } : {}),
    getUtteranceTextForLayer,
  });
  const selectedSegmentTargetId = input.selectionSnapshot.selectedUnitKind === 'segment'
    ? (input.selectedTimelineSegment?.id ?? input.selectionSnapshot.timelineUnit?.unitId ?? undefined)
    : input.selectedTimelineOwnerUtterance?.id ?? undefined;

  const materializeAiToolCall = useCallback((call: Parameters<typeof materializePendingToolCallTargets>[0]) => materializePendingToolCallTargets(call, {
    utterances: segmentTargetScopeUtterances,
    transcriptionLayers: input.transcriptionLayers,
    translationLayers: input.translationLayers,
    ...(input.selectedTimelineOwnerUtterance ? { selectedUtterance: input.selectedTimelineOwnerUtterance } : {}),
    segmentTargets: segmentTargetDescriptors,
    ...(selectedSegmentTargetId ? { selectedSegmentTargetId } : {}),
  }), [
    input.selectedTimelineOwnerUtterance,
    input.transcriptionLayers,
    input.translationLayers,
    segmentTargetDescriptors,
    segmentTargetScopeUtterances,
    selectedSegmentTargetId,
  ]);

  const bridgeTextForLayerWrite = useCallback(async ({ text, targetLayerId, selectedLayerId }: {
    text: string;
    targetLayerId?: string;
    selectedLayerId?: string;
  }) => {
    const { bridgeTextForLayerTarget, resolveFallbackSourceOrthographyId } = await loadOrthographyRuntime();
    const effectiveSelectedLayerId = (selectedLayerId ?? input.selectedLayerId).trim();
    const fallbackSourceOrthographyId = resolveFallbackSourceOrthographyId({
      layers: input.layers,
      selectedLayerId: effectiveSelectedLayerId,
    });
    return bridgeTextForLayerTarget({
      text,
      layers: input.layers,
      ...(targetLayerId !== undefined ? { targetLayerId } : {}),
      selectedLayerId: effectiveSelectedLayerId,
      ...(fallbackSourceOrthographyId !== undefined ? { fallbackSourceOrthographyId } : {}),
    });
  }, [input.layers, input.selectedLayerId]);

  const aiToolCallHandler = useAiToolCallHandler({
    utterances: segmentTargetScopeUtterances,
    selectedUtterance: input.selectedTimelineOwnerUtterance ?? undefined,
    selectedUtteranceMedia: input.selectedTimelineMedia,
    selectedLayerId: input.selectedLayerId,
    transcriptionLayers: input.transcriptionLayers,
    translationLayers: input.translationLayers,
    layerLinks: input.layerLinks,
    createLayer: input.createLayerWithActiveContext,
    createNextUtterance: async () => undefined,
    createTranscriptionSegment: input.createTranscriptionSegment,
    splitUtterance: async () => undefined,
    splitTranscriptionSegment: input.splitTranscriptionSegment,
    ...(input.mergeWithPrevious ? { mergeWithPrevious: input.mergeWithPrevious } : {}),
    ...(input.mergeWithNext ? { mergeWithNext: input.mergeWithNext } : {}),
    mergeSelectedUtterances: input.mergeSelectedUtterances,
    ...(input.mergeSelectedSegments ? { mergeSelectedSegments: input.mergeSelectedSegments } : {}),
    deleteUtterance: input.deleteUtterance,
    deleteSelectedUtterances: input.deleteSelectedUtterances,
    deleteLayer: input.deleteLayer,
    toggleLayerLink: input.toggleLayerLink,
    saveUtteranceText: input.saveUtteranceText,
    saveTextTranslationForUtterance: input.saveTextTranslationForUtterance,
    saveSegmentContentForLayer: input.saveSegmentContentForLayer,
    segmentTargets: segmentTargetDescriptors,
    updateTokenPos: input.updateTokenPos,
    batchUpdateTokenPosByForm: input.batchUpdateTokenPosByForm,
    updateTokenGloss: input.updateTokenGloss,
    ...(input.executeActionRef.current ? { executeAction: input.executeActionRef.current } : {}),
    getSegments: () => segmentTargetScopeUtterances,
    navigateTo: input.selectUtterance,
    openSearch: (detail) => input.openSearchRef.current?.(detail),
    seekToTime: (timeSeconds) => input.seekToTimeRef.current?.(timeSeconds),
    splitAtTime: (timeSeconds) => input.splitAtTimeRef.current?.(timeSeconds) ?? false,
    zoomToSegment: (segmentId, zoomLevel) => input.zoomToSegmentRef.current?.(segmentId, zoomLevel) ?? false,
    bridgeTextForLayerWrite,
  });

  const handleAiToolCall = useCallback(async (call: Parameters<typeof aiToolCallHandler>[0]) => {
    const preparedCall = materializeAiToolCall(call);
    return aiToolCallHandler(preparedCall);
  }, [aiToolCallHandler, materializeAiToolCall]);

  const buildAiPromptContext = useCallback(() => {
    const currentMediaId = input.selectedTimelineMedia?.id;
    const cachedVad = currentMediaId ? vadCache.get(currentMediaId) : null;
    return buildTranscriptionAiPromptContext({
    waveformAnalysis: buildWaveformAnalysisPromptSummary(input.utterancesOnCurrentMedia, {
      ...(input.selectionSnapshot.selectedUnitStartSec !== undefined ? { selectionStartTime: input.selectionSnapshot.selectedUnitStartSec } : {}),
      ...(input.selectionSnapshot.selectedUnitEndSec !== undefined ? { selectionEndTime: input.selectionSnapshot.selectedUnitEndSec } : {}),
      audioTimeSec: aiAudioTimeRef.current,
      ...(cachedVad ? { vadSegments: cachedVad.segments } : {}),
    }),
    ...(acousticSummary ? { acousticSummary } : {}),
    selectionSnapshot: input.selectionSnapshot,
    selectedUnitIds: Array.from(input.selectedUnitIds).slice(0, 12),
    utteranceCount: input.utteranceCount,
    translationLayerCount: input.translationLayerCount,
    aiConfidenceAvg: input.aiConfidenceAvg ?? 0,
    observerStage: aiObserverStageRef.current,
    topLexemes: aiLexemeSummaryRef.current,
    recommendations: aiRecommendationRef.current,
    audioTimeSec: aiAudioTimeRef.current,
    recentEdits: input.undoHistory.slice(0, 5).map((item) => String(item)),
  });
  }, [acousticSummary, input.aiConfidenceAvg, input.selectedUnitIds, input.selectionSnapshot, input.selectedTimelineMedia?.id, input.translationLayerCount, input.undoHistory, input.utteranceCount, input.utterancesOnCurrentMedia]);

  const handleAiToolRiskCheck = createTranscriptionAiToolRiskCheck({
    locale,
    utterances: segmentTargetScopeUtterances,
    ...(input.selectedTimelineOwnerUtterance ? { selectedUtterance: input.selectedTimelineOwnerUtterance } : {}),
    ...(selectedSegmentTargetId ? { selectedSegmentTargetId } : {}),
    segmentTargets: segmentTargetDescriptors,
    transcriptionLayers,
    translationLayers,
    formatTime,
    getUtteranceTextForLayer,
    translationTextByLayer,
  });

  const aiChat = useAiChat({
    onToolCall: handleAiToolCall,
    onToolRiskCheck: handleAiToolRiskCheck,
    preparePendingToolCall: materializeAiToolCall,
    systemPersonaKey: aiDerivedPersona,
    getContext: buildAiPromptContext,
    maxContextChars: 2400,
    historyCharBudget: 6000,
    // 转写页首屏关闭自动连通性探测，避免未交互时触发远程请求 | Disable auto connection probing on transcription first screen to avoid remote calls before user interaction
    autoConnectionProbeEnabled: false,
    embeddingSearchService,
  });

  useEffect(() => { fireAndForget(refreshAiToolDecisionLogs()); }, [aiChat.pendingToolCall, refreshAiToolDecisionLogs]);

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
    locale: input.locale,
    utterances: input.utterances,
    selectedUtterance: input.selectedTimelineOwnerUtterance ?? undefined,
    selectedUtteranceText: input.selectionSnapshot.selectedText,
    translationLayers: input.translationLayers,
    translationDrafts: input.translationDrafts,
    translationTextByLayer: input.translationTextByLayer,
    aiChatConnectionTestStatus: aiChat.connectionTestStatus,
    aiPanelMode,
    selectUtterance: input.selectUtterance,
    setSaveState: input.setSaveState,
    ...(input.selectedTimelineMedia?.id !== undefined ? { mediaId: input.selectedTimelineMedia.id } : {}),
  });

  aiAudioTimeRef.current = input.playerCurrentTime;
  aiObserverStageRef.current = observerResult.stage;
  aiRecommendationRef.current = actionableObserverRecommendations
    .slice(0, 4)
    .map((item) => `${item.title}: ${item.detail}`);
  aiLexemeSummaryRef.current = lexemeMatches
    .slice(0, 6)
    .map((item) => Object.values(item.lemma)[0] ?? item.id);

  useEffect(() => { const nextPersona = taskToPersona(aiCurrentTask); setAiDerivedPersona((prev) => (prev === nextPersona ? prev : nextPersona)); }, [aiCurrentTask]);

  const handleExecuteObserverRecommendation = useCallback((item: AiObserverRecommendation) => {
    const match = actionableObserverRecommendations.find((candidate) => candidate.id === item.id);
    if (match) fireAndForget(Promise.resolve(handleExecuteRecommendation(match)));
  }, [actionableObserverRecommendations, handleExecuteRecommendation]);

  return {
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
    acousticRuntimeStatus,
    acousticSummary,
    acousticDetail,
    handleJumpToTranslationGap,
    handleJumpToAcousticHotspot,
    handleExecuteObserverRecommendation,
  };
}
