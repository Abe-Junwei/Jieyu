/**
 * useAiChat.pendingToolCall — 待确认工具调用的确认/取消处理
 * Confirm / cancel handlers for pending tool calls
 */

import { useCallback } from 'react';
import { useLatest } from './useLatest';
import { nowIso } from './useAiChat.helpers';
import { executeConfirmedProposedChangeBatch, executeConfirmedToolCall } from './useAiChat.confirmExecution';
import { buildAiChangeSetFromPendingToolCall, validateChangeSetEpoch } from '../ai/changeset/AiChangeSetProtocol';
import { persistSessionMemory } from '../ai/chat/sessionMemory';
import { buildToolAuditContext, buildToolDecisionAuditMetadata, toNaturalToolCancelled } from '../ai/chat/toolCallHelpers';
import { genRequestId } from './useAiChat.toolAudit';
import { t, type Locale } from '../i18n';
import type { AiChatToolCall, AiChatToolResult, AiInteractionMetrics, AiSessionMemory, AiTaskSession, AiToolDecisionMode, PendingAiToolCall } from './useAiChat.types';
import type { AiChatSettings } from '../ai/providers/providerCatalog';

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
      const staleAuditContext = pending.auditContext ?? buildToolAuditContext(
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
    setPendingToolCall(null);
    setTaskSession({
      id: taskSessionRef.current.id,
      status: 'executing',
      toolName: call.name,
      updatedAt: nowIso(),
    });
    const auditContext = pending.auditContext ?? buildToolAuditContext(
      '',
      providerId,
      settingsRef.current.model,
      toolDecisionModeRef.current,
      settingsRef.current.toolFeedbackStyle,
    );

    // 注入 requestId | Inject requestId
    const callWithRequestId: AiChatToolCall & { requestId: string } = {
      ...call,
      requestId: call.requestId ?? pending.requestId ?? genRequestId(call, assistantMessageId),
    };

    if (pending.call.name === 'propose_changes' && pending.proposedChildCalls?.length) {
      await executeConfirmedProposedChangeBatch({
        assistantMessageId,
        parentCall: callWithRequestId,
        childCalls: pending.proposedChildCalls,
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
        persistSessionMemory,
        bumpMetric,
      });
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
      persistSessionMemory,
      bumpMetric,
    });
  }, [
    applyAssistantMessageResult,
    bumpMetric,
    getTimelineReadModelEpochRef,
    hasPersistedExecutionForRequest,
    onToolCallRef,
    providerId,
    setPendingToolCall,
    setTaskSession,
    taskSessionRef,
    toolFeedbackLocale,
    writeToolDecisionAuditLog,
  ]);

  const cancelPendingToolCall = useCallback(async () => {
    const pending = pendingToolCallRef.current;
    if (!pending) return;
    const auditContext = pending.auditContext ?? buildToolAuditContext(
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
      toNaturalToolCancelled(toolFeedbackLocale, pending.call.name, settingsRef.current.toolFeedbackStyle),
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
  }, [applyAssistantMessageResult, providerId, taskSessionRef, writeToolDecisionAuditLog]);

  return { confirmPendingToolCall, cancelPendingToolCall };
}
