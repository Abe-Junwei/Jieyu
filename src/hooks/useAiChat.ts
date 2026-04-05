import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLatest } from './useLatest';
import { useLocale, useOptionalLocale } from '../i18n';
import { useAiChatConnectionProbe } from './useAiChat.connectionProbe';
import { useAiChatConversationState } from './useAiChat.conversationState';
import { createAssistantPersistenceHelpers } from './useAiChat.assistantPersistence';
import {
  DEFAULT_FIRST_CHUNK_TIMEOUT_MS,
  INITIAL_METRICS,
  normalizeAutoProbeIntervalMs,
  normalizeFirstChunkTimeoutMs,
  normalizeRagContextTimeoutMs,
  normalizeStreamPersistInterval,
  readDevAutoProbeIntervalMs,
  readDevRagContextTimeoutMs,
  readDevStreamPersistIntervalMs,
} from './useAiChat.config';
import { newMessageId, nowIso } from './useAiChat.helpers';
import { resolveClarifyFastPathCall } from './useAiChat.clarify';
import { buildContextDebugSnapshot, logContextDebugSnapshot } from './useAiChat.debug';
import { executeConfirmedToolCall } from './useAiChat.confirmExecution';
import { resolveAiChatStreamCompletion } from './useAiChat.streamCompletion';
import { getDb } from '../db';
import { enrichContextWithRag } from './useAiChat.rag';
import { ChatOrchestrator } from '../ai/ChatOrchestrator';
import { trimHistoryByChars } from '../ai/chat/historyTrim';
import { loadSessionMemory, persistSessionMemory } from '../ai/chat/sessionMemory';
import { updateSessionMemoryWithPrompt } from '../ai/chat/adaptiveInputProfile';
import { updateSessionMemoryWithRecommendationEvent } from '../ai/chat/recommendationTelemetry';
import { buildAiSystemPrompt, buildPromptContextBlock, isAiContextDebugEnabled } from '../ai/chat/promptContext';
import { resolveAiToolDecisionMode } from '../ai/chat/toolCallHelpers';
import type { AiMessageCitation } from '../db';
import { featureFlags } from '../ai/config/featureFlags';
import { createAssistantStream } from './useAiChat.streamFactory';
import { normalizeAiProviderError } from '../ai/providers/errorUtils';
import { useAiChatToolAudit, genRequestId } from './useAiChat.toolAudit';
import { useAiChatPendingToolCall } from './useAiChat.pendingToolCall';
import { resolveToolDecisionPipeline } from './useAiChat.toolDecisionPipeline';
import {
  formatAbortedMessage,
  formatAiChatDisabledError,
  formatConnectionHealthyMessage,
  formatFirstChunkTimeoutError,
  formatPendingConfirmationBlockedError,
  formatStreamingBusyError,
} from '../ai/messages';
import {
  applyAiChatSettingsPatch,
  createAiChatProvider,
  getDefaultAiChatSettings,
  normalizeAiChatSettings,
} from '../ai/providers/providerCatalog';
import {
  loadAiChatSettingsFromStorage,
  persistAiChatSettings,
} from '../ai/config/aiChatSettingsStorage';
import type { AiChatSettings } from '../ai/providers/providerCatalog';
import type { ChatMessage } from '../ai/providers/LLMProvider';
import type {
  AiContextDebugSnapshot,
  AiInteractionMetrics,
  AiSessionMemory,
  AiTaskSession,
  PendingAiToolCall,
  UiChatMessage,
  UseAiChatOptions,
  AiRecommendationEvent,
} from './useAiChat.types';
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
  const onToolCall = options?.onToolCall;
  const onToolRiskCheck = options?.onToolRiskCheck;
  const preparePendingToolCall = options?.preparePendingToolCall;
  const systemPersonaKey = options?.systemPersonaKey ?? 'transcription';
  const systemPersonaKeyRef = useLatest(systemPersonaKey);
  const getContext = options?.getContext;
  const maxContextChars = options?.maxContextChars ?? 2400;
  const historyCharBudget = options?.historyCharBudget ?? 6000;
  const allowDestructiveToolCalls = options?.allowDestructiveToolCalls ?? false;
  const embeddingSearchService = options?.embeddingSearchService;
  const streamPersistIntervalMs = normalizeStreamPersistInterval(
    options?.streamPersistIntervalMs ?? readDevStreamPersistIntervalMs(),
  );
  const firstChunkTimeoutMs = normalizeFirstChunkTimeoutMs(options?.firstChunkTimeoutMs);
  const autoProbeIntervalMs = normalizeAutoProbeIntervalMs(
    options?.autoProbeIntervalMs ?? readDevAutoProbeIntervalMs(),
  );
  const ragContextTimeoutMs = normalizeRagContextTimeoutMs(readDevRagContextTimeoutMs());
  const onToolCallRef = useLatest(onToolCall);
  const onToolRiskCheckRef = useLatest(onToolRiskCheck);
  const preparePendingToolCallRef = useLatest(preparePendingToolCall);
  const onMessageCompleteRef = useLatest(options?.onMessageComplete);
  const toolDecisionMode = resolveAiToolDecisionMode();
  const settingsHydratedRef = useRef(false);
  // 用户是否在水合完成前手动改过设置 | Whether user patched settings before hydration finished
  const userDirtyRef = useRef(false);
  const clearInFlightRef = useRef(false);
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
  });

  const updateSettings = useCallback((patch: Partial<AiChatSettings>) => {
    abortRef.current?.abort();
    userDirtyRef.current = true;
    setSettings((current) => applyAiChatSettingsPatch(current, patch));
    invalidateConnectionProbe();
    resetConnectionProbe();
  }, [invalidateConnectionProbe, resetConnectionProbe]);

  const stop = useCallback(() => {
    const controller = abortRef.current;
    if (!controller) return;
    controller.abort();
    abortRef.current = null;
    // 用户点停止后应立即解除发送拦截 | Immediately unblock sending after user requests stop.
    setIsStreaming(false);
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
    toolFeedbackLocale,
    ...(onToolCallRef.current != null && { onToolCall: onToolCallRef.current }),
    applyAssistantMessageResult,
    hasPersistedExecutionForRequest,
    writeToolDecisionAuditLog,
    markExecutedRequestId,
    setPendingToolCall,
    setTaskSession,
    bumpMetric,
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

    setLastError(null);
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
      flushAssistantDraft,
      finalizeAssistantMessage,
    } = createAssistantPersistenceHelpers({
      assistantId,
      setMessages,
      streamPersistIntervalMsRef,
      getDbRef: () => dbRef,
      getActiveConversationId: () => activeConversationId,
    });

    let assistantContent = '';

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
      const historyRaw: ChatMessage[] = [...messagesRef.current]
        .reverse()
        .map((m) => ({ role: m.role, content: m.content }));
      const history = trimHistoryByChars(historyRaw, historyCharBudget);
      const aiContext = getContextRef.current?.() ?? null;
      let contextBlock = buildPromptContextBlock(aiContext, maxContextChars);
      let ragCitations: AiMessageCitation[] = [];
      ({
        contextBlock,
        citations: ragCitations,
      } = await enrichContextWithRag({
        embeddingSearchService: embeddingSearchServiceRef.current,
        userText: trimmed,
        contextBlock,
        ragContextTimeoutMs: ragContextTimeoutMsRef.current,
      }));
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
      const clarifyFastPathCall = resolveClarifyFastPathCall({
        taskSession: taskSessionRef.current,
        userText: trimmed,
        aiContext,
      });

      const {
        stream,
        generationSource,
        generationModel,
      } = createAssistantStream({
        userText: trimmed,
        clarifyFastPathCall,
        history,
        orchestrator,
        systemPrompt: buildAiSystemPrompt(systemPersonaKeyRef.current, contextBlock, settingsRef.current.toolFeedbackStyle),
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
          setMessages((prev) => prev.map((msg) => (
            msg.id === assistantId
              ? { ...msg, content: msg.content + delta, ...(assistantThinking ? { thinking: false } : {}) }
              : msg
          )));
          await flushAssistantDraft(assistantContent);
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

        if (chunk.done) {
          streamFinalized = true;
          await flushAssistantDraft(assistantContent, true);
          const {
            finalContent,
            finalStatus,
            finalErrorMessage,
            connectionErrorMessage,
          } = await resolveAiChatStreamCompletion({
            assistantId,
            assistantContent,
            userText: trimmed,
            aiContext,
            messages: messagesRef.current,
            providerId: provider.id,
            model: settingsRef.current.model,
            toolFeedbackLocale,
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
            setPendingToolCall,
            taskSessionId: taskSessionRef.current.id,
            markExecutedRequestId,
            bumpMetric,
            shouldBumpRecovery: metricsRef.current.failureCount > 0 && taskSessionRef.current.status === 'executing',
            genRequestId,
          });

          if (connectionErrorMessage && shouldTrackRemoteStatus) {
            setConnectionTestStatus('error');
            setConnectionTestMessage(connectionErrorMessage);
          }
          if (finalErrorMessage) setLastError(finalErrorMessage);
          await finalizeAssistantMessage(finalStatus, finalContent, finalErrorMessage, ragCitations, assistantReasoningContent);
          break;
        }
      }

      if (!streamFinalized && !controller.signal.aborted) {
        await finalizeAssistantMessage('done', assistantContent, undefined, ragCitations, assistantReasoningContent);
      }
    } catch (error) {
      if (controller.signal.aborted || (error instanceof DOMException && error.name === 'AbortError')) {
        if (timedOutBeforeFirstChunk) {
          const isLongThinkProvider = provider.id === 'deepseek' || provider.id === 'minimax';
          const timeoutMessage = formatFirstChunkTimeoutError(isLongThinkProvider, provider.label);
          const timeoutContent = messagesRef.current.find((msg) => msg.id === assistantId)?.content ?? '';
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
        const abortedContent = messagesRef.current.find((msg) => msg.id === assistantId)?.content ?? '';
        await finalizeAssistantMessage('aborted', abortedContent, formatAbortedMessage());
        return;
      }

      const message = normalizeAiProviderError(error, provider.label);
      const errorContent = messagesRef.current.find((msg) => msg.id === assistantId)?.content ?? '';
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
      const completionContent = assistantContent.trim().length > 0
        ? assistantContent
        : (messagesRef.current.find((m) => m.id === assistantId)?.content ?? '');
      if (completionContent) {
        onMessageCompleteRef.current?.(assistantId, completionContent);
      }
    }
  }, [allowDestructiveToolCalls, ensureConversation, firstChunkTimeoutMs, historyCharBudget, isStreaming, maxContextChars, onMessageCompleteRef, onToolCallRef, onToolRiskCheckRef, orchestrator, provider.id, provider.label, taskSessionRef, writeToolDecisionAuditLog, writeToolIntentAuditLog]);

  const clear = useCallback(() => {
    if (clearInFlightRef.current) return;
    clearInFlightRef.current = true;
    setMessages([]);
    setLastError(null);
    setPendingToolCall(null);
    setTaskSession({
      id: newMessageId('task'),
      status: 'idle',
      updatedAt: nowIso(),
    });
    void (async () => {
      try {
        const db = await getDb();
        const activeConversationId = await ensureConversation();
        await db.collections.ai_messages.removeBySelector({ conversationId: activeConversationId });
        const conversation = await db.collections.ai_conversations.findOne({ selector: { id: activeConversationId } }).exec();
        if (conversation) {
          const row = conversation.toJSON();
          await db.collections.ai_conversations.insert({
            ...row,
            updatedAt: nowIso(),
          });
        }
      } finally {
        clearInFlightRef.current = false;
      }
    })();
  }, [ensureConversation]);

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
  };
}
