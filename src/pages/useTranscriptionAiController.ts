import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AiPanelMode } from '../components/AiAnalysisPanel';
import type { AiObserverRecommendation } from '../components/transcription/toolbar/ObserverStatus';
import type { LayerDocType, LayerLinkDocType, MediaItemDocType, UtteranceDocType } from '../db';
import { useAiChat, type AiChatToolCall, type AiToolRiskCheckResult } from '../hooks/useAiChat';
import { useAiPanelLogic, taskToPersona, type ActionableRecommendation } from '../hooks/useAiPanelLogic';
import { useAiToolCallHandler } from '../hooks/useAiToolCallHandler';
import type { SaveState } from '../hooks/transcriptionTypes';
import { t, tf, type Locale } from '../i18n';
import type { AppShellOpenSearchDetail } from '../utils/appShellEvents';
import { SUPPORTED_VOICE_LANGS, resolveLanguageQuery } from '../utils/langMapping';
import type { EmbeddingProviderKind } from '../ai/embeddings/EmbeddingProvider';
import { createDeferredEmbeddingSearchService } from '../ai/embeddings/DeferredEmbeddingSearchService';
import { listRecentAiToolDecisionLogs } from '../ai/auditReplay';
import { buildTranscriptionAiPromptContext } from './TranscriptionPage.aiPromptContext';
import { loadEmbeddingProviderConfig } from './TranscriptionPage.helpers';
import { fireAndForget } from '../utils/fireAndForget';
import type { TranscriptionSelectionSnapshot } from './transcriptionSelectionSnapshot';
import { transformTextForLayerTarget } from '../utils/orthographyRuntime';

const TOOL_DECISION_LOG_REFRESH_ERROR_PREFIX = '\u5237\u65b0 AI \u5de5\u5177\u5ba1\u8ba1\u65e5\u5fd7\u5931\u8d25\uff1a';

interface UseTranscriptionAiControllerInput {
  utterances: UtteranceDocType[];
  selectedUnitIds: Set<string>;
  selectedUtterance: UtteranceDocType | null;
  selectedTimelineOwnerUtterance: UtteranceDocType | null;
  selectedTimelineMedia?: MediaItemDocType;
  selectedLayerId: string;
  selectionSnapshot: TranscriptionSelectionSnapshot;
  layers: LayerDocType[];
  transcriptionLayers: LayerDocType[];
  translationLayers: LayerDocType[];
  layerLinks: LayerLinkDocType[];
  getUtteranceTextForLayer: (utterance: UtteranceDocType, layerId?: string) => string;
  formatTime: (seconds: number) => string;
  utteranceCount: number;
  translationLayerCount: number;
  aiConfidenceAvg: number | null;
  undoHistory: unknown[];
  createLayerWithActiveContext: (
    layerType: 'transcription' | 'translation',
    input: { languageId: string; alias?: string },
    modality?: 'text' | 'audio' | 'mixed',
  ) => Promise<boolean>;
  createNextUtterance: (utterance: UtteranceDocType, duration: number) => Promise<void>;
  splitUtterance: (utteranceId: string, splitTime: number) => Promise<void>;
  deleteUtterance: (id: string) => Promise<void>;
  deleteSelectedUtterances: (ids: Set<string>) => Promise<void>;
  deleteLayer: (id: string, options?: { keepUtterances?: boolean }) => Promise<void>;
  toggleLayerLink: (transcriptionLayerKey: string, layerId: string) => Promise<void>;
  saveUtteranceText: (utteranceId: string, text: string, layerId?: string) => Promise<void>;
  saveTextTranslationForUtterance: (utteranceId: string, text: string, layerId: string) => Promise<void>;
  saveSegmentContentForLayer: (segmentId: string, layerId: string, value: string) => Promise<void>;
  updateTokenPos: (tokenId: string, pos: string | null) => Promise<void> | void;
  batchUpdateTokenPosByForm: (utteranceId: string, form: string, pos: string | null) => Promise<number> | number;
  updateTokenGloss: (tokenId: string, gloss: string | null, lang?: string) => Promise<void> | void;
  selectUtterance: (id: string) => void;
  setSaveState: React.Dispatch<React.SetStateAction<SaveState>>;
  translationDrafts: Record<string, string>;
  translationTextByLayer: Map<string, Map<string, { text?: string }>>;
  locale: Locale;
  playerCurrentTime: number;
  executeActionRef: React.MutableRefObject<((actionId: string) => void) | undefined>;
  openSearchRef: React.MutableRefObject<((detail?: AppShellOpenSearchDetail) => void) | undefined>;
  seekToTimeRef: React.MutableRefObject<((timeSeconds: number) => void) | undefined>;
  splitAtTimeRef: React.MutableRefObject<((timeSeconds: number) => boolean) | undefined>;
  zoomToSegmentRef: React.MutableRefObject<((segmentId: string, zoomLevel?: number) => boolean) | undefined>;
  handleExecuteRecommendation: (item: ActionableRecommendation) => Promise<void> | void;
}

interface UseTranscriptionAiControllerResult {
  aiPanelMode: AiPanelMode;
  setAiPanelMode: React.Dispatch<React.SetStateAction<AiPanelMode>>;
  aiSidebarError: string | null;
  setAiSidebarError: React.Dispatch<React.SetStateAction<string | null>>;
  embeddingProviderConfig: { kind: EmbeddingProviderKind; baseUrl?: string; apiKey?: string; model?: string };
  setEmbeddingProviderConfig: React.Dispatch<React.SetStateAction<{ kind: EmbeddingProviderKind; baseUrl?: string; apiKey?: string; model?: string }>>;
  aiToolDecisionLogs: Array<{ id: string; toolName: string; decision: string; requestId?: string; timestamp: string }>;
  aiChat: ReturnType<typeof useAiChat>;
  lexemeMatches: ReturnType<typeof useAiPanelLogic>['lexemeMatches'];
  observerResult: ReturnType<typeof useAiPanelLogic>['observerResult'];
  actionableObserverRecommendations: ReturnType<typeof useAiPanelLogic>['actionableObserverRecommendations'];
  selectedAiWarning: boolean;
  selectedTranslationGapCount: number;
  aiCurrentTask: ReturnType<typeof useAiPanelLogic>['aiCurrentTask'];
  aiVisibleCards: ReturnType<typeof useAiPanelLogic>['aiVisibleCards'];
  handleJumpToTranslationGap: () => void;
  handleExecuteObserverRecommendation: (item: AiObserverRecommendation) => void;
}

export function useTranscriptionAiController(
  input: UseTranscriptionAiControllerInput,
): UseTranscriptionAiControllerResult {
  const {
    utterances,
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
  const [embeddingProviderConfig, setEmbeddingProviderConfig] = useState<{ kind: EmbeddingProviderKind; baseUrl?: string; apiKey?: string; model?: string }>(() => loadEmbeddingProviderConfig());
  const embeddingSearchService = useMemo(
    () => createDeferredEmbeddingSearchService(() => embeddingProviderConfig),
    [embeddingProviderConfig],
  );
  const [aiToolDecisionLogs, setAiToolDecisionLogs] = useState<Array<{ id: string; toolName: string; decision: string; requestId?: string; timestamp: string }>>([]);
  const [aiSidebarError, setAiSidebarError] = useState<string | null>(null);

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

  const handleAiToolCall = useAiToolCallHandler({
    utterances: input.utterances,
    selectedUtterance: input.selectedTimelineOwnerUtterance ?? undefined,
    selectedUtteranceMedia: input.selectedTimelineMedia,
    selectedLayerId: input.selectedLayerId,
    transcriptionLayers: input.transcriptionLayers,
    translationLayers: input.translationLayers,
    layerLinks: input.layerLinks,
    createLayer: input.createLayerWithActiveContext,
    createNextUtterance: input.createNextUtterance,
    splitUtterance: input.splitUtterance,
    deleteUtterance: input.deleteUtterance,
    deleteSelectedUtterances: input.deleteSelectedUtterances,
    deleteLayer: input.deleteLayer,
    toggleLayerLink: input.toggleLayerLink,
    saveUtteranceText: input.saveUtteranceText,
    saveTextTranslationForUtterance: input.saveTextTranslationForUtterance,
    updateTokenPos: input.updateTokenPos,
    batchUpdateTokenPosByForm: input.batchUpdateTokenPosByForm,
    updateTokenGloss: input.updateTokenGloss,
    ...(input.executeActionRef.current ? { executeAction: input.executeActionRef.current } : {}),
    getSegments: () => input.utterances,
    navigateTo: input.selectUtterance,
    openSearch: (detail) => input.openSearchRef.current?.(detail),
    seekToTime: (timeSeconds) => input.seekToTimeRef.current?.(timeSeconds),
    splitAtTime: (timeSeconds) => input.splitAtTimeRef.current?.(timeSeconds) ?? false,
    zoomToSegment: (segmentId, zoomLevel) => input.zoomToSegmentRef.current?.(segmentId, zoomLevel) ?? false,
    transformTextForLayerWrite: ({ text, targetLayerId, selectedLayerId }) => {
      const effectiveSelectedLayerId = (selectedLayerId ?? input.selectedLayerId).trim();
      const fallbackSourceOrthographyId = effectiveSelectedLayerId
        ? undefined
        : input.layers.find((layer) => layer.layerType === 'transcription')?.orthographyId;
      return transformTextForLayerTarget({
        text,
        layers: input.layers,
        ...(targetLayerId !== undefined ? { targetLayerId } : {}),
        selectedLayerId: effectiveSelectedLayerId,
        ...(fallbackSourceOrthographyId !== undefined ? { fallbackSourceOrthographyId } : {}),
      });
    },
  });

  const buildAiPromptContext = useCallback(() => buildTranscriptionAiPromptContext({
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
  }), [input.aiConfidenceAvg, input.selectedUnitIds, input.selectionSnapshot, input.translationLayerCount, input.undoHistory, input.utteranceCount]);

  const handleAiToolRiskCheck = useCallback((call: AiChatToolCall): AiToolRiskCheckResult | null => {
    if (call.name === 'delete_layer') {
      const layerId = String(call.arguments.layerId ?? '').trim();
      if (layerId) {
        const exists = transcriptionLayers.some((layer) => layer.id === layerId)
          || translationLayers.some((layer) => layer.id === layerId);
        if (!exists) {
          return {
            requiresConfirmation: false,
            riskSummary: tf(locale, 'transcription.aiTool.layer.targetNotFound', { layerId }),
            impactPreview: [],
          };
        }
      } else {
        const layerType = String(call.arguments.layerType ?? '').trim().toLowerCase();
        const languageQuery = String(call.arguments.languageQuery ?? '').trim();
        if (layerType && languageQuery) {
          const pool = layerType === 'translation' ? translationLayers
            : layerType === 'transcription' ? transcriptionLayers : [];
          const code = resolveLanguageQuery(languageQuery);
          const matchTokens = [languageQuery.toLowerCase(), ...(code ? [code] : [])];
          const entry = code ? SUPPORTED_VOICE_LANGS.flatMap((group) => group.langs).find((lang) => lang.code === code) : undefined;
          if (entry) entry.label.split(/\s*\/\s*/).forEach((part) => matchTokens.push(part.trim().toLowerCase()));
          const matched = pool.filter((layer) => {
            const fields = [layer.languageId, layer.key, layer.name.zho, layer.name.eng]
              .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
              .map((value) => value.trim().toLowerCase());
            return matchTokens.some((token) => fields.some((field) => field.includes(token) || token.includes(field)));
          });
          const layerTypeLabel = layerType === 'translation'
            ? t(locale, 'transcription.aiTool.layer.typeTranslation')
            : t(locale, 'transcription.aiTool.layer.typeTranscription');
          if (matched.length === 0) {
            return {
              requiresConfirmation: false,
              riskSummary: tf(locale, 'transcription.aiTool.layer.noMatchByLanguage', {
                languageQuery,
                layerType: layerTypeLabel,
              }),
              impactPreview: [],
            };
          }
          if (matched.length > 1) {
            return {
              requiresConfirmation: false,
              riskSummary: tf(locale, 'transcription.aiTool.layer.multipleMatchByLanguage', {
                layerType: layerTypeLabel,
              }),
              impactPreview: [],
            };
          }
        }
      }
      return null;
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
      : t(locale, 'transcription.ai.segment.noTranscriptionText');
    const translationLayerCountWithContent = Array.from(translationTextByLayer.values()).reduce((count, layerMap) => {
      const item = layerMap.get(utteranceId);
      return item?.text?.trim() ? count + 1 : count;
    }, 0);

    const hasAnyContent = transcriptionText.length > 0 || translationLayerCountWithContent > 0;
    if (!hasAnyContent) {
      return { requiresConfirmation: false };
    }

    return {
      requiresConfirmation: true,
      riskSummary: tf(locale, 'transcription.ai.segment.deleteRiskSummary', { rowIndex, timeRange }),
      impactPreview: [
        tf(locale, 'transcription.ai.segment.deleteImpactContent', { preview: transcriptionPreview }),
        tf(locale, 'transcription.ai.segment.deleteImpactRelation', { count: translationLayerCountWithContent }),
        t(locale, 'transcription.ai.segment.deleteImpactUndo'),
      ],
    };
  }, [formatTime, getUtteranceTextForLayer, locale, transcriptionLayers, translationLayers, translationTextByLayer, utterances]);

  const aiChat = useAiChat({
    onToolCall: handleAiToolCall,
    onToolRiskCheck: handleAiToolRiskCheck,
    systemPersonaKey: aiDerivedPersona,
    getContext: buildAiPromptContext,
    maxContextChars: 2400,
    historyCharBudget: 6000,
    embeddingSearchService,
  });

  useEffect(() => {
    fireAndForget(refreshAiToolDecisionLogs());
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
  });

  useEffect(() => {
    const nextPersona = taskToPersona(aiCurrentTask);
    setAiDerivedPersona((prev) => (prev === nextPersona ? prev : nextPersona));
  }, [aiCurrentTask]);

  useEffect(() => {
    aiAudioTimeRef.current = input.playerCurrentTime;
  }, [input.playerCurrentTime]);

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
    fireAndForget(Promise.resolve(handleExecuteRecommendation(match)));
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
    handleJumpToTranslationGap,
    handleExecuteObserverRecommendation,
  };
}