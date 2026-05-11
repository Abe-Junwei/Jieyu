// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { buildToolAuditContext } from '../../ai/chat/toolCallHelpers';
import type { Locale } from '../../i18n';
import type { AiChatToolCall } from '../useAiChat';
import { executeConfirmedToolCall } from './useAiChat.confirmExecution';

const TEST_LOCALE: Locale = 'en-US';

describe('executeConfirmedToolCall — T3-c commit order', () => {
  it('runs applyAssistant then confirmed audit then markExecuted on success', async () => {
    const seq: string[] = [];
    const call: AiChatToolCall & { requestId: string } = {
      name: 'set_transcription_text',
      requestId: 'req-single-1',
      arguments: { segmentId: 'u1', text: 'hi' },
    };
    const applyAssistantMessageResult = vi.fn(async () => {
      seq.push('apply');
    });
    const writeToolDecisionAuditLog = vi.fn(async (...args: unknown[]) => {
      seq.push('audit');
      const meta = args[5] as { executed?: boolean } | undefined;
      expect(meta?.executed).toBe(true);
    });
    const markExecutedRequestId = vi.fn(() => {
      seq.push('mark');
    });

    await executeConfirmedToolCall({
      assistantMessageId: 'asst-1',
      call,
      auditContext: buildToolAuditContext('', 'p', 'm', 'enabled', 'concise'),
      locale: TEST_LOCALE,
      toolFeedbackStyle: 'concise',
      hasPersistedExecutionForRequest: async () => false,
      applyAssistantMessageResult,
      onToolCall: async () => ({ ok: true, message: 'saved' }),
      writeToolDecisionAuditLog,
      setTaskSession: vi.fn(),
      taskSessionId: 'ts-1',
      markExecutedRequestId,
      sessionMemory: {},
      updateSessionMemory: vi.fn(),
      persistSessionMemory: vi.fn(),
      bumpMetric: vi.fn(),
    });

    expect(seq).toEqual(['apply', 'audit', 'mark']);
    expect(markExecutedRequestId).toHaveBeenCalledWith('req-single-1');
  });

  it('does not mark executed when tool returns failure', async () => {
    const markExecutedRequestId = vi.fn();
    await executeConfirmedToolCall({
      assistantMessageId: 'asst-1',
      call: {
        name: 'set_transcription_text',
        requestId: 'req-fail-1',
        arguments: { segmentId: 'u1', text: 'x' },
      },
      auditContext: buildToolAuditContext('', 'p', 'm', 'enabled', 'concise'),
      locale: TEST_LOCALE,
      toolFeedbackStyle: 'concise',
      hasPersistedExecutionForRequest: async () => false,
      applyAssistantMessageResult: vi.fn(async () => {}),
      onToolCall: async () => ({ ok: false, message: 'nope' }),
      writeToolDecisionAuditLog: vi.fn(async () => {}),
      setTaskSession: vi.fn(),
      taskSessionId: 'ts-1',
      markExecutedRequestId,
      sessionMemory: {},
      updateSessionMemory: vi.fn(),
      persistSessionMemory: vi.fn(),
      bumpMetric: vi.fn(),
    });
    expect(markExecutedRequestId).not.toHaveBeenCalled();
  });
});
