import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { useLatest } from './useLatest';
import { useLocale, useOptionalLocale } from '../i18n';
import { useAiChatConnectionProbe } from './useAiChat.connectionProbe';
import { useAiChatConversationState } from './useAiChat.conversationState';
import { createAssistantPersistenceHelpers } from './useAiChat.assistantPersistence';
import { DEFAULT_FIRST_CHUNK_TIMEOUT_MS, INITIAL_METRICS, normalizeAutoProbeIntervalMs, normalizeFirstChunkTimeoutMs, normalizeRagContextTimeoutMs, normalizeStreamPersistInterval, readDevAutoProbeIntervalMs, readDevRagContextTimeoutMs, readDevStreamPersistIntervalMs } from './useAiChat.config';
import { newMessageId, nowIso } from './useAiChat.helpers';
import { runAgentLoop } from './useAiChat.agentLoopRunner';
import { resolveClarifyFastPathCall } from './useAiChat.clarify';
import { buildContextDebugSnapshot, logContextDebugSnapshot } from './useAiChat.debug';
import { executeConfirmedToolCall } from './useAiChat.confirmExecution';
import type { ResolveAiChatStreamCompletionParams } from './useAiChat.streamCompletion';
import { finalizeAssistantStreamCompletion } from './useAiChat.streamCompletionPhase';
import { getDb } from '../db';
import { enrichContextWithRag } from './useAiChat.rag';
import { ChatOrchestrator } from '../ai/ChatOrchestrator';
import { buildConversationSummaryFromHistory, countHistoryUserTurns, estimateSummaryCoverageSimilarity, splitHistoryByRecentRounds, trimHistoryByChars, type HistoryChatMessage } from '../ai/chat/historyTrim';
import { buildSessionMemoryPromptDigest, clearConversationSummaryMemory, loadSessionMemory, persistSessionMemory, setSessionMemoryMessagePinned, updateConversationSummaryMemory } from '../ai/chat/sessionMemory';
import { updateSessionMemoryWithPrompt } from '../ai/chat/adaptiveInputProfile';
import { updateSessionMemoryWithRecommendationEvent } from '../ai/chat/recommendationTelemetry';

import { resolveLocalToolRoutingPlan } from '../ai/chat/localToolSlotResolver';
import { resolveContextCharBudgets } from '../ai/chat/contextBudget';
import { buildAiSystemPrompt, buildPromptContextBlock, isAiContextDebugEnabled } from '../ai/chat/promptContext';

import { resolveAiToolDecisionMode } from '../ai/chat/toolCallHelpers';
import type { AiMessageCitation } from '../db';
import { featureFlags } from '../ai/config/featureFlags';
import { createAssistantStream } from './useAiChat.streamFactory';
import { normalizeAiProviderError } from '../ai/providers/errorUtils';
import type { ChatTokenUsage } from '../ai/providers/LLMProvider';
import { mergeTokenUsage } from '../ai/providers/tokenUsage';
import { useAiChatToolAudit, genRequestId } from './useAiChat.toolAudit';
import { useAiChatPendingToolCall } from './useAiChat.pendingToolCall';
import { resolveToolDecisionPipeline } from './useAiChat.toolDecisionPipeline';
import { formatAbortedMessage, formatAiChatDisabledError, formatConnectionHealthyMessage, formatFirstChunkTimeoutError, formatPendingConfirmationBlockedError, formatStreamingBusyError } from '../ai/messages';
import { applyAiChatSettingsPatch, createAiChatProvider, getDefaultAiChatSettings, normalizeAiChatSettings } from '../ai/providers/providerCatalog';
import { loadAiChatSettingsFromStorage, persistAiChatSettings } from '../ai/config/aiChatSettingsStorage';
import { createMetricTags, recordDurationMetric, recordMetric } from '../observability/metrics';
import type { AiChatSettings } from '../ai/providers/providerCatalog';
import type { AiContextDebugSnapshot, AiInteractionMetrics, AiSessionMemory, AiTaskSession, PendingAiToolCall, UiChatMessage, UseAiChatOptions, AiRecommendationEvent } from './useAiChat.types';

function isAgentLoopResumeText(userText: string): boolean {
  const normalized = userText.trim();
  if (!normalized) return false;
  return /^(继续|继续执行|接着|接着说|继续吧)$/u.test(normalized)
    || /^(continue|resume|go on)$/i.test(normalized);
}
export type {
  AiChatProviderKind,
  AiChatSettings,
} from '../ai/providers/providerCatalog';
export type {
  AiChatToolCall,
  AiChatToolName,
  AiChatToolResult,
  AiClarifyCandidate,
  AiConnectionTestStatus,
  AiContextDebugSnapshot,
  AiInteractionMetrics,
  AiPromptContext,
  AiSessionMemory,
  AiSystemPersonaKey,
  AiTaskSession,
  AiToolDecisionMode,
  AiToolRiskCheckResult,
  PendingAiToolCall,
  PreviewContract,
  UiChatMessage,
  UseAiChatOptions,
} from './useAiChat.types';

export function useAiChat(options?: UseAiChatOptions) {
  // 保留主 hook 对确认执行 seam 的显式依赖，结构测试据此验证拆分边界 |
  // Keep the explicit seam reference in the main hook for structure-invariant tests.
  void executeConfirmedToolCall;
  void resolveToolDecisionPipeline;
  // executeConfirmedToolCall(...) is invoked inside useAiChatPendingToolCall.

  const locale = useLocale();
  const toolFeedbackLocale = useOptionalLocale() ?? 'zh-CN';
  const localeRef = useLatest(locale);
  const toolFeedbackLocaleRef = useLatest(toolFeedbackLocale);
  const onToolCall = options?.onToolCall;
  const onToolRiskCheck = options?.onToolRiskCheck;
  const preparePendingToolCall = options?.preparePendingToolCall;
  const systemPersonaKey = options?.systemPersonaKey ?? 'transcription';
  const systemPersonaKeyRef = useLatest(systemPersonaKey);
  const getContext = options?.getContext;
  const maxContextCharsOverride = options?.maxContextChars;
  const historyCharBudgetOverride = options?.historyCharBudget;
  const allowDestructiveToolCalls = options?.allowDestructiveToolCalls ?? false;
  const embeddingSearchService = options?.embeddingSearchService;
  const streamPersistIntervalMs = normalizeStreamPersistInterval(
    options?.streamPersistIntervalMs ?? readDevStreamPersistIntervalMs(),
  );
  const firstChunkTimeoutMs = normalizeFirstChunkTimeoutMs(options?.firstChunkTimeoutMs);
  const autoProbeIntervalMs = normalizeAutoProbeIntervalMs(
    options?.autoProbeIntervalMs ?? readDevAutoProbeIntervalMs(),
  );
  const autoConnectionProbeEnabled = options?.autoConnectionProbeEnabled ?? true;
  const ragContextTimeoutMs = normalizeRagContextTimeoutMs(readDevRagContextTimeoutMs());
  const onToolCallRef = useLatest(onToolCall);
  const onToolRiskCheckRef = useLatest(onToolRiskCheck);
  const preparePendingToolCallRef = useLatest(preparePendingToolCall);
  const getTimelineReadModelEpochRef = useLatest(options?.getTimelineReadModelEpoch);
  const onMessageCompleteRef = useLatest(options?.onMessageComplete);
  const toolDecisionMode = resolveAiToolDecisionMode();
  const settingsHydratedRef = useRef(false);
  // 用户是否在水合完成前手动改过设置 | Whether user patched settings before hydration finished
  const userDirtyRef = useRef(false);
  const clearInFlightRef = useRef(false);
  const clearPersistCleanupRunningRef = useRef(false);
  const clearPersistRequestRef = useRef<{ conversationId: string | null } | null>(null);
  const [messages, setMessages] = useState<UiChatMessage[]>(() => []);
  const messagesRef = useLatest(messages);
  const [isStreaming, setIsStreaming] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const [settings, setSettings] = useState<AiChatSettings>(() => normalizeAiChatSettings());
  const [contextDebugSnapshot, setContextDebugSnapshot] = useState<AiContextDebugSnapshot | null>(null);
  const [pendingToolCall, setPendingToolCall] = useState<PendingAiToolCall | null>(null);
  const [taskSession, setTaskSession] = useState<AiTaskSession>(() => ({
    id: newMessageId('task'),
    status: 'idle',
    updatedAt: nowIso(),
  }));
  const [metrics, setMetrics] = useState<AiInteractionMetrics>({ ...INITIAL_METRICS });
  const metricsRef = useLatest(metrics);
  const sessionMemoryRef = useRef<AiSessionMemory>(loadSessionMemory());
  const bumpMetric = useCallback((key: keyof AiInteractionMetrics, delta = 1) => {
    setMetrics((prev) => ({ ...prev, [key]: prev[key] + delta }));
  }, []);
  const abortRef = useRef<AbortController | null>(null);
  const localToolCallCountRef = useRef(0);

  const provider = useMemo(() => createAiChatProvider(settings), [settings]);
  // 备用 provider：主模型限速/不可用时自动降级 | Fallback provider for auto-degradation
  const fallbackProvider = useMemo(() => {
    if (!settings.fallbackProviderKind || settings.fallbackProviderKind === settings.providerKind) return null;
    const fallbackApiKey = settings.apiKeysByProvider[settings.fallbackProviderKind] ?? '';
    const fallbackSettings = getDefaultAiChatSettings(settings.fallbackProviderKind);
    return createAiChatProvider({ ...fallbackSettings, apiKey: fallbackApiKey });
  }, [settings]);
  const orchestrator = useMemo(() => new ChatOrchestrator(provider, fallbackProvider), [provider, fallbackProvider]);

  // 用 useLatest 包装 send 内部读取的频繁变更值，减少 send 的依赖数组长度，
  // 避免长依赖数组导致的闭包重建风险（如 settings.model 变更时全量重建）。
  const settingsRef = useLatest(settings);
  const getContextRef = useLatest(getContext);
  const embeddingSearchServiceRef = useLatest(embeddingSearchService);
  const toolDecisionModeRef = useLatest(toolDecisionMode);
  const pendingToolCallRef = useLatest(pendingToolCall);
  const taskSessionRef = useLatest(taskSession);
  const streamPersistIntervalMsRef = useLatest(streamPersistIntervalMs);
  const ragContextTimeoutMsRef = useLatest(ragContextTimeoutMs);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const loaded = await loadAiChatSettingsFromStorage();
      if (cancelled) return;
      // 用户已手动改过 → 不覆盖 | User already patched → skip overwrite
      if (!userDirtyRef.current) {
        setSettings(loaded);
      }
      settingsHydratedRef.current = true;
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    // 水合完成或用户手动改过 → 允许持久化 | Persist after hydration or user-dirty
    if (!settingsHydratedRef.current && !userDirtyRef.current) return;
    let cancelled = false;
    void persistAiChatSettings(settings, { isStale: () => cancelled });
    return () => {
      cancelled = true;
    };
  }, [settings]);

  const {
    conversationId,
    isBootstrapping,
    ensureConversation,
  } = useAiChatConversationState({
    locale,
    providerId: provider.id,
    model: settings.model,
    onHistoryLoaded: setMessages,
    onHistoryLoadError: setLastError,
  });

  const {
    connectionTestStatus,
    connectionTestMessage,
    setConnectionTestStatus,
    setConnectionTestMessage,
    resetConnectionProbe,
    invalidateConnectionProbe,
    testConnection,
  } = useAiChatConnectionProbe({
    provider,
    model: settings.model,
    providerKind: settings.providerKind,
    apiKey: settings.apiKey,
    isBootstrapping,
    isStreaming,
    autoProbeIntervalMs,
    autoConnectionProbeEnabled,
  });

  const updateSettings = useCallback((patch: Partial<AiChatSettings>) => {
    userDirtyRef.current = true;
    setSettings((current) => applyAiChatSettingsPatch(current, patch));
    
    // 只在影响连接的设置变更时才重置连接探测
    const shouldResetConnection = (
      patch.providerKind !== undefined ||
      patch.baseUrl !== undefined ||
      patch.model !== undefined ||
      patch.apiKey !== undefined
    );
    
    if (shouldResetConnection) {
      abortRef.current?.abort();
      invalidateConnectionProbe();
      resetConnectionProbe();
    }
  }, [invalidateConnectionProbe, resetConnectionProbe]);

  const stop = useCallback(() => {
    const controller = abortRef.current;
    if (!controller) return;
    controller.abort();
    abortRef.current = null;
    // 用户点停止后应立即解除发送拦截 | Immediately unblock sending after user requests stop.
    setIsStreaming(false);
  }, []);

  const runClearPersistenceCleanup = useCallback(() => {
    if (clearPersistCleanupRunningRef.current) return;
    clearPersistCleanupRunningRef.current = true;
    void (async () => {
      try {
        while (true) {
          const request = clearPersistRequestRef.current;
          clearPersistRequestRef.current = null;
          if (!request) break;

          const db = await getDb();
          let targetConversationId = request.conversationId;
          if (!targetConversationId) {
            const existingRows = (await db.collections.ai_conversations.find().exec())
              .map((doc) => doc.toJSON())
              .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
            targetConversationId = existingRows[0]?.id ?? null;
          }
          if (!targetConversationId) continue;

          await db.collections.ai_messages.removeBySelector({ conversationId: targetConversationId });
          const conversation = await db.collections.ai_conversations.findOne({ selector: { id: targetConversationId } }).exec();
          if (conversation) {
            const row = conversation.toJSON();
            await db.collections.ai_conversations.insert({
              ...row,
              updatedAt: nowIso(),
            });
          }
        }
      } finally {
        clearPersistCleanupRunningRef.current = false;
        if (clearPersistRequestRef.current) {
          runClearPersistenceCleanup();
        }
      }
    })();
  }, []);

  const trackRecommendationEvent = useCallback((event: AiRecommendationEvent) => {
    sessionMemoryRef.current = updateSessionMemoryWithRecommendationEvent(sessionMemoryRef.current, event);
    persistSessionMemory(sessionMemoryRef.current);
  }, []);

  const clearPendingAgentLoopCheckpoint = useCallback(() => {
    if (!sessionMemoryRef.current.pendingAgentLoopCheckpoint) return;
    const { pendingAgentLoopCheckpoint: _ignoredCheckpoint, ...restMemory } = sessionMemoryRef.current;
    sessionMemoryRef.current = restMemory;
    persistSessionMemory(sessionMemoryRef.current);
  }, []);

  const toggleMessagePinned = useCallback((messageId: string) => {
    const normalizedMessageId = messageId.trim();
    if (!normalizedMessageId) return;
    const currentlyPinned = (sessionMemoryRef.current.pinnedMessageIds ?? []).includes(normalizedMessageId);
    sessionMemoryRef.current = setSessionMemoryMessagePinned(sessionMemoryRef.current, normalizedMessageId, !currentlyPinned);
    persistSessionMemory(sessionMemoryRef.current);
    setMessages((prev) => [...prev]);
  }, []);

  const applyAssistantMessageResult = useCallback(async (
    messageId: string,
    content: string,
    status: 'done' | 'error' = 'done',
    errorMessage?: string,
  ) => {
    setMessages((prev) => prev.map((msg) => {
      if (msg.id !== messageId) return msg;
      if (status === 'error') {
        return { ...msg, content, status, ...(errorMessage ? { error: errorMessage } : {}) };
      }
      const { error: _ignoredError, ...rest } = msg;
      return { ...rest, content, status: 'done' };
    }));

    const db = await getDb();
    await db.collections.ai_messages.update(messageId, {
      content,
      status,
      ...(errorMessage ? { errorMessage } : {}),
      updatedAt: nowIso(),
    });
  }, []);

  const {
    markExecutedRequestId,
    writeToolDecisionAuditLog,
    writeToolIntentAuditLog,
    hasPersistedExecutionForRequest,
  } = useAiChatToolAudit();

  const { confirmPendingToolCall, cancelPendingToolCall } = useAiChatPendingToolCall({
    providerId: provider.id,
    settingsRef,
    toolDecisionModeRef,
    pendingToolCallRef,
    taskSessionRef,
    sessionMemoryRef,
    toolFeedbackLocale,
    ...(onToolCallRef.current != null && { onToolCall: onToolCallRef.current }),
    applyAssistantMessageResult,
    hasPersistedExecutionForRequest,
    writeToolDecisionAuditLog,
    markExecutedRequestId,
    setPendingToolCall,
    setTaskSession,
    bumpMetric,
    getTimelineReadModelEpoch: () => getTimelineReadModelEpochRef.current?.(),
  });

  const send = useCallback(async (userText: string) => {
    if (!featureFlags.aiChatEnabled) {
      setLastError(formatAiChatDisabledError());
      return;
    }

    if (isStreaming) {
      setLastError(formatStreamingBusyError());
      return;
    }

    const trimmed = userText.trim();
    if (trimmed.length === 0) return;
    if (pendingToolCallRef.current) {
      setLastError(formatPendingConfirmationBlockedError());
      return;
    }

    const resumeCheckpoint = isAgentLoopResumeText(trimmed)
      ? (sessionMemoryRef.current.pendingAgentLoopCheckpoint ?? null)
      : null;
    if (!resumeCheckpoint && sessionMemoryRef.current.pendingAgentLoopCheckpoint) {
      clearPendingAgentLoopCheckpoint();
    }

    setLastError(null);
    localToolCallCountRef.current = 0;
    sessionMemoryRef.current = updateSessionMemoryWithPrompt(sessionMemoryRef.current, trimmed);
    persistSessionMemory(sessionMemoryRef.current);
    bumpMetric('turnCount');
    const shouldTrackRemoteStatus = provider.id !== 'mock' && provider.id !== 'ollama';
    if (shouldTrackRemoteStatus) {
      setConnectionTestStatus('testing');
      setConnectionTestMessage(null);
    }
    const userMsg: UiChatMessage = {
      id: newMessageId('usr'),
      role: 'user',
      content: trimmed,
      status: 'done',
    };

    const assistantId = newMessageId('ast');
    const assistantSeed: UiChatMessage = {
      id: assistantId,
      role: 'assistant',
      content: '',
      status: 'streaming',
      citations: [],
      generationSource: 'local',
      generationModel: '',
      reasoningContent: '',
    };

    // Keep newest messages at top in UI.
    setMessages((prev) => [userMsg, assistantSeed, ...prev]);
    setIsStreaming(true);

    const controller = new AbortController();
    abortRef.current = controller;
    let dbRef: Awaited<ReturnType<typeof getDb>> | null = null;
    let activeConversationId: string | null = null;
    let firstChunkArrived = false;
    let connectionMarkedSuccess = false;
    let timedOutBeforeFirstChunk = false;
    const sendStartedAtMs = performance.now();
    const aiMetricTags = createMetricTags('ai-chat', {
      provider: provider.id,
      model: settingsRef.current.model || provider.id,
    });
    let firstTokenMetricRecorded = false;
    const recordCompletionSuccessMetric = () => {
      try {
        recordMetric({
          id: 'ai.chat.completion_success_count',
          value: 1,
          tags: aiMetricTags,
        });
      } catch {
        // 忽略指标上报异常，避免影响主流程 | Ignore metric reporting errors to avoid affecting the main flow
      }
    };
    // DeepSeek 和 MiniMax 思考链较长，默认首包超时延长至 60s；若调用方显式覆盖则尊重调用方配置。
    // DeepSeek often needs longer thinking time; default timeout is extended to 60s,
    // but explicit overrides should be honored (tests/dev tuning).
    const effectiveTimeoutMs = provider.id === 'deepseek' || provider.id === 'minimax'
      ? (firstChunkTimeoutMs === DEFAULT_FIRST_CHUNK_TIMEOUT_MS ? 60000 : firstChunkTimeoutMs)
      : (provider.id === 'ollama' ? 0 : firstChunkTimeoutMs);
    const timeoutHandle = (typeof window !== 'undefined' && effectiveTimeoutMs > 0)
      ? window.setTimeout(() => {
        if (firstChunkArrived || controller.signal.aborted) return;
        timedOutBeforeFirstChunk = true;
        controller.abort();
      }, effectiveTimeoutMs)
      : null;
    const {
      queueFlushAssistantDraft,
      awaitQueuedPersistence,
      finalizeAssistantMessage,
    } = createAssistantPersistenceHelpers({
      assistantId,
      setMessages,
      streamPersistIntervalMsRef,
      getDbRef: () => dbRef,
      getActiveConversationId: () => activeConversationId,
    });

    let assistantContent = '';
    let reportedInputTokens = 0;
    let totalReportedOutputTokens = 0;
    let primaryStreamUsage: ChatTokenUsage | undefined;
    let usageObservedThisTurn = false;
    let primaryUsageCommitted = false;
    const commitPrimaryStreamUsage = () => {
      if (primaryUsageCommitted) return;
      primaryUsageCommitted = true;
      reportedInputTokens += primaryStreamUsage?.inputTokens ?? 0;
      totalReportedOutputTokens += primaryStreamUsage?.outputTokens ?? 0;
    };
    const agentLoopSourceUserText = resumeCheckpoint?.originalUserText ?? trimmed;
    const effectiveUserText = resumeCheckpoint?.continuationInput ?? trimmed;

    try {
      activeConversationId = await ensureConversation();
      const db = await getDb();
      dbRef = db;
      const userTimestamp = nowIso();
      await db.collections.ai_messages.insert({
        id: userMsg.id,
        conversationId: activeConversationId,
        role: 'user',
        content: userMsg.content,
        status: 'done',
        createdAt: userTimestamp,
        updatedAt: userTimestamp,
      });
      const assistantTimestamp = nowIso();
      await db.collections.ai_messages.insert({
        id: assistantId,
        conversationId: activeConversationId,
        role: 'assistant',
        content: '',
        status: 'streaming',
        ...(assistantSeed.generationSource !== undefined ? { generationSource: assistantSeed.generationSource } : {}),
        ...(assistantSeed.generationModel !== undefined ? { generationModel: assistantSeed.generationModel } : {}),
        createdAt: assistantTimestamp,
        updatedAt: assistantTimestamp,
      });

      const conversation = await db.collections.ai_conversations.findOne({ selector: { id: activeConversationId } }).exec();
      if (conversation) {
        const row = conversation.toJSON();
        await db.collections.ai_conversations.insert({
          ...row,
          providerId: provider.id,
          model: settingsRef.current.model || provider.id,
          updatedAt: nowIso(),
        });
      }

      // Convert UI order (newest-first) back to chronological order for model context.
      // 排除当前轮次的 userMsg 和空 assistantSeed，因为 assembleMessages 会独立添加 userText
      // | Exclude current turn's userMsg and empty assistantSeed — assembleMessages adds userText separately
      const pinnedMessageIds = new Set(sessionMemoryRef.current.pinnedMessageIds ?? []);
      const historyRaw: HistoryChatMessage[] = [...messagesRef.current]
        .filter((m) => m.id !== userMsg.id && m.id !== assistantId)
        .reverse()
        .map((m) => ({
          role: m.role,
          content: m.content,
          messageId: m.id,
          ...(pinnedMessageIds.has(m.id) ? { pinned: true } : {}),
        }));
      const contextCharBudgets = await resolveContextCharBudgets({
        providerKind: settingsRef.current.providerKind,
        model: settingsRef.current.model,
        ...(maxContextCharsOverride !== undefined ? { maxContextCharsOverride } : {}),
        ...(historyCharBudgetOverride !== undefined ? { historyCharBudgetOverride } : {}),
      });
      const historyCharBudget = contextCharBudgets.historyCharBudget;
      const maxContextChars = contextCharBudgets.maxContextChars;

      const summaryRecentRounds = 3;
      const summaryTriggerTurns = 5;
      const summaryCandidateHistory = historyRaw.filter((message) => !message.pinned);
      const { olderMessages } = splitHistoryByRecentRounds(summaryCandidateHistory, summaryRecentRounds);
      const coveredTurnTarget = countHistoryUserTurns(olderMessages);
      const previousCoveredTurns = sessionMemoryRef.current.summaryTurnCount ?? 0;
      if (coveredTurnTarget - previousCoveredTurns >= summaryTriggerTurns) {
        const conversationSummary = buildConversationSummaryFromHistory(
          olderMessages,
          contextCharBudgets.conversationSummaryMaxChars,
        );
        if (conversationSummary) {
          const similarityScore = estimateSummaryCoverageSimilarity(olderMessages, conversationSummary);
          sessionMemoryRef.current = updateConversationSummaryMemory(
            sessionMemoryRef.current,
            conversationSummary,
            coveredTurnTarget,
            {
              similarityScore,
              qualityWarningThreshold: 0.85,
            },
          );
          persistSessionMemory(sessionMemoryRef.current);
        }
      }

      const history = trimHistoryByChars(
        historyRaw,
        historyCharBudget,
        summaryRecentRounds,
        sessionMemoryRef.current.conversationSummary,
      );
      const basePromptContext = getContextRef.current?.() ?? null;
      const sessionMemoryDigest = buildSessionMemoryPromptDigest(
        sessionMemoryRef.current,
        contextCharBudgets.sessionMemoryDigestMaxChars,
      );
      const aiContext = sessionMemoryDigest
        ? (basePromptContext
          ? { ...basePromptContext, shortTerm: { ...basePromptContext.shortTerm, sessionMemoryDigest } }
          : { shortTerm: { sessionMemoryDigest } })
        : basePromptContext;
      const routingPlan = resolveLocalToolRoutingPlan(
        agentLoopSourceUserText,
        sessionMemoryRef.current,
      );
      let contextBlock = buildPromptContextBlock(aiContext, maxContextChars);
      let ragCitations: AiMessageCitation[] = [];
      if (featureFlags.aiChatRagEnabled) {
        ({
          contextBlock,
          citations: ragCitations,
        } = await enrichContextWithRag({
          embeddingSearchService: embeddingSearchServiceRef.current,
          userText: effectiveUserText,
          contextBlock,
          ragContextTimeoutMs: ragContextTimeoutMsRef.current,
          promptContext: aiContext,
        }));
      }
      const contextDebugEnabled = isAiContextDebugEnabled();
      const nextDebugSnapshot: AiContextDebugSnapshot = buildContextDebugSnapshot({
        enabled: contextDebugEnabled,
        persona: systemPersonaKeyRef.current,
        historyContentList: history.map((item) => item.content),
        contextBlock,
        historyCharBudget,
        maxContextChars,
      });
      setContextDebugSnapshot(nextDebugSnapshot);
      if (contextDebugEnabled) {
        logContextDebugSnapshot(nextDebugSnapshot);
      }
      const clarifyFastPathCall = resumeCheckpoint
        ? null
        : resolveClarifyFastPathCall({
            taskSession: taskSessionRef.current,
            userText: trimmed,
            aiContext,
          });

      const systemPrompt = buildAiSystemPrompt(
        systemPersonaKeyRef.current,
        contextBlock,
        settingsRef.current.toolFeedbackStyle,
        routingPlan.selectedTools,
      );
      setMetrics((prev) => ({
        ...prev,
        currentTurnTokens: 0,
        currentTurnTokensAvailable: false,
      }));

      const buildStreamCompletionEnv = (): Omit<
        ResolveAiChatStreamCompletionParams,
        'assistantId' | 'assistantContent' | 'userText' | 'aiContext'
      > => ({
        messages: messagesRef.current,
        resolveFreshAiContext: () => getContextRef.current?.() ?? null,
        providerId: provider.id,
        model: settingsRef.current.model,
        toolFeedbackLocale: toolFeedbackLocaleRef.current,
        toolDecisionMode: toolDecisionModeRef.current,
        toolFeedbackStyle: settingsRef.current.toolFeedbackStyle,
        allowDestructiveToolCalls,
        ...(onToolRiskCheckRef.current ? { onToolRiskCheck: onToolRiskCheckRef.current } : {}),
        ...(preparePendingToolCallRef.current ? { preparePendingToolCall: preparePendingToolCallRef.current } : {}),
        ...(onToolCallRef.current ? { onToolCall: onToolCallRef.current } : {}),
        hasPersistedExecutionForRequest,
        writeToolDecisionAuditLog,
        writeToolIntentAuditLog,
        sessionMemory: sessionMemoryRef.current,
        updateSessionMemory: (nextMemory) => {
          sessionMemoryRef.current = nextMemory;
        },
        persistSessionMemory,
        setTaskSession,
        getTaskSession: () => taskSessionRef.current,
        setPendingToolCall,
        taskSessionId: taskSessionRef.current.id,
        markExecutedRequestId,
        bumpMetric,
        shouldBumpRecovery: metricsRef.current.failureCount > 0 && taskSessionRef.current.status === 'executing',
        genRequestId,
        localToolCallCountRef,
      });

      const {
        stream,
        generationSource,
        generationModel,
      } = createAssistantStream({
        userText: effectiveUserText,
        clarifyFastPathCall,
        history,
        orchestrator,
        systemPrompt,
        signal: controller.signal,
        taskSessionStatus: taskSessionRef.current.status,
        model: settingsRef.current.model,
        ...(settingsRef.current.explainModel
          ? { explainModel: settingsRef.current.explainModel }
          : {}),
      });

      setMessages((prev) => prev.map((msg) => (
        msg.id === assistantId
          ? { ...msg, generationSource, generationModel }
          : msg
      )));

      await db.collections.ai_messages.update(assistantId, {
        generationSource,
        generationModel,
        updatedAt: nowIso(),
      });

      let assistantReasoningContent = '';
      let assistantThinking = false;
      let streamFinalized = false;

      for await (const chunk of stream) {
        if (!firstChunkArrived) {
          firstChunkArrived = true;
          if (!firstTokenMetricRecorded) {
            firstTokenMetricRecorded = true;
            try {
              recordDurationMetric('ai.chat.first_token_latency_ms', sendStartedAtMs, aiMetricTags);
            } catch {
              // 忽略指标上报异常，避免影响主流程 | Ignore metric reporting errors to avoid affecting the main flow
            }
          }
          if (shouldTrackRemoteStatus && !connectionMarkedSuccess) {
            connectionMarkedSuccess = true;
            setConnectionTestStatus('success');
            setConnectionTestMessage(formatConnectionHealthyMessage(provider.label));
          }
          if (timeoutHandle !== null && typeof window !== 'undefined') {
            window.clearTimeout(timeoutHandle);
          }
        }

        if (chunk.error) {
          const errorText = chunk.error;
          streamFinalized = true;
          commitPrimaryStreamUsage();
          await awaitQueuedPersistence();
          await finalizeAssistantMessage('error', assistantContent, errorText, ragCitations, assistantReasoningContent);
          setLastError(errorText);
          if (shouldTrackRemoteStatus) {
            setConnectionTestStatus('error');
            setConnectionTestMessage(errorText);
          }
          break;
        }

        if ((chunk.delta ?? '').length > 0) {
          const delta = chunk.delta ?? '';
          assistantContent += delta;
          flushSync(() => {
            setMessages((prev) => prev.map((msg) => (
              msg.id === assistantId
                ? { ...msg, content: msg.content + delta, ...(assistantThinking ? { thinking: false } : {}) }
                : msg
            )));
          });
          queueFlushAssistantDraft(assistantContent);
        }

        // 思考中状态：非reasoning_content型provider的首包到达前显示"正在思考"
        // Anthropic/Gemini/Ollama等provider在首个delta到达前会yield { thinking: true }
        if (chunk.thinking && !chunk.delta) {
          assistantThinking = true;
          setMessages((prev) => prev.map((msg) => (
            msg.id === assistantId
              ? { ...msg, thinking: true }
              : msg
          )));
        }

        // 累加推理内容（reasoning_content），如 DeepSeek 思考过程
        if (chunk.reasoningContent && chunk.reasoningContent.length > 0) {
          assistantReasoningContent += chunk.reasoningContent;
          setMessages((prev) => prev.map((msg) => (
            msg.id === assistantId
              ? { ...msg, reasoningContent: (msg.reasoningContent ?? '') + chunk.reasoningContent }
              : msg
          )));
        }

        if (chunk.usage) {
          usageObservedThisTurn = true;
          primaryStreamUsage = mergeTokenUsage(primaryStreamUsage, chunk.usage);
        }

        if (chunk.done) {
          streamFinalized = true;
          queueFlushAssistantDraft(assistantContent, true);
          await awaitQueuedPersistence();
          commitPrimaryStreamUsage();
          const {
            finalContent,
            finalStatus,
            finalErrorMessage,
            connectionErrorMessage,
            localToolResults,
          } = await finalizeAssistantStreamCompletion(
            {
              assistantId,
              assistantContent,
              userText: effectiveUserText,
              aiContext,
            },
            buildStreamCompletionEnv(),
          );

          let resolvedContent = finalContent;
          let resolvedStatus = finalStatus;
          let resolvedErrorMessage = finalErrorMessage;
          let resolvedConnectionErrorMessage = connectionErrorMessage;

          // ── Agent loop（已提取至 useAiChat.agentLoopRunner） ──
          const loopResult = await runAgentLoop(
            {
              assistantId,
              agentLoopSourceUserText,
              history,
              historyCharBudget,
              systemPrompt,
              aiContext,
              signal: controller.signal,
              routingPlan,
              aiChatAgentLoopEnabled: featureFlags.aiChatAgentLoopEnabled,
              getSessionMemory: () => sessionMemoryRef.current,
              setSessionMemory: (next) => { sessionMemoryRef.current = next; },
              getSettings: () => settingsRef.current,
              getLocaleIsZhCn: () => localeRef.current === 'zh-CN',
              getAiContext: () => getContextRef.current?.() ?? null,
              getTaskSession: () => taskSessionRef.current,
              setTaskSession,
              setMetrics,
              persistSessionMemory,
              buildStreamCompletionEnv,
              orchestrator,
              insertAuditLog: (entry) => db.collections.audit_logs.insert(entry),
            },
            {
              resolvedContent: finalContent,
              resolvedStatus: finalStatus,
              resolvedErrorMessage: finalErrorMessage,
              resolvedConnectionErrorMessage: connectionErrorMessage,
              resolvedLocalToolResults: localToolResults,
              rawAssistantContentForLoop: assistantContent,
              assistantReasoningContent,
              reportedInputTokens,
              totalOutputTokens: totalReportedOutputTokens,
              startStep: resumeCheckpoint ? Math.max(1, resumeCheckpoint.step + 1) : 1,
            },
          );

          resolvedContent = loopResult.resolvedContent;
          resolvedStatus = loopResult.resolvedStatus;
          resolvedErrorMessage = loopResult.resolvedErrorMessage;
          resolvedConnectionErrorMessage = loopResult.resolvedConnectionErrorMessage;
          assistantReasoningContent = loopResult.assistantReasoningContent;
          totalReportedOutputTokens = loopResult.totalOutputTokens;
          reportedInputTokens = loopResult.reportedInputTokens;

          if (loopResult.loopExecuted) {
            setTaskSession((prev) => {
              if (prev.status !== 'executing') return prev;
              return {
                id: prev.id,
                status: 'idle',
                updatedAt: nowIso(),
              };
            });
          }

          const stillPendingCheckpoint = sessionMemoryRef.current.pendingAgentLoopCheckpoint;
          if (
            !stillPendingCheckpoint
            || (
              resumeCheckpoint
              && stillPendingCheckpoint.createdAt === resumeCheckpoint.createdAt
              && stillPendingCheckpoint.step === resumeCheckpoint.step
            )
          ) {
            clearPendingAgentLoopCheckpoint();
          }
          if (resolvedConnectionErrorMessage && shouldTrackRemoteStatus) {
            setConnectionTestStatus('error');
            setConnectionTestMessage(resolvedConnectionErrorMessage);
          }
          if (resolvedErrorMessage) setLastError(resolvedErrorMessage);
          if (resolvedStatus === 'done') {
            recordCompletionSuccessMetric();
          }
          await finalizeAssistantMessage(resolvedStatus, resolvedContent, resolvedErrorMessage, ragCitations, assistantReasoningContent);
          break;
        }
      }

      if (!streamFinalized && !controller.signal.aborted) {
        commitPrimaryStreamUsage();
        recordCompletionSuccessMetric();
        await awaitQueuedPersistence();
        await finalizeAssistantMessage('done', assistantContent, undefined, ragCitations, assistantReasoningContent);
      }
    } catch (error) {
      if (controller.signal.aborted || (error instanceof DOMException && error.name === 'AbortError')) {
        if (timedOutBeforeFirstChunk) {
          const isLongThinkProvider = provider.id === 'deepseek' || provider.id === 'minimax';
          const timeoutMessage = formatFirstChunkTimeoutError(isLongThinkProvider, provider.label);
          const timeoutContent = messagesRef.current.find((msg) => msg.id === assistantId)?.content ?? '';
          await awaitQueuedPersistence();
          await finalizeAssistantMessage('error', timeoutContent, timeoutMessage);
          setLastError(timeoutMessage);
          if (shouldTrackRemoteStatus) {
            setConnectionTestStatus('error');
            setConnectionTestMessage(timeoutMessage);
          }
          return;
        }
        if (shouldTrackRemoteStatus && !firstChunkArrived) {
          setConnectionTestStatus('idle');
          setConnectionTestMessage(null);
        }
        const abortedMsg = messagesRef.current.find((msg) => msg.id === assistantId);
        const abortedContent = abortedMsg?.content ?? '';
        commitPrimaryStreamUsage();
        await awaitQueuedPersistence();
        await finalizeAssistantMessage('aborted', abortedContent, formatAbortedMessage());
        return;
      }

      const message = normalizeAiProviderError(error, provider.label);
      const errorMsg = messagesRef.current.find((msg) => msg.id === assistantId);
      const errorContent = errorMsg?.content ?? '';
      commitPrimaryStreamUsage();
      await awaitQueuedPersistence();
      await finalizeAssistantMessage('error', errorContent, message);
      setLastError(message);
      if (shouldTrackRemoteStatus) {
        setConnectionTestStatus('error');
        setConnectionTestMessage(message);
      }
    } finally {
      if (timeoutHandle !== null && typeof window !== 'undefined') {
        window.clearTimeout(timeoutHandle);
      }
      // 仅清理当前活跃流，避免旧流覆盖新流状态 | Clean only if this stream is still the active one.
      if (abortRef.current === controller) {
        abortRef.current = null;
        setIsStreaming(false);
      }
      // Fire onMessageComplete once per stream — prefer latest stream buffer to avoid stale ref reads.
      const completionContent = messagesRef.current.find((m) => m.id === assistantId)?.content
        ?? (assistantContent.trim().length > 0
          ? assistantContent
          : '');
      commitPrimaryStreamUsage();
      const inputTokens = reportedInputTokens;
      const outputTokens = totalReportedOutputTokens;
      setMetrics((prev) => ({
        ...prev,
        totalInputTokens: prev.totalInputTokens + inputTokens,
        totalOutputTokens: prev.totalOutputTokens + outputTokens,
        currentTurnTokens: inputTokens + outputTokens,
        totalInputTokensAvailable: prev.totalInputTokensAvailable || usageObservedThisTurn,
        totalOutputTokensAvailable: prev.totalOutputTokensAvailable || usageObservedThisTurn,
        currentTurnTokensAvailable: usageObservedThisTurn,
      }));
      if (completionContent) {
        onMessageCompleteRef.current?.(assistantId, completionContent);
      }
    }
  }, [
    allowDestructiveToolCalls,
    ensureConversation,
    firstChunkTimeoutMs,
    historyCharBudgetOverride,
    isStreaming,
    maxContextCharsOverride,
    onMessageCompleteRef,
    onToolCallRef,
    onToolRiskCheckRef,
    orchestrator,
    provider.id,
    provider.label,
    taskSessionRef,
    writeToolDecisionAuditLog,
    writeToolIntentAuditLog,
  ]);

  const clear = useCallback(() => {
    if (clearInFlightRef.current) return;
    clearInFlightRef.current = true;
    sessionMemoryRef.current = clearConversationSummaryMemory(sessionMemoryRef.current);
    if (sessionMemoryRef.current.pendingAgentLoopCheckpoint) {
      const { pendingAgentLoopCheckpoint: _ignoredCheckpoint, ...restMemory } = sessionMemoryRef.current;
      sessionMemoryRef.current = restMemory;
    }
    persistSessionMemory(sessionMemoryRef.current);
    setMessages([]);
    setLastError(null);
    setPendingToolCall(null);
    setMetrics({ ...INITIAL_METRICS });
    setTaskSession({
      id: newMessageId('task'),
      status: 'idle',
      updatedAt: nowIso(),
    });
    clearInFlightRef.current = false;

    // 异步清理持久层，避免 IndexedDB 删除阻塞 UI 清空体感 | Cleanup persistence asynchronously to avoid IndexedDB deletion blocking clear UX.
    clearPersistRequestRef.current = {
      conversationId: conversationId ?? null,
    };
    runClearPersistenceCleanup();
  }, [conversationId, runClearPersistenceCleanup]);

  return {
    messages,
    isStreaming,
    lastError,
    send,
    stop,
    clear,
    testConnection,
    enabled: featureFlags.aiChatEnabled,
    toolDecisionMode,
    isBootstrapping,
    providerLabel: provider.label,
    settings,
    updateSettings,
    connectionTestStatus,
    connectionTestMessage,
    contextDebugSnapshot,
    pendingToolCall,
    taskSession,
    metrics,
    sessionMemory: sessionMemoryRef.current,
    confirmPendingToolCall,
    cancelPendingToolCall,
    trackRecommendationEvent,
    toggleMessagePinned,
  };
}
