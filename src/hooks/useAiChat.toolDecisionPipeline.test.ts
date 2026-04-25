import { describe, expect, it, vi } from 'vitest';
import { resolveToolDecisionPipeline } from './useAiChat.toolDecisionPipeline';
import type { AiChatToolCall, AiSessionMemory, AiTaskSession } from './useAiChat.types';

function baseParams(overrides: {
  toolCall?: AiChatToolCall;
  sessionMemory?: AiSessionMemory;
} = {}): Parameters<typeof resolveToolDecisionPipeline>[0] {
  const toolCall = overrides.toolCall ?? {
    name: 'delete_transcription_segment',
    arguments: { segmentId: 'unit-1' },
    requestId: 'req-1',
  };
  return {
    assistantMessageId: 'ast-1',
    toolCall,
    userText: 'delete segment unit-1',
    aiContext: null,
    messageHistory: [],
    providerId: 'mock',
    model: 'mock-model',
    locale: 'en-US',
    toolDecisionMode: 'enabled',
    toolFeedbackStyle: 'detailed',
    allowDestructiveToolCalls: true,
    hasPersistedExecutionForRequest: async () => false,
    writeToolDecisionAuditLog: vi.fn(async () => {}),
    writeToolIntentAuditLog: vi.fn(async () => {}),
    sessionMemory: overrides.sessionMemory ?? {},
    updateSessionMemory: vi.fn(),
    persistSessionMemory: vi.fn(),
    setTaskSession: vi.fn(),
    setPendingToolCall: vi.fn(),
    taskSessionId: 'task-1',
    markExecutedRequestId: vi.fn(),
    bumpMetric: vi.fn(),
    shouldBumpRecovery: false,
  };
}

describe('useAiChat.toolDecisionPipeline directive policy', () => {
  it('blocks destructive tools when user safety preference denies destructive actions', async () => {
    const params = baseParams({
      sessionMemory: { safetyPreferences: { denyDestructive: true } },
    });

    const result = await resolveToolDecisionPipeline(params);

    expect(result.finalStatus).toBe('done');
    expect(result.finalContent).toContain('destructive actions are disabled');
    expect(params.writeToolDecisionAuditLog).toHaveBeenCalledWith(
      'ast-1',
      'auto:delete_transcription_segment',
      'policy_blocked:delete_transcription_segment:user_directive_deny_destructive',
      'system',
      'req-1',
      expect.objectContaining({ outcome: 'policy_blocked', reason: 'user_directive_deny_destructive' }),
    );
  });

  it('turns ask-first tool preference into a pending confirmation', async () => {
    const params = baseParams({
      toolCall: { name: 'set_transcription_text', arguments: { segmentId: 'unit-1', text: 'hello' }, requestId: 'req-2' },
      sessionMemory: { toolPreferences: { autoExecute: 'ask_first' } },
    });

    const result = await resolveToolDecisionPipeline(params);

    expect(result.finalStatus).toBe('done');
    expect(params.setTaskSession).toHaveBeenCalledWith(expect.objectContaining<Partial<AiTaskSession>>({
      status: 'waiting_confirm',
      toolName: 'set_transcription_text',
    }));
    expect(params.setPendingToolCall).toHaveBeenCalledWith(expect.objectContaining({
      assistantMessageId: 'ast-1',
      requestId: 'req-2',
    }));
  });
});
