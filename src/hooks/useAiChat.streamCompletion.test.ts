import { describe, expect, it, vi } from 'vitest';
import type { AiPromptContext, AiSessionMemory } from './useAiChat.types';
import { resolveAiChatStreamCompletion } from './useAiChat.streamCompletion';

const emptySession: AiSessionMemory = {};

function baseParams(overrides: Partial<Parameters<typeof resolveAiChatStreamCompletion>[0]> = {}): Parameters<typeof resolveAiChatStreamCompletion>[0] {
  return {
    assistantId: 'ast-test',
    assistantContent: '',
    userText: 'ping',
    aiContext: null,
    messages: [],
    providerId: 'mock',
    model: 'mock-model',
    toolFeedbackLocale: 'zh-CN' as const,
    toolDecisionMode: 'gray' as const,
    toolFeedbackStyle: 'detailed' as const,
    allowDestructiveToolCalls: false,
    hasPersistedExecutionForRequest: async () => false,
    writeToolDecisionAuditLog: vi.fn(async () => {}),
    writeToolIntentAuditLog: vi.fn(async () => {}),
    sessionMemory: emptySession,
    updateSessionMemory: vi.fn(),
    persistSessionMemory: vi.fn(),
    setTaskSession: vi.fn(),
    setPendingToolCall: vi.fn(),
    taskSessionId: 'task-1',
    markExecutedRequestId: vi.fn(),
    bumpMetric: vi.fn(),
    shouldBumpRecovery: false,
    genRequestId: () => 'req-1',
    localToolCallCountRef: { current: 0 },
    ...overrides,
  };
}

describe('resolveAiChatStreamCompletion local tools JIT context', () => {
  it('uses resolveFreshAiContext for a single local tool when provided', async () => {
    const stale: AiPromptContext = {
      longTerm: { projectStats: { unitCount: 5, translationLayerCount: 1, aiConfidenceAvg: null } },
    };
    const fresh: AiPromptContext = {
      longTerm: { projectStats: { unitCount: 99, translationLayerCount: 1, aiConfidenceAvg: null } },
    };

    const result = await resolveAiChatStreamCompletion(
      baseParams({
        assistantContent: '{"tool_call":{"name":"get_project_stats","arguments":{}}}',
        aiContext: stale,
        resolveFreshAiContext: () => fresh,
      }),
    );

    expect(result.finalStatus).toBe('done');
    expect(result.localToolResults).toHaveLength(1);
    const payload = result.localToolResults![0]!.result as { unitCount: number; _readModel: { unitIndexComplete: boolean } };
    expect(payload.unitCount).toBe(99);
    expect(payload._readModel.unitIndexComplete).toBe(true);
  });

  it('falls back to aiContext when resolveFreshAiContext is omitted', async () => {
    const stale: AiPromptContext = {
      longTerm: { projectStats: { unitCount: 7, translationLayerCount: 0, aiConfidenceAvg: null } },
    };

    const result = await resolveAiChatStreamCompletion(
      baseParams({
        assistantContent: '{"tool_call":{"name":"get_project_stats","arguments":{}}}',
        aiContext: stale,
      }),
    );

    const payload = result.localToolResults![0]!.result as { unitCount: number };
    expect(payload.unitCount).toBe(7);
  });

  it('falls back to aiContext when resolveFreshAiContext returns null', async () => {
    const stale: AiPromptContext = {
      longTerm: { projectStats: { unitCount: 3, translationLayerCount: 0, aiConfidenceAvg: null } },
    };

    const result = await resolveAiChatStreamCompletion(
      baseParams({
        assistantContent: '{"tool_call":{"name":"get_project_stats","arguments":{}}}',
        aiContext: stale,
        resolveFreshAiContext: () => null,
      }),
    );

    const payload = result.localToolResults![0]!.result as { unitCount: number };
    expect(payload.unitCount).toBe(3);
  });

  it('re-invokes resolveFreshAiContext for each tool in a multi-tool batch', async () => {
    const stale: AiPromptContext = {
      longTerm: { projectStats: { unitCount: 1, translationLayerCount: 0, aiConfidenceAvg: null } },
    };
    let calls = 0;
    const resolveFreshAiContext = (): AiPromptContext => {
      calls += 1;
      return {
        longTerm: {
          projectStats: {
            unitCount: 100 + calls,
            translationLayerCount: 0,
            aiConfidenceAvg: null,
          },
        },
      };
    };

    const batchPayload = JSON.stringify({
      tool_calls: [
        { name: 'get_project_stats', arguments: {} },
        { name: 'get_project_stats', arguments: {} },
      ],
    });

    const result = await resolveAiChatStreamCompletion(
      baseParams({
        assistantContent: batchPayload,
        aiContext: stale,
        resolveFreshAiContext,
      }),
    );

    expect(calls).toBe(2);
    expect(result.localToolResults).toHaveLength(2);
    expect((result.localToolResults![0]!.result as { unitCount: number }).unitCount).toBe(101);
    expect((result.localToolResults![1]!.result as { unitCount: number }).unitCount).toBe(102);
  });
});
