import { describe, expect, it, vi } from 'vitest';
import { buildSendTurnStreamCompletionEnv } from './useAiChat.sendTurnStreamPhase.completionEnv';
import { createConversationGenerationRef } from '../../ai/chat/conversationGeneration';
import type { RunAiChatSendTurnStreamPhaseInput } from './useAiChat.sendTurnStreamPhase.types';

vi.mock('../../ai/chat/sessionMemory', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../ai/chat/sessionMemory')>();
  return {
    ...actual,
    persistSessionMemoryAsync: vi.fn(async () => {}),
  };
});

import { persistSessionMemoryAsync } from '../../ai/chat/sessionMemory';

function minimalStreamPhaseInput(
  overrides: Partial<RunAiChatSendTurnStreamPhaseInput> = {},
): RunAiChatSendTurnStreamPhaseInput {
  const conversationGenerationRef = createConversationGenerationRef(0);
  return {
    phaseState: {} as RunAiChatSendTurnStreamPhaseInput['phaseState'],
    opening: {
      responsePolicy: { locale: 'en-US', style: 'detailed' },
    } as RunAiChatSendTurnStreamPhaseInput['opening'],
    sendTurnConversationId: 'conv-turn-a',
    stream: (async function* () {})(),
    generationSource: 'local',
    controller: new AbortController(),
    effectiveUserText: 'hello',
    agentLoopSourceUserText: 'hello',
    resumeCheckpoint: null,
    verticalWorkflowSelection: null,
    verticalOutputEnvelopeSeed: null,
    userMsg: { id: 'user-1', role: 'user', content: 'hello' },
    assistantId: 'ast-1',
    shouldTrackRemoteStatus: false,
    timeoutHandle: null,
    sendStartedAtMs: 0,
    aiMetricTags: {},
    queueFlushAssistantDraft: vi.fn(),
    awaitQueuedPersistence: async () => {},
    finalizeAssistantMessage: async () => {},
    conversationGenerationRef,
    streamGenerationAtStart: 0,
    provider: { id: 'mock', label: 'Mock' } as RunAiChatSendTurnStreamPhaseInput['provider'],
    flags: {} as RunAiChatSendTurnStreamPhaseInput['flags'],
    orchestrator: {} as RunAiChatSendTurnStreamPhaseInput['orchestrator'],
    outputTokenCap: 4096,
    outputTokenRetryCap: 8192,
    clearPendingAgentLoopCheckpoint: vi.fn(),
    setLastError: vi.fn(),
    setMessages: vi.fn(),
    setConnectionTestStatus: vi.fn(),
    setConnectionTestMessage: vi.fn(),
    setTaskSession: vi.fn(),
    setMetrics: vi.fn(),
    setPendingToolCall: vi.fn(),
    messagesRef: { current: [] },
    metricsRef: {
      current: { successCount: 0, failureCount: 0, clarifyCount: 0, recoveryCount: 0 },
    },
    sessionMemoryRef: { current: {} },
    settingsRef: { current: { model: 'mock-1' } },
    toolFeedbackLocaleRef: { current: 'en-US' },
    getContextRef: { current: null },
    toolDecisionModeRef: { current: 'enabled' },
    onToolRiskCheckRef: { current: null },
    preparePendingToolCallRef: { current: null },
    onToolCallRef: { current: null },
    taskSessionRef: { current: { id: 'task-1', status: 'idle', updatedAt: '' } },
    backgroundMemoryRuntimeRef: { current: null },
    allowDestructiveToolCalls: true,
    hasPersistedExecutionForRequest: async () => false,
    writeToolDecisionAuditLog: vi.fn(async () => {}),
    writeToolIntentAuditLog: vi.fn(async () => {}),
    markExecutedRequestId: vi.fn(),
    bumpMetric: vi.fn(),
    localToolCallCountRef: { current: 0 },
    commitPrimaryStreamUsage: vi.fn(),
    recordCompletionSuccessMetric: vi.fn(),
    ...overrides,
  };
}

describe('buildSendTurnStreamCompletionEnv', () => {
  it('persists session memory to the turn conversation id, not the UI-bound conversation', () => {
    const sessionMemoryRef = { current: { preferences: { lastLanguage: 'cmn' } } };
    const env = buildSendTurnStreamCompletionEnv(minimalStreamPhaseInput({ sessionMemoryRef }));

    env.persistSessionMemory({ preferences: { lastLanguage: 'yue' } });

    expect(persistSessionMemoryAsync).toHaveBeenCalledWith('conv-turn-a', {
      preferences: { lastLanguage: 'yue' },
    });
    expect(sessionMemoryRef.current).toEqual({ preferences: { lastLanguage: 'yue' } });
  });

  it('skips in-memory and Dexie session memory updates when generation is stale', () => {
    const conversationGenerationRef = createConversationGenerationRef(0);
    conversationGenerationRef.current = 1;
    const sessionMemoryRef = { current: {} };
    const env = buildSendTurnStreamCompletionEnv(
      minimalStreamPhaseInput({
        conversationGenerationRef,
        streamGenerationAtStart: 0,
        sessionMemoryRef,
      }),
    );

    env.persistSessionMemory({ preferences: { lastLanguage: 'cmn' } });
    env.updateSessionMemory({ preferences: { lastLanguage: 'cmn' } });

    expect(persistSessionMemoryAsync).not.toHaveBeenCalled();
    expect(sessionMemoryRef.current).toEqual({});
  });
});
