// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { buildToolAuditContext } from '../ai/chat/toolCallHelpers';
import type { Locale } from '../i18n';
import type { AiChatToolCall, AiChatToolResult } from './useAiChat';
import { executeConfirmedProposedChangeBatch } from './useAiChat.confirmExecution';
import { nowIso } from './useAiChat.helpers';

function baseParentCall(requestId = 'parent-req-1'): AiChatToolCall & { requestId: string } {
  return {
    name: 'propose_changes',
    requestId,
    arguments: { changes: [] },
  };
}

function validSetText(segmentId: string, text: string): AiChatToolCall {
  return {
    name: 'set_transcription_text',
    arguments: { segmentId, text },
  };
}

const TEST_LOCALE: Locale = 'en-US';

function auditLogNewValue(call: readonly unknown[]): string | undefined {
  const v = call[2];
  return typeof v === 'string' ? v : undefined;
}

function makeDeps(overrides?: {
  hasPersisted?: boolean;
  onToolCall?: (call: AiChatToolCall) => Promise<AiChatToolResult> | AiChatToolResult;
}) {
  const applyAssistantMessageResult = vi.fn(async () => {});
  const writeToolDecisionAuditLog = vi.fn(async () => {});
  const setTaskSession = vi.fn();
  const markExecutedRequestId = vi.fn();
  const updateSessionMemory = vi.fn();
  const persistSessionMemory = vi.fn();
  const bumpMetric = vi.fn();
  const hasPersistedExecutionForRequest = vi.fn(async () => overrides?.hasPersisted ?? false);
  const onToolCall = overrides?.onToolCall ?? vi.fn(async (): Promise<AiChatToolResult> => ({ ok: true, message: 'ok' }));

  return {
    applyAssistantMessageResult,
    writeToolDecisionAuditLog,
    setTaskSession,
    markExecutedRequestId,
    updateSessionMemory,
    persistSessionMemory,
    bumpMetric,
    hasPersistedExecutionForRequest,
    onToolCall,
  };
}

describe('executeConfirmedProposedChangeBatch', () => {
  it('marks parent request executed only after all children succeed and does not invoke rollbacks', async () => {
    const rb1 = vi.fn(async () => {});
    const rb2 = vi.fn(async () => {});
    const onToolCall = vi.fn(async (call: AiChatToolCall): Promise<AiChatToolResult> => {
      if (call.name === 'set_transcription_text' && call.arguments.segmentId === 'a') {
        return { ok: true, message: 'a', rollback: rb1 };
      }
      if (call.name === 'set_transcription_text' && call.arguments.segmentId === 'b') {
        return { ok: true, message: 'b', rollback: rb2 };
      }
      return { ok: false, message: 'unexpected' };
    });
    const d = makeDeps({ onToolCall });

    await executeConfirmedProposedChangeBatch({
      assistantMessageId: 'asst-1',
      parentCall: baseParentCall(),
      childCalls: [validSetText('a', 'ta'), validSetText('b', 'tb')],
      auditContext: buildToolAuditContext('', 'p', 'm', 'enabled', 'concise'),
      locale: TEST_LOCALE,
      toolFeedbackStyle: 'concise',
      hasPersistedExecutionForRequest: d.hasPersistedExecutionForRequest,
      applyAssistantMessageResult: d.applyAssistantMessageResult,
      onToolCall: d.onToolCall,
      writeToolDecisionAuditLog: d.writeToolDecisionAuditLog,
      setTaskSession: d.setTaskSession,
      taskSessionId: 'ts-1',
      markExecutedRequestId: d.markExecutedRequestId,
      sessionMemory: {},
      updateSessionMemory: d.updateSessionMemory,
      persistSessionMemory: d.persistSessionMemory,
      bumpMetric: d.bumpMetric,
    });

    expect(d.markExecutedRequestId).toHaveBeenCalledTimes(1);
    expect(d.markExecutedRequestId).toHaveBeenCalledWith('parent-req-1');
    expect(rb1).not.toHaveBeenCalled();
    expect(rb2).not.toHaveBeenCalled();
    expect(d.bumpMetric).toHaveBeenCalledWith('successCount');
    const confirmedLog = d.writeToolDecisionAuditLog.mock.calls.find(
      (c) => auditLogNewValue(c)?.startsWith('confirmed:propose_changes'),
    );
    expect(confirmedLog).toBeDefined();
  });

  it('runs merge_transcription_segments rollback before set_text rollback when a third child fails', async () => {
    const order: string[] = [];
    const rbMerge = vi.fn(async () => {
      order.push('merge');
    });
    const rbText = vi.fn(async () => {
      order.push('text');
    });
    const onToolCall = vi.fn(async (call: AiChatToolCall): Promise<AiChatToolResult> => {
      if (call.name === 'merge_transcription_segments') {
        return { ok: true, message: 'merged', rollback: rbMerge };
      }
      if (call.arguments.segmentId === 'x') return { ok: true, message: 'x', rollback: rbText };
      if (call.arguments.segmentId === 'y') return { ok: false, message: 'fail-y' };
      return { ok: false, message: 'unexpected' };
    });
    const d = makeDeps({ onToolCall });

    const mergeCall: AiChatToolCall = {
      name: 'merge_transcription_segments',
      arguments: { segmentIds: ['s1', 's2'] },
    };

    await executeConfirmedProposedChangeBatch({
      assistantMessageId: 'asst-1',
      parentCall: baseParentCall(),
      childCalls: [mergeCall, validSetText('x', 'tx'), validSetText('y', 'ty')],
      auditContext: buildToolAuditContext('', 'p', 'm', 'enabled', 'concise'),
      locale: TEST_LOCALE,
      toolFeedbackStyle: 'concise',
      hasPersistedExecutionForRequest: d.hasPersistedExecutionForRequest,
      applyAssistantMessageResult: d.applyAssistantMessageResult,
      onToolCall: d.onToolCall,
      writeToolDecisionAuditLog: d.writeToolDecisionAuditLog,
      setTaskSession: d.setTaskSession,
      taskSessionId: 'ts-1',
      markExecutedRequestId: d.markExecutedRequestId,
      sessionMemory: {},
      updateSessionMemory: d.updateSessionMemory,
      persistSessionMemory: d.persistSessionMemory,
      bumpMetric: d.bumpMetric,
    });

    expect(order).toEqual(['text', 'merge']);
    expect(rbMerge).toHaveBeenCalledTimes(1);
    expect(rbText).toHaveBeenCalledTimes(1);
    expect(d.markExecutedRequestId).not.toHaveBeenCalled();
  });

  it('runs rollbacks in reverse order when a later child fails', async () => {
    const order: string[] = [];
    const rb1 = vi.fn(async () => {
      order.push('rb1');
    });
    const rb2 = vi.fn(async () => {
      order.push('rb2');
    });
    const onToolCall = vi.fn(async (call: AiChatToolCall): Promise<AiChatToolResult> => {
      if (call.arguments.segmentId === 'a') return { ok: true, message: 'a', rollback: rb1 };
      if (call.arguments.segmentId === 'b') return { ok: true, message: 'b', rollback: rb2 };
      return { ok: false, message: 'child-err' };
    });
    const d = makeDeps({ onToolCall });

    await executeConfirmedProposedChangeBatch({
      assistantMessageId: 'asst-1',
      parentCall: baseParentCall(),
      childCalls: [validSetText('a', 'ta'), validSetText('b', 'tb'), validSetText('c', 'tc')],
      auditContext: buildToolAuditContext('', 'p', 'm', 'enabled', 'concise'),
      locale: TEST_LOCALE,
      toolFeedbackStyle: 'concise',
      hasPersistedExecutionForRequest: d.hasPersistedExecutionForRequest,
      applyAssistantMessageResult: d.applyAssistantMessageResult,
      onToolCall: d.onToolCall,
      writeToolDecisionAuditLog: d.writeToolDecisionAuditLog,
      setTaskSession: d.setTaskSession,
      taskSessionId: 'ts-1',
      markExecutedRequestId: d.markExecutedRequestId,
      sessionMemory: {},
      updateSessionMemory: d.updateSessionMemory,
      persistSessionMemory: d.persistSessionMemory,
      bumpMetric: d.bumpMetric,
    });

    expect(order).toEqual(['rb2', 'rb1']);
    expect(d.markExecutedRequestId).not.toHaveBeenCalled();
    const failLog = d.writeToolDecisionAuditLog.mock.calls.find(
      (c) => auditLogNewValue(c) === 'confirm_failed:propose_changes:child_failed',
    );
    expect(failLog).toBeDefined();
    expect(d.bumpMetric).toHaveBeenCalledWith('failureCount');
  });

  it('rolls back after successful children when a later child has invalid_args (invalid_child_args path)', async () => {
    const rb1 = vi.fn(async () => {});
    const onToolCall = vi.fn(async (call: AiChatToolCall): Promise<AiChatToolResult> => {
      if (call.arguments.segmentId === 'a') return { ok: true, message: 'a', rollback: rb1 };
      return { ok: true, message: 'x' };
    });
    const d = makeDeps({ onToolCall });
    const invalidSecond: AiChatToolCall = {
      name: 'set_transcription_text',
      arguments: { segmentId: 'b' },
    };

    await executeConfirmedProposedChangeBatch({
      assistantMessageId: 'asst-1',
      parentCall: baseParentCall(),
      childCalls: [validSetText('a', 'ta'), invalidSecond],
      auditContext: buildToolAuditContext('', 'p', 'm', 'enabled', 'concise'),
      locale: TEST_LOCALE,
      toolFeedbackStyle: 'concise',
      hasPersistedExecutionForRequest: d.hasPersistedExecutionForRequest,
      applyAssistantMessageResult: d.applyAssistantMessageResult,
      onToolCall: d.onToolCall,
      writeToolDecisionAuditLog: d.writeToolDecisionAuditLog,
      setTaskSession: d.setTaskSession,
      taskSessionId: 'ts-1',
      markExecutedRequestId: d.markExecutedRequestId,
      sessionMemory: {},
      updateSessionMemory: d.updateSessionMemory,
      persistSessionMemory: d.persistSessionMemory,
      bumpMetric: d.bumpMetric,
    });

    expect(d.onToolCall).toHaveBeenCalledTimes(1);
    expect(rb1).toHaveBeenCalledTimes(1);
    expect(d.markExecutedRequestId).not.toHaveBeenCalled();
    const failLog = d.writeToolDecisionAuditLog.mock.calls.find(
      (c) => auditLogNewValue(c) === 'confirm_failed:propose_changes:invalid_child_args',
    );
    expect(failLog).toBeDefined();
  });

  it('does not mark executed when parent requestId was already persisted', async () => {
    const d = makeDeps({ hasPersisted: true, onToolCall: vi.fn() });

    await executeConfirmedProposedChangeBatch({
      assistantMessageId: 'asst-1',
      parentCall: baseParentCall(),
      childCalls: [validSetText('a', 'ta')],
      auditContext: buildToolAuditContext('', 'p', 'm', 'enabled', 'concise'),
      locale: TEST_LOCALE,
      toolFeedbackStyle: 'concise',
      hasPersistedExecutionForRequest: d.hasPersistedExecutionForRequest,
      applyAssistantMessageResult: d.applyAssistantMessageResult,
      onToolCall: d.onToolCall,
      writeToolDecisionAuditLog: d.writeToolDecisionAuditLog,
      setTaskSession: d.setTaskSession,
      taskSessionId: 'ts-1',
      markExecutedRequestId: d.markExecutedRequestId,
      sessionMemory: {},
      updateSessionMemory: d.updateSessionMemory,
      persistSessionMemory: d.persistSessionMemory,
      bumpMetric: d.bumpMetric,
    });

    expect(d.onToolCall).not.toHaveBeenCalled();
    expect(d.markExecutedRequestId).not.toHaveBeenCalled();
  });

  it('sets task session idle with fresh updatedAt', async () => {
    const d = makeDeps({
      onToolCall: vi.fn(async (): Promise<AiChatToolResult> => ({ ok: true, message: 'ok' })),
    });
    const before = nowIso();

    await executeConfirmedProposedChangeBatch({
      assistantMessageId: 'asst-1',
      parentCall: baseParentCall(),
      childCalls: [validSetText('a', 'ta')],
      auditContext: buildToolAuditContext('', 'p', 'm', 'enabled', 'concise'),
      locale: TEST_LOCALE,
      toolFeedbackStyle: 'concise',
      hasPersistedExecutionForRequest: d.hasPersistedExecutionForRequest,
      applyAssistantMessageResult: d.applyAssistantMessageResult,
      onToolCall: d.onToolCall,
      writeToolDecisionAuditLog: d.writeToolDecisionAuditLog,
      setTaskSession: d.setTaskSession,
      taskSessionId: 'ts-1',
      markExecutedRequestId: d.markExecutedRequestId,
      sessionMemory: {},
      updateSessionMemory: d.updateSessionMemory,
      persistSessionMemory: d.persistSessionMemory,
      bumpMetric: d.bumpMetric,
    });

    expect(d.setTaskSession).toHaveBeenCalled();
    const last = d.setTaskSession.mock.calls.at(-1)?.[0] as { status: string; updatedAt: string };
    expect(last.status).toBe('idle');
    expect(last.updatedAt >= before).toBe(true);
  });
});
