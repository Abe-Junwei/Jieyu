/**
 * useAiChat.pendingToolCall — 待确认工具调用的确认/取消处理
 * Confirm / cancel handlers for pending tool calls
 */

import { useCallback } from 'react';
import { useLatest } from '../ui/useLatest';
import { nowIso } from './useAiChat.helpers';
import {
  executeConfirmedProposedChangeBatch,
  executeConfirmedToolCall,
} from './useAiChat.confirmExecution';
import {
  buildAiChangeSetFromPendingToolCall,
  validateChangeSetEpoch,
} from '../../ai/changeset/AiChangeSetProtocol';
import { persistSessionMemory, persistSessionMemoryAsync } from '../../ai/chat/sessionMemory';
import {
  buildToolAuditContext,
  buildToolDecisionAuditMetadata,
  toNaturalToolCancelled,
} from '../../ai/chat/toolCallHelpers';
import { genRequestId } from './useAiChat.toolAudit';
import { resolveApproval } from '../../ai/runtime/aiRuntimeV2Pending';
import { publishAgentWriteCancelled } from '../../ai/runtime/agentUiEvents';
import { t, type Locale } from '../../i18n';
import type {
  AiChatToolCall,
  AiChatToolResult,
  AiInteractionMetrics,
  AiSessionMemory,
  AiTaskSession,
  AiToolDecisionMode,
  PendingAiToolCall,
} from './useAiChat.types';
import type { AiChatSettings } from '../../ai/providers/providerCatalog';

interface UseAiChatPendingToolCallOptions {
  providerId: string;
  settingsRef: { readonly current: AiChatSettings };
  toolDecisionModeRef: { readonly current: AiToolDecisionMode };
  pendingToolCallRef: { readonly current: PendingAiToolCall | null };
  taskSessionRef: { readonly current: AiTaskSession };
  sessionMemoryRef: React.MutableRefObject<AiSessionMemory>;
  toolFeedbackLocale: Locale;
  onToolCall?: (call: AiChatToolCall) => Promise<AiChatToolResult> | AiChatToolResult;
  applyAssistantMessageResult: (
    messageId: string,
    content: string,
    status?: 'done' | 'error',
    errorMessage?: string,
  ) => Promise<void>;
  hasPersistedExecutionForRequest: (requestId: string) => Promise<boolean>;
  writeToolDecisionAuditLog: (
    assistantMessageId: string,
    oldValue: string,
    newValue: string,
    source: 'human' | 'ai' | 'system',
    requestId?: string,
    metadata?: ReturnType<typeof buildToolDecisionAuditMetadata>,
  ) => Promise<void>;
  markExecutedRequestId: (requestId: string) => void;
  setPendingToolCall: React.Dispatch<React.SetStateAction<PendingAiToolCall | null>>;
  setTaskSession: React.Dispatch<React.SetStateAction<AiTaskSession>>;
  bumpMetric: (key: keyof AiInteractionMetrics, delta?: number) => void;
  getTimelineReadModelEpoch?: () => number | undefined;
  conversationIdRef: { readonly current: string | null };
}

export function useAiChatPendingToolCall(options: UseAiChatPendingToolCallOptions) {
  const {
    providerId,
    settingsRef,
    toolDecisionModeRef,
    pendingToolCallRef,
    taskSessionRef,
    sessionMemoryRef,
    toolFeedbackLocale,
    applyAssistantMessageResult,
    hasPersistedExecutionForRequest,
    writeToolDecisionAuditLog,
    markExecutedRequestId,
    setPendingToolCall,
    setTaskSession,
    bumpMetric,
    getTimelineReadModelEpoch,
    conversationIdRef,
  } = options;
  const onToolCallRef = useLatest(options.onToolCall);
  const getTimelineReadModelEpochRef = useLatest(getTimelineReadModelEpoch);

  const confirmPendingToolCall = useCallback(async () => {
    const pending = pendingToolCallRef.current;
    if (!pending) return;

    const assistantMessageId = pending.assistantMessageId;
    const changeSet = buildAiChangeSetFromPendingToolCall(pending);
    const currentEpoch = getTimelineReadModelEpochRef.current?.();
    if (!validateChangeSetEpoch(changeSet, currentEpoch)) {
      const staleCall = pending.executionCall ?? pending.call;
      const staleAuditContext =
        pending.auditContext ??
        buildToolAuditContext(
          '',
          providerId,
          settingsRef.current.model,
          toolDecisionModeRef.current,
          settingsRef.current.toolFeedbackStyle,
        );
      const staleMessage = t(toolFeedbackLocale, 'ai.alerts.staleReadModelConfirmBlocked');
      setPendingToolCall(null);
      setTaskSession({
        id: taskSessionRef.current.id,
        status: 'idle',
        updatedAt: nowIso(),
      });
      bumpMetric('failureCount');
      await applyAssistantMessageResult(assistantMessageId, staleMessage, 'error', staleMessage);
      await writeToolDecisionAuditLog(
        assistantMessageId,
        `pending:${staleCall.name}`,
        `confirm_failed:${staleCall.name}:stale_read_model`,
        'system',
        staleCall.requestId ?? pending.requestId,
        buildToolDecisionAuditMetadata(
          assistantMessageId,
          staleCall,
          staleAuditContext,
          'system',
          'confirm_failed',
          false,
          staleMessage,
          'stale_read_model',
        ),
      );
      return;
    }

    const call = pending.executionCall ?? pending.call;
    const auditContext =
      pending.auditContext ??
      buildToolAuditContext(
        '',
        providerId,
        settingsRef.current.model,
        toolDecisionModeRef.current,
        settingsRef.current.toolFeedbackStyle,
      );
    const originConversationId =
      pending.conversationIdAtCapture ?? conversationIdRef.current ?? null;
    const shouldApplyTurnSideEffects = () =>
      originConversationId === null || conversationIdRef.current === originConversationId;
    const persistSessionMemoryForOrigin = (memory: AiSessionMemory) => {
      if (originConversationId) {
        void persistSessionMemoryAsync(originConversationId, memory);
        return;
      }
      persistSessionMemory(memory);
    };

    if (!shouldApplyTurnSideEffects()) {
      const staleMessage = t(toolFeedbackLocale, 'ai.alerts.staleReadModelConfirmBlocked');
      setTaskSession({
        id: taskSessionRef.current.id,
        status: 'idle',
        updatedAt: nowIso(),
      });
      bumpMetric('failureCount');
      await applyAssistantMessageResult(assistantMessageId, staleMessage, 'error', staleMessage);
      await writeToolDecisionAuditLog(
        assistantMessageId,
        `pending:${call.name}`,
        `confirm_failed:${call.name}:turn_superseded`,
        'system',
        call.requestId ?? pending.requestId,
        buildToolDecisionAuditMetadata(
          assistantMessageId,
          call,
          auditContext,
          'system',
          'confirm_failed',
          false,
          staleMessage,
          'turn_superseded',
        ),
      );
      return;
    }

    setPendingToolCall(null);
    setTaskSession({
      id: taskSessionRef.current.id,
      status: 'executing',
      toolName: call.name,
      updatedAt: nowIso(),
    });

    // v2：确认 = 原生 tool-approval-response；本页内立即经决策管线执行，重载后留到下一回合开头
    // v2: confirm records a native approval response; executes now through the pipeline when the turn is live
    if (pending.runtimeV2 && pending.call.name !== 'propose_changes') {
      await writeToolDecisionAuditLog(
        assistantMessageId,
        `pending:${call.name}`,
        `approved:${call.name}:tool_approval`,
        'human',
        call.requestId ?? pending.requestId,
      );
      const r = await resolveApproval(
        pending.runtimeV2.conversationId,
        pending.runtimeV2.approvalId,
        true,
        Date.now(),
      );
      setTaskSession({ id: taskSessionRef.current.id, status: 'idle', updatedAt: nowIso() });
      await applyAssistantMessageResult(
        assistantMessageId,
        r?.outcome?.message ?? t(toolFeedbackLocale, 'ai.runtimeV2.approvedRunsNextTurn'),
        r?.outcome?.status === 'error' ? 'error' : 'done',
      );
      if (r?.nextCard) setPendingToolCall(r.nextCard as PendingAiToolCall);
      return;
    }

    // 注入 requestId | Inject requestId
    const callWithRequestId: AiChatToolCall & { requestId: string } = {
      ...call,
      requestId: call.requestId ?? pending.requestId ?? genRequestId(call, assistantMessageId),
    };

    if (pending.call.name === 'propose_changes' && pending.proposedChildCalls?.length) {
      // 记下批处理最后写给用户的结果，原样回给模型 | capture the batch's real outcome for the model
      let batchOutcome: { status: 'done' | 'error'; message: string } = {
        status: 'error',
        message: 'proposed changes produced no result',
      };
      await executeConfirmedProposedChangeBatch({
        assistantMessageId,
        parentCall: callWithRequestId,
        childCalls: pending.proposedChildCalls,
        auditContext,
        locale: toolFeedbackLocale,
        toolFeedbackStyle: settingsRef.current.toolFeedbackStyle,
        hasPersistedExecutionForRequest,
        applyAssistantMessageResult: async (id, content, status, errorMessage) => {
          batchOutcome = { status: status === 'error' ? 'error' : 'done', message: content };
          await applyAssistantMessageResult(id, content, status, errorMessage);
        },
        ...(onToolCallRef.current ? { onToolCall: onToolCallRef.current } : {}),
        writeToolDecisionAuditLog,
        setTaskSession,
        taskSessionId: taskSessionRef.current.id,
        markExecutedRequestId,
        sessionMemory: sessionMemoryRef.current,
        updateSessionMemory: (nextMemory) => {
          sessionMemoryRef.current = nextMemory;
        },
        persistSessionMemory: persistSessionMemoryForOrigin,
        bumpMetric,
        shouldApplyTurnSideEffects,
      });
      // shortcut: v2 下 propose_changes 仍用旧批处理执行，结果记回原生审批消息 | batch path, outcome recorded
      if (pending.runtimeV2) {
        const r = await resolveApproval(
          pending.runtimeV2.conversationId,
          pending.runtimeV2.approvalId,
          true,
          Date.now(),
          batchOutcome,
        );
        if (r?.nextCard) setPendingToolCall(r.nextCard as PendingAiToolCall);
      }
      return;
    }

    await executeConfirmedToolCall({
      assistantMessageId,
      call: callWithRequestId,
      auditContext,
      locale: toolFeedbackLocale,
      toolFeedbackStyle: settingsRef.current.toolFeedbackStyle,
      hasPersistedExecutionForRequest,
      applyAssistantMessageResult,
      ...(onToolCallRef.current ? { onToolCall: onToolCallRef.current } : {}),
      writeToolDecisionAuditLog,
      setTaskSession,
      taskSessionId: taskSessionRef.current.id,
      markExecutedRequestId,
      sessionMemory: sessionMemoryRef.current,
      updateSessionMemory: (nextMemory) => {
        sessionMemoryRef.current = nextMemory;
      },
      persistSessionMemory: persistSessionMemoryForOrigin,
      bumpMetric,
      shouldApplyTurnSideEffects,
    });
  }, [
    applyAssistantMessageResult,
    bumpMetric,
    getTimelineReadModelEpochRef,
    hasPersistedExecutionForRequest,
    markExecutedRequestId,
    onToolCallRef,
    pendingToolCallRef,
    providerId,
    sessionMemoryRef,
    setPendingToolCall,
    settingsRef,
    setTaskSession,
    taskSessionRef,
    toolFeedbackLocale,
    toolDecisionModeRef,
    writeToolDecisionAuditLog,
    conversationIdRef,
  ]);

  const cancelPendingToolCall = useCallback(async () => {
    const pending = pendingToolCallRef.current;
    if (!pending) return;
    const auditContext =
      pending.auditContext ??
      buildToolAuditContext(
        '',
        providerId,
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
      toNaturalToolCancelled(
        toolFeedbackLocale,
        pending.call.name,
        settingsRef.current.toolFeedbackStyle,
      ),
    );

    await writeToolDecisionAuditLog(
      pending.assistantMessageId,
      `pending:${pending.call.name}`,
      `cancelled:${pending.call.name}`,
      'human',
      pending.call.requestId ?? pending.requestId,
      buildToolDecisionAuditMetadata(
        pending.assistantMessageId,
        pending.call,
        auditContext,
        'human',
        'cancelled',
        false,
      ),
    );
    publishAgentWriteCancelled({
      toolName: pending.call.name,
      ...(auditContext.agentRunId ? { agentRunId: auditContext.agentRunId } : {}),
      ...((pending.call.requestId ?? pending.requestId)
        ? { requestId: pending.call.requestId ?? pending.requestId }
        : {}),
    });
    // v2：取消 = 原生拒绝 response + execution-denied；有下一张卡片则接着显示 | native denial, show next card
    if (pending.runtimeV2) {
      const r = await resolveApproval(
        pending.runtimeV2.conversationId,
        pending.runtimeV2.approvalId,
        false,
        Date.now(),
      );
      if (r?.nextCard) setPendingToolCall(r.nextCard as PendingAiToolCall);
    }
  }, [
    applyAssistantMessageResult,
    bumpMetric,
    pendingToolCallRef,
    providerId,
    setPendingToolCall,
    settingsRef,
    setTaskSession,
    taskSessionRef,
    toolDecisionModeRef,
    toolFeedbackLocale,
    writeToolDecisionAuditLog,
  ]);

  return { confirmPendingToolCall, cancelPendingToolCall };
}
