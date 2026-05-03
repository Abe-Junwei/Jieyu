import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLatest } from './useLatest';
import { useLocale, useOptionalLocale, type Locale } from '../i18n';
import { useAiChatConnectionProbe } from './useAiChat.connectionProbe';
import { useAiChatConversationState } from './useAiChat.conversationState';
import { DEFAULT_OUTPUT_TOKEN_CAP, INITIAL_METRICS, normalizeAutoProbeIntervalMs, normalizeFirstChunkTimeoutMs, normalizeOutputTokenCap, normalizeOutputTokenRetryCap, normalizeRagContextTimeoutMs, normalizeSessionTokenBudget, normalizeStreamPersistInterval, readDevOutputTokenCap, readDevOutputTokenRetryCap, readDevAutoProbeIntervalMs, readDevRagContextTimeoutMs, readDevSessionTokenBudget, readDevStreamPersistIntervalMs } from './useAiChat.config';
import { newMessageId, nowIso } from './useAiChat.helpers';
import { executeConfirmedToolCall } from './useAiChat.confirmExecution';
import { enrichContextWithRag } from './useAiChat.rag';
import { AI_CHAT_BACKGROUND_MEMORY_SANDBOX_PROFILE, createAiChatBackgroundMemoryRuntime, type AiChatBackgroundMemoryRuntime } from './useAiChat.backgroundMemory';
import { resolveAiChatResponsePolicy } from './useAiChat.responsePolicy';
import { getDb } from '../db';
import { ChatOrchestrator } from '../ai/ChatOrchestrator';
import { clearConversationSummaryMemory, loadSessionMemory, persistSessionMemory } from '../ai/chat/sessionMemory';
import { useAgentLoopSessionMemoryDexieReconcile } from './useAiChat.agentLoopDexieReconcile';
import { updateSessionMemoryWithRecommendationEvent } from '../ai/chat/recommendationTelemetry';
import { runAiChatClearPersistenceCleanup, type AiChatClearPersistenceRequest } from './useAiChat.persistenceCleanup';
import { resolveAiToolDecisionMode } from '../ai/chat/toolCallHelpers';
import { featureFlags } from '../ai/config/featureFlags';
import { createAssistantStream } from './useAiChat.streamFactory';
import { useAiChatToolAudit } from './useAiChat.toolAudit';
import { useAiChatPendingToolCall } from './useAiChat.pendingToolCall';
import { useSyncAssistantDialogueChatTool } from './useSyncAssistantDialogueChatTool';
import { useAiChatAgentLoopCheckpointControls } from './useAiChat.agentLoopCheckpointControls';
import { useAiChatDirectiveSessionControls } from './useAiChat.directiveSessionControls';
import { resolveToolDecisionPipeline } from './useAiChat.toolDecisionPipeline';
import { runAiChatSendTurn } from './useAiChat.sendTurn';
import { applyAiChatSettingsPatch, createAiChatProvider, getDefaultAiChatSettings, normalizeAiChatSettings } from '../ai/providers/providerCatalog';
import { loadAiChatSettingsFromStorage, persistAiChatSettings } from '../ai/config/aiChatSettingsStorage';
import type { AiChatSettings } from '../ai/providers/providerCatalog';
import type { AiContextDebugSnapshot, AiInteractionMetrics, AiRecommendationEvent, AiSessionMemory, AiSystemPersonaKey, AiTaskSession, PendingAiToolCall, UiChatMessage, UseAiChatOptions } from './useAiChat.types';

export type { AiChatProviderKind, AiChatSettings } from '../ai/providers/providerCatalog';
export type { AiChatToolCall, AiChatToolName, AiChatToolResult, AiClarifyCandidate, AiConnectionTestStatus, AiContextDebugSnapshot, AiInteractionMetrics, AiMemoryRecallShapeTelemetry, AiPromptContext, AiPromptDraftSnapshot, AiPromptLayerLinkSnapshot, AiPromptLayerSnapshot, AiPromptNoteSummary, AiPromptSpeakerSnapshot, AiPromptVisibleTimelineState, AiSessionMemory, AiSystemPersonaKey, AiTaskSession, AiToolDecisionMode, AiToolRiskCheckResult, PendingAiToolCall, PreviewContract, UiChatMessage, UseAiChatOptions } from './useAiChat.types';

export function useAiChat(options?: UseAiChatOptions) {
  // 保留主 hook 对确认执行 seam 的显式依赖，结构测试据此验证拆分边界 |
  // Keep the explicit seam reference in the main hook for structure-invariant tests.
  void executeConfirmedToolCall;
  void resolveToolDecisionPipeline;
  void enrichContextWithRag;
  void createAssistantStream;
  // executeConfirmedToolCall(...) is invoked inside useAiChatPendingToolCall.

  const locale = useLocale();
  const toolFeedbackLocale: Locale = useOptionalLocale() ?? 'zh-CN';
  const toolFeedbackLocaleRef = useLatest(toolFeedbackLocale);
  const onToolCall = options?.onToolCall;
  const onToolRiskCheck = options?.onToolRiskCheck;
  const preparePendingToolCall = options?.preparePendingToolCall;
  const systemPersonaKey: AiSystemPersonaKey = options?.systemPersonaKey ?? 'transcription';
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
  const clearPersistRequestRef = useRef<AiChatClearPersistenceRequest | null>(null);
  const [messages, setMessages] = useState<UiChatMessage[]>(() => []);
  const messagesRef = useLatest(messages);
  const [isStreaming, setIsStreaming] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const [settings, setSettings] = useState<AiChatSettings>(() => normalizeAiChatSettings());
  const sessionTokenBudget = normalizeSessionTokenBudget(
    options?.sessionTokenBudget ?? settings.sessionTokenBudget ?? readDevSessionTokenBudget(),
  );
  const outputTokenCap = normalizeOutputTokenCap(
    options?.outputTokenCap ?? settings.outputTokenCap ?? readDevOutputTokenCap(),
    DEFAULT_OUTPUT_TOKEN_CAP,
  );
  const outputTokenRetryCap = normalizeOutputTokenRetryCap(
    options?.outputTokenRetryCap ?? settings.outputTokenRetryCap ?? readDevOutputTokenRetryCap(),
    outputTokenCap,
  );
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
  useAgentLoopSessionMemoryDexieReconcile(sessionMemoryRef);
  const backgroundMemoryRuntimeRef = useRef<AiChatBackgroundMemoryRuntime | null>(null);
  if (backgroundMemoryRuntimeRef.current === null) {
    backgroundMemoryRuntimeRef.current = createAiChatBackgroundMemoryRuntime({
      enabled: featureFlags.aiBackgroundMemoryExtractorEnabled,
      sandboxEnabled: featureFlags.aiBackgroundToolSandboxEnabled,
      sandboxProfile: AI_CHAT_BACKGROUND_MEMORY_SANDBOX_PROFILE,
      flushQuotaEnabled: featureFlags.aiBackgroundMemorySessionWriteQuotaEnabled,
      flushQuotaMaxCompletedWriteFlushesPerConversation: featureFlags.aiBackgroundMemorySessionWriteQuotaMax,
      getSessionMemory: () => sessionMemoryRef.current,
      setSessionMemory: (nextMemory) => {
        sessionMemoryRef.current = nextMemory;
      },
      persistSessionMemory,
    });
  }
  const bumpMetric = useCallback((key: keyof AiInteractionMetrics, delta = 1) => {
    setMetrics((prev) => {
      const currentValue = prev[key];
      if (typeof currentValue !== 'number') {
        return prev;
      }
      return { ...prev, [key]: currentValue + delta };
    });
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
  useSyncAssistantDialogueChatTool(pendingToolCall);

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
    clearPendingAgentLoopCheckpoint,
    dismissPendingAgentLoopCheckpoint,
    clearPendingAgentLoopCheckpointIfTaskIdMatches,
    resolveAgentLoopResumeCheckpoint,
  } = useAiChatAgentLoopCheckpointControls({ sessionMemoryRef, setMessages });

  const {
    toggleMessagePinned,
    deactivateSessionDirective,
    pruneSessionDirectivesBySourceMessage,
  } = useAiChatDirectiveSessionControls({ conversationId, sessionMemoryRef, messagesRef, setMessages });

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
    runAiChatClearPersistenceCleanup(clearPersistCleanupRunningRef, clearPersistRequestRef);
  }, []);

  const trackRecommendationEvent = useCallback((event: AiRecommendationEvent) => {
    sessionMemoryRef.current = updateSessionMemoryWithRecommendationEvent(sessionMemoryRef.current, event);
    persistSessionMemory(sessionMemoryRef.current);
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
    toolFeedbackLocale: resolveAiChatResponsePolicy(sessionMemoryRef.current, toolFeedbackLocale, settings.toolFeedbackStyle).locale,
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
    await runAiChatSendTurn({
      userText,
      featureFlags,
      isStreaming,
      sessionTokenBudget,
      firstChunkTimeoutMs,
      outputTokenCap,
      outputTokenRetryCap,
      allowDestructiveToolCalls,
      maxContextCharsOverride,
      historyCharBudgetOverride,
      provider,
      orchestrator,
      ensureConversation,
      setLastError,
      setMessages,
      setIsStreaming,
      setConnectionTestStatus,
      setConnectionTestMessage,
      setContextDebugSnapshot,
      setMetrics,
      setTaskSession,
      setPendingToolCall,
      messagesRef,
      metricsRef,
      pendingToolCallRef,
      sessionMemoryRef,
      settingsRef,
      toolFeedbackLocaleRef,
      systemPersonaKeyRef,
      getContextRef,
      embeddingSearchServiceRef,
      ragContextTimeoutMsRef,
      toolDecisionModeRef,
      onToolRiskCheckRef,
      preparePendingToolCallRef,
      onToolCallRef,
      taskSessionRef,
      onMessageCompleteRef,
      abortRef,
      localToolCallCountRef,
      streamPersistIntervalMsRef,
      backgroundMemoryRuntimeRef,
      writeToolDecisionAuditLog,
      writeToolIntentAuditLog,
      hasPersistedExecutionForRequest,
      markExecutedRequestId,
      bumpMetric,
      resolveAgentLoopResumeCheckpoint,
      clearPendingAgentLoopCheckpoint,
    });
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
    outputTokenCap,
    outputTokenRetryCap,
    provider.id,
    provider.label,
    sessionTokenBudget,
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
    dismissPendingAgentLoopCheckpoint,
    clearPendingAgentLoopCheckpointIfTaskIdMatches,
    trackRecommendationEvent,
    toggleMessagePinned,
    deactivateSessionDirective,
    pruneSessionDirectivesBySourceMessage,
  };
}
