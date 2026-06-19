import { describe, expect, it, vi } from 'vitest';
import { resolveAiChatStreamCompletion } from './useAiChat.streamCompletion';
import type { AiSessionMemory } from './useAiChat.types';

function baseEnv(overrides: { shouldApplyTurnSideEffects?: () => boolean } = {}) {
  return {
    messages: [],
    providerId: 'mock',
    model: 'mock-model',
    toolFeedbackLocale: 'en-US' as const,
    toolDecisionMode: 'enabled' as const,
    toolFeedbackStyle: 'detailed' as const,
    allowDestructiveToolCalls: true,
    hasPersistedExecutionForRequest: async () => false,
    writeToolDecisionAuditLog: vi.fn(async () => {}),
    writeToolIntentAuditLog: vi.fn(async () => {}),
    sessionMemory: {} as AiSessionMemory,
    updateSessionMemory: vi.fn(),
    persistSessionMemory: vi.fn(),
    setTaskSession: vi.fn(),
    setPendingToolCall: vi.fn(),
    taskSessionId: 'task-1',
    markExecutedRequestId: vi.fn(),
    bumpMetric: vi.fn(),
    shouldBumpRecovery: false,
    genRequestId: () => 'req-gen',
    localToolCallCountRef: { current: 0 },
    ...(overrides.shouldApplyTurnSideEffects
      ? { shouldApplyTurnSideEffects: overrides.shouldApplyTurnSideEffects }
      : {}),
  };
}

describe('resolveAiChatStreamCompletion turn side-effect guard', () => {
  it('does not invoke write-tool pipeline when turn side effects are stale', async () => {
    const onToolCall = vi.fn(async () => ({ ok: true, message: 'done' }));
    const persistSessionMemory = vi.fn();

    const result = await resolveAiChatStreamCompletion({
      assistantId: 'ast-1',
      assistantContent:
        '{"tool_call":{"name":"set_transcription_text","arguments":{"segmentId":"seg-1","text":"hi"}}}',
      userText: 'set text',
      aiContext: null,
      ...baseEnv({ shouldApplyTurnSideEffects: () => false }),
      onToolCall,
      persistSessionMemory,
    });

    expect(onToolCall).not.toHaveBeenCalled();
    expect(persistSessionMemory).not.toHaveBeenCalled();
    expect(result.finalStatus).toBe('done');
    expect(result.finalContent).toContain('set_transcription_text');
  });
});
