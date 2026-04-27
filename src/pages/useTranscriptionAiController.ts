import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLatest } from '../hooks/useLatest';
import type { AiPanelMode } from '../components/AiAnalysisPanel';
import type { AiObserverRecommendation } from '../components/transcription/toolbar/ObserverStatus';
import { useAiChat } from '../hooks/useAiChat';
import { useAiPanelLogic, taskToPersona } from '../hooks/useAiPanelLogic';
import { useAiToolCallHandler } from '../hooks/useAiToolCallHandler';
import { materializePendingToolCallTargets } from '../hooks/useAiToolCallHandler.segmentTargeting';
import type { EmbeddingProviderKind } from '../ai/embeddings/EmbeddingProvider';
import { createDeferredEmbeddingSearchService } from '../ai/embeddings/DeferredEmbeddingSearchService';
import { buildTranscriptionAiPromptContext } from './TranscriptionPage.aiPromptContext';
import { timelineUnitsToWaveformAnalysisRows } from '../hooks/timelineUnitView';
import { loadEmbeddingProviderConfig } from './TranscriptionPage.helpers';
import { fireAndForget } from '../utils/fireAndForget';
import { createTranscriptionAiToolRiskCheck } from './transcriptionAiToolRiskCheck';
import { buildAiSegmentTargetDescriptors, resolveAiSegmentTargetScopeUnits } from './useTranscriptionAiController.segmentTargets';
import { buildWaveformAnalysisPromptSummary } from '../utils/waveformAnalysisOverlays';
import { vadCache } from '../app/transcriptionServicesPageAccess';
import { formatRecentActions } from '../hooks/useEditEventBuffer';
import { createMetricTags, recordMetric } from '../observability/metrics';
import { createTranscriptionAiReadModelAccessors } from './transcriptionAiReadModelAccessors';
import { buildOwnerUnitCandidates, resolveExplicitOwnerUnitForAi, resolveOwnerUnitForAi, resolveWritableAiTargetId } from './transcriptionAiSelectionResolver';
import type { UseTranscriptionAiControllerInput, UseTranscriptionAiControllerResult } from './transcriptionAiController.types';
import { useTranscriptionAiAcousticRuntime } from './useTranscriptionAiAcousticRuntime';
import { bridgeTextForLayerTargetWithFallback, refreshRecentAiToolDecisionLogs, toSyntheticUnitDoc } from '../utils/transcriptionAiControllerHelpers';
import {
  getTranscriptionPlaybackClockSnapshot,
  subscribeTranscriptionPlaybackClock,
} from '../hooks/transcriptionPlaybackClock';
export type { UseTranscriptionAiControllerInput, UseTranscriptionAiControllerResult } from './transcriptionAiController.types';

export function useTranscriptionAiController(
  input: UseTranscriptionAiControllerInput,
): UseTranscriptionAiControllerResult {
  const {
    transcriptionLayers,
    translationLayers,
    locale,
    formatTime,
    getUnitTextForLayer,
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
  const scopeMediaItemForAi = input.scopeMediaItemForAi ?? input.selectedTimelineMedia;
  const ownerUnitCandidatesForAi = useMemo(
    () => buildOwnerUnitCandidates(effectiveUnitIndex.allUnits, input.getUnitDocById, toSyntheticUnitDoc),
    [effectiveUnitIndex.allUnits, input.getUnitDocById],
  );
  const explicitOwnerUnitForAi = resolveExplicitOwnerUnitForAi({
    selectedUnit: input.selectionSnapshot.selectedUnit,
    getUnitDocById: input.getUnitDocById,
    selectedTimelineSegment: input.selectedTimelineSegment,
    ownerCandidates: ownerUnitCandidatesForAi,
  });
  const resolvedOwnerUnitForAi = useMemo(
    () => resolveOwnerUnitForAi({
      selectedUnit: input.selectionSnapshot.selectedUnit,
      getUnitDocById: input.getUnitDocById,
      selectedTimelineSegment: input.selectedTimelineSegment,
      ownerCandidates: ownerUnitCandidatesForAi,
    }),
    [input.getUnitDocById, input.selectedTimelineSegment, input.selectionSnapshot.selectedUnit, ownerUnitCandidatesForAi],
  );
  const [aiToolDecisionLogs, setAiToolDecisionLogs] = useState<Array<{ id: string; toolName: string; decision: string; reason?: string; reasonLabelEn?: string; reasonLabelZh?: string; requestId?: string; timestamp: string; source?: 'human' | 'ai' | 'system'; executed?: boolean; durationMs?: number; message?: string }>>([]);
  const [internalAiSidebarError, setInternalAiSidebarError] = useState<string | null>(null);
  const aiSidebarError = input.aiSidebarError ?? internalAiSidebarError;
  const setAiSidebarError = input.setAiSidebarError ?? setInternalAiSidebarError;
  const allUnitsAsUnits = useMemo(
    () => effectiveUnitIndex.allUnits.map((unit) => toSyntheticUnitDoc(unit)),
    [effectiveUnitIndex.allUnits],
  );
  const currentMediaUnitsAsUnits = useMemo(
    () => effectiveUnitIndex.currentMediaUnits.map((unit) => toSyntheticUnitDoc(unit)),
    [effectiveUnitIndex.currentMediaUnits],
  );
  const acousticBatchSelectionRanges = useMemo(() => {
    const selectedUnits = new Map<string, (typeof effectiveUnitIndex.currentMediaUnits)[number]>();
    const selectedMediaId = scopeMediaItemForAi?.id;
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
  }, [effectiveUnitIndex, scopeMediaItemForAi?.id, input.selectedUnitIds]);

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
    ...(scopeMediaItemForAi?.id !== undefined ? { selectedTimelineMediaId: scopeMediaItemForAi.id } : {}),
    ...(input.selectionSnapshot.selectedUnitStartSec !== undefined ? { selectionStartSec: input.selectionSnapshot.selectedUnitStartSec } : {}),
    ...(input.selectionSnapshot.selectedUnitEndSec !== undefined ? { selectionEndSec: input.selectionSnapshot.selectedUnitEndSec } : {}),
    seekToTimeRef: input.seekToTimeRef,
    ...(input.acousticConfigOverride !== undefined ? { configOverride: input.acousticConfigOverride } : {}),
    ...(input.acousticProviderPreference !== undefined ? { providerPreference: input.acousticProviderPreference } : {}),
  });

  const refreshAiToolDecisionLogs = useCallback(async () => {
    await refreshRecentAiToolDecisionLogs({ setAiToolDecisionLogs, setAiSidebarError });
  }, [setAiSidebarError]);

  const segmentTargetScopeUnits = resolveAiSegmentTargetScopeUnits({
    units: allUnitsAsUnits,
    unitsOnCurrentMedia: currentMediaUnitsAsUnits,
    ...(scopeMediaItemForAi ? { selectedTimelineMedia: scopeMediaItemForAi } : {}),
  });

  const segmentTargetDescriptors = buildAiSegmentTargetDescriptors({
    unitTargets: segmentTargetScopeUnits,
    selectedLayerId: input.selectedLayerId,
    ...(input.activeLayerIdForEdits !== undefined ? { activeLayerIdForEdits: input.activeLayerIdForEdits } : {}),
    ...(input.segmentsByLayer !== undefined ? { segmentsByLayer: input.segmentsByLayer } : {}),
    ...(input.segmentContentByLayer !== undefined ? { segmentContentByLayer: input.segmentContentByLayer } : {}),
    ...(input.resolveSegmentRoutingForLayer !== undefined ? { resolveSegmentRoutingForLayer: input.resolveSegmentRoutingForLayer } : {}),
    getUnitTextForLayer,
  });
  const selectedSegmentTargetId = resolveWritableAiTargetId({
    selectedUnitKind: input.selectionSnapshot.selectedUnitKind,
    selectedTimelineSegmentId: input.selectedTimelineSegment?.id,
    snapshotTimelineUnitId: input.selectionSnapshot.timelineUnit?.unitId,
    explicitOwnerUnitId: explicitOwnerUnitForAi?.id,
  });

  const materializeAiToolCall = useCallback((call: Parameters<typeof materializePendingToolCallTargets>[0]) => materializePendingToolCallTargets(call, {
    units: segmentTargetScopeUnits,
    transcriptionLayers: input.transcriptionLayers,
    translationLayers: input.translationLayers,
    segmentTargets: segmentTargetDescriptors,
    ...(selectedSegmentTargetId ? { selectedSegmentTargetId } : {}),
  }), [input.transcriptionLayers, input.translationLayers, segmentTargetDescriptors, segmentTargetScopeUnits, selectedSegmentTargetId]);

  const bridgeTextForLayerWrite = useCallback(async ({ text, targetLayerId, selectedLayerId }: {
    text: string;
    targetLayerId?: string;
    selectedLayerId?: string;
  }) => {
    const effectiveSelectedLayerId = (selectedLayerId ?? input.selectedLayerId).trim();
    return bridgeTextForLayerTargetWithFallback({
      text,
      layers: input.layers,
      ...(targetLayerId !== undefined ? { targetLayerId } : {}),
      selectedLayerId: effectiveSelectedLayerId,
    });
  }, [input.layers, input.selectedLayerId]);

  const { readSegmentLayerText, readUnitLayerText, readTokenPos, readTokenGloss } = useMemo(
    () => createTranscriptionAiReadModelAccessors<NonNullable<ReturnType<typeof input.getUnitDocById>>>({
      segmentContentByLayer: input.segmentContentByLayer,
      getUnitDocById: input.getUnitDocById,
      segmentTargetScopeUnits,
      getUnitTextForLayer,
      allUnitRows: effectiveUnitIndex.allUnits,
    }),
    [effectiveUnitIndex.allUnits, getUnitTextForLayer, input.getUnitDocById, input.segmentContentByLayer, segmentTargetScopeUnits],
  );

  const aiToolCallHandler = useAiToolCallHandler({
    units: segmentTargetScopeUnits,
    selectedUnit: resolvedOwnerUnitForAi ?? undefined,
    selectedUnitMedia: scopeMediaItemForAi,
    selectedLayerId: input.selectedLayerId,
    transcriptionLayers: input.transcriptionLayers,
    translationLayers: input.translationLayers,
    layerLinks: input.layerLinks,
    createLayer: input.createLayerWithActiveContext,
    createAdjacentUnit: input.createAdjacentUnit ?? (async () => undefined),
    createTranscriptionSegment: input.createTranscriptionSegment,
    splitUnit: async () => undefined,
    splitTranscriptionSegment: input.splitTranscriptionSegment,
    ...(input.mergeAdjacentSegmentsForAiRollback
      ? { mergeAdjacentSegmentsForAiRollback: input.mergeAdjacentSegmentsForAiRollback }
      : {}),
    ...(input.silentSegmentGraphSyncForAi ? { silentSegmentGraphSyncForAi: input.silentSegmentGraphSyncForAi } : {}),
    ...(input.mergeWithPrevious ? { mergeWithPrevious: input.mergeWithPrevious } : {}),
    ...(input.mergeWithNext ? { mergeWithNext: input.mergeWithNext } : {}),
    mergeSelectedUnits: input.mergeSelectedUnits,
    ...(input.mergeSelectedSegments ? { mergeSelectedSegments: input.mergeSelectedSegments } : {}),
    deleteUnit: input.deleteUnit,
    deleteSelectedUnits: input.deleteSelectedUnits,
    deleteLayer: input.deleteLayer,
    toggleLayerLink: input.toggleLayerLink,
    ...(input.rebindTranslationLayerHost ? { rebindTranslationLayerHost: input.rebindTranslationLayerHost } : {}),
    saveUnitText: input.saveUnitText,
    saveUnitLayerText: input.saveUnitLayerText,
    saveSegmentContentForLayer: input.saveSegmentContentForLayer,
    readSegmentLayerText,
    readUnitLayerText,
    readTokenPos,
    readTokenGloss,
    segmentTargets: segmentTargetDescriptors,
    updateTokenPos: input.updateTokenPos,
    batchUpdateTokenPosByForm: input.batchUpdateTokenPosByForm,
    updateTokenGloss: input.updateTokenGloss,
    ...(input.executeActionRef.current ? { executeAction: input.executeActionRef.current } : {}),
    getSegments: () => segmentTargetScopeUnits,
    navigateTo: input.selectUnit,
    openSearch: (detail) => input.openSearchRef.current?.(detail),
    seekToTime: (timeSeconds) => input.seekToTimeRef.current?.(timeSeconds),
    splitAtTime: (timeSeconds) => input.splitAtTimeRef.current?.(timeSeconds) ?? false,
    zoomToSegment: (segmentId, zoomLevel) => input.zoomToSegmentRef.current?.(segmentId, zoomLevel) ?? false,
    bridgeTextForLayerWrite,
  });

  const handleAiToolCall = useCallback(async (call: Parameters<typeof aiToolCallHandler>[0]) =>
    aiToolCallHandler(materializeAiToolCall(call)), [aiToolCallHandler, materializeAiToolCall]);

  const buildAiPromptContext = useCallback(() => {
    const currentMediaId = scopeMediaItemForAi?.id;
    const cachedVad = currentMediaId ? vadCache.get(currentMediaId) : null;
    const waveformRows = timelineUnitsToWaveformAnalysisRows(effectiveUnitIndex.currentMediaUnits);
    const projectUnitsForTools = effectiveUnitIndex.isComplete || effectiveUnitIndex.allUnits.length > 0
      ? effectiveUnitIndex.allUnits
      : undefined;
    if (projectUnitsForTools && !projectUnitsForTools.some((unit) => unit.kind === 'unit') && projectUnitsForTools.some((unit) => unit.kind === 'segment')) {
      recordMetric({ id: 'ai.segment_only_project_context_build', value: 1, tags: createMetricTags('useTranscriptionAiController', { currentMediaId: currentMediaId ?? 'unknown' }) });
    }
    if (typeof input.authoritativeUnitCount === 'number' && Number.isFinite(input.authoritativeUnitCount) && effectiveUnitIndex.totalCount !== input.authoritativeUnitCount) {
      if (import.meta.env.DEV) {
        console.warn('[timeline_unit_count_mismatch]', {
          source: 'useTranscriptionAiController',
          indexTotalCount: effectiveUnitIndex.totalCount,
          authoritativeUnitCount: input.authoritativeUnitCount,
        });
      }
      recordMetric({ id: 'ai.timeline_unit_count_mismatch', value: 1, tags: createMetricTags('useTranscriptionAiController', { indexTotalCount: effectiveUnitIndex.totalCount, authoritativeUnitCount: input.authoritativeUnitCount }) });
    }
    return buildTranscriptionAiPromptContext({
      locale,
      currentMediaUnits: effectiveUnitIndex.currentMediaUnits,
      ...(projectUnitsForTools ? { projectUnitsForTools } : {}),
      timelineUnitViewIndex: { byLayer: effectiveUnitIndex.byLayer },
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
      layerLinks: input.layerLinks,
      ...(input.unitDrafts ? { unitDrafts: input.unitDrafts } : {}),
      ...(input.translationDrafts ? { translationDrafts: input.translationDrafts } : {}),
      focusedDraftKey: input.focusedTranslationDraftKeyRef?.current ?? null,
      ...(input.speakers ? { speakers: input.speakers } : {}),
      ...(input.noteSummary ? { noteSummary: input.noteSummary } : {}),
      ...(input.visibleTimelineState ? { visibleTimelineState: input.visibleTimelineState } : {}),
      ...(typeof input.activeTextId === 'string' && input.activeTextId.trim().length > 0 ? { activeTextId: input.activeTextId.trim() } : {}),
      ...(input.defaultTranscriptionLayerId !== undefined ? { defaultTranscriptionLayerId: input.defaultTranscriptionLayerId } : {}),
      ...(scopeMediaItemForAi ? { mediaItems: [scopeMediaItemForAi] } : {}),
      ...(currentMediaId !== undefined ? { currentMediaId } : {}),
      ...(input.activeLayerIdForEdits !== undefined ? { activeLayerIdForEdits: input.activeLayerIdForEdits } : {}),
      recentActions: formatRecentActions(input.recentTimelineEditEvents),
      timelineReadModelEpoch: effectiveUnitIndex.epoch,
    });
  }, [acousticSummary, effectiveUnitIndex, input.activeLayerIdForEdits, input.activeTextId, input.aiConfidenceAvg, input.authoritativeUnitCount, input.defaultTranscriptionLayerId, input.layerLinks, input.layers, input.noteSummary, input.recentTimelineEditEvents, input.speakers, input.visibleTimelineState, scopeMediaItemForAi, input.selectedUnitIds, input.selectionSnapshot, input.translationDrafts, input.translationLayerCount, input.unitDrafts]);

  const handleAiToolRiskCheck = createTranscriptionAiToolRiskCheck({
    locale,
    units: segmentTargetScopeUnits,
    ...(selectedSegmentTargetId ? { selectedSegmentTargetId } : {}),
    segmentTargets: segmentTargetDescriptors,
    transcriptionLayers,
    translationLayers,
    formatTime,
    getUnitTextForLayer,
    translationTextByLayer,
  });

  const getTimelineReadModelEpoch = useCallback(
    () => effectiveUnitIndex.epoch,
    [effectiveUnitIndex.epoch],
  );

  const onAiAssistantMessageCompleteRef = useLatest(input.onAiAssistantMessageComplete);
  const handleAiAssistantMessageComplete = useCallback((assistantMessageId: string, content: string) => {
    onAiAssistantMessageCompleteRef.current?.(assistantMessageId, content);
  }, [onAiAssistantMessageCompleteRef]);

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
    onMessageComplete: handleAiAssistantMessageComplete,
  });

  useEffect(() => {
    fireAndForget(refreshAiToolDecisionLogs(), { context: 'src/pages/useTranscriptionAiController.ts:L337', policy: 'background-quiet' });
  }, [aiChat.pendingToolCall, refreshAiToolDecisionLogs]);

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
    units: allUnitsAsUnits,
    selectedUnit: resolvedOwnerUnitForAi ?? undefined,
    selectedUnitText: input.selectionSnapshot.selectedText,
    translationLayers: input.translationLayers,
    translationDrafts: input.translationDrafts,
    translationTextByLayer: input.translationTextByLayer,
    aiChatConnectionTestStatus: aiChat.connectionTestStatus,
    aiPanelMode,
    selectUnit: input.selectUnit,
    setSaveState: input.setSaveState,
    ...(scopeMediaItemForAi?.id !== undefined ? { mediaId: scopeMediaItemForAi.id } : {}),
  });

  useEffect(() => {
    aiAudioTimeRef.current = getTranscriptionPlaybackClockSnapshot();
    return subscribeTranscriptionPlaybackClock(() => {
      aiAudioTimeRef.current = getTranscriptionPlaybackClockSnapshot();
    });
  }, []);

  useEffect(() => {
    if (input.playerCurrentTime === undefined) return;
    aiAudioTimeRef.current = input.playerCurrentTime;
  }, [input.playerCurrentTime]);

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
    if (match) fireAndForget(Promise.resolve(handleExecuteRecommendation(match)), { context: 'src/pages/useTranscriptionAiController.ts:L387', policy: 'user-visible' });
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
