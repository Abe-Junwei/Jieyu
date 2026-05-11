import type { Dispatch, SetStateAction } from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { ChatOrchestrator } from '../../ai/ChatOrchestrator';
import { featureFlags } from '../../ai/config/featureFlags';
import { getDefaultAiChatSettings } from '../../ai/providers/providerCatalog';
import type {
  AiInteractionMetrics,
  AiSessionMemory,
  AiSystemPersonaKey,
  AiTaskSession,
  UiChatMessage,
} from './useAiChat.types';
import type { PersistOpeningTurnAndBuildPromptContextResult } from './useAiChat.sendPersistTurnAndBuildPromptContext';
import { persistOpeningTurnAndBuildPromptContext } from './useAiChat.sendPersistTurnAndBuildPromptContext';
import { createAssistantStream } from './useAiChat.streamFactory';
import { createMetricTags } from '../../observability/metrics';
import { createInitialSendTurnStreamPhaseState } from './useAiChat.sendTurnStreamPhase';
import type {
  SendTurnDbConversationHolder,
  SendTurnPreflightContext,
} from './useAiChat.sendTurnPreflight';
import type { RunAiChatSendTurnArgs } from './useAiChat.sendTurn.types';
import { runAiChatSendTurnPersistAndPrimaryStream } from './useAiChat.sendTurnPersistAndPrimaryStream';

vi.mock('./useAiChat.sendPersistTurnAndBuildPromptContext', () => ({
  persistOpeningTurnAndBuildPromptContext: vi.fn(),
}));

vi.mock('./useAiChat.streamFactory', () => ({
  createAssistantStream: vi.fn(),
}));

const zeroMetrics: AiInteractionMetrics = {
  turnCount: 0,
  successCount: 0,
  failureCount: 0,
  clarifyCount: 0,
  explainFallbackCount: 0,
  cancelCount: 0,
  recoveryCount: 0,
  totalInputTokens: 0,
  totalOutputTokens: 0,
  currentTurnTokens: 0,
};

function makePreflight(): SendTurnPreflightContext {
  const controller = new AbortController();
  const dbConversation: SendTurnDbConversationHolder = { dbRef: null, activeConversationId: null };
  return {
    correlationId: 'snt-test',
    trimmed: 'hello',
    resumeCheckpoint: null,
    shouldTrackRemoteStatus: false,
    userMsg: { id: 'u1', role: 'user', content: 'hello', status: 'done' },
    assistantId: 'a1',
    assistantSeed: {
      id: 'a1',
      role: 'assistant',
      content: '',
      status: 'streaming',
      generationSource: 'local',
      generationModel: '',
      reasoningContent: '',
    },
    controller,
    dbConversation,
    phaseState: createInitialSendTurnStreamPhaseState(),
    timedOutBeforeFirstChunk: { current: false },
    sendStartedAtMs: 0,
    aiMetricTags: createMetricTags('ai-chat', { provider: 'openai', model: 'gpt-4' }),
    recordCompletionSuccessMetric: () => {},
    timeoutHandle: null,
    queueFlushAssistantDraft: vi.fn(),
    awaitQueuedPersistence: vi.fn().mockResolvedValue(undefined),
    finalizeAssistantMessage: vi.fn().mockResolvedValue(undefined),
    commitPrimaryStreamUsage: vi.fn(),
    agentLoopSourceUserText: 'hello',
    effectiveUserText: 'hello',
    verticalWorkflowSelection: null,
    verticalOutputEnvelopeSeed: null,
  };
}

function makeOpening(
  over: {
    update?: () => Promise<unknown>;
  } = {},
): PersistOpeningTurnAndBuildPromptContextResult {
  const update = over.update ?? vi.fn().mockResolvedValue(undefined);
  const mockDb = {
    collections: {
      ai_messages: { update },
    },
  };
  return {
    db: mockDb as unknown as PersistOpeningTurnAndBuildPromptContextResult['db'],
    activeConversationId: 'conv-1',
    history: [],
    historyCharBudget: 8000,
    maxContextChars: 32000,
    aiContext: null,
    responsePolicy: {} as PersistOpeningTurnAndBuildPromptContextResult['responsePolicy'],
    routingPlan: {} as PersistOpeningTurnAndBuildPromptContextResult['routingPlan'],
    contextBlock: '',
    ragCitations: [],
    memoryRecallShape: undefined,
    clarifyFastPathCall: null,
    systemPrompt: 'system',
    verticalOutputEnvelopeSeed: null,
  };
}

function makeSendTurnArgs(
  over: { setMessages?: Dispatch<SetStateAction<UiChatMessage[]>> } = {},
): RunAiChatSendTurnArgs {
  const setMessages = over.setMessages ?? (vi.fn() as Dispatch<SetStateAction<UiChatMessage[]>>);
  const settings = getDefaultAiChatSettings('mock');

  const orchestrator = {
    sendMessage: vi.fn(() => ({
      stream: (async function* streamGen() {
        yield { done: true as const };
      })(),
    })),
  } as unknown as ChatOrchestrator;

  const noopAsync = vi.fn().mockResolvedValue(undefined);
  const noop = vi.fn();

  return {
    userText: 'hello',
    featureFlags,
    isStreaming: false,
    sessionTokenBudget: 1_000_000,
    firstChunkTimeoutMs: 30_000,
    outputTokenCap: 4096,
    outputTokenRetryCap: 1,
    allowDestructiveToolCalls: true,
    maxContextCharsOverride: undefined,
    historyCharBudgetOverride: undefined,
    provider: { id: 'openai', label: 'OpenAI' },
    orchestrator,
    ensureConversation: vi.fn(async () => 'conv-1'),
    setLastError: noop,
    setMessages,
    setIsStreaming: noop,
    setConnectionTestStatus: noop,
    setConnectionTestMessage: noop,
    setContextDebugSnapshot: noop,
    setMetrics: noop,
    setTaskSession: noop,
    setPendingToolCall: noop,
    messagesRef: { current: [] },
    metricsRef: { current: { ...zeroMetrics } },
    pendingToolCallRef: { current: null },
    sessionMemoryRef: { current: {} as AiSessionMemory },
    settingsRef: { current: settings },
    toolFeedbackLocaleRef: { current: 'zh-CN' },
    systemPersonaKeyRef: { current: 'transcription' as AiSystemPersonaKey },
    getContextRef: { current: () => null },
    embeddingSearchServiceRef: { current: undefined },
    ragContextTimeoutMsRef: { current: 5000 },
    toolDecisionModeRef: { current: 'enabled' },
    onToolRiskCheckRef: { current: undefined },
    preparePendingToolCallRef: { current: undefined },
    onToolCallRef: { current: undefined },
    taskSessionRef: { current: { status: 'idle' } as AiTaskSession },
    onMessageCompleteRef: { current: undefined },
    abortRef: { current: null },
    localToolCallCountRef: { current: 0 },
    streamPersistIntervalMsRef: { current: 1000 },
    backgroundMemoryRuntimeRef: { current: null },
    writeToolDecisionAuditLog: noopAsync,
    writeToolIntentAuditLog: noopAsync,
    hasPersistedExecutionForRequest: vi.fn(async () => false),
    markExecutedRequestId: noop,
    bumpMetric: noop,
    resolveAgentLoopResumeCheckpoint: vi.fn(async () => null),
    clearPendingAgentLoopCheckpoint: noop,
  };
}

describe('runAiChatSendTurnPersistAndPrimaryStream failure paths', () => {
  beforeEach(() => {
    vi.mocked(persistOpeningTurnAndBuildPromptContext).mockReset();
    vi.mocked(createAssistantStream).mockReset();
  });

  it('propagates persistOpeningTurnAndBuildPromptContext failures without starting a stream', async () => {
    vi.mocked(persistOpeningTurnAndBuildPromptContext).mockRejectedValueOnce(
      new Error('persist failed'),
    );
    const args = makeSendTurnArgs();
    const preflight = makePreflight();

    await expect(
      runAiChatSendTurnPersistAndPrimaryStream(args, preflight, preflight.dbConversation),
    ).rejects.toThrow('persist failed');

    expect(createAssistantStream).not.toHaveBeenCalled();
  });

  it('propagates createAssistantStream failures before DB generation metadata write', async () => {
    vi.mocked(persistOpeningTurnAndBuildPromptContext).mockResolvedValue(makeOpening());
    vi.mocked(createAssistantStream).mockImplementation(() => {
      throw new Error('stream factory failed');
    });
    const setMessages = vi.fn();
    const args = makeSendTurnArgs({ setMessages });
    const preflight = makePreflight();

    await expect(
      runAiChatSendTurnPersistAndPrimaryStream(args, preflight, preflight.dbConversation),
    ).rejects.toThrow('stream factory failed');

    expect(setMessages).not.toHaveBeenCalled();
  });

  it('propagates ai_messages.update failures after stream wiring', async () => {
    const update = vi.fn().mockRejectedValue(new Error('db generation metadata failed'));
    vi.mocked(persistOpeningTurnAndBuildPromptContext).mockResolvedValue(makeOpening({ update }));
    vi.mocked(createAssistantStream).mockReturnValue({
      stream: (async function* empty() {
        yield { done: true };
      })(),
      generationSource: 'llm',
      generationModel: 'gpt-4',
    });
    const setMessages = vi.fn();
    const args = makeSendTurnArgs({ setMessages });
    const preflight = makePreflight();

    await expect(
      runAiChatSendTurnPersistAndPrimaryStream(args, preflight, preflight.dbConversation),
    ).rejects.toThrow('db generation metadata failed');

    expect(createAssistantStream).toHaveBeenCalledTimes(1);
    expect(setMessages).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalled();
  });
});
