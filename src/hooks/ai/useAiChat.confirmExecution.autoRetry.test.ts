// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { buildToolAuditContext } from '../../ai/chat/toolCallHelpers';
import type { Locale } from '../../i18n';
import type { AiChatToolCall } from '../useAiChat';
import { executeConfirmedToolCall } from './useAiChat.confirmExecution';

vi.mock('../../ai/config/featureFlags', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../../ai/config/featureFlags')>();
  return {
    featureFlags: {
      ...mod.featureFlags,
      aiToolCallExecutorAutoRetryEnabled: true,
    },
  };
});

const TEST_LOCALE: Locale = 'en-US';

describe('executeConfirmedToolCall — T4-c executor auto-retry', () => {
  it('retries once on throw for read-only tools then succeeds', async () => {
    const call: AiChatToolCall & { requestId: string } = {
      name: 'get_project_summary',
      requestId: 'req-retry-ok',
      arguments: {},
    };
    let attempts = 0;
    const onToolCall = vi.fn(async () => {
      attempts += 1;
      if (attempts === 1) {
        throw new Error('transient');
      }
      return { ok: true, message: 'saved' };
    });

    await executeConfirmedToolCall({
      assistantMessageId: 'asst-retry',
      call,
      auditContext: buildToolAuditContext('', 'p', 'm', 'enabled', 'concise'),
      locale: TEST_LOCALE,
      toolFeedbackStyle: 'concise',
      hasPersistedExecutionForRequest: async () => false,
      applyAssistantMessageResult: vi.fn(async () => {}),
      onToolCall,
      writeToolDecisionAuditLog: vi.fn(async () => {}),
      setTaskSession: vi.fn(),
      taskSessionId: 'ts-1',
      markExecutedRequestId: vi.fn(),
      sessionMemory: {},
      updateSessionMemory: vi.fn(),
      persistSessionMemory: vi.fn(),
      bumpMetric: vi.fn(),
    });

    expect(attempts).toBe(2);
    expect(onToolCall).toHaveBeenCalledTimes(2);
  });

  it('waits for a write past 30 seconds and never starts a duplicate retry', async () => {
    vi.useFakeTimers();
    try {
      let finishWrite!: (value: { ok: true; message: string }) => void;
      const write = new Promise<{ ok: true; message: string }>((resolve) => {
        finishWrite = resolve;
      });
      const onToolCall = vi.fn(() => write);
      const writeToolDecisionAuditLog = vi.fn(async (..._args: unknown[]) => {});
      const markExecutedRequestId = vi.fn();
      const execution = executeConfirmedToolCall({
        assistantMessageId: 'asst-slow-write',
        call: {
          name: 'set_transcription_text',
          requestId: 'req-slow-write',
          arguments: { segmentId: 'u1', text: 'hi' },
        },
        auditContext: buildToolAuditContext('', 'p', 'm', 'enabled', 'concise'),
        locale: TEST_LOCALE,
        toolFeedbackStyle: 'concise',
        hasPersistedExecutionForRequest: async () => false,
        applyAssistantMessageResult: vi.fn(async () => {}),
        onToolCall,
        writeToolDecisionAuditLog,
        setTaskSession: vi.fn(),
        taskSessionId: 'ts-1',
        markExecutedRequestId,
        sessionMemory: {},
        updateSessionMemory: vi.fn(),
        persistSessionMemory: vi.fn(),
        bumpMetric: vi.fn(),
      });

      await vi.advanceTimersByTimeAsync(30_001);
      expect(onToolCall).toHaveBeenCalledTimes(1);
      expect(writeToolDecisionAuditLog).not.toHaveBeenCalled();
      finishWrite({ ok: true, message: 'saved' });
      await execution;
      expect(markExecutedRequestId).toHaveBeenCalledWith('req-slow-write');
      expect(writeToolDecisionAuditLog.mock.calls.at(-1)?.[2]).toBe(
        'confirmed:set_transcription_text',
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not retry destructive tools on throw', async () => {
    const call: AiChatToolCall & { requestId: string } = {
      name: 'delete_transcription_segment',
      requestId: 'req-retry-del',
      arguments: { segmentId: 'u1' },
    };
    const onToolCall = vi.fn(async () => {
      throw new Error('boom');
    });
    const writeToolDecisionAuditLog = vi.fn(async (..._args: unknown[]) => {});

    await executeConfirmedToolCall({
      assistantMessageId: 'asst-retry-del',
      call,
      auditContext: buildToolAuditContext('', 'p', 'm', 'enabled', 'concise'),
      locale: TEST_LOCALE,
      toolFeedbackStyle: 'concise',
      hasPersistedExecutionForRequest: async () => false,
      applyAssistantMessageResult: vi.fn(async () => {}),
      onToolCall,
      writeToolDecisionAuditLog,
      setTaskSession: vi.fn(),
      taskSessionId: 'ts-1',
      markExecutedRequestId: vi.fn(),
      sessionMemory: {},
      updateSessionMemory: vi.fn(),
      persistSessionMemory: vi.fn(),
      bumpMetric: vi.fn(),
    });

    expect(onToolCall).toHaveBeenCalledTimes(1);
    expect(writeToolDecisionAuditLog).toHaveBeenCalled();
  });

  it('does not retry a non-destructive write after its executor throws', async () => {
    const onToolCall = vi.fn(async () => {
      throw new Error('write outcome unknown');
    });
    const writeToolDecisionAuditLog = vi.fn(async (..._args: unknown[]) => {});

    await executeConfirmedToolCall({
      assistantMessageId: 'asst-write-throw',
      call: {
        name: 'set_transcription_text',
        requestId: 'req-write-throw',
        arguments: { segmentId: 'u1', text: 'hi' },
      },
      auditContext: buildToolAuditContext('', 'p', 'm', 'enabled', 'concise'),
      locale: TEST_LOCALE,
      toolFeedbackStyle: 'concise',
      hasPersistedExecutionForRequest: async () => false,
      applyAssistantMessageResult: vi.fn(async () => {}),
      onToolCall,
      writeToolDecisionAuditLog,
      setTaskSession: vi.fn(),
      taskSessionId: 'ts-1',
      markExecutedRequestId: vi.fn(),
      sessionMemory: {},
      updateSessionMemory: vi.fn(),
      persistSessionMemory: vi.fn(),
      bumpMetric: vi.fn(),
    });

    expect(onToolCall).toHaveBeenCalledTimes(1);
    expect(writeToolDecisionAuditLog).toHaveBeenCalledTimes(1);
  });
});
