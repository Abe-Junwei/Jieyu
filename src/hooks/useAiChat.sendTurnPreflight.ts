/**
 * Send-turn guards, session bookkeeping, UI seed messages, timeout + persistence helpers (before persistOpening).
 */

import { getDb } from '../db';
import { updateSessionMemoryWithPrompt } from '../ai/chat/adaptiveInputProfile';
import { extractUserDirectives } from '../ai/memory/userDirectiveExtractor';
import { applyUserDirectivesToSessionMemory } from '../ai/memory/userDirectiveRegistry';
import { genRequestId } from './useAiChat.toolAudit';
import { isAiChatSendBlockedByAssistantDialogue } from './useAiChat.assistantDialogueSendGate';
import { createAssistantPersistenceHelpers } from './useAiChat.assistantPersistence';
import { DEFAULT_FIRST_CHUNK_TIMEOUT_MS, estimateTokensFromText } from './useAiChat.config';
import { newMessageId } from './useAiChat.helpers';
import {
  formatPendingConfirmationBlockedError,
  formatSessionBudgetExceededError,
  formatStreamingBusyError,
  formatAiChatDisabledError,
} from '../ai/messages';
import { createMetricTags, recordMetric } from '../observability/metrics';
import { persistSessionMemory } from '../ai/chat/sessionMemory';
import type { MetricTags } from '../observability/metrics';
import {
  createInitialSendTurnStreamPhaseState,
  type SendTurnStreamPhaseState,
} from './useAiChat.sendTurnStreamPhase';
import type { RunAiChatSendTurnArgs } from './useAiChat.sendTurn.types';
import type { AiSessionMemory, UiChatMessage } from './useAiChat.types';

export type SendTurnDbConversationHolder = {
  dbRef: Awaited<ReturnType<typeof getDb>> | null;
  activeConversationId: string | null;
};

export type SendTurnPreflightContext = Readonly<{
  trimmed: string;
  resumeCheckpoint: NonNullable<AiSessionMemory['pendingAgentLoopCheckpoint']> | null;
  shouldTrackRemoteStatus: boolean;
  userMsg: UiChatMessage;
  assistantId: string;
  assistantSeed: UiChatMessage;
  controller: AbortController;
  dbConversation: SendTurnDbConversationHolder;
  phaseState: SendTurnStreamPhaseState;
  timedOutBeforeFirstChunk: { current: boolean };
  sendStartedAtMs: number;
  aiMetricTags: MetricTags;
  recordCompletionSuccessMetric: () => void;
  timeoutHandle: number | NodeJS.Timeout | null;
  queueFlushAssistantDraft: (content: string, force?: boolean) => void;
  awaitQueuedPersistence: () => Promise<void>;
  finalizeAssistantMessage: (
    status: 'done' | 'error' | 'aborted',
    content: string,
    errorMessage?: string,
    citations?: import('../db').AiMessageCitation[],
    reasoningContent?: string,
  ) => Promise<void>;
  commitPrimaryStreamUsage: () => void;
  agentLoopSourceUserText: string;
  effectiveUserText: string;
  /** One id per user send attempt; use with `logSendTurnPhase` when localStorage debug is on. */
  correlationId: string;
}>;

/** Returns null when the turn should not proceed (caller already updated UI / errors). */
export async function runAiChatSendTurnPreflight(
  args: RunAiChatSendTurnArgs,
): Promise<SendTurnPreflightContext | null> {
  const {
    userText,
    featureFlags: flags,
    isStreaming,
    sessionTokenBudget,
    firstChunkTimeoutMs,
    provider,
    setLastError,
    setMessages,
    setIsStreaming,
    setConnectionTestStatus,
    setConnectionTestMessage,
    metricsRef,
    pendingToolCallRef,
    sessionMemoryRef,
    settingsRef,
    streamPersistIntervalMsRef,
    abortRef,
    localToolCallCountRef,
    writeToolDecisionAuditLog,
    bumpMetric,
    resolveAgentLoopResumeCheckpoint,
    clearPendingAgentLoopCheckpoint,
  } = args;

  if (!flags.aiChatEnabled) {
    setLastError(formatAiChatDisabledError());
    return null;
  }

  if (isStreaming) {
    setLastError(formatStreamingBusyError());
    return null;
  }

  const trimmed = userText.trim();
  if (trimmed.length === 0) return null;
  if (isAiChatSendBlockedByAssistantDialogue(pendingToolCallRef.current)) {
    setLastError(formatPendingConfirmationBlockedError());
    return null;
  }

  const estimatedInputTokens = estimateTokensFromText(trimmed);
  const currentSessionTokens = metricsRef.current.totalInputTokens + metricsRef.current.totalOutputTokens;
  if (currentSessionTokens + estimatedInputTokens > sessionTokenBudget) {
    await writeToolDecisionAuditLog(
      newMessageId('ast'),
      'pending:cost_guard',
      'blocked:cost_guard:session_budget_exceeded',
      'system',
      genRequestId({
        name: 'propose_changes',
        arguments: { scope: 'cost_guard_session_budget' },
      }),
    );
    bumpMetric('failureCount');
    setLastError(formatSessionBudgetExceededError(sessionTokenBudget, currentSessionTokens, estimatedInputTokens));
    return null;
  }

  const resumeCheckpoint = await resolveAgentLoopResumeCheckpoint(trimmed);
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

  setMessages((prev) => [userMsg, assistantSeed, ...prev]);
  setIsStreaming(true);

  const controller = new AbortController();
  abortRef.current = controller;
  const dbConversation: SendTurnDbConversationHolder = { dbRef: null, activeConversationId: null };
  const phaseState = createInitialSendTurnStreamPhaseState();
  const timedOutBeforeFirstChunk = { current: false };
  const sendStartedAtMs = performance.now();
  const aiMetricTags = createMetricTags('ai-chat', {
    provider: provider.id,
    model: settingsRef.current.model || provider.id,
  });
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
  const effectiveTimeoutMs = provider.id === 'deepseek' || provider.id === 'minimax'
    ? (firstChunkTimeoutMs === DEFAULT_FIRST_CHUNK_TIMEOUT_MS ? 60000 : firstChunkTimeoutMs)
    : (provider.id === 'ollama' ? 0 : firstChunkTimeoutMs);
  const timeoutHandle = (typeof window !== 'undefined' && effectiveTimeoutMs > 0)
    ? window.setTimeout(() => {
      if (phaseState.firstChunkArrived || controller.signal.aborted) return;
      timedOutBeforeFirstChunk.current = true;
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
    getDbRef: () => dbConversation.dbRef,
    getActiveConversationId: () => dbConversation.activeConversationId,
  });

  const commitPrimaryStreamUsage = () => {
    if (phaseState.primaryUsageCommitted) return;
    phaseState.primaryUsageCommitted = true;
    phaseState.reportedInputTokens += phaseState.primaryStreamUsage?.inputTokens ?? 0;
    phaseState.totalReportedOutputTokens += phaseState.primaryStreamUsage?.outputTokens ?? 0;
  };

  const agentLoopSourceUserText = resumeCheckpoint?.originalUserText ?? trimmed;
  const effectiveUserText = resumeCheckpoint?.continuationInput ?? trimmed;
  const immediateDirectives = extractUserDirectives({ userText: effectiveUserText, source: 'user_explicit', sourceMessageId: userMsg.id });
  if (immediateDirectives.length > 0) {
    sessionMemoryRef.current = applyUserDirectivesToSessionMemory(sessionMemoryRef.current, immediateDirectives).nextMemory;
    persistSessionMemory(sessionMemoryRef.current);
  }

  const correlationId = newMessageId('snt');

  return {
    correlationId,
    trimmed,
    resumeCheckpoint,
    shouldTrackRemoteStatus,
    userMsg,
    assistantId,
    assistantSeed,
    controller,
    dbConversation,
    phaseState,
    timedOutBeforeFirstChunk,
    sendStartedAtMs,
    aiMetricTags,
    recordCompletionSuccessMetric,
    timeoutHandle,
    queueFlushAssistantDraft,
    awaitQueuedPersistence,
    finalizeAssistantMessage,
    commitPrimaryStreamUsage,
    agentLoopSourceUserText,
    effectiveUserText,
  };
}
