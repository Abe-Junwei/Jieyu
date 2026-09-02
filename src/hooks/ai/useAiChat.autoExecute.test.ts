import { describe, expect, it, vi } from 'vitest';
import { executeAutoToolCall } from './useAiChat.autoExecute';
import type { AiChatToolCall, AiSessionMemory, ToolAuditContext } from './useAiChat.types';

function baseParams(
  overrides: {
    shouldApplyTurnSideEffects?: () => boolean;
    onToolCall?: (call: AiChatToolCall) => Promise<{ ok: boolean; message: string }>;
  } = {},
) {
  const toolCall: AiChatToolCall = {
    name: 'set_transcription_text',
    arguments: { segmentId: 'seg-1', text: 'hello' },
    requestId: 'req-1',
  };
  return {
    assistantMessageId: 'ast-1',
    toolCall,
    auditContext: {
      userText: 'update text',
      providerId: 'mock',
      model: 'mock-model',
      toolDecisionMode: 'enabled',
      toolFeedbackStyle: 'detailed',
    } satisfies ToolAuditContext,
    locale: 'en-US' as const,
    toolFeedbackStyle: 'detailed' as const,
    onToolCall: overrides.onToolCall ?? vi.fn(async () => ({ ok: true, message: 'updated' })),
    writeToolDecisionAuditLog: vi.fn(async () => {}),
    setTaskSession: vi.fn(),
    taskSessionId: 'task-1',
    sessionMemory: {} as AiSessionMemory,
    updateSessionMemory: vi.fn(),
    persistSessionMemory: vi.fn(),
    markExecutedRequestId: vi.fn(),
    bumpMetric: vi.fn(),
    shouldBumpRecovery: false,
    ...(overrides.shouldApplyTurnSideEffects
      ? { shouldApplyTurnSideEffects: overrides.shouldApplyTurnSideEffects }
      : {}),
  };
}

describe('executeAutoToolCall turn side-effect guard', () => {
  it('skips tool execution and session memory when turn side effects are stale', async () => {
    const onToolCall = vi.fn(async () => ({ ok: true, message: 'updated' }));
    const persistSessionMemory = vi.fn();
    const updateSessionMemory = vi.fn();

    const result = await executeAutoToolCall({
      ...baseParams({ onToolCall, shouldApplyTurnSideEffects: () => false }),
      persistSessionMemory,
      updateSessionMemory,
    });

    expect(onToolCall).not.toHaveBeenCalled();
    expect(persistSessionMemory).not.toHaveBeenCalled();
    expect(updateSessionMemory).not.toHaveBeenCalled();
    expect(result.finalStatus).toBe('error');
    expect(result.finalErrorMessage).toBe('turn_superseded');
  });

  it('commits session memory through commitToolEffects on success', async () => {
    const persistSessionMemory = vi.fn();
    const updateSessionMemory = vi.fn();
    const facts = [
      { fact: 'keep-me', source: 'user' as const, createdAt: '2026-01-01T00:00:00.000Z' },
    ];

    const result = await executeAutoToolCall({
      ...baseParams(),
      sessionMemory: { projectFacts: facts },
      persistSessionMemory,
      updateSessionMemory,
    });

    expect(result.finalStatus).toBe('done');
    expect(updateSessionMemory).toHaveBeenCalledTimes(1);
    expect(persistSessionMemory).toHaveBeenCalledTimes(1);
    const next = updateSessionMemory.mock.calls[0]?.[0] as AiSessionMemory;
    expect(next.lastToolName).toBe('set_transcription_text');
    expect(next.projectFacts).toBe(facts);
  });
});
