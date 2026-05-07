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
import {
  AI_CHAT_SESSION_SIDECAR_WRITE_PATH,
  resolveAiChatSessionSidecarSandboxPolicy,
} from '../ai/policy/resolveExecutionPolicy';
import { scheduleSessionSidecarSandboxAudit } from './useAiChat.sessionSidecarAudit';
import type { MetricTags } from '../observability/metrics';
import {
  createInitialSendTurnStreamPhaseState,
  type SendTurnStreamPhaseState,
} from './useAiChat.sendTurnStreamPhase';
import {
  buildVerticalWorkflowOutputEnvelopeV0,
  selectVerticalWorkflowV0,
  type VerticalWorkflowOutputEnvelopeV0,
  type VerticalWorkflowSelectionV0,
} from '../ai/vertical/verticalWorkflowSelection';
import {
  buildStep2RetryPrompt,
  createInitialComposedWorkflowState,
  resolveComposedStepWorkflowSelection,
  selectComposedWorkflowTemplate,
} from '../ai/vertical/composedWorkflowTemplates';
import type { RunAiChatSendTurnArgs } from './useAiChat.sendTurn.types';
import { AI_CHAT_BACKGROUND_MEMORY_SANDBOX_AUTHORIZED_DIRS, AI_CHAT_BACKGROUND_MEMORY_SANDBOX_PROFILE } from './useAiChat.backgroundMemory';
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
  verticalWorkflowSelection: VerticalWorkflowSelectionV0 | null;
  verticalOutputEnvelopeSeed: VerticalWorkflowOutputEnvelopeV0 | null;
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
    messagesRef,
    localToolCallCountRef,
    writeToolDecisionAuditLog,
    bumpMetric,
    resolveAgentLoopResumeCheckpoint,
    clearPendingAgentLoopCheckpoint,
    sendPreflightSessionSidecarSandboxProfileOverride,
    activeConversationId,
    ensureConversation,
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
    messagesRef,
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

  // ── Composed workflow state machine ───────────────────────────────────────
  let composedUserTextOverride: string | undefined;
  const existingComposedState = sessionMemoryRef.current.composedWorkflowState;

  if (existingComposedState?.status === 'step1_done') {
    // Step 2 retry: advance state and override user text to a short retry cue.
    sessionMemoryRef.current = {
      ...sessionMemoryRef.current,
      composedWorkflowState: {
        ...existingComposedState,
        status: 'running',
        currentStepIndex: 1,
      },
    };
    persistSessionMemory(sessionMemoryRef.current);
    composedUserTextOverride = buildStep2RetryPrompt();
  }

  const finalEffectiveUserText = composedUserTextOverride ?? effectiveUserText;

  const composedTemplate = selectComposedWorkflowTemplate(finalEffectiveUserText);
  let verticalWorkflowSelection: VerticalWorkflowSelectionV0 | null = null;

  if (composedTemplate) {
    // New composed workflow: seed state and resolve step 1 workflow.
    sessionMemoryRef.current = {
      ...sessionMemoryRef.current,
      composedWorkflowState: createInitialComposedWorkflowState(composedTemplate, finalEffectiveUserText),
    };
    persistSessionMemory(sessionMemoryRef.current);
    const stepWorkflow = resolveComposedStepWorkflowSelection(sessionMemoryRef.current.composedWorkflowState!);
    if (stepWorkflow) {
      verticalWorkflowSelection = {
        workflowId: stepWorkflow.workflowId,
        workflow: stepWorkflow.workflow,
        confidence: 1.0,
        source: 'composed_v0',
        reasonCode: 'composed_step1',
        matchedKeyword: finalEffectiveUserText,
      };
    }
  } else {
    verticalWorkflowSelection = selectVerticalWorkflowV0(finalEffectiveUserText);
  }

  const verticalOutputEnvelopeSeed = verticalWorkflowSelection
    ? buildVerticalWorkflowOutputEnvelopeV0(verticalWorkflowSelection)
    : null;
  const immediateDirectives = extractUserDirectives({ userText: effectiveUserText, source: 'user_explicit', sourceMessageId: userMsg.id });
  if (immediateDirectives.length > 0) {
    const profile = sendPreflightSessionSidecarSandboxProfileOverride ?? AI_CHAT_BACKGROUND_MEMORY_SANDBOX_PROFILE;
    const decision = resolveAiChatSessionSidecarSandboxPolicy({
      sandboxEnabled: flags.aiBackgroundToolSandboxEnabled,
      profile,
      authorizedWriteDirs: AI_CHAT_BACKGROUND_MEMORY_SANDBOX_AUTHORIZED_DIRS,
      virtualWritePath: AI_CHAT_SESSION_SIDECAR_WRITE_PATH.sendPreflightDirective,
    });
    if (decision.action === 'allow') {
      sessionMemoryRef.current = applyUserDirectivesToSessionMemory(sessionMemoryRef.current, immediateDirectives).nextMemory;
      persistSessionMemory(sessionMemoryRef.current);
    } else {
      const convId = activeConversationId ?? (await ensureConversation());
      scheduleSessionSidecarSandboxAudit({
        conversationId: convId,
        virtualWritePath: AI_CHAT_SESSION_SIDECAR_WRITE_PATH.sendPreflightDirective,
        sandboxAction: decision.action,
        sandboxReason: decision.reason,
        sourceMessageId: userMsg.id,
      });
    }
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
    verticalWorkflowSelection,
    verticalOutputEnvelopeSeed,
  };
}
