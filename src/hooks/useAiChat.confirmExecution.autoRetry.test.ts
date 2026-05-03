// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { buildToolAuditContext } from '../ai/chat/toolCallHelpers';
import type { Locale } from '../i18n';
import type { AiChatToolCall } from './useAiChat';
import { executeConfirmedToolCall } from './useAiChat.confirmExecution';

vi.mock('../ai/config/featureFlags', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../ai/config/featureFlags')>();
  return {
    featureFlags: {
      ...mod.featureFlags,
      aiToolCallExecutorAutoRetryEnabled: true,
    },
  };
});

const TEST_LOCALE: Locale = 'en-US';

describe('executeConfirmedToolCall — T4-c executor auto-retry', () => {
  it('retries once on throw for non-destructive tools then succeeds', async () => {
    const call: AiChatToolCall & { requestId: string } = {
      name: 'set_transcription_text',
      requestId: 'req-retry-ok',
      arguments: { segmentId: 'u1', text: 'hi' },
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

  it('does not retry destructive tools on throw', async () => {
    const call: AiChatToolCall & { requestId: string } = {
      name: 'delete_transcription_segment',
      requestId: 'req-retry-del',
      arguments: { segmentId: 'u1' },
    };
    const onToolCall = vi.fn(async () => {
      throw new Error('boom');
    });
    const writeToolDecisionAuditLog = vi.fn(async () => {});

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
});
