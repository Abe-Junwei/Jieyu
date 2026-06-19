import { describe, expect, it, vi } from 'vitest';
import type { LocalContextToolResult } from '../../ai/chat/localContextTools';
import type { AiSessionMemory, AiTaskSession } from './useAiChat.types';
import type { ResolveAiChatStreamCompletionParams } from './useAiChat.streamCompletion';
import type { AuditLogDocType } from '../../db/types';
import { runAgentLoop } from './useAiChat.agentLoopRunner';

vi.mock('../../ai/config/featureFlags', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../../ai/config/featureFlags')>();
  return {
    ...mod,
    featureFlags: {
      ...mod.featureFlags,
      aiAgentLoopClosedLoopReplanningEnabled: true,
    },
  };
});

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

describe('runAgentLoop coordination lite', () => {
  it('persists token-budget checkpoint and stores returned task id in session memory', async () => {
    let sessionMemory: AiSessionMemory = {};
    let taskSession: AiTaskSession = {
      id: 'task-1',
      status: 'executing',
      updatedAt: '2026-04-25T00:00:00.000Z',
    };
    const initialToolResult: LocalContextToolResult = {
      ok: true,
      name: 'list_layers',
      result: { layers: [] },
    };
    const persistAgentLoopCheckpoint = vi.fn(async () => 'task_agent_loop_budget_1');

    const result = await runAgentLoop(
      {
        assistantId: 'ast-budget',
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
        setSessionMemory: (next) => {
          sessionMemory = next;
        },
        getSettings: () => ({ model: 'mock-model' }),
        getLocaleIsZhCn: () => true,
        getAiContext: () => null,
        getTaskSession: () => taskSession,
        setTaskSession: (next) => {
          taskSession = typeof next === 'function' ? next(taskSession) : next;
        },
        setMetrics: vi.fn(),
        persistSessionMemory: vi.fn(),
        persistAgentLoopCheckpoint,
        coordinationLiteEnabled: false,
        buildStreamCompletionEnv: streamCompletionEnvOnly,
        orchestrator: {
          sendMessage: vi.fn(() => ({
            stream: (async function* () {
              yield { done: true };
            })(),
          })),
        },
        insertAuditLog: vi.fn(async () => {}),
      },
      {
        resolvedContent: 'tool payload ready',
        resolvedStatus: 'done',
        resolvedErrorMessage: undefined,
        resolvedConnectionErrorMessage: undefined,
        resolvedLocalToolResults: [initialToolResult],
        rawAssistantContentForLoop: 'tool payload ready',
        assistantReasoningContent: '',
        reportedInputTokens: 4000,
        totalOutputTokens: 0,
        startStep: 1,
      },
    );

    expect(result.loopExecuted).toBe(true);
    expect(persistAgentLoopCheckpoint).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'token_budget_warning',
        step: 1,
        originalUserText: 'summarize current layers',
      }),
    );
    expect(sessionMemory.pendingAgentLoopCheckpoint?.taskId).toBe('task_agent_loop_budget_1');
  });

  it('does not persist session memory on token-budget checkpoint when turn side effects are stale', async () => {
    let sessionMemory: AiSessionMemory = { preferences: { lastLanguage: 'eng' } };
    let taskSession: AiTaskSession = {
      id: 'task-1',
      status: 'executing',
      updatedAt: '2026-04-25T00:00:00.000Z',
    };
    const initialToolResult: LocalContextToolResult = {
      ok: true,
      name: 'list_layers',
      result: { layers: [] },
    };
    const persistSessionMemory = vi.fn();
    const shouldApplyTurnSideEffects = () => false;
    const guardedUpdateSessionMemory = (next: AiSessionMemory) => {
      if (!shouldApplyTurnSideEffects()) return;
      sessionMemory = next;
    };
    const guardedPersistSessionMemory = (next: AiSessionMemory) => {
      if (!shouldApplyTurnSideEffects()) return;
      persistSessionMemory(next);
    };

    await runAgentLoop(
      {
        assistantId: 'ast-budget-stale',
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
        setSessionMemory: guardedUpdateSessionMemory,
        getSettings: () => ({ model: 'mock-model' }),
        getLocaleIsZhCn: () => true,
        getAiContext: () => null,
        getTaskSession: () => taskSession,
        setTaskSession: (next) => {
          taskSession = typeof next === 'function' ? next(taskSession) : next;
        },
        setMetrics: vi.fn(),
        persistSessionMemory: guardedPersistSessionMemory,
        persistAgentLoopCheckpoint: vi.fn(async () => 'task_stale_budget'),
        coordinationLiteEnabled: false,
        buildStreamCompletionEnv: () => ({
          ...streamCompletionEnvOnly(),
          shouldApplyTurnSideEffects,
          updateSessionMemory: guardedUpdateSessionMemory,
          persistSessionMemory: guardedPersistSessionMemory,
        }),
        orchestrator: {
          sendMessage: vi.fn(() => ({
            stream: (async function* () {
              yield { done: true };
            })(),
          })),
        },
        insertAuditLog: vi.fn(async () => {}),
      },
      {
        resolvedContent: 'tool payload ready',
        resolvedStatus: 'done',
        resolvedErrorMessage: undefined,
        resolvedConnectionErrorMessage: undefined,
        resolvedLocalToolResults: [initialToolResult],
        rawAssistantContentForLoop: 'tool payload ready',
        assistantReasoningContent: '',
        reportedInputTokens: 4000,
        totalOutputTokens: 0,
        startStep: 1,
      },
    );

    expect(persistSessionMemory).not.toHaveBeenCalled();
    expect(sessionMemory.pendingAgentLoopCheckpoint).toBeUndefined();
    expect(sessionMemory.preferences?.lastLanguage).toBe('eng');
  });

  it('emits audit-only coordination notifications for loop steps', async () => {
    let sessionMemory: AiSessionMemory = {};
    let taskSession: AiTaskSession = {
      id: 'task-1',
      status: 'executing',
      updatedAt: '2026-04-25T00:00:00.000Z',
    };
    const insertAuditLog = vi.fn(async (_entry: AuditLogDocType) => {});
    const initialToolResult: LocalContextToolResult = {
      ok: true,
      name: 'list_layers',
      result: { layers: [] },
    };
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
        setSessionMemory: (next) => {
          sessionMemory = next;
        },
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
    expect(insertAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ field: 'ai_agent_loop_step' }),
    );
    expect(insertAuditLog).toHaveBeenCalledWith(
      expect.objectContaining({ field: 'ai_coordination_lite' }),
    );
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

  it('closed-loop replanning: search zero results clarifies without entering continuation stream', async () => {
    const orchestrator = { sendMessage: vi.fn() };
    let taskSession: AiTaskSession = {
      id: 'task-1',
      status: 'executing',
      updatedAt: '2026-04-25T00:00:00.000Z',
    };
    const setTaskSession = vi.fn((next) => {
      taskSession = typeof next === 'function' ? next(taskSession) : next;
    });
    const setMetrics = vi.fn();
    const result = await runAgentLoop(
      {
        assistantId: 'ast-search-zero',
        agentLoopSourceUserText: 'find tone consonant examples',
        history: [],
        historyCharBudget: 1000,
        systemPrompt: 'system',
        aiContext: null,
        signal: new AbortController().signal,
        routingPlan: {
          queryFamily: 'search',
          selectedTools: ['search_units'],
          scope: 'current_scope',
        },
        aiChatAgentLoopEnabled: true,
        getSessionMemory: () => ({}),
        setSessionMemory: vi.fn(),
        getSettings: () => ({ model: 'mock-model' }),
        getLocaleIsZhCn: () => true,
        getAiContext: () => null,
        getTaskSession: () => taskSession,
        setTaskSession,
        setMetrics,
        persistSessionMemory: vi.fn(),
        coordinationLiteEnabled: false,
        buildStreamCompletionEnv: streamCompletionEnvOnly,
        orchestrator,
        insertAuditLog: vi.fn(async () => {}),
      },
      {
        resolvedContent: 'searching…',
        resolvedStatus: 'done',
        resolvedErrorMessage: undefined,
        resolvedConnectionErrorMessage: undefined,
        resolvedLocalToolResults: [
          { ok: true, name: 'search_units', result: { count: 0, matches: [] } },
        ],
        rawAssistantContentForLoop: 'searching…',
        assistantReasoningContent: '',
        reportedInputTokens: 0,
        totalOutputTokens: 0,
        startStep: 1,
      },
    );

    expect(orchestrator.sendMessage).not.toHaveBeenCalled();
    expect(result.loopExecuted).toBe(false);
    expect(result.resolvedStatus).toBe('done');
    expect(result.resolvedContent).toContain('未找到匹配的句段');
    expect(result.resolvedLocalToolResults).toBeUndefined();
    expect(setTaskSession).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'waiting_clarify',
        toolName: 'search_units',
        clarifyReason: 'query_ambiguous',
      }),
    );
    expect(setMetrics).toHaveBeenCalled();
  });

  it('closed-loop replanning: abort appends retryable explainability', async () => {
    const result = await runAgentLoop(
      {
        assistantId: 'ast-abort',
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
        getTaskSession: () => ({
          id: 'task-1',
          status: 'executing',
          updatedAt: '2026-04-25T00:00:00.000Z',
        }),
        setTaskSession: vi.fn(),
        setMetrics: vi.fn(),
        persistSessionMemory: vi.fn(),
        coordinationLiteEnabled: false,
        buildStreamCompletionEnv: streamCompletionEnvOnly,
        orchestrator: { sendMessage: vi.fn() },
        insertAuditLog: vi.fn(async () => {}),
      },
      {
        resolvedContent: 'partial',
        resolvedStatus: 'done',
        resolvedErrorMessage: undefined,
        resolvedConnectionErrorMessage: undefined,
        resolvedLocalToolResults: [
          { ok: false, name: 'list_layers', result: null, error: 'database unavailable' },
        ],
        rawAssistantContentForLoop: 'partial',
        assistantReasoningContent: '',
        reportedInputTokens: 0,
        totalOutputTokens: 0,
        startStep: 1,
      },
    );

    expect(result.resolvedContent).toContain('暂时失败');
    expect(result.loopExecuted).toBe(false);
  });

  it('closed-loop replanning: max-steps ceiling appends explainability without continuation', async () => {
    const orchestrator = { sendMessage: vi.fn() };
    const result = await runAgentLoop(
      {
        assistantId: 'ast-max-steps',
        agentLoopSourceUserText: 'continue analysis',
        history: [],
        historyCharBudget: 8000,
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
        getTaskSession: () => ({
          id: 'task-1',
          status: 'executing',
          updatedAt: '2026-04-25T00:00:00.000Z',
        }),
        setTaskSession: vi.fn(),
        setMetrics: vi.fn(),
        persistSessionMemory: vi.fn(),
        coordinationLiteEnabled: false,
        buildStreamCompletionEnv: streamCompletionEnvOnly,
        orchestrator,
        insertAuditLog: vi.fn(async () => {}),
      },
      {
        resolvedContent: 'step 6 payload',
        resolvedStatus: 'done',
        resolvedErrorMessage: undefined,
        resolvedConnectionErrorMessage: undefined,
        resolvedLocalToolResults: [
          { ok: true, name: 'list_layers', result: { layers: [{ id: 'l1' }] } },
        ],
        rawAssistantContentForLoop: 'step 6 payload',
        assistantReasoningContent: '',
        reportedInputTokens: 0,
        totalOutputTokens: 0,
        startStep: 6,
      },
    );

    expect(orchestrator.sendMessage).not.toHaveBeenCalled();
    expect(result.resolvedContent).toContain('多步推理已达到上限');
  });

  it('closed-loop replanning: detail unit not found replans with user guidance appended', async () => {
    const orchestrator = {
      sendMessage: vi.fn(() => ({
        stream: (async function* () {
          yield { delta: 'retry search', done: true };
        })(),
      })),
    };
    const result = await runAgentLoop(
      {
        assistantId: 'ast-detail-replan',
        agentLoopSourceUserText: 'show unit seg-404',
        history: [],
        historyCharBudget: 4000,
        systemPrompt: 'system',
        aiContext: null,
        signal: new AbortController().signal,
        routingPlan: {
          queryFamily: 'detail',
          selectedTools: ['get_unit_detail'],
          scope: 'current_scope',
        },
        aiChatAgentLoopEnabled: true,
        getSessionMemory: () => ({}),
        setSessionMemory: vi.fn(),
        getSettings: () => ({ model: 'mock-model' }),
        getLocaleIsZhCn: () => true,
        getAiContext: () => null,
        getTaskSession: () => ({
          id: 'task-1',
          status: 'executing',
          updatedAt: '2026-04-25T00:00:00.000Z',
        }),
        setTaskSession: vi.fn(),
        setMetrics: vi.fn(),
        persistSessionMemory: vi.fn(),
        coordinationLiteEnabled: false,
        buildStreamCompletionEnv: streamCompletionEnvOnly,
        orchestrator,
        insertAuditLog: vi.fn(async () => {}),
      },
      {
        resolvedContent: 'fetching detail…',
        resolvedStatus: 'done',
        resolvedErrorMessage: undefined,
        resolvedConnectionErrorMessage: undefined,
        resolvedLocalToolResults: [
          { ok: false, name: 'get_unit_detail', result: null, error: 'unit not found: seg-404' },
        ],
        rawAssistantContentForLoop: 'fetching detail…',
        assistantReasoningContent: '',
        reportedInputTokens: 100,
        totalOutputTokens: 0,
        startStep: 1,
      },
    );

    expect(result.resolvedContent).toContain('未找到指定句段');
    expect(orchestrator.sendMessage).toHaveBeenCalled();
    expect(result.loopExecuted).toBe(true);
  });

  it('closed-loop replanning: abort appends explainability even when stream ended in error', async () => {
    const result = await runAgentLoop(
      {
        assistantId: 'ast-abort-error',
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
        getTaskSession: () => ({
          id: 'task-1',
          status: 'executing',
          updatedAt: '2026-04-25T00:00:00.000Z',
        }),
        setTaskSession: vi.fn(),
        setMetrics: vi.fn(),
        persistSessionMemory: vi.fn(),
        coordinationLiteEnabled: false,
        buildStreamCompletionEnv: streamCompletionEnvOnly,
        orchestrator: { sendMessage: vi.fn() },
        insertAuditLog: vi.fn(async () => {}),
      },
      {
        resolvedContent: '',
        resolvedStatus: 'error',
        resolvedErrorMessage: 'local context tool batch failed',
        resolvedConnectionErrorMessage: undefined,
        resolvedLocalToolResults: [
          { ok: false, name: 'list_layers', result: null, error: 'database unavailable' },
        ],
        rawAssistantContentForLoop: '',
        assistantReasoningContent: '',
        reportedInputTokens: 0,
        totalOutputTokens: 0,
        startStep: 1,
      },
    );

    expect(result.resolvedContent).toContain('暂时失败');
    expect(result.loopExecuted).toBe(false);
  });
});
