// @vitest-environment jsdom

import type { Dispatch, SetStateAction } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChatOrchestrator } from '../ai/ChatOrchestrator';
import { tf } from '../i18n';
import { featureFlags } from '../ai/config/featureFlags';
import { getDefaultAiChatSettings } from '../ai/providers/providerCatalog';
import { createMetricTags } from '../observability/metrics';
import type { SendTurnStreamPhaseState } from './useAiChat.sendTurnStreamPhase';
import type { SendTurnPreflightContext } from './useAiChat.sendTurnPreflight';
import type { PersistOpeningTurnAndBuildPromptContextResult } from './useAiChat.sendPersistTurnAndBuildPromptContext';
import type { RunAiChatSendTurnArgs } from './useAiChat.sendTurn.types';
import type { AiInteractionMetrics, AiSessionMemory, AiSystemPersonaKey, AiTaskSession, UiChatMessage } from './useAiChat.types';
import { runAiChatSendTurnPreflight } from './useAiChat.sendTurnPreflight';
import { runAiChatSendTurnPersistAndPrimaryStream } from './useAiChat.sendTurnPersistAndPrimaryStream';
import { runAiChatSendTurnStreamPhase } from './useAiChat.sendTurnStreamPhase';
import { finalizeSendTurnStream, handleSendTurnStreamCatch } from './useAiChat.sendTurnCompletion';
import { logSendTurnPhase } from './useAiChat.sendTurnCorrelation';
import { runAiChatSendTurn } from './useAiChat.sendTurn';

vi.mock('./useAiChat.sendTurnPreflight', () => ({
  runAiChatSendTurnPreflight: vi.fn(),
}));

vi.mock('./useAiChat.sendTurnPersistAndPrimaryStream', () => ({
  runAiChatSendTurnPersistAndPrimaryStream: vi.fn(),
}));

vi.mock('./useAiChat.sendTurnStreamPhase', () => ({
  runAiChatSendTurnStreamPhase: vi.fn(),
}));

vi.mock('./useAiChat.sendTurnCompletion', () => ({
  finalizeSendTurnStream: vi.fn(),
  handleSendTurnStreamCatch: vi.fn(),
}));

vi.mock('./useAiChat.sendTurnCorrelation', () => ({
  logSendTurnPhase: vi.fn(),
}));

const emptyStreamPhaseState: SendTurnStreamPhaseState = {
  assistantContent: '',
  assistantReasoningContent: '',
  reportedInputTokens: 0,
  totalReportedOutputTokens: 0,
  primaryStreamUsage: undefined,
  usageObservedThisTurn: false,
  streamFinalized: false,
  assistantThinking: false,
  firstChunkArrived: false,
  connectionMarkedSuccess: false,
  firstTokenMetricRecorded: false,
  primaryUsageCommitted: false,
};

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

function makeSendTurnArgs(over: Partial<RunAiChatSendTurnArgs> = {}): RunAiChatSendTurnArgs {
  const settings = getDefaultAiChatSettings('mock');
  const orchestrator = {
    sendMessage: vi.fn(() => ({
      stream: (async function* done() {
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
    outputTokenRetryCap: 960,
    allowDestructiveToolCalls: true,
    maxContextCharsOverride: undefined,
    historyCharBudgetOverride: undefined,
    provider: { id: 'mock', label: 'Mock' },
    orchestrator,
    ensureConversation: vi.fn(async () => 'conv-1'),
    setLastError: noop as Dispatch<SetStateAction<string | null>>,
    setMessages: noop as Dispatch<SetStateAction<UiChatMessage[]>>,
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
    taskSessionRef: { current: { id: 't1', status: 'idle', updatedAt: '2026-01-01T00:00:00.000Z' } as AiTaskSession },
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
    ...over,
  };
}

function preflightStub(controller: AbortController): SendTurnPreflightContext {
  return {
    correlationId: 'snt-orchestration',
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
    dbConversation: { dbRef: null, activeConversationId: null },
    phaseState: emptyStreamPhaseState,
    timedOutBeforeFirstChunk: { current: false },
    sendStartedAtMs: 0,
    aiMetricTags: createMetricTags('ai-chat', { provider: 'mock', model: 'mock' }),
    recordCompletionSuccessMetric: vi.fn(),
    timeoutHandle: null,
    queueFlushAssistantDraft: vi.fn(),
    awaitQueuedPersistence: vi.fn().mockResolvedValue(undefined),
    finalizeAssistantMessage: vi.fn().mockResolvedValue(undefined),
    commitPrimaryStreamUsage: vi.fn(),
    agentLoopSourceUserText: 'hello',
    effectiveUserText: 'hello',
  };
}

const minimalOpening = {} as unknown as PersistOpeningTurnAndBuildPromptContextResult;

describe('runAiChatSendTurn orchestration', () => {
  beforeEach(() => {
    vi.mocked(runAiChatSendTurnPreflight).mockReset();
    vi.mocked(runAiChatSendTurnPersistAndPrimaryStream).mockReset();
    vi.mocked(runAiChatSendTurnStreamPhase).mockReset();
    vi.mocked(finalizeSendTurnStream).mockReset();
    vi.mocked(handleSendTurnStreamCatch).mockReset();
    vi.mocked(logSendTurnPhase).mockReset();
  });

  it('runs preflight → persist → stream phase and logs phases in order', async () => {
    const controller = new AbortController();
    vi.mocked(runAiChatSendTurnPreflight).mockResolvedValue(preflightStub(controller));
    vi.mocked(runAiChatSendTurnPersistAndPrimaryStream).mockResolvedValue({
      opening: minimalOpening,
      sendTurnConversationId: 'conv-1',
      stream: (async function* oneDone() {
        yield { done: true };
      })(),
      generationSource: 'local',
    });
    vi.mocked(runAiChatSendTurnStreamPhase).mockResolvedValue(undefined);

    await runAiChatSendTurn(makeSendTurnArgs());

    expect(runAiChatSendTurnPreflight).toHaveBeenCalledTimes(1);
    expect(runAiChatSendTurnPersistAndPrimaryStream).toHaveBeenCalledTimes(1);
    expect(runAiChatSendTurnStreamPhase).toHaveBeenCalledTimes(1);
    expect(handleSendTurnStreamCatch).not.toHaveBeenCalled();
    expect(finalizeSendTurnStream).toHaveBeenCalledTimes(1);

    const phases = vi.mocked(logSendTurnPhase).mock.calls.map((c) => c[1]);
    expect(phases).toEqual([
      'preflight_ok',
      'persist_primary_stream_start',
      'persist_primary_stream_ready',
      'stream_phase_start',
      'finally',
    ]);
  });

  it('invokes catch + finalize when persist layer throws', async () => {
    const controller = new AbortController();
    vi.mocked(runAiChatSendTurnPreflight).mockResolvedValue(preflightStub(controller));
    vi.mocked(runAiChatSendTurnPersistAndPrimaryStream).mockRejectedValue(new Error('persist failed'));

    await runAiChatSendTurn(makeSendTurnArgs());

    expect(handleSendTurnStreamCatch).toHaveBeenCalledTimes(1);
    expect(finalizeSendTurnStream).toHaveBeenCalledTimes(1);
    expect(runAiChatSendTurnStreamPhase).not.toHaveBeenCalled();
  });

  it('overrides lastError with persist-layer recovery hint after catch for known storage errors', async () => {
    const controller = new AbortController();
    const setLastError = vi.fn();
    vi.mocked(runAiChatSendTurnPreflight).mockResolvedValue(preflightStub(controller));
    vi.mocked(runAiChatSendTurnPersistAndPrimaryStream).mockRejectedValue(new Error('persist failed'));
    vi.mocked(handleSendTurnStreamCatch).mockResolvedValue(undefined);

    await runAiChatSendTurn(makeSendTurnArgs({
      setLastError: setLastError as unknown as Dispatch<SetStateAction<string | null>>,
    }));

    expect(setLastError).toHaveBeenCalledWith(
      tf('zh-CN', 'ai.chat.persistLayerRecoveryHint', { providerLabel: 'Mock' }),
    );
  });
});
