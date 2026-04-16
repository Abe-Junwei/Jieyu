import { Fragment, useCallback, useContext, useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { MaterialSymbol } from '../ui/MaterialSymbol';
import { JIEYU_MATERIAL_INLINE, JIEYU_MATERIAL_INLINE_TIGHT, JIEYU_MATERIAL_PANEL } from '../../utils/jieyuMaterialIcon';
import { diffAiToolSnapshot, type AiToolGoldenSnapshot, type AiToolReplayBundle, type AiToolSnapshotDiff } from '../../ai/auditReplay';
import { buildCopyableAssistantPlainText, splitCitationMarkers } from '../../utils/citationFootnoteUtils';
import { t, useLocale } from '../../i18n';
import { aiChatProviderDefinitions, getAiChatProviderDefinition } from '../../ai/providers/providerCatalog';
import type { AiChatProviderKind, AiChatSettings, AiToolFeedbackStyle } from '../../ai/providers/providerCatalog';
import { useAiAssistantHubContext } from '../../contexts/AiAssistantHubContext';
import { formatCitationLabel, formatToolDecision } from './aiChatCardUtils';
import { exportReplayBundleSnapshot, openReplayBundleByRequestId, parseImportedGoldenSnapshot } from './aiChatReplayUtils';
import { AiChatAlertsPanel } from './AiChatAlertsPanel';
import { AiChatCandidateChips } from './AiChatCandidateChips';
import { AiChatMetricsBar } from './AiChatMetricsBar';
import { AiChatPromptLabModal } from './AiChatPromptLabModal';
import { AiChatReplayDetailPanel } from './AiChatReplayDetailPanel';
import { StreamWordsText } from './streamAssistantWords';
import { useAiPromptTemplates } from './useAiPromptTemplates';
import { escapedUnicodeRegExp } from '../../utils/decodeEscapedUnicode';
import { getAiChatCardMessages } from '../../i18n/aiChatCardMessages';
import { AiPanelContext } from '../../contexts/AiPanelContext';
import { useGlobalContext } from '../../services/GlobalContextService';
import { deriveAdaptiveProfileFromMessages, mergeAdaptiveProfiles } from '../../ai/chat/adaptiveInputProfile';
import { rankCandidateLabelsByAdaptiveProfile } from './aiChatAdaptiveRanking';
import { useAiChatHybridRecommendations } from './useAiChatHybridRecommendations';
import { detectWebLLMRuntimeStatus, warmupWebLLMModel, type WebLLMRuntimeStatus, type WebLLMWarmupProgress } from '../../ai/providers/webllmRuntime';
import { buildFollowUpSuggestions, classifyRecommendationAdoption, formatTaskTraceOutcome } from './aiChatCardFollowUps';

type AiChatCardProps = {
  embedded?: boolean;
  voiceDrawer?: ReactNode | undefined;
  voiceEntry?: {
    enabled: boolean;
    expanded: boolean;
    listening: boolean;
    statusText?: string;
    onTogglePanel: () => void;
  } | undefined;
};

export function AiChatCard({ embedded = false, voiceDrawer, voiceEntry }: AiChatCardProps = {}) {
  const locale = useLocale();
  const {
    currentPage,
    selectedUnit,
    selectedRowMeta,
    selectedUnitKind,
    selectedLayerType,
    selectedText,
    selectedTimeRangeLabel,
    lexemeMatches,
    aiChatEnabled,
    aiChatSettings,
    aiMessages,
    aiIsStreaming,
    aiLastError,
    aiConnectionTestStatus,
    aiConnectionTestMessage,
    aiPendingToolCall,
    aiTaskSession,
    aiInteractionMetrics,
    aiSessionMemory,
    aiToolDecisionLogs,
    onUpdateAiChatSettings,
    onTestAiConnection,
    onSendAiMessage,
    onStopAiMessage,
    onClearAiMessages,
    onToggleAiMessagePin,
    onConfirmPendingToolCall,
    onCancelPendingToolCall,
    timelineReadModelEpoch,
    onTrackAiRecommendationEvent,
    observerStage,
    onJumpToCitation,
  } = useAiAssistantHubContext();
  const aiPanelContext = useContext(AiPanelContext);
  const { profile } = useGlobalContext();

  const [chatInput, setChatInput] = useState('');
  const [showProviderConfig, setShowProviderConfig] = useState(false);
  const [testConnectionPending, setTestConnectionPending] = useState(false);
  const [showPromptLab, setShowPromptLab] = useState(false);
  const [selectedReplayBundle, setSelectedReplayBundle] = useState<AiToolReplayBundle | null>(null);
  const [replayLoadingRequestId, setReplayLoadingRequestId] = useState<string | null>(null);
  const [replayErrorMessage, setReplayErrorMessage] = useState<string | null>(null);
  const [exportedSnapshotRequestId, setExportedSnapshotRequestId] = useState<string | null>(null);
  const [compareSnapshot, setCompareSnapshot] = useState<AiToolGoldenSnapshot | null>(null);
  const [snapshotDiff, setSnapshotDiff] = useState<AiToolSnapshotDiff | null>(null);
  // \\u5c55\\u5f00\\u7684\\u63a8\\u7406\\u5185\\u5bb9\\u6d88\\u606f ID \\u96c6\\u5408 | Set of message IDs with expanded reasoning content
  const [expandedReasoningIds, setExpandedReasoningIds] = useState<Set<string>>(new Set());
  const importFileInputRef = useRef<HTMLInputElement | null>(null);
  const chatInputRef = useRef<HTMLInputElement | null>(null);
  const visibleRecommendationSignatureRef = useRef<string | null>(null);
  const exposedRecommendationRef = useRef<{ prompt: string; source: 'fallback' | 'llm'; signature: string } | null>(null);
  const [dismissedRecommendationSignature, setDismissedRecommendationSignature] = useState<string | null>(null);
  const sessionAdaptiveInputProfile = aiSessionMemory?.preferences?.adaptiveInputProfile ?? aiSessionMemory?.adaptiveInputProfile;
  const sessionLastToolName = aiSessionMemory?.preferences?.lastToolName ?? aiSessionMemory?.lastToolName;

  const activeProviderDefinition = aiChatSettings
    ? getAiChatProviderDefinition(aiChatSettings.providerKind)
    : getAiChatProviderDefinition('mock');

  const isZh = locale === 'zh-CN';
  const cardMessages = useMemo(() => getAiChatCardMessages(isZh), [isZh]);
  const toolFeedbackStyleResolved: AiToolFeedbackStyle = useMemo(
    () => (aiChatSettings?.toolFeedbackStyle === 'concise' ? 'concise' : 'detailed'),
    [aiChatSettings?.toolFeedbackStyle],
  );
  const messageViewportRef = useRef<HTMLDivElement | null>(null);
  const hasApiKeyField = activeProviderDefinition.fields.some((field) => field.key === 'apiKey');

  const promptVars = useMemo<Record<string, string>>(() => {
    const selectedText = selectedUnit?.text?.trim()
      ?? '';
    const currentUnit = selectedUnit
      ? `id=${selectedUnit.id}; text=${selectedText}; time=${selectedUnit.startTime}-${selectedUnit.endTime}`
      : '';
    const lexiconSummary = lexemeMatches.length === 0
      ? ''
      : lexemeMatches
        .slice(0, 5)
        .map((item) => Object.values(item.lemma)[0] ?? item.id)
        .join(', ');

    return {
      selected_text: String(selectedText ?? ''),
      current_unit: currentUnit,
      current_unit: currentUnit,
      lexicon_summary: lexiconSummary,
      project_stage: observerStage ?? '',
      current_row: selectedRowMeta ? String(selectedRowMeta.rowNumber) : '',
    };
  }, [lexemeMatches, observerStage, selectedRowMeta, selectedUnit]);

  const adaptiveInputProfile = useMemo(
    () => mergeAdaptiveProfiles(
      deriveAdaptiveProfileFromMessages(aiMessages ?? []),
      sessionAdaptiveInputProfile,
    ),
    [aiMessages, sessionAdaptiveInputProfile],
  );

  const {
    quickPromptTemplates,
    promptTemplates,
    editingTemplateId,
    templateTitleInput,
    templateContentInput,
    setTemplateTitleInput,
    setTemplateContentInput,
    savePromptTemplate,
    editPromptTemplate,
    removePromptTemplate,
    injectPromptTemplate,
    appendPromptVariable,
  } = useAiPromptTemplates({
    promptVars,
    onInjectRenderedPrompt: setChatInput,
    onEditTemplate: () => setShowPromptLab(true),
    ...(adaptiveInputProfile !== undefined ? { adaptiveInputProfile } : {}),
  });

  const providerGroups = useMemo(() => {
    const directKinds: AiChatProviderKind[] = ['deepseek', 'qwen', 'anthropic', 'gemini', 'ollama', 'minimax'];
    const compatibleKinds: AiChatProviderKind[] = ['openai-compatible'];
    const localKinds: AiChatProviderKind[] = ['mock', 'webllm', 'custom-http'];
    const byKind = new Map(aiChatProviderDefinitions.map((provider) => [provider.kind, provider]));

    const pick = (kinds: AiChatProviderKind[]) => kinds
      .map((kind) => byKind.get(kind))
      .filter((provider): provider is NonNullable<typeof provider> => Boolean(provider));

    return [
      { label: cardMessages.providerGroupOfficial, items: pick(directKinds) },
      { label: cardMessages.providerGroupCompatible, items: pick(compatibleKinds) },
      { label: cardMessages.providerGroupLocalCustom, items: pick(localKinds) },
    ].filter((group) => group.items.length > 0);
  }, [cardMessages]);

  const providerStatusLabel = useMemo(() => {
    const kind = aiChatSettings?.providerKind ?? 'mock';
    return cardMessages.providerStatusLabel(kind, aiConnectionTestStatus);
  }, [aiChatSettings?.providerKind, aiConnectionTestStatus, cardMessages]);

  const [webllmRuntimeStatus, setWebllmRuntimeStatus] = useState<WebLLMRuntimeStatus>(() => detectWebLLMRuntimeStatus());
  const [webllmWarmupState, setWebllmWarmupState] = useState<'idle' | 'running' | 'success' | 'error'>('idle');
  const [webllmWarmupProgress, setWebllmWarmupProgress] = useState<WebLLMWarmupProgress | null>(null);
  const [webllmWarmupMessage, setWebllmWarmupMessage] = useState<string | null>(null);
  const webllmWarmupAbortRef = useRef<AbortController | null>(null);
  const webllmWarmupRunIdRef = useRef(0);

  const webllmFallbackDefinition = useMemo(() => {
    const fallbackKind = aiChatSettings?.fallbackProviderKind;
    if (!fallbackKind || fallbackKind === 'webllm') {
      return getAiChatProviderDefinition('mock');
    }
    return getAiChatProviderDefinition(fallbackKind);
  }, [aiChatSettings?.fallbackProviderKind]);

  const webllmSourceLabel = useMemo(() => {
    if (webllmRuntimeStatus.source === 'injected-runtime') return cardMessages.webllmRuntimeSourceInjected;
    if (webllmRuntimeStatus.source === 'prompt-api') return cardMessages.webllmRuntimeSourcePromptApi;
    return cardMessages.webllmRuntimeSourceUnavailable;
  }, [cardMessages.webllmRuntimeSourceInjected, cardMessages.webllmRuntimeSourcePromptApi, cardMessages.webllmRuntimeSourceUnavailable, webllmRuntimeStatus.source]);

  const refreshWebllmRuntimeStatus = useCallback(() => {
    setWebllmRuntimeStatus(detectWebLLMRuntimeStatus());
  }, []);

  const dispatchWebllmWarmupEvent = useCallback((status: 'success' | 'error' | 'cancelled', message: string) => {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new CustomEvent('ai:webllm-warmup', {
      detail: { status, message },
    }));
  }, []);

  const webllmWarmupPercent = useMemo(() => {
    if (!webllmWarmupProgress) {
      return webllmWarmupState === 'success' ? 100 : 0;
    }
    return Math.max(0, Math.min(100, Math.round(webllmWarmupProgress.progress * 100)));
  }, [webllmWarmupProgress, webllmWarmupState]);

  const webllmWarmupPhaseLabel = useMemo(() => {
    if (!webllmWarmupProgress) return null;
    if (webllmWarmupProgress.phase === 'downloading') return cardMessages.webllmWarmupPhaseDownloading;
    if (webllmWarmupProgress.phase === 'initializing') return cardMessages.webllmWarmupPhaseInitializing;
    if (webllmWarmupProgress.phase === 'ready') return cardMessages.webllmWarmupPhaseReady;
    return cardMessages.webllmWarmupPhasePreparing;
  }, [
    cardMessages.webllmWarmupPhaseDownloading,
    cardMessages.webllmWarmupPhaseInitializing,
    cardMessages.webllmWarmupPhasePreparing,
    cardMessages.webllmWarmupPhaseReady,
    webllmWarmupProgress,
  ]);

  const webllmWarmupFailureMessage = useCallback((reason?: string | null) => {
    const trimmed = (reason ?? '').trim();
    if (!trimmed) return cardMessages.webllmWarmupFailed;
    const normalized = trimmed.length > 160 ? `${trimmed.slice(0, 157)}...` : trimmed;
    return cardMessages.webllmWarmupFailedWithReason(normalized);
  }, [cardMessages]);

  useEffect(() => {
    if (aiChatSettings?.providerKind !== 'webllm') return;
    refreshWebllmRuntimeStatus();
  }, [aiChatSettings?.providerKind, showProviderConfig, refreshWebllmRuntimeStatus]);

  useEffect(() => {
    return () => {
      webllmWarmupAbortRef.current?.abort();
    };
  }, []);

  const handleWarmupWebllmModel = useCallback(async () => {
    if (!aiChatSettings || aiChatSettings.providerKind !== 'webllm') return;
    webllmWarmupAbortRef.current?.abort();
    const runId = webllmWarmupRunIdRef.current + 1;
    webllmWarmupRunIdRef.current = runId;
    const abortController = new AbortController();
    webllmWarmupAbortRef.current = abortController;
    setWebllmWarmupState('running');
    setWebllmWarmupProgress({ phase: 'preparing', progress: 0, message: cardMessages.webllmWarmupPreparing });
    setWebllmWarmupMessage(null);
    try {
      const status = await warmupWebLLMModel(aiChatSettings.model, {
        signal: abortController.signal,
        onProgress: (progress) => {
          if (runId !== webllmWarmupRunIdRef.current) return;
          setWebllmWarmupProgress(progress);
        },
      });
      if (runId !== webllmWarmupRunIdRef.current) return;
      webllmWarmupAbortRef.current = null;
      setWebllmRuntimeStatus(status);
      if (status.available) {
        setWebllmWarmupState('success');
        setWebllmWarmupMessage(cardMessages.webllmWarmupDone);
        setWebllmWarmupProgress({ phase: 'ready', progress: 1, message: cardMessages.webllmWarmupDone });
        dispatchWebllmWarmupEvent('success', cardMessages.webllmWarmupDone);
        return;
      }
      const failedMessage = webllmWarmupFailureMessage(status.detail);
      setWebllmWarmupState('error');
      setWebllmWarmupMessage(failedMessage);
      dispatchWebllmWarmupEvent('error', failedMessage);
    } catch (error) {
      if (runId !== webllmWarmupRunIdRef.current) return;
      webllmWarmupAbortRef.current = null;
      const isAbort = typeof error === 'object' && error !== null && 'name' in error && (error as { name?: string }).name === 'AbortError';
      if (isAbort) {
        setWebllmWarmupState('idle');
        setWebllmWarmupProgress(null);
        setWebllmWarmupMessage(cardMessages.webllmWarmupCancelled);
        dispatchWebllmWarmupEvent('cancelled', cardMessages.webllmWarmupCancelled);
        return;
      }
      const failedReason = typeof error === 'object' && error !== null && 'message' in error && typeof (error as { message?: unknown }).message === 'string'
        ? (error as { message: string }).message
        : null;
      const failedMessage = webllmWarmupFailureMessage(failedReason);
      setWebllmWarmupState('error');
      setWebllmWarmupMessage(failedMessage);
      dispatchWebllmWarmupEvent('error', failedMessage);
    }
  }, [
    aiChatSettings,
    cardMessages.webllmWarmupCancelled,
    cardMessages.webllmWarmupDone,
    cardMessages.webllmWarmupFailed,
    cardMessages.webllmWarmupPreparing,
    dispatchWebllmWarmupEvent,
    webllmWarmupFailureMessage,
  ]);

  const handleCancelWebllmWarmup = useCallback(() => {
    if (webllmWarmupState !== 'running') return;
    webllmWarmupRunIdRef.current += 1;
    webllmWarmupAbortRef.current?.abort();
    webllmWarmupAbortRef.current = null;
    setWebllmWarmupState('idle');
    setWebllmWarmupProgress(null);
    setWebllmWarmupMessage(cardMessages.webllmWarmupCancelled);
    dispatchWebllmWarmupEvent('cancelled', cardMessages.webllmWarmupCancelled);
  }, [cardMessages.webllmWarmupCancelled, dispatchWebllmWarmupEvent, webllmWarmupState]);

  const showAgentLoopProgress = aiTaskSession?.status === 'executing'
    && typeof aiTaskSession.step === 'number'
    && typeof aiTaskSession.maxSteps === 'number'
    && aiTaskSession.maxSteps > 0;

  const providerStatusTone = useMemo(() => {
    const kind = aiChatSettings?.providerKind ?? 'mock';
    if (aiConnectionTestStatus === 'error') return 'error';
    if (aiConnectionTestStatus === 'success') return 'ok';
    if (kind === 'mock' || kind === 'ollama' || kind === 'webllm') return 'local';
    return 'idle';
  }, [aiChatSettings?.providerKind, aiConnectionTestStatus]);

  const isTestingConnection = testConnectionPending || aiConnectionTestStatus === 'testing';

  const inputPlaceholder = useMemo(() => cardMessages.recommendedInputPlaceholder({
    fallback: t(locale, 'ai.chat.inputPlaceholder'),
    page: currentPage,
    observerStage,
    aiCurrentTask: aiPanelContext?.aiCurrentTask,
    rowNumber: selectedRowMeta?.rowNumber ?? null,
    selectedText: selectedText ?? '',
    annotationStatus: selectedUnit?.annotationStatus ?? null,
    confidence: selectedUnit?.ai_metadata?.confidence ?? null,
    lexemeCount: lexemeMatches.length,
    lastToolName: aiTaskSession?.toolName ?? sessionLastToolName ?? null,
    preferredMode: profile.preferences.preferredMode,
    confirmationThreshold: profile.preferences.confirmationThreshold,
    selectedUnitKind: selectedUnitKind ?? null,
    ...(adaptiveInputProfile?.dominantIntent !== undefined ? { adaptiveIntent: adaptiveInputProfile.dominantIntent } : {}),
    ...(adaptiveInputProfile?.preferredResponseStyle !== undefined ? { adaptiveResponseStyle: adaptiveInputProfile.preferredResponseStyle } : {}),
    ...(adaptiveInputProfile?.topKeywords !== undefined ? { adaptiveKeywords: adaptiveInputProfile.topKeywords } : {}),
    ...(adaptiveInputProfile?.lastPromptExcerpt !== undefined ? { adaptiveLastPromptExcerpt: adaptiveInputProfile.lastPromptExcerpt } : {}),
    ...(selectedLayerType !== undefined ? { selectedLayerType } : {}),
    ...(selectedTimeRangeLabel !== undefined ? { selectedTimeRangeLabel } : {}),
  }), [
    adaptiveInputProfile?.dominantIntent,
    adaptiveInputProfile?.lastPromptExcerpt,
    adaptiveInputProfile?.preferredResponseStyle,
    adaptiveInputProfile?.topKeywords,
    aiPanelContext?.aiCurrentTask,
    aiTaskSession?.toolName,
    sessionLastToolName,
    cardMessages,
    currentPage,
    lexemeMatches.length,
    locale,
    observerStage,
    profile.preferences.confirmationThreshold,
    profile.preferences.preferredMode,
    selectedLayerType,
    selectedRowMeta?.rowNumber,
    selectedText,
    selectedTimeRangeLabel,
    selectedUnitKind,
    selectedUnit,
  ]);

  const rankedClarifyCandidates = useMemo(
    () => rankCandidateLabelsByAdaptiveProfile(aiTaskSession?.candidates ?? [], adaptiveInputProfile),
    [adaptiveInputProfile, aiTaskSession?.candidates],
  );

  const latestAssistantMessage = useMemo(() => {
    const sourceMessages = aiMessages ?? [];
    for (let index = sourceMessages.length - 1; index >= 0; index -= 1) {
      const item = sourceMessages[index];
      if (item?.role === 'assistant') return item;
    }
    return null;
  }, [aiMessages]);

  const followUpSuggestions = useMemo(() => buildFollowUpSuggestions({
    isZh,
    latestAssistantMessage,
    lastFrame: aiSessionMemory?.localToolState?.lastFrame,
  }), [aiSessionMemory?.localToolState?.lastFrame, isZh, latestAssistantMessage]);

  const recentTaskTrace = useMemo(
    () => [...(aiTaskSession?.trace ?? [])].slice(-3).reverse(),
    [aiTaskSession?.trace],
  );

  const hybridRecommendations = useAiChatHybridRecommendations({
    locale,
    enabled: aiChatEnabled,
    composerIdle: chatInput.trim().length === 0 && !aiIsStreaming,
    aiChatSettings,
    connectionTestStatus: aiConnectionTestStatus,
    recommendationTelemetry: aiSessionMemory?.recommendationTelemetry,
    primarySuggestion: inputPlaceholder,
    page: currentPage,
    observerStage,
    aiCurrentTask: aiPanelContext?.aiCurrentTask,
    rowNumber: selectedRowMeta?.rowNumber ?? null,
    selectedText: selectedText ?? '',
    annotationStatus: selectedUnit?.annotationStatus ?? null,
    confidence: selectedUnit?.ai_metadata?.confidence ?? null,
    lexemeCount: lexemeMatches.length,
    lastToolName: aiTaskSession?.toolName ?? sessionLastToolName ?? null,
    preferredMode: profile.preferences.preferredMode,
    confirmationThreshold: profile.preferences.confirmationThreshold,
    selectedUnitKind: selectedUnitKind ?? null,
    selectedLayerType: selectedLayerType ?? null,
    selectedTimeRangeLabel: selectedTimeRangeLabel ?? null,
    ...(adaptiveInputProfile?.dominantIntent !== undefined ? { adaptiveIntent: adaptiveInputProfile.dominantIntent } : {}),
    ...(adaptiveInputProfile?.preferredResponseStyle !== undefined ? { adaptiveResponseStyle: adaptiveInputProfile.preferredResponseStyle } : {}),
    ...(adaptiveInputProfile?.topKeywords !== undefined ? { adaptiveKeywords: adaptiveInputProfile.topKeywords } : {}),
    ...(adaptiveInputProfile?.lastPromptExcerpt !== undefined ? { adaptiveLastPromptExcerpt: adaptiveInputProfile.lastPromptExcerpt } : {}),
  });
  const topHybridRecommendation = hybridRecommendations.items[0];
  const hybridInputSuggestion = topHybridRecommendation?.prompt ?? inputPlaceholder;
  const hybridInputSignature = topHybridRecommendation
    ? `${hybridRecommendations.source}:${topHybridRecommendation.prompt}`
    : `fallback:${inputPlaceholder}`;
  const showInlineRecommendation = chatInput.length === 0
    && !aiIsStreaming
    && hybridInputSuggestion.trim().length > 0
    && dismissedRecommendationSignature !== hybridInputSignature;
  const composerPlaceholder = showInlineRecommendation ? '' : inputPlaceholder;

  useEffect(() => {
    if (dismissedRecommendationSignature !== hybridInputSignature) return;
    setDismissedRecommendationSignature(null);
  }, [dismissedRecommendationSignature, hybridInputSignature]);

  useEffect(() => {
    const topRecommendation = hybridRecommendations.items[0];
    if (!topRecommendation || !showInlineRecommendation || !onTrackAiRecommendationEvent) {
      visibleRecommendationSignatureRef.current = null;
      return;
    }
    const signature = `${hybridRecommendations.source}:${topRecommendation.prompt}`;
    if (visibleRecommendationSignatureRef.current === signature) return;
    visibleRecommendationSignatureRef.current = signature;
    exposedRecommendationRef.current = {
      prompt: topRecommendation.prompt,
      source: hybridRecommendations.source,
      signature,
    };
    onTrackAiRecommendationEvent({
      type: 'shown',
      source: hybridRecommendations.source,
      prompt: topRecommendation.prompt,
      signature,
      timestamp: new Date().toISOString(),
    });
  }, [hybridRecommendations.items, hybridRecommendations.source, onTrackAiRecommendationEvent, showInlineRecommendation]);

  const chatTitle = useMemo(() => t(locale, 'ai.chat.title').replace(/\s*[（(]MVP[）)]\s*/gi, ''), [locale]);
  const messages = aiMessages ?? [];
  /** 流式阶段正文+推理长度；用于贴底滚动依赖，避免仅 messages.length 变化时才滚动 | Scroll anchor during token stream */
  const streamingThreadScrollSignature = useMemo(() => {
    if (!aiIsStreaming) return 0;
    let sum = 0;
    for (const m of messages) {
      if (m.role !== 'assistant' || m.status !== 'streaming') continue;
      sum += (m.content?.length ?? 0) + (m.reasoningContent?.length ?? 0);
    }
    return sum;
  }, [aiIsStreaming, messages]);
  const pinnedMessageIds = aiSessionMemory?.pinnedMessageIds ?? [];
  const pinnedMessageIdSet = useMemo(() => new Set(pinnedMessageIds), [pinnedMessageIds]);
  const summaryChain = aiSessionMemory?.summaryChain ?? [];
  const latestConversationSummary = (aiSessionMemory?.conversationSummary ?? '').trim();
  const hasConversationSummary = latestConversationSummary.length > 0 || summaryChain.length > 0;
  const summaryEntries = useMemo(() => {
    if (summaryChain.length > 0) {
      return [...summaryChain].slice(-4).reverse();
    }
    if (!latestConversationSummary) return [];
    return [{
      id: 'latest-summary',
      summary: latestConversationSummary,
      coveredTurnCount: aiSessionMemory?.summaryTurnCount ?? 0,
      createdAt: '',
    }];
  }, [aiSessionMemory?.summaryTurnCount, latestConversationSummary, summaryChain]);
  const summaryQualityWarning = aiSessionMemory?.summaryQualityWarning ?? null;
  const turns = useMemo(() => {
    const newestTurns: Array<{ assistant?: typeof messages[number]; user?: typeof messages[number] }> = [];
    let index = 0;
    while (index < messages.length) {
      const current = messages[index];
      const next = messages[index + 1];
      if (!current) break;

      if (next && current.role !== next.role) {
        newestTurns.push({
          user: current.role === 'user' ? current : next,
          assistant: current.role === 'assistant' ? current : next,
        });
        index += 2;
        continue;
      }

      newestTurns.push(current.role === 'assistant' ? { assistant: current } : { user: current });
      index += 1;
    }

    return [...newestTurns].reverse();
  }, [messages]);

  useEffect(() => {
    if (messages.length === 0) return;
    const viewport = messageViewportRef.current;
    if (!viewport) return;
    // 消息按时间正序展示；仅在用户已靠近底部时自动跟随，避免强行打断向上阅读 | Stick to bottom only when already near bottom
    if (typeof window === 'undefined') {
      viewport.scrollTop = viewport.scrollHeight;
      return;
    }

    const stickThresholdPx = 120;
    const rafId = window.requestAnimationFrame(() => {
      const distanceFromBottom = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight;
      if (distanceFromBottom <= stickThresholdPx) {
        viewport.scrollTop = viewport.scrollHeight;
      }
    });

    return () => window.cancelAnimationFrame(rafId);
  }, [aiIsStreaming, messages.length, streamingThreadScrollSignature]);

  // P0: count active alerts for the alert bar
  const hasToolPending = !!aiPendingToolCall;
  const hasDecisionLogs = (aiToolDecisionLogs ?? []).length > 0;
  const alertCount = hasToolPending ? 1 : 0;
  const errorWarningText = useMemo(() => {
    const raw = (aiLastError ?? '').trim();
    if (!raw) return null;
    const isLayerMismatch = escapedUnicodeRegExp('\\u672a\\u627e\\u5230\\u5339\\u914d.?\\u5f53\\u524d.?\\u7684\\u8f6c\\u5199\\u5c42|no matching\\s+"?current"?\\s+transcription\\s+layer', 'i').test(raw);
    return isLayerMismatch
      ? cardMessages.layerMismatchWarning
      : `⚠ ${raw}`;
  }, [aiLastError, cardMessages]);
  const inputBlockedReason = useMemo(() => {
    if (hasToolPending) {
      return cardMessages.highRiskPending;
    }
    return null;
  }, [hasToolPending, cardMessages]);
  const [showAlertBar, setShowAlertBar] = useState(() => alertCount > 0);
  const [showDecisionPanel, setShowDecisionPanel] = useState(false);
  const [showReplayDetailPanel, setShowReplayDetailPanel] = useState(false);
  const [showConversationSummary, setShowConversationSummary] = useState(false);
  const [dismissedErrorWarning, setDismissedErrorWarning] = useState(false);
  const [voiceDrawerMaxHeight, setVoiceDrawerMaxHeight] = useState<number | null>(null);
  const [decisionPanelMaxHeight, setDecisionPanelMaxHeight] = useState<number | null>(null);
  const [isVoiceDrawerResizing, setIsVoiceDrawerResizing] = useState(false);
  const [isDecisionPanelResizing, setIsDecisionPanelResizing] = useState(false);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const copiedMessageTimerRef = useRef<number | null>(null);
  const blockedHintTimerRef = useRef<number | null>(null);
  const exportedSnapshotTimerRef = useRef<number | null>(null);
  const decisionPanelBodyRef = useRef<HTMLDivElement | null>(null);
  const [transientBlockedReason, setTransientBlockedReason] = useState<string | null>(null);
  const prevAlertCountRef = useRef(alertCount);
  const canUseVoiceEntry = Boolean(voiceEntry?.enabled);
  const voiceResizeStartYRef = useRef(0);
  const voiceResizeStartHeightRef = useRef(0);
  const decisionResizeStartYRef = useRef(0);
  const decisionResizeStartHeightRef = useRef(0);

  useEffect(() => {
    if (!hasConversationSummary && showConversationSummary) {
      setShowConversationSummary(false);
    }
  }, [hasConversationSummary, showConversationSummary]);

  const resolveVoiceDrawerHeightBounds = (): { min: number; max: number; preferred: number } => {
    if (typeof window === 'undefined') {
      return { min: 140, max: 380, preferred: 260 };
    }
    const min = Math.max(120, Math.floor(window.innerHeight * 0.2));
    const max = Math.max(min + 80, Math.floor(window.innerHeight * 0.62));
    const preferred = Math.min(Math.max(Math.floor(window.innerHeight * 0.36), min), max);
    return { min, max, preferred };
  };

  const clampVoiceDrawerHeight = (value: number): number => {
    const { min, max } = resolveVoiceDrawerHeightBounds();
    return Math.min(Math.max(value, min), max);
  };

  const startVoiceDrawerResize = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (!voiceEntry?.expanded || typeof window === 'undefined') return;
    event.preventDefault();
    const { preferred } = resolveVoiceDrawerHeightBounds();
    const initial = clampVoiceDrawerHeight(voiceDrawerMaxHeight ?? preferred);
    voiceResizeStartYRef.current = event.clientY;
    voiceResizeStartHeightRef.current = initial;
    setVoiceDrawerMaxHeight(initial);
    setIsVoiceDrawerResizing(true);
  };

  const resolveDecisionPanelHeightBounds = (): { min: number; max: number; preferred: number } => {
    if (typeof window === 'undefined') {
      return { min: 160, max: 380, preferred: 260 };
    }
    const min = Math.max(132, Math.floor(window.innerHeight * 0.22));
    const max = Math.max(min + 80, Math.floor(window.innerHeight * 0.62));
    const preferred = Math.min(Math.max(Math.floor(window.innerHeight * 0.36), min), max);
    return { min, max, preferred };
  };

  const clampDecisionPanelHeight = (value: number): number => {
    const { min, max } = resolveDecisionPanelHeightBounds();
    return Math.min(Math.max(value, min), max);
  };

  const startDecisionPanelResize = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (!showDecisionPanel || typeof window === 'undefined') return;
    event.preventDefault();
    const { preferred } = resolveDecisionPanelHeightBounds();
    const measuredHeight = decisionPanelBodyRef.current?.getBoundingClientRect().height ?? 0;
    const initial = clampDecisionPanelHeight(measuredHeight > 0 ? measuredHeight : (decisionPanelMaxHeight ?? preferred));
    decisionResizeStartYRef.current = event.clientY;
    decisionResizeStartHeightRef.current = initial;
    setIsDecisionPanelResizing(true);
  };

  const voiceDrawerInlineStyle: CSSProperties | undefined = voiceDrawerMaxHeight !== null
    ? ({ ['--ai-voice-drawer-max-height' as string]: `${voiceDrawerMaxHeight}px` } as CSSProperties)
    : undefined;

  const decisionPanelInlineStyle: CSSProperties | undefined = decisionPanelMaxHeight !== null
    ? ({
      ['--ai-decision-panel-max-height' as string]: `${decisionPanelMaxHeight}px`,
      ['--ai-decision-panel-body-height' as string]: `${decisionPanelMaxHeight}px`,
    } as CSSProperties)
    : undefined;

  useEffect(() => {
    const prev = prevAlertCountRef.current;
    if (prev === 0 && alertCount > 0) {
      setShowAlertBar(true);
    }
    if (alertCount === 0) {
      setShowAlertBar(false);
    }
    prevAlertCountRef.current = alertCount;
  }, [alertCount]);

  useEffect(() => {
    setDismissedErrorWarning(false);
  }, [errorWarningText]);

  useEffect(() => {
    setShowReplayDetailPanel(false);
  }, [selectedReplayBundle?.requestId]);

  useEffect(() => {
    return () => {
      if (copiedMessageTimerRef.current !== null && typeof window !== 'undefined') {
        window.clearTimeout(copiedMessageTimerRef.current);
      }
      if (blockedHintTimerRef.current !== null && typeof window !== 'undefined') {
        window.clearTimeout(blockedHintTimerRef.current);
      }
      if (exportedSnapshotTimerRef.current !== null && typeof window !== 'undefined') {
        window.clearTimeout(exportedSnapshotTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (aiIsStreaming) return;
    setTransientBlockedReason(null);
    if (blockedHintTimerRef.current !== null && typeof window !== 'undefined') {
      window.clearTimeout(blockedHintTimerRef.current);
      blockedHintTimerRef.current = null;
    }
  }, [aiIsStreaming]);

  useEffect(() => {
    if (!isVoiceDrawerResizing || typeof window === 'undefined') return;

    const handlePointerMove = (event: PointerEvent): void => {
      const delta = voiceResizeStartYRef.current - event.clientY;
      setVoiceDrawerMaxHeight(clampVoiceDrawerHeight(voiceResizeStartHeightRef.current + delta));
    };

    const stopResize = (): void => {
      setIsVoiceDrawerResizing(false);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', stopResize);
    window.addEventListener('pointercancel', stopResize);
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'ns-resize';

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', stopResize);
      window.removeEventListener('pointercancel', stopResize);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };
  }, [isVoiceDrawerResizing]);

  useEffect(() => {
    if (!isDecisionPanelResizing || typeof window === 'undefined') return;

    const handlePointerMove = (event: PointerEvent): void => {
      const delta = decisionResizeStartYRef.current - event.clientY;
      setDecisionPanelMaxHeight(clampDecisionPanelHeight(decisionResizeStartHeightRef.current + delta));
    };

    const stopResize = (): void => {
      setIsDecisionPanelResizing(false);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', stopResize);
    window.addEventListener('pointercancel', stopResize);
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'ns-resize';

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', stopResize);
      window.removeEventListener('pointercancel', stopResize);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };
  }, [isDecisionPanelResizing]);

  const showTransientBlockedReason = (reason: string): void => {
    setTransientBlockedReason(reason);
    if (blockedHintTimerRef.current !== null && typeof window !== 'undefined') {
      window.clearTimeout(blockedHintTimerRef.current);
    }
    if (typeof window !== 'undefined') {
      blockedHintTimerRef.current = window.setTimeout(() => {
        setTransientBlockedReason(null);
        blockedHintTimerRef.current = null;
      }, 1800);
    }
  };

  const openReplayBundle = async (requestId: string): Promise<void> => {
    setReplayLoadingRequestId(requestId);
    setReplayErrorMessage(null);
    const result = await openReplayBundleByRequestId(requestId, compareSnapshot, isZh);
    setSelectedReplayBundle(result.bundle);
    setReplayErrorMessage(result.errorMessage);
    setSnapshotDiff(result.snapshotDiff);
    setReplayLoadingRequestId(null);
  };

  const exportGoldenSnapshot = async (requestId: string): Promise<void> => {
    setReplayErrorMessage(null);
    const result = await exportReplayBundleSnapshot(requestId, selectedReplayBundle, isZh);
    if (result.errorMessage) {
      setReplayErrorMessage(result.errorMessage);
      return;
    }

    if (result.bundle) {
      setSelectedReplayBundle(result.bundle);
      setExportedSnapshotRequestId(requestId);
      if (typeof window !== 'undefined' && exportedSnapshotTimerRef.current !== null) {
        window.clearTimeout(exportedSnapshotTimerRef.current);
      }
      if (typeof window !== 'undefined') {
        exportedSnapshotTimerRef.current = window.setTimeout(() => {
          setExportedSnapshotRequestId((current) => (current === requestId ? null : current));
          exportedSnapshotTimerRef.current = null;
        }, 1200);
      }
    }
  };

  // \\u4ece\\u672c\\u5730\\u6587\\u4ef6\\u5bfc\\u5165 golden snapshot \\u5e76\\u4e0e\\u5f53\\u524d replay bundle \\u5bf9\\u6bd4 | Import a local golden snapshot and diff it against the current bundle
  const importSnapshotForCompare = (file: File): void => {
    setReplayErrorMessage(null);
    const reader = new FileReader();
    reader.onload = (e) => {
      const result = parseImportedGoldenSnapshot((e.target?.result as string) ?? '', isZh);
      if (result.errorMessage) {
        setReplayErrorMessage(result.errorMessage);
        return;
      }

      if (result.snapshot) {
        setCompareSnapshot(result.snapshot);
        setSnapshotDiff(
          selectedReplayBundle
            ? diffAiToolSnapshot(result.snapshot, selectedReplayBundle)
            : null,
        );
      }
    };
    reader.readAsText(file);
  };

  const submitChatInput = (): void => {
    const text = chatInput.trim();
    if (!text) return;
    if (!onSendAiMessage) {
      showTransientBlockedReason(cardMessages.chatNotReady);
      return;
    }
    if (aiIsStreaming) {
      showTransientBlockedReason(cardMessages.previousReplyStreaming);
      return;
    }
    if (hasToolPending) {
      setShowAlertBar(true);
      showTransientBlockedReason(inputBlockedReason ?? cardMessages.pendingActionBeforeSend);
      return;
    }
    const exposedRecommendation = exposedRecommendationRef.current;
    if (exposedRecommendation && onTrackAiRecommendationEvent) {
      const adoptionType = classifyRecommendationAdoption(text, exposedRecommendation.prompt);
      if (adoptionType) {
        onTrackAiRecommendationEvent({
          type: adoptionType,
          source: exposedRecommendation.source,
          prompt: exposedRecommendation.prompt,
          signature: exposedRecommendation.signature,
          timestamp: new Date().toISOString(),
        });
      }
    }
    exposedRecommendationRef.current = null;
    void onSendAiMessage(text);
    setChatInput('');
    setDismissedRecommendationSignature(null);
  };

  const submitFollowUpPrompt = (prompt: string): void => {
    const normalized = prompt.trim();
    if (!normalized) return;
    if (!onSendAiMessage) {
      showTransientBlockedReason(cardMessages.chatNotReady);
      return;
    }
    if (aiIsStreaming) {
      showTransientBlockedReason(cardMessages.previousReplyStreaming);
      return;
    }
    if (hasToolPending) {
      setShowAlertBar(true);
      showTransientBlockedReason(inputBlockedReason ?? cardMessages.pendingActionBeforeSend);
      return;
    }
    exposedRecommendationRef.current = null;
    void onSendAiMessage(normalized);
    setChatInput('');
    setDismissedRecommendationSignature(null);
  };

  const applyInlineRecommendation = (): void => {
    if (!topHybridRecommendation) return;
    setChatInput(topHybridRecommendation.prompt);
    setDismissedRecommendationSignature(null);
    const input = chatInputRef.current;
    if (!input) return;
    if (typeof window === 'undefined') {
      input.focus();
      return;
    }
    window.requestAnimationFrame(() => {
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    });
  };

  return (
    <div className={`transcription-ai-card ${embedded ? 'transcription-ai-card-embedded' : ''}`}>
      {/* P0: Header — redesigned as a chat-area header */}
      <div className="ai-chat-header">
        <div className="ai-chat-header-left">
          <div className="ai-chat-header-info">
            <div className="ai-chat-header-title-row">
              <span className="ai-chat-header-title">{chatTitle}</span>
            </div>
          </div>
          <div className="ai-chat-header-tools">
            <div className="transcription-ai-mode-switch" role="group" aria-label={cardMessages.toolFeedbackStyle}>
              <button
                type="button"
                className={`transcription-ai-mode-btn ${toolFeedbackStyleResolved === 'detailed' ? 'is-active' : ''}`}
                aria-pressed={toolFeedbackStyleResolved === 'detailed'}
                onClick={() => {
                  if (toolFeedbackStyleResolved === 'detailed') return;
                  onUpdateAiChatSettings?.({ toolFeedbackStyle: 'detailed' });
                }}
              >
                {cardMessages.detailed}
              </button>
              <button
                type="button"
                className={`transcription-ai-mode-btn ${toolFeedbackStyleResolved === 'concise' ? 'is-active' : ''}`}
                aria-pressed={toolFeedbackStyleResolved === 'concise'}
                onClick={() => {
                  if (toolFeedbackStyleResolved === 'concise') return;
                  onUpdateAiChatSettings?.({ toolFeedbackStyle: 'concise' });
                }}
              >
                {cardMessages.concise}
              </button>
            </div>
            <span
              className={`ai-chat-provider-status-dot ai-chat-provider-status-dot-${providerStatusTone} ai-chat-provider-status-dot-inline`}
              role="status"
              aria-label={providerStatusLabel}
              title={`${activeProviderDefinition.label} · ${providerStatusLabel}`}
            />
            <select
              className="ai-chat-provider-select"
              value={aiChatSettings?.providerKind ?? 'mock'}
              onChange={(e) => onUpdateAiChatSettings?.({
                providerKind: e.currentTarget.value as AiChatSettings['providerKind'],
              })}
            >
              {providerGroups.map((group) => (
                <optgroup key={group.label} label={group.label}>
                  {group.items.map((provider) => (
                    <option key={provider.kind} value={provider.kind}>{provider.label}</option>
                  ))}
                </optgroup>
              ))}
            </select>
            <button
              type="button"
              className="icon-btn ai-chat-header-config-btn"
              aria-label={showProviderConfig ? cardMessages.hideProviderConfig : cardMessages.openProviderConfig}
              title={showProviderConfig ? cardMessages.hideProviderConfig : cardMessages.openProviderConfig}
              onClick={() => setShowProviderConfig((prev) => !prev)}
            >
              <MaterialSymbol name="settings" className={JIEYU_MATERIAL_INLINE} />
            </button>
          </div>
        </div>
      </div>

      {/* P0: Provider config panel (collapsible below header) */}
      {aiChatSettings && showProviderConfig && (
        <form
          className="ai-chat-provider-config-panel"
          onSubmit={(event) => event.preventDefault()}
        >
          {activeProviderDefinition.fields.map((field) => (
            <div key={field.key} className="ai-chat-provider-config-row">
              <span className="ai-cfg-label">{field.label}</span>
              {field.type === 'select' ? (
                <select
                  className="ai-cfg-input"
                  value={String(aiChatSettings[field.key] ?? '')}
                  onChange={(e) => onUpdateAiChatSettings?.({ [field.key]: e.currentTarget.value } as Partial<AiChatSettings>)}
                >
                  {(field.options ?? []).map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              ) : (
                <input
                  className="ai-cfg-input"
                  type={field.type}
                  value={String(aiChatSettings[field.key] ?? '')}
                  placeholder={field.placeholder}
                  onChange={(e) => onUpdateAiChatSettings?.({ [field.key]: e.currentTarget.value } as Partial<AiChatSettings>)}
                />
              )}
            </div>
          ))}
          <div className="ai-chat-provider-config-actions">
            <button
              type="button"
              className={`icon-btn ai-chat-provider-config-action-btn${aiConnectionTestStatus === 'success' ? ' ai-conn-ok' : ''}`}
              disabled={!onTestAiConnection || isTestingConnection}
              onClick={() => {
                if (!onTestAiConnection) return;
                setTestConnectionPending(true);
                void onTestAiConnection().finally(() => {
                  setTestConnectionPending(false);
                });
              }}
            >
              {isTestingConnection
                ? t(locale, 'ai.chat.testing')
                : t(locale, 'ai.chat.testConnection')}
            </button>
            {aiChatSettings.providerKind === 'webllm' && (
              <button
                type="button"
                className={`icon-btn ai-chat-provider-config-action-btn${webllmWarmupState === 'success' ? ' ai-conn-ok' : ''}`}
                disabled={webllmWarmupState === 'running'}
                onClick={() => {
                  void handleWarmupWebllmModel();
                }}
              >
                {webllmWarmupState === 'running'
                  ? cardMessages.webllmWarmingUp
                  : cardMessages.webllmWarmup}
              </button>
            )}
            {aiChatSettings.providerKind === 'webllm' && webllmWarmupState === 'running' && (
              <button
                type="button"
                className="icon-btn ai-chat-provider-config-action-btn ai-chat-provider-config-action-btn-cancel"
                onClick={handleCancelWebllmWarmup}
              >
                {cardMessages.webllmWarmupCancel}
              </button>
            )}
            {hasApiKeyField && (
              <button
                type="button"
                className="icon-btn ai-chat-provider-config-action-btn ai-chat-provider-config-action-btn-clear-key"
                onClick={() => onUpdateAiChatSettings?.({ apiKey: '' })}
              >
                {cardMessages.clearCurrentKey}
              </button>
            )}
          </div>
          {aiConnectionTestStatus === 'error' && aiConnectionTestMessage && (
            <p className="ai-conn-error-msg">{aiConnectionTestMessage}</p>
          )}
          {aiChatSettings.providerKind === 'webllm' && (
            <div className={`ai-webllm-runtime-card ${webllmRuntimeStatus.available ? 'is-available' : 'is-unavailable'}`}>
              <p className="ai-webllm-runtime-title">{cardMessages.webllmRuntimeTitle}</p>
              <p className="ai-webllm-runtime-line"><span>{cardMessages.webllmRuntimeSource}:</span> <strong>{webllmSourceLabel}</strong></p>
              <p className="ai-webllm-runtime-line"><span>{cardMessages.webllmRuntimeDetail}:</span> {webllmRuntimeStatus.detail}</p>
              <p className="ai-webllm-runtime-line"><span>{cardMessages.webllmRuntimeRoute}:</span> {webllmFallbackDefinition.label}</p>
              {(webllmWarmupState === 'running' || webllmWarmupState === 'success') && (
                <div className="ai-webllm-progress" role="status" aria-live="polite">
                  <p className="ai-webllm-runtime-line"><span>{cardMessages.webllmWarmupProgressLabel}:</span> {webllmWarmupPercent}%</p>
                  <div className="ai-webllm-progress-track">
                    <progress className="ai-webllm-progress-bar" value={webllmWarmupPercent} max={100}>
                      {webllmWarmupPercent}%
                    </progress>
                  </div>
                  {webllmWarmupPhaseLabel && (
                    <p className="ai-webllm-runtime-line ai-webllm-progress-detail">{webllmWarmupPhaseLabel}</p>
                  )}
                </div>
              )}
              {webllmWarmupMessage && (
                <p className={`ai-webllm-runtime-message ${
                  webllmWarmupState === 'error'
                    ? 'is-error'
                    : webllmWarmupState === 'success'
                      ? 'is-success'
                      : 'is-info'
                }`}>
                  {webllmWarmupMessage}
                </p>
              )}
            </div>
          )}
        </form>
      )}

      {!aiChatEnabled ? (
        <p className="small-text">{t(locale, 'ai.chat.disabled')}</p>
      ) : (
        <>
          {hasConversationSummary && (
            <section className={`ai-chat-summary-panel ${showConversationSummary ? 'is-open' : ''}`}>
              <div className="ai-chat-summary-header-row">
                <button
                  type="button"
                  className="ai-chat-summary-toggle"
                  onClick={() => setShowConversationSummary((prev) => !prev)}
                >
                  {showConversationSummary ? cardMessages.hideConversationSummary : cardMessages.showConversationSummary}
                </button>
                {summaryQualityWarning && (
                  <span className="ai-chat-summary-warning" role="status" aria-live="polite">
                    {cardMessages.summaryQualityWarning(summaryQualityWarning.similarity, summaryQualityWarning.threshold)}
                  </span>
                )}
              </div>
              {showConversationSummary && (
                <div className="ai-chat-summary-body">
                  <p className="ai-chat-summary-title">{cardMessages.conversationSummaryTitle}</p>
                  {summaryEntries.length === 0 ? (
                    <p className="ai-chat-summary-empty">{cardMessages.summaryEmpty}</p>
                  ) : summaryEntries.map((entry) => (
                    <article key={entry.id} className="ai-chat-summary-entry">
                      <div className="ai-chat-summary-entry-meta">
                        <span>{cardMessages.summaryCoveredTurns(entry.coveredTurnCount)}</span>
                        {entry.createdAt ? <span>{new Date(entry.createdAt).toLocaleString(locale)}</span> : null}
                      </div>
                      <p className="ai-chat-summary-entry-content">{entry.summary}</p>
                    </article>
                  ))}
                </div>
              )}
            </section>
          )}

          {/* Message viewport */}
          <div ref={messageViewportRef} className="ai-chat-message-viewport">
            {messages.length === 0 ? (
              <p className="small-text">{t(locale, 'ai.chat.noMessages')}</p>
            ) : (
              <div className="ai-chat-message-canvas">
                {turns.map((turn, index) => {
                  const assistantMsg = turn.assistant;
                  const userMsg = turn.user;
                  if (!assistantMsg && !userMsg) return null;

                  const assistantContent = assistantMsg
                    ? ((assistantMsg.status === 'streaming' && /\{[\s\S]*"tool_call"\s*:\s*\{/.test(assistantMsg.content || ''))
                      ? cardMessages.parsingToolCall
                      : (assistantMsg.content || (assistantMsg.status === 'streaming'
                        ? (assistantMsg.thinking ? cardMessages.thinking : '...')
                        : (assistantMsg.status === 'aborted' ? cardMessages.aborted : ''))))
                    : '';
                  const reasoningContent = assistantMsg?.reasoningContent;
                  const hasReasoning = typeof reasoningContent === 'string' && reasoningContent.length > 0;
                  const isReasoningExpanded = hasReasoning && expandedReasoningIds.has(assistantMsg?.id ?? '');
                  // \\u539f\\u59cb\\u5f15\\u7528\\u4fdd\\u6301\\u6ce8\\u5165\\u987a\\u5e8f，\\u7528\\u4e8e [N] \\u6807\\u8bb0\\u89e3\\u6790 | Raw citations keep injection order for [N] marker resolution
                  const rawCitations = assistantMsg?.citations ?? [];
                  const hasInlineMarkers = rawCitations.length > 0 && /\[\d+\]/.test(assistantContent);
                  // \\u6709\\u884c\\u5185\\u6807\\u8bb0\\u65f6\\u4fdd\\u6301\\u6ce8\\u5165\\u987a\\u5e8f；\\u5426\\u5219\\u6309\\u7c7b\\u578b\\u6392\\u5e8f\\u517c\\u5bb9\\u65e7\\u6d88\\u606f | Injection order when markers exist; type-sorted for legacy
                  const orderedCitations = hasInlineMarkers
                    ? rawCitations
                    : [...rawCitations].sort((a, b) => {
                        const rank = (type: string): number => {
                          if (type === 'unit') return 1;
                          if (type === 'note') return 2;
                          if (type === 'pdf') return 3;
                          return 99;
                        };
                        return rank(a.type) - rank(b.type);
                      });
                  const copyableAssistantContent = buildCopyableAssistantPlainText({
                    content: assistantMsg?.content ?? '',
                    citations: orderedCitations,
                    locale,
                  });
                  const hasCopyableAssistantContent = copyableAssistantContent.length > 0;
                  const showAiGeneratedText = assistantMsg?.generationSource === 'llm' && assistantMsg?.status === 'done';
                  const generatedModelName = (assistantMsg?.generationModel ?? '').trim();
                  const generatedLabel = generatedModelName.length > 0
                    ? cardMessages.generatedByModel(generatedModelName)
                    : cardMessages.aiGenerated;
                  const isAssistantPinned = pinnedMessageIdSet.has(assistantMsg?.id ?? '');
                  const userContent = userMsg
                    ? (userMsg.content || (userMsg.status === 'streaming' ? '...' : (userMsg.status === 'aborted' ? cardMessages.aborted : '')))
                    : '';
                  const isUserPinned = pinnedMessageIdSet.has(userMsg?.id ?? '');

                  return (
                    <div
                      key={`${assistantMsg?.id ?? 'na'}-${userMsg?.id ?? 'nu'}`}
                      className="ai-chat-turn"
                      data-index={index}
                    >
                      {userMsg && (
                        <div className="ai-chat-message-bubble ai-chat-message-user">
                          <div className="ai-chat-message-surface">
                            <span className="ai-chat-message-content">{userContent}</span>
                            {onToggleAiMessagePin && (
                              <div className="ai-chat-message-actions">
                                <button
                                  type="button"
                                  className={`ai-chat-message-action-btn ${isUserPinned ? 'is-active' : ''}`}
                                  onClick={() => onToggleAiMessagePin(userMsg.id)}
                                >
                                  {isUserPinned ? cardMessages.unpinMessage : cardMessages.pinMessage}
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {assistantMsg && (
                        <div className="ai-chat-message-bubble ai-chat-message-assistant">
                          <div className="ai-chat-message-surface">
                            <span className="ai-chat-message-content">
                              {hasInlineMarkers
                                ? splitCitationMarkers(assistantContent, rawCitations.length).map((seg, i) => (
                                    seg.type === 'text'
                                      ? (
                                        assistantMsg.status === 'streaming'
                                          ? (
                                            <StreamWordsText
                                              key={`${assistantMsg.id}-cit-${i}`}
                                              streamKey={`${assistantMsg.id}-cit-${i}`}
                                              text={seg.value}
                                              locale={locale}
                                            />
                                          )
                                          : <Fragment key={i}>{seg.value}</Fragment>
                                      )
                                      : (
                                        <sup
                                          key={i}
                                          className="ai-citation-marker"
                                          role="button"
                                          tabIndex={0}
                                          onClick={() => {
                                            const c = rawCitations[seg.index! - 1];
                                            if (c && onJumpToCitation) void onJumpToCitation(c.type, c.refId, c);
                                          }}
                                          onKeyDown={(e) => {
                                            if (e.key === 'Enter' || e.key === ' ') {
                                              const c = rawCitations[seg.index! - 1];
                                              if (c && onJumpToCitation) void onJumpToCitation(c.type, c.refId, c);
                                            }
                                          }}
                                        >
                                          {seg.value}
                                        </sup>
                                      )
                                  ))
                                : assistantMsg.status === 'streaming'
                                  ? (
                                    <StreamWordsText
                                      streamKey={assistantMsg.id}
                                      text={assistantContent}
                                      locale={locale}
                                    />
                                  )
                                  : assistantContent}
                            </span>
                            {/* \\u53ef\\u6298\\u53e0\\u7684\\u63a8\\u7406\\u8fc7\\u7a0b | Collapsible reasoning content */}
                            {hasReasoning && isReasoningExpanded && (
                              <div className="ai-chat-reasoning-block">
                                <div className="ai-chat-reasoning-title">
                                  {cardMessages.reasoning}
                                </div>
                                <div className="ai-chat-reasoning-body">
                                  {assistantMsg.status === 'streaming'
                                    ? (
                                      <StreamWordsText
                                        streamKey={`${assistantMsg.id}-reasoning`}
                                        text={reasoningContent ?? ''}
                                        locale={locale}
                                      />
                                    )
                                    : reasoningContent}
                                </div>
                              </div>
                            )}
                            {(onToggleAiMessagePin || hasCopyableAssistantContent || orderedCitations.length > 0 || hasReasoning || showAiGeneratedText) && (
                              <div className="ai-chat-message-actions">
                                {onToggleAiMessagePin && (
                                  <button
                                    type="button"
                                    className={`ai-chat-message-action-btn ${isAssistantPinned ? 'is-active' : ''}`}
                                    onClick={() => onToggleAiMessagePin(assistantMsg.id)}
                                  >
                                    {isAssistantPinned ? cardMessages.unpinMessage : cardMessages.pinMessage}
                                  </button>
                                )}
                                {hasCopyableAssistantContent && (
                                  <button
                                    type="button"
                                    className="icon-btn ai-chat-message-copy-btn"
                                    title={copiedMessageId === assistantMsg.id
                                      ? cardMessages.copied
                                      : cardMessages.copy}
                                    aria-label={copiedMessageId === assistantMsg.id
                                      ? cardMessages.copied
                                      : cardMessages.copy}
                                    onClick={() => {
                                      if (typeof navigator === 'undefined' || !navigator.clipboard) return;
                                      void navigator.clipboard.writeText(copyableAssistantContent);
                                      if (copiedMessageTimerRef.current !== null && typeof window !== 'undefined') {
                                        window.clearTimeout(copiedMessageTimerRef.current);
                                      }
                                      setCopiedMessageId(assistantMsg.id);
                                      if (typeof window !== 'undefined') {
                                        copiedMessageTimerRef.current = window.setTimeout(() => {
                                          setCopiedMessageId((current) => (current === assistantMsg.id ? null : current));
                                        }, 1200);
                                      }
                                    }}
                                  >
                                    {copiedMessageId === assistantMsg.id ? <MaterialSymbol name="check" className={JIEYU_MATERIAL_INLINE_TIGHT} /> : <MaterialSymbol name="content_copy" className={JIEYU_MATERIAL_INLINE_TIGHT} />}
                                  </button>
                                )}
                                {hasReasoning && (
                                  <button
                                    type="button"
                                    className="ai-chat-message-action-btn ai-chat-message-action-btn-italic"
                                    onClick={() => {
                                      setExpandedReasoningIds((prev) => {
                                        const next = new Set(prev);
                                        if (next.has(assistantMsg.id)) {
                                          next.delete(assistantMsg.id);
                                        } else {
                                          next.add(assistantMsg.id);
                                        }
                                        return next;
                                      });
                                    }}
                                  >
                                    {isReasoningExpanded
                                      ? cardMessages.hideReasoning
                                      : cardMessages.showReasoning}
                                  </button>
                                )}
                                {orderedCitations.map((citation, ci) => (
                                  <button
                                    key={`${assistantMsg.id}-${citation.type}-${citation.refId}`}
                                    className="ai-chat-message-action-btn"
                                    title={`${citation.type}:${citation.refId}`}
                                    type="button"
                                    onClick={() => { if (!onJumpToCitation) return; void onJumpToCitation(citation.type, citation.refId, citation); }}
                                    disabled={!onJumpToCitation}
                                  >
                                    {hasInlineMarkers ? `[${ci + 1}] ` : ''}{formatCitationLabel(isZh, citation)}
                                  </button>
                                ))}
                                {showAiGeneratedText && (
                                  <span className="ai-chat-message-source-text">
                                    {generatedLabel}
                                  </span>
                                )}
                              </div>
                            )}
                        </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            {messages.length > 0 && onClearAiMessages && (
              <div className="ai-chat-message-toolbar">
                <button
                  type="button"
                  className="ai-chat-clear-inline-text"
                  onClick={() => onClearAiMessages?.()}
                >
                  {t(locale, 'ai.chat.clear')}
                </button>
              </div>
            )}
          </div>

          <AiChatAlertsPanel
            isZh={isZh}
            errorWarningText={errorWarningText ?? ''}
            dismissedErrorWarning={dismissedErrorWarning}
            alertCount={alertCount}
            debugUiShowAll={false}
            showAlertBar={showAlertBar}
            aiPendingToolCall={aiPendingToolCall}
            timelineReadModelEpoch={timelineReadModelEpoch}
            onDismissErrorWarning={() => setDismissedErrorWarning(true)}
            onToggleAlertBar={() => setShowAlertBar((prev) => !prev)}
            onConfirmPendingToolCall={onConfirmPendingToolCall}
            onCancelPendingToolCall={onCancelPendingToolCall}
          />

          {/* \\u5019\\u9009\\u5feb\\u6377\\u56de\\u590d\\u6761 | Candidate quick-reply chips */}
          {aiTaskSession?.status === 'waiting_clarify' && (aiTaskSession.candidates ?? []).length > 0 && (
            <AiChatCandidateChips
              isZh={isZh}
              aiIsStreaming={Boolean(aiIsStreaming)}
              debugUiShowAll={false}
              candidates={rankedClarifyCandidates}
              onSendAiMessage={onSendAiMessage}
            />
          )}

          {/* Input row */}
          <div className="ai-chat-composer">
            {showAgentLoopProgress && (
              <div className="ai-chat-agent-loop-progress" role="status" aria-live="polite">
                {cardMessages.agentLoopProgress(aiTaskSession.step!, aiTaskSession.maxSteps!)}
              </div>
            )}
            {recentTaskTrace.length > 0 && (
              <div className="ai-chat-task-trace" role="status" aria-live="polite">
                <div className="ai-chat-task-trace-title">{cardMessages.taskTraceTitle}</div>
                <div className="ai-chat-task-trace-list">
                  {recentTaskTrace.map((entry) => (
                    <div key={`${entry.requestId ?? entry.toolName ?? entry.phase}-${entry.stepNumber}`} className="ai-chat-task-trace-chip">
                      <span className="ai-chat-task-trace-step">{cardMessages.taskTraceStepLabel(entry.stepNumber)}</span>
                      <span className="ai-chat-task-trace-tool">{entry.toolName ?? entry.phase}</span>
                      <span className="ai-chat-task-trace-status">{formatTaskTraceOutcome(entry, isZh)}</span>
                      {typeof entry.durationMs === 'number' ? <span className="ai-chat-task-trace-duration">{`${entry.durationMs}ms`}</span> : null}
                    </div>
                  ))}
                </div>
              </div>
            )}
            {followUpSuggestions.length > 0 && (
              <div className="ai-chat-follow-up-panel">
                <div className="ai-chat-follow-up-title">{cardMessages.followUpTitle}</div>
                <div className="ai-chat-composer-shortcuts-list">
                  {followUpSuggestions.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className="icon-btn ai-chat-composer-shortcut ai-chat-follow-up-chip"
                      onClick={() => submitFollowUpPrompt(item.prompt)}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <AiChatMetricsBar
              isZh={isZh}
              aiInteractionMetrics={aiInteractionMetrics}
              aiSessionMemory={aiSessionMemory}
            />
            {quickPromptTemplates.length > 0 && (
              <div className="ai-chat-composer-shortcuts">
                <div className="ai-chat-composer-shortcuts-list">
                  {quickPromptTemplates.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className="icon-btn ai-chat-composer-shortcut"
                      onClick={() => injectPromptTemplate(item.content)}
                    >
                      {item.title}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className="ai-chat-composer-row">
              <div className="ai-chat-composer-input-wrap">
                <input
                  ref={chatInputRef}
                  className={`ai-chat-input ai-chat-input-composer${showInlineRecommendation ? ' has-ghost-suggestion' : ''}`}
                  type="text"
                  value={chatInput}
                  placeholder={composerPlaceholder}
                  aria-label={showInlineRecommendation ? hybridInputSuggestion : inputPlaceholder}
                  onChange={(e) => setChatInput(e.currentTarget.value)}
                  onKeyDown={(e) => {
                    const native = e.nativeEvent as KeyboardEvent;
                    // \\u8f93\\u5165\\u6cd5\\u7ec4\\u5408\\u671f\\u95f4\\u56de\\u8f66\\u7528\\u4e8e\\u9009\\u8bcd，\\u4e0d\\u5e94\\u89e6\\u53d1\\u53d1\\u9001 | Enter should not submit while IME composition is active.
                    if (native.isComposing || native.keyCode === 229) return;
                    if (!e.shiftKey && !e.altKey && !e.ctrlKey && !e.metaKey && showInlineRecommendation && (e.key === 'ArrowRight' || e.key === 'Tab')) {
                      const input = chatInputRef.current;
                      const caretAtStart = !input || ((input.selectionStart ?? 0) === 0 && (input.selectionEnd ?? 0) === 0);
                      if (caretAtStart) {
                        e.preventDefault();
                        applyInlineRecommendation();
                        return;
                      }
                    }
                    if (!e.shiftKey && !e.altKey && !e.ctrlKey && !e.metaKey && showInlineRecommendation && e.key === 'Escape') {
                      e.preventDefault();
                      setDismissedRecommendationSignature(hybridInputSignature);
                      return;
                    }
                    if (e.key !== 'Enter' || e.shiftKey || e.altKey || e.ctrlKey || e.metaKey) return;
                    e.preventDefault();
                    submitChatInput();
                  }}
                />
                {showInlineRecommendation && (
                  <div
                    className="ai-chat-input-ghost-suggestion"
                    aria-hidden="true"
                  >
                    <span className="ai-chat-input-ghost-prefix">{cardMessages.recommendationTitle}</span>
                    <span className="ai-chat-input-ghost-text">{hybridInputSuggestion}</span>
                  </div>
                )}
              </div>
              <button
                type="button"
                className={`icon-btn ai-chat-composer-send-btn${aiIsStreaming ? ' is-streaming' : ''}`}
                aria-label={aiIsStreaming ? cardMessages.stopGenerating : t(locale, 'ai.chat.send')}
                disabled={aiIsStreaming ? !onStopAiMessage : (!onSendAiMessage || hasToolPending)}
                onClick={() => {
                  if (aiIsStreaming) {
                    onStopAiMessage?.();
                    return;
                  }
                  submitChatInput();
                }}
              >
                {aiIsStreaming ? cardMessages.stop : <MaterialSymbol name="arrow_upward" className={JIEYU_MATERIAL_PANEL} />}
              </button>
            </div>
            {(transientBlockedReason || inputBlockedReason) && (
              <p className="small-text ai-chat-composer-warning">{transientBlockedReason ?? inputBlockedReason}</p>
            )}

            <div className={`ai-chat-prompt-lab-panel ${showPromptLab ? 'is-open' : 'is-closed'}${promptTemplates.length === 0 ? ' is-empty' : ''}`}>
              <button
                type="button"
                className="ai-chat-prompt-lab-panel-head"
                onClick={() => setShowPromptLab((prev) => !prev)}
                aria-expanded={showPromptLab}
              >
                <span className="ai-chat-prompt-lab-panel-title">
                  {cardMessages.promptLab}
                  <span className="ai-chat-decision-panel-bracket"> · </span>
                  <span className="ai-chat-decision-panel-count">{promptTemplates.length}{cardMessages.promptTemplateCountSuffix}</span>
                </span>
                <span className="ai-chat-fold-caret" aria-hidden="true">▾</span>
              </button>
              <div className="ai-chat-prompt-lab-panel-body" aria-hidden={!showPromptLab}>
                <AiChatPromptLabModal
                  isZh={isZh}
                  showPromptLab={showPromptLab}
                  promptTemplates={promptTemplates}
                  editingTemplateId={editingTemplateId}
                  templateTitleInput={templateTitleInput}
                  templateContentInput={templateContentInput}
                  onInjectTemplate={injectPromptTemplate}
                  onEditTemplate={editPromptTemplate}
                  onRemoveTemplate={removePromptTemplate}
                  onTemplateTitleInputChange={setTemplateTitleInput}
                  onTemplateContentInputChange={setTemplateContentInput}
                  onAppendPromptVariable={appendPromptVariable}
                  onSaveTemplate={savePromptTemplate}
                  onInjectAndClose={() => {
                    injectPromptTemplate(templateContentInput);
                  }}
                />
              </div>
            </div>
            {canUseVoiceEntry && voiceEntry && (
              <div
                className={`ai-chat-voice-drawer ${voiceEntry.expanded ? 'is-open' : 'is-closed'}${isVoiceDrawerResizing ? ' is-resizing' : ''}`}
                style={voiceDrawerInlineStyle}
              >
                <div className="ai-chat-voice-drawer-shell">
                  <button
                    type="button"
                    className="ai-chat-voice-drawer-head"
                    onClick={voiceEntry.onTogglePanel}
                    aria-expanded={voiceEntry.expanded}
                  >
                    <span className="ai-chat-voice-drawer-title">{cardMessages.voiceInput}</span>
                    <span className="ai-chat-fold-caret" aria-hidden="true">▾</span>
                  </button>
                  <div className="ai-chat-voice-drawer-body" aria-hidden={!voiceEntry.expanded}>
                    {voiceEntry.expanded && (
                      <div
                        className="ai-chat-voice-drawer-resizer"
                        role="separator"
                        aria-orientation="horizontal"
                        aria-label={cardMessages.dragResizeVoicePanelHeight}
                        onPointerDown={startVoiceDrawerResize}
                      />
                    )}
                    {voiceDrawer ?? <p className="ai-chat-fold-empty">{cardMessages.voicePanelUnavailable}</p>}
                  </div>
                </div>
              </div>
            )}

            <div
              className={`ai-chat-decision-panel ${showDecisionPanel ? 'is-open' : 'is-closed'}${hasDecisionLogs ? '' : ' is-empty'}${isDecisionPanelResizing ? ' is-resizing' : ''}`}
              style={decisionPanelInlineStyle}
            >
                <button
                  type="button"
                  className="ai-chat-decision-panel-head"
                  onClick={() => setShowDecisionPanel((prev) => !prev)}
                  aria-expanded={showDecisionPanel}
                >
                  <span className="ai-chat-decision-panel-title">
                    {cardMessages.aiDecisions}
                    <span className="ai-chat-decision-panel-bracket"> · </span>
                    <span className="ai-chat-decision-panel-count">{aiToolDecisionLogs?.length ?? 0}{cardMessages.decisionCountSuffix}</span>
                  </span>
                  <span className="ai-chat-fold-caret" aria-hidden="true">▾</span>
                </button>
                  <div
                    ref={decisionPanelBodyRef}
                    className="ai-chat-decision-panel-body"
                    aria-hidden={!showDecisionPanel}
                  >
                    {showDecisionPanel && (
                      <div
                        className="ai-chat-decision-panel-resizer"
                        role="separator"
                        aria-orientation="horizontal"
                        aria-label={cardMessages.dragResizeDecisionPanelHeight}
                        onPointerDown={startDecisionPanelResize}
                      />
                    )}
                    {!hasDecisionLogs && (
                      <p className="ai-chat-fold-empty">{cardMessages.noDecisionsYet}</p>
                    )}
                    <div className="ai-chat-decision-list">
                      {(aiToolDecisionLogs ?? []).map((item) => {
                        const canReplay = typeof item.requestId === 'string' && item.requestId.trim().length > 0;
                        const isLoading = replayLoadingRequestId === item.requestId;
                        const isSelected = selectedReplayBundle?.requestId === item.requestId;
                        const decisionBits = [
                          formatToolDecision(isZh, item.decision),
                          item.reason,
                          typeof item.durationMs === 'number' ? `${item.durationMs}ms` : '',
                        ].filter((value) => typeof value === 'string' && value.trim().length > 0);
                        return (
                          <div key={item.id} className="ai-chat-decision-item ai-chat-decision-item-compact">
                            <div className="ai-chat-decision-item-meta">
                              <span className="ai-chat-decision-item-main">{item.toolName || cardMessages.unknownTool} · {decisionBits.join(' · ')}</span>
                              <em className="ai-chat-decision-item-time">{new Date(item.timestamp).toLocaleTimeString()}</em>
                            </div>
                            {canReplay && (
                              <div className="ai-chat-decision-item-actions">
                                <button
                                  type="button"
                                  className="icon-btn ai-chat-decision-action-btn ai-chat-decision-action-btn-wide"
                                  disabled={isLoading}
                                  onClick={() => void openReplayBundle(item.requestId!)}
                                >
                                  {isLoading ? cardMessages.loading : (isSelected ? cardMessages.replayOpened : cardMessages.replayCompare)}
                                </button>
                                <button
                                  type="button"
                                  className="icon-btn ai-chat-decision-action-btn ai-chat-decision-action-btn-mid"
                                  onClick={() => void exportGoldenSnapshot(item.requestId!)}
                                >
                                  {exportedSnapshotRequestId === item.requestId
                                    ? cardMessages.snapshotExported
                                    : cardMessages.exportSnapshot}
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                      {replayErrorMessage && (
                        <div className="ai-chat-decision-error">{replayErrorMessage}</div>
                      )}
                      {selectedReplayBundle && (
                        <AiChatReplayDetailPanel
                          isZh={isZh}
                          selectedReplayBundle={selectedReplayBundle}
                          showReplayDetailPanel={showReplayDetailPanel}
                          compareSnapshot={compareSnapshot}
                          snapshotDiff={snapshotDiff}
                          importFileInputRef={importFileInputRef}
                          onToggleDetail={() => setShowReplayDetailPanel((prev) => !prev)}
                          onClose={() => {
                            setSelectedReplayBundle(null);
                            setCompareSnapshot(null);
                            setSnapshotDiff(null);
                          }}
                          onImportSnapshotFile={importSnapshotForCompare}
                          onClearCompare={() => {
                            setCompareSnapshot(null);
                            setSnapshotDiff(null);
                          }}
                        />
                      )}
                    </div>
                  </div>
              </div>
          </div>

        </>
      )}
    </div>
  );
}
