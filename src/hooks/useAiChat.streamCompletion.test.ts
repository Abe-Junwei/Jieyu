import { describe, expect, it, vi } from 'vitest';
import type { AiPromptContext, AiSessionMemory } from './useAiChat.types';
import type { ResolveAiChatStreamCompletionParams } from './useAiChat.streamCompletion';
import { resolveAiChatStreamCompletion } from './useAiChat.streamCompletion';
import { finalizeAssistantStreamCompletion } from './useAiChat.streamCompletionPhase';
import { addMetricObserver } from '../observability/metrics';

const emptySession: AiSessionMemory = {};

function baseParams(overrides: Partial<ResolveAiChatStreamCompletionParams> = {}): ResolveAiChatStreamCompletionParams {
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

function streamCompletionEnvOnly(
  overrides: Partial<ResolveAiChatStreamCompletionParams> = {},
): Omit<ResolveAiChatStreamCompletionParams, 'assistantId' | 'assistantContent' | 'userText' | 'aiContext'> {
  const full = baseParams(overrides);
  const {
    assistantId: _a,
    assistantContent: _c,
    userText: _u,
    aiContext: _ctx,
    ...env
  } = full;
  return env;
}

describe('finalizeAssistantStreamCompletion', () => {
  it('merges env with core the same as a single resolveAiChatStreamCompletion call', async () => {
    const core = {
      assistantId: 'ast-merge',
      assistantContent: 'No JSON tool payload',
      userText: 'hello',
      aiContext: null as AiPromptContext | null,
    };
    const direct = await resolveAiChatStreamCompletion({ ...streamCompletionEnvOnly(), ...core });
    const wrapped = await finalizeAssistantStreamCompletion(core, streamCompletionEnvOnly());
    expect(wrapped).toEqual(direct);
  });
});

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

  it('asks for clarification instead of executing ambiguous bare metric query', async () => {
    const metricEvents: Array<{ id: string; reason?: string }> = [];
    const dispose = addMetricObserver((event) => {
      const reason = event.tags?.reason;
      metricEvents.push({
        id: event.id,
        ...(typeof reason === 'string' ? { reason } : {}),
      });
    });
    try {
      const result = await resolveAiChatStreamCompletion(
        baseParams({
          assistantContent: '{"tool_call":{"name":"get_project_stats","arguments":{}}}',
          userText: '多少',
          aiContext: {
            longTerm: {
              projectStats: { unitCount: 12, translationLayerCount: 1, aiConfidenceAvg: null },
            },
          },
          sessionMemory: {},
        }),
      );

      expect(result.finalStatus).toBe('done');
      expect(result.localToolResults).toBeUndefined();
      expect(result.finalContent).toMatch(/语段数|说话人数|翻译层数|scope|current audio/i);
      expect(metricEvents.some((event) => event.id === 'ai.local_tool_clarification_needed' && event.reason === 'metric_ambiguous')).toBe(true);
    } finally {
      dispose();
    }
  });

  it('keeps executing project stats when previous metric frame is available', async () => {
    const result = await resolveAiChatStreamCompletion(
      baseParams({
        assistantContent: '{"tool_call":{"name":"get_project_stats","arguments":{}}}',
        userText: '多少',
        aiContext: {
          longTerm: {
            projectStats: { unitCount: 12, speakerCount: 3, translationLayerCount: 1, aiConfidenceAvg: null },
          },
        },
        sessionMemory: {
          localToolState: {
            lastIntent: 'stats.get',
            lastScope: 'project',
            lastFrame: {
              domain: 'project_stats',
              questionKind: 'count',
              metric: 'speaker_count',
              scope: 'project',
              source: 'tool',
              updatedAt: '2026-04-15T00:00:00.000Z',
            },
            updatedAt: '2026-04-15T00:00:00.000Z',
          },
        },
      }),
    );

    expect(result.finalStatus).toBe('done');
    expect(result.localToolResults).toHaveLength(1);
    expect(result.finalContent).toContain('说话人');
  });

  it('asks for keyword clarification instead of running empty search', async () => {
    const result = await resolveAiChatStreamCompletion(
      baseParams({
        assistantContent: '{"tool_call":{"name":"search_units","arguments":{}}}',
        userText: '帮我搜一下',
        aiContext: {
          shortTerm: {
            localUnitIndex: [],
          },
          longTerm: {
            projectStats: { unitCount: 12, translationLayerCount: 1, aiConfidenceAvg: null },
          },
        },
      }),
    );

    expect(result.finalStatus).toBe('done');
    expect(result.localToolResults).toBeUndefined();
    expect(result.finalContent).toMatch(/关键词|keyword/i);
  });

  it('asks for target clarification when detail target is not resolvable', async () => {
    const result = await resolveAiChatStreamCompletion(
      baseParams({
        assistantContent: '{"tool_call":{"name":"get_unit_detail","arguments":{}}}',
        userText: '看一下详情',
        aiContext: {
          shortTerm: {
            localUnitIndex: [],
          },
          longTerm: {
            projectStats: { unitCount: 12, translationLayerCount: 1, aiConfidenceAvg: null },
          },
        },
      }),
    );

    expect(result.finalStatus).toBe('done');
    expect(result.localToolResults).toBeUndefined();
    expect(result.finalContent).toMatch(/第几个语段|segment ID|ordinal/i);
  });
});

describe('resolveAiChatStreamCompletion non-tool assistant text', () => {
  it('returns done with assistant text when there is no tool JSON', async () => {
    const result = await resolveAiChatStreamCompletion(
      baseParams({
        assistantContent: 'Here is a plain reply without tools.',
      }),
    );
    expect(result.finalStatus).toBe('done');
    expect(result.finalContent).toContain('plain reply');
    expect(result.localToolResults).toBeUndefined();
  });

  it('still errors on empty assistant content', async () => {
    const result = await resolveAiChatStreamCompletion(
      baseParams({
        assistantContent: '   ',
      }),
    );
    expect(result.finalStatus).toBe('error');
    expect(result.finalErrorMessage).toBeDefined();
  });

  it('normalizes malformed json-like replies into friendly clarification instead of exposing raw json', async () => {
    const result = await resolveAiChatStreamCompletion(
      baseParams({
        userText: '当前有多少说话人？',
        assistantContent: '```json\n{"unexpected":"shape"}\n```',
      }),
    );
    expect(result.finalStatus).toBe('done');
    expect(result.finalContent).not.toContain('```json');
    expect(result.finalContent).not.toContain('unexpected');
    expect(result.finalContent).toMatch(/继续追问|直接回答|确认/u);
  });

  it('does not append hallucination warning when count claim matches current scope count', async () => {
    const context: AiPromptContext = {
      shortTerm: {
        currentScopeUnitCount: 2,
        currentMediaUnitCount: 2,
        projectUnitCount: 3,
      },
      longTerm: {
        projectStats: { unitCount: 3, translationLayerCount: 1, aiConfidenceAvg: null },
      },
    };
    const assistantContent = [
      '1. #1 alpha',
      '2. #2 beta',
      '3. #3 gamma',
      '4. #4 delta',
      '根据当前波形区统计，当前共有 2 个语段。',
    ].join('\n');

    const result = await resolveAiChatStreamCompletion(
      baseParams({
        assistantContent,
        aiContext: context,
      }),
    );

    expect(result.finalStatus).toBe('done');
    expect(result.finalContent).toContain('当前共有 2 个语段');
    expect(result.finalContent).not.toContain('可能包含不准确的信息');
  });

  it('appends hallucination warning when count claim matches none of scope/track/project counts', async () => {
    const context: AiPromptContext = {
      shortTerm: {
        currentScopeUnitCount: 2,
        currentMediaUnitCount: 2,
        projectUnitCount: 3,
      },
      longTerm: {
        projectStats: { unitCount: 3, translationLayerCount: 1, aiConfidenceAvg: null },
      },
    };
    const assistantContent = [
      '1. #1 alpha',
      '2. #2 beta',
      '3. #3 gamma',
      '4. #4 delta',
      '根据项目统计，当前共有 9 个语段。',
    ].join('\n');

    const result = await resolveAiChatStreamCompletion(
      baseParams({
        assistantContent,
        aiContext: context,
      }),
    );

    expect(result.finalStatus).toBe('done');
    expect(result.finalContent).toContain('当前共有 9 个语段');
    expect(result.finalContent).toContain('可能包含不准确的信息');
  });
});
