import { describe, expect, it, vi } from 'vitest';
import { runSendTurnStreamAgentLoopAfterPrimaryCompletion } from './useAiChat.sendTurnStreamPhase.completionPipelineAgentLoop';
import type { RunAiChatSendTurnStreamPhaseInput } from './useAiChat.sendTurnStreamPhase.types';
import type { RunSendTurnStreamPostCompletionPipelineArgs } from './useAiChat.sendTurnStreamPhase.completionPipelineShared';

type CapturedAgentLoopDeps = {
  persistSessionMemory: (memory: unknown) => void;
  setSessionMemory: (memory: unknown) => void;
};

let capturedAgentLoopDeps: CapturedAgentLoopDeps | null = null;

vi.mock('./useAiChat.agentLoopRunner', () => ({
  runAgentLoop: async (deps: CapturedAgentLoopDeps) => {
    capturedAgentLoopDeps = deps;
    return {
      resolvedContent: 'done',
      resolvedStatus: 'done' as const,
      assistantReasoningContent: '',
      totalOutputTokens: 0,
      reportedInputTokens: 0,
      loopExecuted: false,
    };
  },
}));

function minimalPostCompletionArgs(
  buildStreamCompletionEnv: RunSendTurnStreamPostCompletionPipelineArgs['buildStreamCompletionEnv'],
): RunSendTurnStreamPostCompletionPipelineArgs & {
  resolution: { content: string; status: 'done' | 'error' };
} {
  return {
    input: {
      opening: {
        db: { collections: { audit_logs: { insert: vi.fn(async () => {}) } } },
        history: [],
        historyCharBudget: 1000,
        aiContext: null,
        routingPlan: { queryFamily: 'unknown', selectedTools: [], scope: 'project' },
        systemPrompt: 'system',
      },
      controller: new AbortController(),
      agentLoopSourceUserText: 'hello',
      resumeCheckpoint: null,
      assistantId: 'ast-1',
      shouldTrackRemoteStatus: false,
      flags: { aiChatAgentLoopEnabled: true, aiCoordinationLiteEnabled: false },
      orchestrator: {},
      clearPendingAgentLoopCheckpoint: vi.fn(),
      setLastError: vi.fn(),
      setConnectionTestStatus: vi.fn(),
      setConnectionTestMessage: vi.fn(),
      setTaskSession: vi.fn(),
      setMetrics: vi.fn(),
      sessionMemoryRef: { current: {} },
      settingsRef: { current: { model: 'mock-1' } },
      toolFeedbackLocaleRef: { current: 'en-US' },
      getContextRef: { current: undefined },
      taskSessionRef: { current: { id: 'task-1', status: 'idle', updatedAt: '' } },
    } as unknown as RunAiChatSendTurnStreamPhaseInput,
    phaseState: {
      assistantContent: 'body',
      assistantReasoningContent: '',
      reportedInputTokens: 0,
      totalReportedOutputTokens: 0,
    } as RunSendTurnStreamPostCompletionPipelineArgs['phaseState'],
    streamCompletionResult: {
      finalContent: 'done',
      finalStatus: 'done',
      verticalWorkflowSelection: null,
      verticalOutputEnvelopeSeed: null,
    },
    buildStreamCompletionEnv,
    resolution: { content: 'done', status: 'done' },
  };
}

describe('runSendTurnStreamAgentLoopAfterPrimaryCompletion', () => {
  it('wires agent-loop session memory through buildStreamCompletionEnv guards', async () => {
    capturedAgentLoopDeps = null;
    const guardedPersist = vi.fn();
    const guardedUpdate = vi.fn();
    const buildStreamCompletionEnv = vi.fn(() => ({
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
      sessionMemory: {},
      updateSessionMemory: guardedUpdate,
      persistSessionMemory: guardedPersist,
      setTaskSession: vi.fn(),
      setPendingToolCall: vi.fn(),
      taskSessionId: 'task-1',
      markExecutedRequestId: vi.fn(),
      bumpMetric: vi.fn(),
      shouldBumpRecovery: false,
      genRequestId: () => 'req-1',
      localToolCallCountRef: { current: 0 },
      shouldApplyTurnSideEffects: () => true,
    }));

    await runSendTurnStreamAgentLoopAfterPrimaryCompletion(
      minimalPostCompletionArgs(buildStreamCompletionEnv),
    );

    expect(capturedAgentLoopDeps).not.toBeNull();
    capturedAgentLoopDeps!.setSessionMemory({ preferences: { lastLanguage: 'cmn' } });
    capturedAgentLoopDeps!.persistSessionMemory({ preferences: { lastLanguage: 'cmn' } });
    expect(guardedUpdate).toHaveBeenCalledWith({ preferences: { lastLanguage: 'cmn' } });
    expect(guardedPersist).toHaveBeenCalledWith({ preferences: { lastLanguage: 'cmn' } });
  });
});
