import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLatest } from './useLatest';
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
import { newAuditLogId, newMessageId, nowIso } from './useAiChat.helpers';
import { resolveClarifyFastPathCall } from './useAiChat.clarify';
import { buildContextDebugSnapshot, logContextDebugSnapshot } from './useAiChat.debug';
import { executeConfirmedToolCall } from './useAiChat.confirmExecution';
import { resolveToolDecisionPipeline } from './useAiChat.toolDecisionPipeline';
import { getDb } from '../db';
import { enrichContextWithRag } from './useAiChat.rag';
import { ChatOrchestrator } from '../ai/ChatOrchestrator';
import { trimHistoryByChars } from '../ai/chat/historyTrim';
import { loadSessionMemory, persistSessionMemory } from '../ai/chat/sessionMemory';
import { buildAiSystemPrompt, buildPromptContextBlock, isAiContextDebugEnabled } from '../ai/chat/promptContext';
import {
  buildToolAuditContext,
  buildToolDecisionAuditMetadata,
  normalizeLegacyRiskNarration,
  parseLegacyNarratedToolCall,
  parseToolCallFromText,
  planToolCallTargets,
  resolveAiToolDecisionMode,
  toNaturalToolCancelled,
} from '../ai/chat/toolCallHelpers';
import type { AiMessageCitation } from '../db';
import { featureFlags } from '../ai/config/featureFlags';
import { createAssistantStream } from './useAiChat.streamFactory';
import { normalizeAiProviderError } from '../ai/providers/errorUtils';
import { buildAiToolRequestId } from '../ai/toolRequestId';
import {
  formatAbortedMessage,
  formatAiChatDisabledError,
  formatConnectionHealthyMessage,
  formatConnectionProbeNoContentError,
  formatConnectionProbeSuccessMessage,
  formatEmptyModelReply,
  formatEmptyModelResponseError,
  formatFirstChunkTimeoutError,
  formatHistoryLoadFailedFallbackError,
  formatPendingConfirmationBlockedError,
  formatRecoveredInterruptedMessage,
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
import type { AiChatSettings, AiToolFeedbackStyle } from '../ai/providers/providerCatalog';
import type { ChatMessage } from '../ai/providers/LLMProvider';
import type {
  AiChatToolCall,
  AiChatToolName,
  AiConnectionTestStatus,
  AiContextDebugSnapshot,
  AiInteractionMetrics,
  AiSessionMemory,
  AiTaskSession,
  AiToolDecisionMode,
  PendingAiToolCall,
  UiChatMessage,
  UseAiChatOptions,
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

type ToolPlannerClarifyReason =
  | 'missing-utterance-target'
  | 'missing-split-position'
  | 'missing-translation-layer-target'
  | 'missing-layer-link-target'
  | 'missing-layer-target'
  | 'missing-language-target';

type ToolPlannerDecision = 'resolved' | 'clarify';

interface ToolIntentAssessment {
  decision: 'execute' | 'clarify' | 'ignore' | 'cancel';
  score: number;
  hasExecutionCue: boolean;
  hasActionVerb: boolean;
  hasActionTarget: boolean;
  hasExplicitId: boolean;
  hasMetaQuestion: boolean;
  hasTechnicalDiscussion: boolean;
}

interface ToolAuditContext {
  userText: string;
  providerId: string;
  model: string;
  toolDecisionMode: AiToolDecisionMode;
  toolFeedbackStyle: AiToolFeedbackStyle;
  plannerDecision?: ToolPlannerDecision;
  plannerReason?: ToolPlannerClarifyReason;
  intentAssessment?: ToolIntentAssessment;
}

interface ToolIntentAuditMetadata {
  schemaVersion: 1;
  phase: 'intent';
  requestId: string;
  assistantMessageId: string;
  toolCall: AiChatToolCall;
  context: ToolAuditContext;
}

interface ToolDecisionAuditMetadata {
  schemaVersion: 1;
  phase: 'decision';
  requestId: string;
  assistantMessageId: string;
  source: 'human' | 'ai' | 'system';
  toolCall: AiChatToolCall;
  context: ToolAuditContext;
  executed: boolean;
  outcome: string;
  message?: string;
  reason?: string;
  /** 工具执行耗时（ms），仅在 executed=true 时有值 | Tool execution duration, only when executed=true */
  durationMs?: number;
}

export function useAiChat(options?: UseAiChatOptions) {
  const onToolCall = options?.onToolCall;
  const onToolRiskCheck = options?.onToolRiskCheck;
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
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [settings, setSettings] = useState<AiChatSettings>(() => normalizeAiChatSettings());
  const [connectionTestStatus, setConnectionTestStatus] = useState<AiConnectionTestStatus>('idle');
  const [connectionTestMessage, setConnectionTestMessage] = useState<string | null>(null);
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
  const testAbortRef = useRef<AbortController | null>(null);

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
    void persistAiChatSettings(settings);
  }, [settings]);

  const updateSettings = useCallback((patch: Partial<AiChatSettings>) => {
    abortRef.current?.abort();
    testAbortRef.current?.abort();
    userDirtyRef.current = true;
    setSettings((current) => applyAiChatSettingsPatch(current, patch));
    setConnectionTestStatus('idle');
    setConnectionTestMessage(null);
  }, []);

  const runConnectionProbe = useCallback(async (showTesting: boolean) => {
    testAbortRef.current?.abort();
    const controller = new AbortController();
    testAbortRef.current = controller;
    if (showTesting) {
      setConnectionTestStatus('testing');
      setConnectionTestMessage(null);
    }

    try {
      const stream = provider.chat(
        [{ role: 'user', content: 'Reply with OK only.' }],
        {
          model: settings.model,
          maxTokens: 8,
          temperature: 0,
          signal: controller.signal,
        },
      );

      let receivedAnyResponse = false;
      let receivedAnyChunk = false;
      for await (const chunk of stream) {
        receivedAnyChunk = true;
        if (chunk.error) {
          throw new Error(chunk.error);
        }
        if ((chunk.delta ?? '').trim().length > 0) {
          receivedAnyResponse = true;
        }
        if (chunk.done || receivedAnyResponse) {
          break;
        }
      }

      const acceptChunkOnly = provider.id === 'ollama';
      if (!receivedAnyResponse && !(acceptChunkOnly && receivedAnyChunk)) {
        throw new Error(formatConnectionProbeNoContentError());
      }

      setConnectionTestStatus('success');
      setConnectionTestMessage(formatConnectionProbeSuccessMessage(provider.label, showTesting));
    } catch (error) {
      if (controller.signal.aborted || (error instanceof DOMException && error.name === 'AbortError')) {
        if (showTesting) {
          setConnectionTestStatus('idle');
          setConnectionTestMessage(null);
        }
        return;
      }

      setConnectionTestStatus('error');
      setConnectionTestMessage(normalizeAiProviderError(error, provider.label));
    } finally {
      if (testAbortRef.current === controller) {
        testAbortRef.current = null;
      }
    }
  }, [provider, settings.model]);

  const testConnection = useCallback(async () => {
    await runConnectionProbe(true);
  }, [runConnectionProbe]);

  useEffect(() => {
    // 测试环境禁用自动探测，避免用例被真实网络波动干扰 | Disable auto probe in tests for deterministic runs.
    if (import.meta.env.MODE === 'test') return;
    if (isBootstrapping) return;
    if (isStreaming) return;
    if (testAbortRef.current) return;

    const kind = settings.providerKind;
    if (kind === 'mock' || kind === 'ollama') return;
    if (settings.apiKey.trim().length === 0) return;

    let cancelled = false;
    const tick = () => {
      if (cancelled) return;
      if (isStreaming || testAbortRef.current) return;
      void runConnectionProbe(false);
    };

    tick();
    const timerId = window.setInterval(tick, autoProbeIntervalMs);
    return () => {
      cancelled = true;
      window.clearInterval(timerId);
    };
  }, [autoProbeIntervalMs, isBootstrapping, isStreaming, runConnectionProbe, settings.apiKey, settings.providerKind]);

  const ensureConversation = useCallback(async (): Promise<string> => {
    if (conversationId) return conversationId;

    const db = await getDb();
    const existingRows = (await db.collections.ai_conversations.find().exec())
      .map((doc) => doc.toJSON())
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

    if (existingRows.length > 0) {
      const recentId = existingRows[0]!.id;
      setConversationId(recentId);
      return recentId;
    }

    const id = newMessageId('conv');
    const timestamp = nowIso();
    await db.collections.ai_conversations.insert({
      id,
      title: '默认会话',
      mode: 'assistant',
      providerId: provider.id,
      model: settings.model || provider.id,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    setConversationId(id);
    return id;
  }, [conversationId, provider.id, settings.model]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const db = await getDb();
        // Recover crashed/interrupted sessions by marking stale streaming rows as aborted.
        const zombieStreamingRows = await db.collections.ai_messages.findByIndex('status', 'streaming');
        if (zombieStreamingRows.length > 0) {
          const now = nowIso();
          await Promise.all(zombieStreamingRows.map(async (doc) => {
            const row = doc.toJSON();
            await db.collections.ai_messages.insert({
              ...row,
              status: 'aborted',
              errorMessage: row.errorMessage ?? formatRecoveredInterruptedMessage(),
              updatedAt: now,
            });
          }));
        }

        const conversations = (await db.collections.ai_conversations.find().exec())
          .map((doc) => doc.toJSON())
          .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

        if (cancelled) return;
        if (conversations.length === 0) {
          setIsBootstrapping(false);
          return;
        }

        const latest = conversations[0]!;
        setConversationId(latest.id);
        const rows = (await db.collections.ai_messages.findByIndex('conversationId', latest.id))
          .map((doc) => doc.toJSON())
          .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
        const historyRowsMap: Record<string, typeof rows[number]> = {};
        for (const row of rows) { historyRowsMap[row.id] = row; }
        const history: UiChatMessage[] = rows.map((row) => ({
          id: row.id,
          role: row.role === 'assistant' ? 'assistant' : 'user',
          content: row.content,
          status: row.status,
          ...(row.errorMessage ? { error: row.errorMessage } : {}),
          ...(row.citations ? { citations: row.citations } : {}),
          ...('reasoningContent' in row && row.reasoningContent
            ? { reasoningContent: String(row.reasoningContent) }
            : {}),
        }));

        if (!cancelled) {
          // UI renders newest-first to keep latest dialog always visible at top.
          setMessages(
            history
              .filter((row) => row.role === 'user' || row.role === 'assistant')
              .reverse(),
          );
        }
      } catch (error) {
        if (!cancelled) {
          setLastError(error instanceof Error ? error.message : formatHistoryLoadFailedFallbackError());
        }
      } finally {
        if (!cancelled) {
          setIsBootstrapping(false);
        }
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const stop = useCallback(() => {
    const controller = abortRef.current;
    if (!controller) return;
    controller.abort();
    // 用户点停止后应立即解除发送拦截 | Immediately unblock sending after user requests stop.
    setIsStreaming(false);
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

  /**
   * 写入工具决策审计日志，自动补充 requestId | Write tool decision audit log with requestId
   */
  const writeToolDecisionAuditLog = useCallback(async (
    assistantMessageId: string,
    oldValue: string,
    newValue: string,
    source: 'human' | 'ai' | 'system',
    requestId?: string,
    metadata?: ToolDecisionAuditMetadata,
  ) => {
    const db = await getDb();
    await db.collections.audit_logs.insert({
      id: newAuditLogId(),
      collection: 'ai_messages',
      documentId: assistantMessageId,
      action: 'update',
      field: 'ai_tool_call_decision',
      oldValue,
      newValue,
      source,
      timestamp: nowIso(),
      ...(requestId ? { requestId } : {}),
      ...(metadata ? { metadataJson: JSON.stringify(metadata) } : {}),
    });
  }, []);

  const writeToolIntentAuditLog = useCallback(async (
    assistantMessageId: string,
    callName: AiChatToolName,
    assessment: ToolIntentAssessment,
    requestId?: string,
    metadata?: ToolIntentAuditMetadata,
  ) => {
    const db = await getDb();
    await db.collections.audit_logs.insert({
      id: newAuditLogId(),
      collection: 'ai_messages',
      documentId: assistantMessageId,
      action: 'update',
      field: 'ai_tool_call_intent',
      oldValue: callName,
      newValue: JSON.stringify(assessment),
      source: 'ai',
      timestamp: nowIso(),
      ...(requestId ? { requestId } : {}),
      ...(metadata ? { metadataJson: JSON.stringify(metadata) } : {}),
    });
  }, []);

  // 幂等性工具调用去重集 | Idempotency deduplication set
  const executedRequestIds = useRef<Set<string>>(new Set());

  // 生成幂等性指纹（按 assistant 消息作用域）| Generate idempotency fingerprint scoped to assistant message
  function genRequestId(call: AiChatToolCall, scopeMessageId?: string): string {
    const base = buildAiToolRequestId(call);
    if (!scopeMessageId) return base;
    return `${base}_${scopeMessageId}`;
  }

  const hasPersistedExecutionForRequest = useCallback(async (requestId: string): Promise<boolean> => {
    if (executedRequestIds.current.has(requestId)) return true;

    const db = await getDb();
    const rows = await db.dexie.audit_logs
      .where('[collection+field+requestId]')
      .equals(['ai_messages', 'ai_tool_call_decision', requestId])
      .toArray();

    const hasExecuted = rows.some((row) => {
      if (typeof row.metadataJson === 'string' && row.metadataJson.trim().length > 0) {
        try {
          const parsed = JSON.parse(row.metadataJson) as { phase?: unknown; executed?: unknown };
          if (parsed.phase === 'decision' && parsed.executed === true) {
            return true;
          }
        } catch (err) {
          console.error('[Jieyu] useAiChat: failed to parse tool decision metadata, falling back to compact parsing', err);
        }
      }

      const parts = String(row.newValue ?? '').split(':');
      const decision = parts[0] ?? '';
      const reason = parts[2] ?? '';
      if (decision === 'confirmed' || decision === 'auto_confirmed') return true;
      if ((decision === 'confirm_failed' || decision === 'auto_failed')
        && reason !== 'invalid_args'
        && reason !== 'no_executor'
        && reason !== 'duplicate_requestId') {
        return true;
      }
      return false;
    });

    if (hasExecuted) {
      executedRequestIds.current.add(requestId);
    }
    return hasExecuted;
  }, []);

  const confirmPendingToolCall = useCallback(async () => {
    const pending = pendingToolCallRef.current;
    if (!pending) return;

    const { call, assistantMessageId } = pending;
    setPendingToolCall(null);
    setTaskSession({
      id: taskSessionRef.current.id,
      status: 'executing',
      toolName: call.name,
      updatedAt: nowIso(),
    });
    const auditContext = pending.auditContext ?? buildToolAuditContext(
      '',
      provider.id,
      settingsRef.current.model,
      toolDecisionModeRef.current,
      settingsRef.current.toolFeedbackStyle,
    );

    // 注入 requestId | Inject requestId
    if (!call.requestId) call.requestId = genRequestId(call, assistantMessageId);
    const callWithRequestId: AiChatToolCall & { requestId: string } = {
      ...call,
      requestId: call.requestId,
    };

    await executeConfirmedToolCall({
      assistantMessageId,
      call: callWithRequestId,
      auditContext,
      toolFeedbackStyle: settingsRef.current.toolFeedbackStyle,
      hasPersistedExecutionForRequest,
      applyAssistantMessageResult,
      ...(onToolCallRef.current ? { onToolCall: onToolCallRef.current } : {}),
      writeToolDecisionAuditLog,
      setTaskSession,
      taskSessionId: taskSessionRef.current.id,
      markExecutedRequestId: (requestId) => {
        executedRequestIds.current.add(requestId);
      },
      sessionMemory: sessionMemoryRef.current,
      updateSessionMemory: (nextMemory) => {
        sessionMemoryRef.current = nextMemory;
      },
      persistSessionMemory,
      bumpMetric,
    });
  }, [applyAssistantMessageResult, hasPersistedExecutionForRequest, onToolCallRef, provider.id, taskSessionRef, writeToolDecisionAuditLog]);

  const cancelPendingToolCall = useCallback(async () => {
    const pending = pendingToolCallRef.current;
    if (!pending) return;
    const auditContext = pending.auditContext ?? buildToolAuditContext(
      '',
      provider.id,
      settingsRef.current.model,
      toolDecisionModeRef.current,
      settingsRef.current.toolFeedbackStyle,
    );

    setPendingToolCall(null);
    bumpMetric('cancelCount');
    setTaskSession({
      id: taskSessionRef.current.id,
      status: 'idle',
      updatedAt: nowIso(),
    });
    await applyAssistantMessageResult(
      pending.assistantMessageId,
      toNaturalToolCancelled(pending.call.name, settingsRef.current.toolFeedbackStyle),
    );

    await writeToolDecisionAuditLog(
      pending.assistantMessageId,
      `pending:${pending.call.name}`,
      `cancelled:${pending.call.name}`,
      'human',
      pending.call.requestId,
      buildToolDecisionAuditMetadata(
        pending.assistantMessageId,
        pending.call,
        auditContext,
        'human',
        'cancelled',
        false,
      ),
    );
  }, [applyAssistantMessageResult, provider.id, taskSessionRef, writeToolDecisionAuditLog]);

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
    let lastPersistedAssistantContent = '';
    let lastPersistedAt = 0;
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

    const flushAssistantDraft = async (content: string, force = false): Promise<void> => {
      if (!dbRef) return;
      if (content === lastPersistedAssistantContent) return;
      const now = Date.now();
      if (!force && now - lastPersistedAt < streamPersistIntervalMsRef.current) return;

      const existing = await dbRef.collections.ai_messages.findOne({ selector: { id: assistantId } }).exec();
      if (!existing) return;
      const row = existing.toJSON();
      await dbRef.collections.ai_messages.insert({
        ...row,
        content,
        updatedAt: nowIso(),
      });
      lastPersistedAssistantContent = content;
      lastPersistedAt = now;
    };

    const updateConversationTimestamp = async () => {
      if (!dbRef || !activeConversationId) return;
      const conv = await dbRef.collections.ai_conversations.findOne({ selector: { id: activeConversationId } }).exec();
      if (!conv) return;
      const convo = conv.toJSON();
      await dbRef.collections.ai_conversations.insert({
        ...convo,
        updatedAt: nowIso(),
      });
    };

    const finalizeAssistantMessage = async (
      status: 'done' | 'error' | 'aborted',
      content: string,
      errorMessage?: string,
      citations?: AiMessageCitation[],
      reasoningContent?: string,
    ) => {
      setMessages((prev) => prev.map((msg) => {
        if (msg.id !== assistantId) return msg;
        if (status === 'error') {
          return {
            ...msg,
            content,
            status,
            ...(errorMessage ? { error: errorMessage } : {}),
            ...(citations ? { citations } : {}),
            ...(reasoningContent ? { reasoningContent } : {}),
          };
        }
        return { ...msg, content, status, ...(citations ? { citations } : {}), ...(reasoningContent ? { reasoningContent } : {}) };
      }));

      if (!dbRef) return;
      const existing = await dbRef.collections.ai_messages.findOne({ selector: { id: assistantId } }).exec();
      if (existing) {
        const row = existing.toJSON();
        await dbRef.collections.ai_messages.insert({
          ...row,
          content,
          status,
          ...(errorMessage ? { errorMessage } : {}),
          ...(citations ? { citations } : {}),
          ...(reasoningContent ? { reasoningContent } : {}),
          updatedAt: nowIso(),
        });
      }
      await updateConversationTimestamp();
    };

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
        systemPrompt: buildAiSystemPrompt(systemPersonaKeyRef.current, contextBlock),
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
          let finalContent = assistantContent;
          let finalStatus: 'done' | 'error' = 'done';
          let finalErrorMessage: string | undefined;

          // 防止空响应导致“看起来无反应” | Guard against empty model replies that look like no-op in UI.
          if (assistantContent.trim().length === 0) {
            finalContent = formatEmptyModelReply();
            finalStatus = 'error';
            finalErrorMessage = formatEmptyModelResponseError();
            setLastError(finalErrorMessage);
            if (shouldTrackRemoteStatus) {
              setConnectionTestStatus('error');
              setConnectionTestMessage(finalErrorMessage);
            }
            await finalizeAssistantMessage(finalStatus, finalContent, finalErrorMessage, ragCitations, assistantReasoningContent);
            break;
          }

          const parsedToolCall = parseToolCallFromText(assistantContent) ?? parseLegacyNarratedToolCall(assistantContent);
          const planner = parsedToolCall ? planToolCallTargets(parsedToolCall, trimmed, aiContext) : null;
          const toolCall = planner?.call ?? null;
          if (toolCall) {
            // 幂等性指纹注入 | Inject idempotency fingerprint
            if (!toolCall.requestId) toolCall.requestId = genRequestId(toolCall, assistantId);
            const toolDecisionResult = await resolveToolDecisionPipeline({
              assistantMessageId: assistantId,
              toolCall,
              userText: trimmed,
              aiContext,
              messageHistory: messagesRef.current,
              providerId: provider.id,
              model: settingsRef.current.model,
              toolDecisionMode: toolDecisionModeRef.current,
              toolFeedbackStyle: settingsRef.current.toolFeedbackStyle,
              planner,
              allowDestructiveToolCalls,
              ...(onToolRiskCheckRef.current ? { onToolRiskCheck: onToolRiskCheckRef.current } : {}),
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
              markExecutedRequestId: (requestId) => {
                executedRequestIds.current.add(requestId);
              },
              bumpMetric,
              shouldBumpRecovery: metricsRef.current.failureCount > 0 && taskSessionRef.current.status === 'executing',
            });
            finalContent = toolDecisionResult.finalContent;
            finalStatus = toolDecisionResult.finalStatus;
            finalErrorMessage = toolDecisionResult.finalErrorMessage;
          } else {
            finalContent = normalizeLegacyRiskNarration(finalContent, settingsRef.current.toolFeedbackStyle);
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
  };
}
