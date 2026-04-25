import { describe, expect, it, vi } from 'vitest';
import type { LocalContextToolResult } from '../ai/chat/localContextTools';
import type { AiSessionMemory, AiTaskSession } from './useAiChat.types';
import type { ResolveAiChatStreamCompletionParams } from './useAiChat.streamCompletion';
import type { AuditLogDocType } from '../db/types';
import { runAgentLoop } from './useAiChat.agentLoopRunner';

function streamCompletionEnvOnly(): Omit<ResolveAiChatStreamCompletionParams, 'assistantId' | 'assistantContent' | 'userText' | 'aiContext'> {
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

describe('runAgentLoop coordination lite', () => {
  it('emits audit-only coordination notifications for loop steps', async () => {
    let sessionMemory: AiSessionMemory = {};
    let taskSession: AiTaskSession = { id: 'task-1', status: 'executing', updatedAt: '2026-04-25T00:00:00.000Z' };
    const insertAuditLog = vi.fn(async (_entry: AuditLogDocType) => {});
    const initialToolResult: LocalContextToolResult = { ok: true, name: 'list_layers', result: { layers: [] } };
    const orchestrator = {
      sendMessage: vi.fn(() => ({
        stream: (async function* () {
          yield { delta: 'Here is the final synthesis.' };
          yield { done: true };
        })(),
      })),
    };

    const result = await runAgentLoop(
      {
        assistantId: 'ast-1',
        agentLoopSourceUserText: 'summarize current layers',
        history: [],
        historyCharBudget: 1000,
        systemPrompt: 'system',
        aiContext: null,
        signal: new AbortController().signal,
        routingPlan: {
          queryFamily: 'unknown',
          selectedTools: ['list_layers'],
          scope: 'project',
        },
        aiChatAgentLoopEnabled: true,
        getSessionMemory: () => sessionMemory,
        setSessionMemory: (next) => { sessionMemory = next; },
        getSettings: () => ({ model: 'mock-model' }),
        getLocaleIsZhCn: () => true,
        getAiContext: () => null,
        getTaskSession: () => taskSession,
        setTaskSession: (next) => {
          taskSession = typeof next === 'function' ? next(taskSession) : next;
        },
        setMetrics: vi.fn(),
        persistSessionMemory: vi.fn(),
        coordinationLiteEnabled: true,
        buildStreamCompletionEnv: streamCompletionEnvOnly,
        orchestrator,
        insertAuditLog,
      },
      {
        resolvedContent: 'tool payload ready',
        resolvedStatus: 'done',
        resolvedErrorMessage: undefined,
        resolvedConnectionErrorMessage: undefined,
        resolvedLocalToolResults: [initialToolResult],
        rawAssistantContentForLoop: 'tool payload ready',
        assistantReasoningContent: '',
        reportedInputTokens: 0,
        totalOutputTokens: 0,
        startStep: 1,
      },
    );

    expect(result.loopExecuted).toBe(true);
    expect(result.resolvedContent).toBe('Here is the final synthesis.');
    expect(insertAuditLog).toHaveBeenCalledWith(expect.objectContaining({ field: 'ai_agent_loop_step' }));
    expect(insertAuditLog).toHaveBeenCalledWith(expect.objectContaining({ field: 'ai_coordination_lite' }));
    const coordinationAudit = insertAuditLog.mock.calls
      .map((call) => call[0])
      .find((entry): entry is AuditLogDocType => entry.field === 'ai_coordination_lite');
    expect(coordinationAudit).toBeDefined();
    expect(JSON.parse(coordinationAudit?.metadataJson ?? '{}')).toMatchObject({
      phase: 'coordination_lite',
      notification: {
        taskId: 'ast-1_loop_1',
        status: 'completed',
        phase: 'research',
      },
      parallelPolicy: {
        canRunInParallel: true,
      },
    });
  });
});
