import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AiPanelMode } from '../components/AiAnalysisPanel';
import type { AiObserverRecommendation } from '../components/transcription/toolbar/ObserverStatus';
import { useAiChat } from '../hooks/useAiChat';
import { useAiPanelLogic, taskToPersona } from '../hooks/useAiPanelLogic';
import { useAiToolCallHandler } from '../hooks/useAiToolCallHandler';
import { materializePendingToolCallTargets } from '../hooks/useAiToolCallHandler.segmentTargeting';
import type { EmbeddingProviderKind } from '../ai/embeddings/EmbeddingProvider';
import { createDeferredEmbeddingSearchService } from '../ai/embeddings/DeferredEmbeddingSearchService';
import { listRecentAiToolDecisionLogs } from '../ai/auditReplay';
import { buildTranscriptionAiPromptContext } from './TranscriptionPage.aiPromptContext';
import { timelineUnitsToWaveformAnalysisRows } from '../hooks/timelineUnitView';
import { loadEmbeddingProviderConfig } from './TranscriptionPage.helpers';
import { fireAndForget } from '../utils/fireAndForget';
import { loadOrthographyRuntime } from '../utils/loadOrthographyRuntime';
import { createTranscriptionAiToolRiskCheck } from './transcriptionAiToolRiskCheck';
import { buildAiSegmentTargetDescriptors, resolveAiSegmentTargetScopeUtterances } from './useTranscriptionAiController.segmentTargets';
import { buildWaveformAnalysisPromptSummary } from '../utils/waveformAnalysisOverlays';
import { vadCache } from '../services/vad/VadCacheService';
import { formatRecentActions } from '../hooks/useEditEventBuffer';
import { createMetricTags, recordMetric } from '../observability/metrics';
import type { UtteranceDocType } from '../db';
import {
  buildOwnerUtteranceCandidates,
  resolveOwnerUtteranceForAi,
  resolveSelectedAiSegmentTargetId,
} from './transcriptionAiSelectionResolver';
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
  const toSyntheticUtterance = useCallback((unit: { id: string; mediaId: string; textId?: string; startTime: number; endTime: number; speakerId?: string }): UtteranceDocType => ({
    id: unit.id,
    mediaId: unit.mediaId,
    textId: unit.textId ?? '',
    startTime: unit.startTime,
    endTime: unit.endTime,
    ...(unit.speakerId ? { speakerId: unit.speakerId } : {}),
    createdAt: '',
    updatedAt: '',
  }), []);
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
  const effectiveUnitIndex = input.timelineUnitViewIndex;
  const ownerUtteranceCandidatesForAi = useMemo(() => buildOwnerUtteranceCandidates(
    effectiveUnitIndex.allUnits,
    input.getUtteranceDocById,
    toSyntheticUtterance,
  ), [effectiveUnitIndex.allUnits, input.getUtteranceDocById, toSyntheticUtterance]);
  const resolvedOwnerUtteranceForAi = useMemo(() => resolveOwnerUtteranceForAi({
    selectedUnit: input.selectionSnapshot.selectedUnit,
    getUtteranceDocById: input.getUtteranceDocById,
    selectedTimelineSegment: input.selectedTimelineSegment,
    ownerCandidates: ownerUtteranceCandidatesForAi,
  }), [input.getUtteranceDocById, input.selectedTimelineSegment, input.selectionSnapshot.selectedUnit, ownerUtteranceCandidatesForAi]);
  const [aiToolDecisionLogs, setAiToolDecisionLogs] = useState<Array<{ id: string; toolName: string; decision: string; requestId?: string; timestamp: string }>>([]);
  const [internalAiSidebarError, setInternalAiSidebarError] = useState<string | null>(null);
  const aiSidebarError = input.aiSidebarError ?? internalAiSidebarError;
  const setAiSidebarError = input.setAiSidebarError ?? setInternalAiSidebarError;
  const allUnitsAsUtterances = useMemo(
    () => effectiveUnitIndex.allUnits.map((unit) => toSyntheticUtterance(unit)),
    [effectiveUnitIndex.allUnits, toSyntheticUtterance],
  );
  const currentMediaUnitsAsUtterances = useMemo(
    () => effectiveUnitIndex.currentMediaUnits.map((unit) => toSyntheticUtterance(unit)),
    [effectiveUnitIndex.currentMediaUnits, toSyntheticUtterance],
  );
  const acousticBatchSelectionRanges = useMemo(() => {
    const selectedUnits = new Map<string, (typeof effectiveUnitIndex.currentMediaUnits)[number]>();
    const selectedMediaId = input.selectedTimelineMedia?.id;
    for (const selectedId of input.selectedUnitIds) {
      const directHit = effectiveUnitIndex.resolveBySemanticId(selectedId);
      if (directHit && (!selectedMediaId || directHit.mediaId === selectedMediaId)) {
        selectedUnits.set(directHit.id, directHit);
      }
      for (const referringUnit of effectiveUnitIndex.getReferringUnits(selectedId)) {
        if (!selectedMediaId || referringUnit.mediaId === selectedMediaId) {
          selectedUnits.set(referringUnit.id, referringUnit);
        }
      }
    }
    return Array.from(selectedUnits.values())
      .sort((left, right) => left.startTime - right.startTime)
      .map((unit) => ({
        selectionId: unit.id,
        selectionLabel: unit.id,
        selectionStartSec: unit.startTime,
        selectionEndSec: unit.endTime,
      }));
  }, [effectiveUnitIndex, input.selectedTimelineMedia?.id, input.selectedUnitIds]);

  const {
    acousticRuntimeStatus,
    acousticSummary,
    acousticDetail,
    acousticDetailFullMedia,
    acousticBatchDetails,
    acousticBatchSelectionCount,
    acousticBatchDroppedSelectionRanges,
    acousticCalibrationStatus,
    acousticProviderState,
    handleJumpToAcousticHotspot,
  } = useTranscriptionAiAcousticRuntime({
    batchSelectionRanges: acousticBatchSelectionRanges,
    ...(input.selectedMediaUrl !== undefined ? { selectedMediaUrl: input.selectedMediaUrl } : {}),
    ...(input.selectedTimelineMedia?.id !== undefined ? { selectedTimelineMediaId: input.selectedTimelineMedia.id } : {}),
    ...(input.selectionSnapshot.selectedUnitStartSec !== undefined ? { selectionStartSec: input.selectionSnapshot.selectedUnitStartSec } : {}),
    ...(input.selectionSnapshot.selectedUnitEndSec !== undefined ? { selectionEndSec: input.selectionSnapshot.selectedUnitEndSec } : {}),
    seekToTimeRef: input.seekToTimeRef,
    ...(input.acousticConfigOverride !== undefined ? { configOverride: input.acousticConfigOverride } : {}),
    ...(input.acousticProviderPreference !== undefined ? { providerPreference: input.acousticProviderPreference } : {}),
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
    utterances: allUnitsAsUtterances,
    utterancesOnCurrentMedia: currentMediaUnitsAsUtterances,
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
  const selectedSegmentTargetId = resolveSelectedAiSegmentTargetId({
    selectedUnitKind: input.selectionSnapshot.selectedUnitKind,
    selectedTimelineSegmentId: input.selectedTimelineSegment?.id,
    snapshotTimelineUnitId: input.selectionSnapshot.timelineUnit?.unitId,
    resolvedOwnerUtteranceId: resolvedOwnerUtteranceForAi?.id,
  });

  const materializeAiToolCall = useCallback((call: Parameters<typeof materializePendingToolCallTargets>[0]) => materializePendingToolCallTargets(call, {
    utterances: segmentTargetScopeUtterances,
    transcriptionLayers: input.transcriptionLayers,
    translationLayers: input.translationLayers,
    ...(resolvedOwnerUtteranceForAi ? { selectedUnit: resolvedOwnerUtteranceForAi } : {}),
    segmentTargets: segmentTargetDescriptors,
    ...(selectedSegmentTargetId ? { selectedSegmentTargetId } : {}),
  }), [
    resolvedOwnerUtteranceForAi,
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
    selectedUnit: resolvedOwnerUtteranceForAi ?? undefined,
    selectedUnitMedia: input.selectedTimelineMedia,
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
    mergeSelectedUnits: input.mergeSelectedUnits,
    ...(input.mergeSelectedSegments ? { mergeSelectedSegments: input.mergeSelectedSegments } : {}),
    deleteUtterance: input.deleteUtterance,
    deleteSelectedUnits: input.deleteSelectedUnits,
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
    navigateTo: input.selectUnit,
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
    const waveformRows = timelineUnitsToWaveformAnalysisRows(effectiveUnitIndex.currentMediaUnits);
    const projectUnitsForTools = effectiveUnitIndex.isComplete || effectiveUnitIndex.allUnits.length > 0
      ? effectiveUnitIndex.allUnits
      : undefined;
    if (projectUnitsForTools && !projectUnitsForTools.some((unit) => unit.kind === 'utterance') && projectUnitsForTools.some((unit) => unit.kind === 'segment')) {
      recordMetric({
        id: 'ai.segment_only_project_context_build',
        value: 1,
        tags: createMetricTags('useTranscriptionAiController', { currentMediaId: currentMediaId ?? 'unknown' }),
      });
    }
    if (typeof input.authoritativeUnitCount === 'number' && Number.isFinite(input.authoritativeUnitCount) && effectiveUnitIndex.totalCount !== input.authoritativeUnitCount) {
      if (import.meta.env.DEV) {
        console.warn('[timeline_unit_count_mismatch]', {
          source: 'useTranscriptionAiController',
          indexTotalCount: effectiveUnitIndex.totalCount,
          authoritativeUnitCount: input.authoritativeUnitCount,
        });
      }
      recordMetric({ id: 'ai.timeline_unit_count_mismatch',
        value: 1,
        tags: createMetricTags('useTranscriptionAiController', {
          indexTotalCount: effectiveUnitIndex.totalCount,
          authoritativeUnitCount: input.authoritativeUnitCount,
        }),
      });
    }
    return buildTranscriptionAiPromptContext({
      currentMediaUnits: effectiveUnitIndex.currentMediaUnits,
      ...(projectUnitsForTools ? { projectUnitsForTools } : {}),
      unitIndexComplete: effectiveUnitIndex.isComplete,
      waveformAnalysis: buildWaveformAnalysisPromptSummary(waveformRows, {
        ...(input.selectionSnapshot.selectedUnitStartSec !== undefined ? { selectionStartTime: input.selectionSnapshot.selectedUnitStartSec } : {}),
        ...(input.selectionSnapshot.selectedUnitEndSec !== undefined ? { selectionEndTime: input.selectionSnapshot.selectedUnitEndSec } : {}),
        audioTimeSec: aiAudioTimeRef.current,
        ...(cachedVad ? { vadSegments: cachedVad.segments } : {}),
      }),
      ...(acousticSummary ? { acousticSummary } : {}),
      selectionSnapshot: input.selectionSnapshot,
      selectedUnitCount: input.selectedUnitIds.size,
      selectedUnitIds: Array.from(input.selectedUnitIds).slice(0, 12),
      unitCount: effectiveUnitIndex.totalCount,
      currentScopeUnitCount: segmentTargetDescriptors.length,
      translationLayerCount: input.translationLayerCount,
      aiConfidenceAvg: input.aiConfidenceAvg ?? 0,
      observerStage: aiObserverStageRef.current,
      topLexemes: aiLexemeSummaryRef.current,
      recommendations: aiRecommendationRef.current,
      audioTimeSec: aiAudioTimeRef.current,
      layers: input.layers,
      ...(input.selectedTimelineMedia ? { mediaItems: [input.selectedTimelineMedia] } : {}),
      ...(currentMediaId !== undefined ? { currentMediaId } : {}),
      ...(input.activeLayerIdForEdits !== undefined ? { activeLayerIdForEdits: input.activeLayerIdForEdits } : {}),
      recentActions: formatRecentActions(input.recentTimelineEditEvents),
      timelineReadModelEpoch: effectiveUnitIndex.epoch,
    });
  }, [acousticSummary, effectiveUnitIndex, input.activeLayerIdForEdits, input.aiConfidenceAvg, input.authoritativeUnitCount, input.layers, input.recentTimelineEditEvents, input.selectedTimelineMedia, input.selectedUnitIds, input.selectionSnapshot, input.translationLayerCount]);

  const handleAiToolRiskCheck = createTranscriptionAiToolRiskCheck({
    locale,
    utterances: segmentTargetScopeUtterances,
    ...(resolvedOwnerUtteranceForAi ? { selectedUnit: resolvedOwnerUtteranceForAi } : {}),
    ...(selectedSegmentTargetId ? { selectedSegmentTargetId } : {}),
    segmentTargets: segmentTargetDescriptors,
    transcriptionLayers,
    translationLayers,
    formatTime,
    getUtteranceTextForLayer,
    translationTextByLayer,
  });

  const getTimelineReadModelEpoch = useCallback(
    () => effectiveUnitIndex.epoch,
    [effectiveUnitIndex.epoch],
  );

  const aiChat = useAiChat({
    onToolCall: handleAiToolCall,
    onToolRiskCheck: handleAiToolRiskCheck,
    preparePendingToolCall: materializeAiToolCall,
    systemPersonaKey: aiDerivedPersona,
    getContext: buildAiPromptContext,
    getTimelineReadModelEpoch,
    maxContextChars: 2400,
    historyCharBudget: 12000,
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
    handleJumpToTranslationGap,
  } = useAiPanelLogic({
    locale: input.locale,
    utterances: allUnitsAsUtterances,
    selectedUnit: resolvedOwnerUtteranceForAi ?? undefined,
    selectedUnitText: input.selectionSnapshot.selectedText,
    translationLayers: input.translationLayers,
    translationDrafts: input.translationDrafts,
    translationTextByLayer: input.translationTextByLayer,
    aiChatConnectionTestStatus: aiChat.connectionTestStatus,
    aiPanelMode,
    selectUnit: input.selectUnit,
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
    acousticDetailFullMedia,
    acousticBatchDetails,
    acousticBatchSelectionCount,
    acousticBatchDroppedSelectionRanges,
    acousticCalibrationStatus,
    acousticProviderState,
    handleJumpToTranslationGap,
    handleJumpToAcousticHotspot,
    handleExecuteObserverRecommendation,
  };
}
