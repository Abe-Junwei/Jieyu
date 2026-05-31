import { describe, expect, it, vi } from 'vitest';
import type { LocalContextToolResult } from '../../ai/chat/localContextTools';
import type { AiTaskSession } from './useAiChat.types';
import type { ResolveAiChatStreamCompletionParams } from './useAiChat.streamCompletion';
import { runAgentLoop } from './useAiChat.agentLoopRunner';

function streamCompletionEnvOnly(): Omit<
  ResolveAiChatStreamCompletionParams,
  'assistantId' | 'assistantContent' | 'userText' | 'aiContext'
> {
  return {
    messages: [],
    providerId: 'mock',
    model: 'mock-model',
    toolFeedbackLocale: 'zh-CN',
    toolDecisionMode: 'gray',
    toolFeedbackStyle: 'detailed',
    allowDestructiveToolCalls: false,
    hasPersistedExecutionForRequest: async () => false,
    writeToolDecisionAuditLog: vi.fn(async () => {}),
    writeToolIntentAuditLog: vi.fn(async () => {}),
    sessionMemory: {},
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
  };
}

describe('runAgentLoop — replanning flag off (default)', () => {
  it('does not append replanning explainability when tool fails', async () => {
    const orchestrator = { sendMessage: vi.fn() };
    let taskSession: AiTaskSession = {
      id: 'task-1',
      status: 'executing',
      updatedAt: '2026-04-25T00:00:00.000Z',
    };

    const result = await runAgentLoop(
      {
        assistantId: 'ast-legacy-fail',
        agentLoopSourceUserText: 'list all layers',
        history: [],
        historyCharBudget: 1000,
        systemPrompt: 'system',
        aiContext: null,
        signal: new AbortController().signal,
        routingPlan: { queryFamily: 'unknown', selectedTools: ['list_layers'], scope: 'project' },
        aiChatAgentLoopEnabled: true,
        getSessionMemory: () => ({}),
        setSessionMemory: vi.fn(),
        getSettings: () => ({ model: 'mock-model' }),
        getLocaleIsZhCn: () => true,
        getAiContext: () => null,
        getTaskSession: () => taskSession,
        setTaskSession: (next) => {
          taskSession = typeof next === 'function' ? next(taskSession) : next;
        },
        setMetrics: vi.fn(),
        persistSessionMemory: vi.fn(),
        coordinationLiteEnabled: false,
        buildStreamCompletionEnv: streamCompletionEnvOnly,
        orchestrator,
        insertAuditLog: vi.fn(async () => {}),
      },
      {
        resolvedContent: 'partial',
        resolvedStatus: 'done',
        resolvedErrorMessage: undefined,
        resolvedConnectionErrorMessage: undefined,
        resolvedLocalToolResults: [
          { ok: false, name: 'list_layers', result: null, error: 'database unavailable' },
        ] as LocalContextToolResult[],
        rawAssistantContentForLoop: 'partial',
        assistantReasoningContent: '',
        reportedInputTokens: 0,
        totalOutputTokens: 0,
        startStep: 1,
      },
    );

    expect(orchestrator.sendMessage).not.toHaveBeenCalled();
    expect(result.loopExecuted).toBe(false);
    expect(result.resolvedContent).toBe('partial');
    expect(result.resolvedContent).not.toContain('暂时失败');
    expect(taskSession.status).toBe('executing');
  });
});
