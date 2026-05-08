import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLatest } from './useLatest';
import { useLocale, useOptionalLocale, type Locale } from '../i18n';
import { useAiChatConnectionProbe } from './useAiChat.connectionProbe';
import { useAiChatConversationState } from './useAiChat.conversationState';
import { DEFAULT_OUTPUT_TOKEN_CAP, INITIAL_METRICS, normalizeAutoProbeIntervalMs, normalizeFirstChunkTimeoutMs, normalizeOutputTokenCap, normalizeOutputTokenRetryCap, normalizeRagContextTimeoutMs, normalizeSessionTokenBudget, normalizeStreamPersistInterval, readDevOutputTokenCap, readDevOutputTokenRetryCap, readDevAutoProbeIntervalMs, readDevRagContextTimeoutMs, readDevSessionTokenBudget, readDevStreamPersistIntervalMs } from './useAiChat.config';
import { newAuditLogId, nowIso } from './useAiChat.helpers';
import { getDb } from '../db';
import { executeConfirmedToolCall } from './useAiChat.confirmExecution';
import { enrichContextWithRag } from './useAiChat.rag';
import type { AiChatBackgroundMemoryRuntime } from './useAiChat.backgroundMemory';
import { resolveAiChatResponsePolicy } from './useAiChat.responsePolicy';

import { ChatOrchestrator } from '../ai/ChatOrchestrator';
import { loadSessionMemory, persistSessionMemory } from '../ai/chat/sessionMemory';
import { resetSessionMemoryForClear } from '../ai/chat/resetSessionMemoryForClear';
import { resolveComposedWorkflowReflectionRetry } from '../ai/chat/composedWorkflowRetry';
import { buildStep2RetryPrompt } from '../ai/vertical/composedWorkflowTemplates';
import { useAgentLoopSessionMemoryDexieReconcile } from './useAiChat.agentLoopDexieReconcile';
import {
  abortAiChatStream,
  createApplyAssistantMessageResultWrapper,
  setActiveSourceSetIdInSessionMemory,
  trackRecommendationEventInSessionMemory,
} from '../ai/chat/useAiChatPureHelpers';
import { runAiChatClearPersistenceCleanup, type AiChatClearPersistenceRequest } from './useAiChat.persistenceCleanup';
import { scheduleClearPersistenceCleanup } from '../ai/chat/scheduleClearPersistenceCleanup';
import { resolveAiToolDecisionMode } from '../ai/chat/toolCallHelpers';
import { featureFlags } from '../ai/config/featureFlags';
import { createAssistantStream } from './useAiChat.streamFactory';
import { useAiChatToolAudit } from './useAiChat.toolAudit';
import { useAiChatPendingToolCall } from './useAiChat.pendingToolCall';
import { useSyncAssistantDialogueChatTool } from './useSyncAssistantDialogueChatTool';
import { useAiChatAgentLoopCheckpointControls } from './useAiChat.agentLoopCheckpointControls';
import { useAiChatDirectiveSessionControls } from './useAiChat.directiveSessionControls';
import { resolveToolDecisionPipeline } from './useAiChat.toolDecisionPipeline';
import { runAiChatSendTurn, type RunAiChatSendTurnArgs } from './useAiChat.sendTurn';
import { applyAiChatSettingsPatch, createAiChatProvider, normalizeAiChatSettings } from '../ai/providers/providerCatalog';
import { createFallbackAiChatProvider } from '../ai/chat/createFallbackAiChatProvider';
import { shouldResetConnectionForSettingsPatch } from '../ai/chat/settingsConnectionReset';
import { bumpMetricValue } from '../ai/chat/metricBump';

import { createIdleTaskSession } from '../ai/chat/createIdleTaskSession';
import { createBackgroundMemoryRuntime } from '../ai/chat/backgroundMemoryRuntimeFactory';
import { loadAiChatSettingsFromStorage, persistAiChatSettings } from '../ai/config/aiChatSettingsStorage';
import type { AiChatSettings } from '../ai/providers/providerCatalog';
import type { AiContextDebugSnapshot, AiInteractionMetrics, AiRecommendationEvent, AiSessionMemory, AiSystemPersonaKey, AiTaskSession, PendingAiToolCall, UiChatMessage, UseAiChatOptions } from './useAiChat.types';

export type { AiChatSettings } from '../ai/providers/providerCatalog';
export type { AiChatToolCall, AiChatToolResult, AiContextDebugSnapshot, AiInteractionMetrics, AiSessionMemory, AiSystemPersonaKey, AiTaskSession, PendingAiToolCall, UiChatMessage, UseAiChatOptions } from './useAiChat.types';

export function useAiChat(options?: UseAiChatOptions) {
  // 保留主 hook 对确认执行 seam 的显式依赖，结构测试据此验证拆分边界 |
  // Keep the explicit seam reference in the main hook for structure-invariant tests.
  void executeConfirmedToolCall;
  void resolveToolDecisionPipeline;
  void enrichContextWithRag;
  void createAssistantStream;
  void nowIso;
  const sessionMemorySeam = { persistSessionMemory, };
  void sessionMemorySeam;
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
  const onPushAdoptionItemsRef = useLatest(options?.onPushAdoptionItems);
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
  const [taskSession, setTaskSession] = useState<AiTaskSession>(() => createIdleTaskSession());
  const [metrics, setMetrics] = useState<AiInteractionMetrics>({ ...INITIAL_METRICS });
  const metricsRef = useLatest(metrics);
  const sessionMemoryRef = useRef<AiSessionMemory>(loadSessionMemory());
  useAgentLoopSessionMemoryDexieReconcile(sessionMemoryRef);

  // 用 useLatest 包装 send 内部读取的频繁变更值，减少 send 的依赖数组长度，
  // 避免长依赖数组导致的闭包重建风险（如 settings.model 变更时全量重建）。
  const settingsRef = useLatest(settings);
  const getContextRef = useLatest(getContext);
  const embeddingSearchServiceRef = useLatest(embeddingSearchService);
  const toolDecisionModeRef = useLatest(toolDecisionMode);
  const pendingToolCallRef = useLatest(pendingToolCall);
  const taskSessionRef = useLatest(taskSession);

  const backgroundMemoryRuntimeRef = useRef<AiChatBackgroundMemoryRuntime | null>(null);
  if (backgroundMemoryRuntimeRef.current === null) {
    backgroundMemoryRuntimeRef.current = createBackgroundMemoryRuntime(sessionMemoryRef, getContextRef);
  }
  const bumpMetric = useCallback((key: keyof AiInteractionMetrics, delta = 1) => {
    setMetrics((prev) => bumpMetricValue(prev, key, delta));
  }, []);
  const abortRef = useRef<AbortController | null>(null);
  const localToolCallCountRef = useRef(0);

  const { provider, fallbackProvider } = useMemo(() => ({
    provider: createAiChatProvider(settings),
    fallbackProvider: createFallbackAiChatProvider(settings),
  }), [settings]);
  const orchestrator = useMemo(() => new ChatOrchestrator(provider, fallbackProvider), [provider, fallbackProvider]);
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
    conversationIdRef,
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
  } = useAiChatDirectiveSessionControls({ conversationIdRef, sessionMemoryRef, messagesRef, setMessages });

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
    
    if (shouldResetConnectionForSettingsPatch(patch)) {
      abortRef.current?.abort();
      invalidateConnectionProbe();
      resetConnectionProbe();
    }
  }, [invalidateConnectionProbe, resetConnectionProbe]);

  const stop = useCallback(() => {
    abortAiChatStream(abortRef, setIsStreaming);
  }, []);

  const runClearPersistenceCleanup = useCallback(() => {
    runAiChatClearPersistenceCleanup(clearPersistCleanupRunningRef, clearPersistRequestRef);
  }, []);

  const trackRecommendationEvent = useCallback((event: AiRecommendationEvent) => {
    sessionMemoryRef.current = trackRecommendationEventInSessionMemory(sessionMemoryRef.current, event);
  }, []);

  const setActiveSourceSetId = useCallback((id: string | null) => {
    const previousId = sessionMemoryRef.current.activeSourceSetId ?? null;
    sessionMemoryRef.current = setActiveSourceSetIdInSessionMemory(sessionMemoryRef.current, id);
    persistSessionMemory(sessionMemoryRef.current);
    void (async () => {
      try {
        const db = await getDb();
        await db.collections.audit_logs.insert({
          id: newAuditLogId(),
          collection: 'ai_messages',
          documentId: 'session_memory',
          action: 'update',
          field: 'ai_source_set_mutation',
          oldValue: previousId ?? '',
          newValue: id ?? '',
          source: 'human',
          timestamp: nowIso(),
          requestId: `source_set_${Date.now()}`,
          metadataJson: JSON.stringify({ schemaVersion: 1, phase: 'active_source_set_change' }),
        });
      } catch {
        // Audit write failure is best-effort
      }
    })();
  }, []);

  const applyAssistantMessageResultWrapper = useMemo(
    () => createApplyAssistantMessageResultWrapper(setMessages),
    [],
  );

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
    applyAssistantMessageResult: applyAssistantMessageResultWrapper,
    hasPersistedExecutionForRequest,
    writeToolDecisionAuditLog,
    markExecutedRequestId,
    setPendingToolCall,
    setTaskSession,
    bumpMetric,
    getTimelineReadModelEpoch: () => getTimelineReadModelEpochRef.current?.(),
  });

  const send = useCallback(async (userText: string) => {
    const sharedSendTurnArgs = {
      activeConversationId: conversationId,
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
      onPushAdoptionItemsRef,
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
    } satisfies Omit<RunAiChatSendTurnArgs, 'userText'>;

    await runAiChatSendTurn({
      ...sharedSendTurnArgs,
      userText,
    });

    // PR-13: auto-trigger step2 when composed workflow step1 succeeded but step2 failed
    let composedState = sessionMemoryRef.current.composedWorkflowState;
    if (composedState?.status === 'step1_done') {
      const step2UserText = buildStep2RetryPrompt();
      await runAiChatSendTurn({
        ...sharedSendTurnArgs,
        userText: step2UserText,
      });
      // 第二次 send 会更新 sessionMemory；后续 reflection 重试判断必须用最新快照 | Refresh snapshot after nested send.
      composedState = sessionMemoryRef.current.composedWorkflowState;
    }

    // P4: auto-trigger reflection retry for composed workflow (max 1 retry per step).
    const retryResult = resolveComposedWorkflowReflectionRetry(sessionMemoryRef.current);
    if (retryResult.retryUserText) {
      sessionMemoryRef.current = retryResult.nextSessionMemory;
      await runAiChatSendTurn({
        ...sharedSendTurnArgs,
        userText: retryResult.retryUserText,
      });
    }
  }, [
    allowDestructiveToolCalls,
    conversationId,
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
    sessionMemoryRef.current = resetSessionMemoryForClear(sessionMemoryRef.current);
    void (async () => {
      try {
        const db = await getDb();
        await db.collections.audit_logs.insert({
          id: newAuditLogId(),
          collection: 'ai_messages',
          documentId: 'session_memory',
          action: 'reset',
          field: 'ai_session_memory_reset',
          oldValue: '',
          newValue: 'cleared',
          source: 'human',
          timestamp: nowIso(),
          requestId: `session_reset_${Date.now()}`,
          metadataJson: JSON.stringify({ schemaVersion: 1 }),
        });
      } catch {
        // Audit write failure is best-effort
      }
    })();
    setMessages([]);
    setLastError(null);
    setPendingToolCall(null);
    setMetrics({ ...INITIAL_METRICS });
    setTaskSession(createIdleTaskSession());
    clearInFlightRef.current = false;

    scheduleClearPersistenceCleanup(clearPersistRequestRef, conversationId ?? null, runClearPersistenceCleanup);
  }, [conversationId, runClearPersistenceCleanup]);

  return {
    messages,
    isStreaming,
    lastError,
    conversationId,
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
    setActiveSourceSetId,
    toggleMessagePinned,
    deactivateSessionDirective,
    pruneSessionDirectivesBySourceMessage,
  };
}
