// @vitest-environment jsdom

import type { Dispatch, SetStateAction } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChatOrchestrator } from '../ai/ChatOrchestrator';
import { featureFlags } from '../ai/config/featureFlags';
import { getDefaultAiChatSettings } from '../ai/providers/providerCatalog';
import { createMetricTags } from '../observability/metrics';
import type { VerticalWorkflowOutputEnvelopeV0 } from '../ai/vertical/verticalWorkflowSelection';
import type { PersistOpeningTurnAndBuildPromptContextResult } from './useAiChat.sendPersistTurnAndBuildPromptContext';
import {
  createInitialSendTurnStreamPhaseState,
  runAiChatSendTurnStreamPhase,
  type RunAiChatSendTurnStreamPhaseInput,
} from './useAiChat.sendTurnStreamPhase';
import type { AiInteractionMetrics, AiSessionMemory, AiTaskSession, UiChatMessage } from './useAiChat.types';
import { finalizeAssistantStreamCompletion } from './useAiChat.streamCompletionPhase';
import { runAgentLoop, type AgentLoopRunnerResult } from './useAiChat.agentLoopRunner';
import { createAssistantStream, type AssistantStreamChunk } from './useAiChat.streamFactory';

vi.mock('react-dom', () => ({
  flushSync: (fn: () => void) => {
    fn();
  },
}));

vi.mock('./useAiChat.streamCompletionPhase', () => ({
  finalizeAssistantStreamCompletion: vi.fn(),
}));

vi.mock('./useAiChat.agentLoopRunner', () => ({
  runAgentLoop: vi.fn(),
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

function buildOpening(): PersistOpeningTurnAndBuildPromptContextResult {
  const db = {
    collections: {
      ai_messages: { update: vi.fn().mockResolvedValue(undefined) },
      audit_logs: { insert: vi.fn().mockResolvedValue(undefined) },
    },
  };
  return {
    db: db as unknown as PersistOpeningTurnAndBuildPromptContextResult['db'],
    activeConversationId: 'conv-1',
    history: [],
    historyCharBudget: 8000,
    maxContextChars: 32000,
    aiContext: null,
    responsePolicy: { locale: 'zh-CN', style: 'detailed' } as PersistOpeningTurnAndBuildPromptContextResult['responsePolicy'],
    routingPlan: {} as PersistOpeningTurnAndBuildPromptContextResult['routingPlan'],
    contextBlock: '',
    ragCitations: [],
    memoryRecallShape: undefined,
    clarifyFastPathCall: null,
    systemPrompt: 'system',
  };
}

function buildBaseInput(over: Partial<RunAiChatSendTurnStreamPhaseInput> = {}): RunAiChatSendTurnStreamPhaseInput {
  const assistantId = 'ast-stream';
  const assistantMsg: UiChatMessage = {
    id: assistantId,
    role: 'assistant',
    content: '',
    status: 'streaming',
    generationSource: 'local',
    generationModel: '',
    reasoningContent: '',
  };
  const noop = vi.fn();
  const noopAsync = vi.fn().mockResolvedValue(undefined);
  const controller = new AbortController();
  const settings = getDefaultAiChatSettings('mock');
  const taskSession: AiTaskSession = {
    id: 'task-1',
    status: 'idle',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };

  return {
    phaseState: createInitialSendTurnStreamPhaseState(),
    commitPrimaryStreamUsage: vi.fn(),
    recordCompletionSuccessMetric: vi.fn(),
    opening: buildOpening(),
    sendTurnConversationId: 'conv-1',
    stream: (async function* empty() {
      return;
    })(),
    generationSource: 'local',
    controller,
    effectiveUserText: 'hi',
    agentLoopSourceUserText: 'hi',
    resumeCheckpoint: null,
    verticalWorkflowSelection: null,
    verticalOutputEnvelopeSeed: null,
    userMsg: { id: 'usr-1', role: 'user', content: 'hi', status: 'done' },
    assistantId,
    shouldTrackRemoteStatus: false,
    timeoutHandle: null,
    sendStartedAtMs: 0,
    aiMetricTags: createMetricTags('ai-chat', { provider: 'mock', model: 'mock' }),
    queueFlushAssistantDraft: vi.fn(),
    awaitQueuedPersistence: noopAsync,
    finalizeAssistantMessage: noopAsync,
    provider: { id: 'mock', label: 'Mock' },
    flags: featureFlags,
    orchestrator: {} as unknown as ChatOrchestrator,
    outputTokenCap: 480,
    outputTokenRetryCap: 960,
    clearPendingAgentLoopCheckpoint: vi.fn(),
    setLastError: noop as Dispatch<SetStateAction<string | null>>,
    setMessages: noop as Dispatch<SetStateAction<UiChatMessage[]>>,
    setConnectionTestStatus: noop as Dispatch<SetStateAction<import('./useAiChat.types').AiConnectionTestStatus>>,
    setConnectionTestMessage: noop as Dispatch<SetStateAction<string | null>>,
    setTaskSession: noop as Dispatch<SetStateAction<AiTaskSession>>,
    setMetrics: noop as Dispatch<SetStateAction<AiInteractionMetrics>>,
    setPendingToolCall: noop as Dispatch<SetStateAction<import('./useAiChat.types').PendingAiToolCall | null>>,
    messagesRef: { current: [assistantMsg] },
    metricsRef: { current: { ...zeroMetrics } },
    sessionMemoryRef: { current: {} as AiSessionMemory },
    settingsRef: { current: settings },
    toolFeedbackLocaleRef: { current: 'zh-CN' },
    getContextRef: { current: () => null },
    toolDecisionModeRef: { current: 'enabled' },
    onToolRiskCheckRef: { current: undefined },
    preparePendingToolCallRef: { current: undefined },
    onToolCallRef: { current: undefined },
    taskSessionRef: { current: taskSession },
    backgroundMemoryRuntimeRef: { current: null },
    allowDestructiveToolCalls: true,
    hasPersistedExecutionForRequest: vi.fn(async () => false),
    writeToolDecisionAuditLog: noopAsync,
    writeToolIntentAuditLog: noopAsync,
    markExecutedRequestId: noop,
    bumpMetric: noop,
    localToolCallCountRef: { current: 0 },
    ...over,
  };
}

describe('runAiChatSendTurnStreamPhase', () => {
  beforeEach(() => {
    vi.mocked(finalizeAssistantStreamCompletion).mockReset();
    vi.mocked(runAgentLoop).mockReset();
    vi.mocked(createAssistantStream).mockReset();
    vi.mocked(finalizeAssistantStreamCompletion).mockResolvedValue({
      finalContent: 'final-body',
      finalStatus: 'done',
    });
    vi.mocked(runAgentLoop).mockResolvedValue({
      resolvedContent: 'final-body',
      resolvedStatus: 'done',
      resolvedErrorMessage: undefined,
      resolvedConnectionErrorMessage: undefined,
      resolvedLocalToolResults: undefined,
      loopExecuted: false,
      assistantReasoningContent: '',
      totalOutputTokens: 0,
      reportedInputTokens: 0,
    } as AgentLoopRunnerResult);
  });

  it('finalizes an empty stream as done without calling completion helpers', async () => {
    const finalizeAssistantMessage = vi.fn().mockResolvedValue(undefined);
    const recordCompletionSuccessMetric = vi.fn();
    const input = buildBaseInput({
      finalizeAssistantMessage,
      recordCompletionSuccessMetric,
      stream: (async function* noYield() {
        return;
      })(),
    });

    await runAiChatSendTurnStreamPhase(input);

    expect(finalizeAssistantStreamCompletion).not.toHaveBeenCalled();
    expect(runAgentLoop).not.toHaveBeenCalled();
    expect(finalizeAssistantMessage).toHaveBeenCalledTimes(1);
    expect(finalizeAssistantMessage).toHaveBeenCalledWith(
      'done',
      '',
      undefined,
      [],
      '',
    );
    expect(recordCompletionSuccessMetric).toHaveBeenCalledTimes(1);
  });

  it('runs completion + agent loop when stream yields done', async () => {
    const finalizeAssistantMessage = vi.fn().mockResolvedValue(undefined);
    const recordCompletionSuccessMetric = vi.fn();
    async function* oneDone(): AsyncGenerator<AssistantStreamChunk> {
      yield { done: true };
    }
    const input = buildBaseInput({
      finalizeAssistantMessage,
      recordCompletionSuccessMetric,
      stream: oneDone(),
    });

    await runAiChatSendTurnStreamPhase(input);

    expect(finalizeAssistantStreamCompletion).toHaveBeenCalledTimes(1);
    expect(runAgentLoop).toHaveBeenCalledTimes(1);
    expect(finalizeAssistantMessage).toHaveBeenCalledTimes(1);
    expect(finalizeAssistantMessage).toHaveBeenCalledWith(
      'done',
      'final-body',
      undefined,
      [],
      '',
    );
    expect(recordCompletionSuccessMetric).toHaveBeenCalledTimes(1);
  });

  it('forwards vertical envelope seed into completion env for downstream consumers', async () => {
    const finalizeAssistantMessage = vi.fn().mockResolvedValue(undefined);
    const auditInsert = vi.fn().mockResolvedValue(undefined);
    const opening = {
      ...buildOpening(),
      db: {
        collections: {
          ai_messages: { update: vi.fn().mockResolvedValue(undefined) },
          audit_logs: { insert: auditInsert },
        },
      },
    } as unknown as PersistOpeningTurnAndBuildPromptContextResult;
    const verticalOutputEnvelopeSeed: VerticalWorkflowOutputEnvelopeV0 = {
      schemaVersion: 0,
      workflowId: 'annotation_qa',
      writeMode: 'propose_only',
      outputKind: 'qa_findings',
      evidencePackets: [],
      generatedAt: '2026-01-01T00:00:00.000Z',
    };
    async function* oneDone(): AsyncGenerator<AssistantStreamChunk> {
      yield { done: true };
    }
    const input = buildBaseInput({
      finalizeAssistantMessage,
      opening,
      stream: oneDone(),
      verticalWorkflowSelection: {
        workflowId: 'annotation_qa',
        workflow: {
          id: 'annotation_qa',
          labelKey: 'msg.ai.vertical.workflow.annotationQa',
          inputScope: 'selection',
          outputKind: 'qa_findings',
          writeMode: 'propose_only',
          requiredCapabilities: ['read.segment'],
        },
        confidence: 0.84,
        source: 'rule_v0',
        reasonCode: 'keyword_match',
        matchedKeyword: 'qa',
      },
      verticalOutputEnvelopeSeed,
    });

    await runAiChatSendTurnStreamPhase(input);

    expect(finalizeAssistantStreamCompletion).toHaveBeenCalledTimes(1);
    const env = vi.mocked(finalizeAssistantStreamCompletion).mock.calls[0]?.[1];
    expect(env).toBeTruthy();
    expect(env).toEqual(expect.objectContaining({
      verticalOutputEnvelopeSeed,
      verticalWorkflowSelection: expect.objectContaining({ workflowId: 'annotation_qa' }),
    }));
    expect(auditInsert).toHaveBeenCalled();
    const payload = auditInsert.mock.calls.find((call) => (call[0] as { field?: string }).field === 'ai_vertical_workflow_result')?.[0] as
      | { field: string; oldValue: string; newValue: string; metadataJson: string }
      | undefined;
    expect(payload?.oldValue).toBe('annotation_qa');
    expect(payload?.newValue).toBe('done');
    const meta = JSON.parse(payload!.metadataJson) as {
      completionPath: string;
      workflowId: string;
      envelope: { evidencePacketCount: number };
    };
    expect(meta.completionPath).toBe('stream_done');
    expect(meta.workflowId).toBe('annotation_qa');
    expect(meta.envelope.evidencePacketCount).toBe(0);
  });

  it('maps stream chunk errors to assistant error + lastError', async () => {
    const finalizeAssistantMessage = vi.fn().mockResolvedValue(undefined);
    const setLastError = vi.fn();
    async function* errChunk(): AsyncGenerator<AssistantStreamChunk> {
      yield { error: 'stream exploded' };
    }
    const input = buildBaseInput({
      finalizeAssistantMessage,
      setLastError: setLastError as unknown as Dispatch<SetStateAction<string | null>>,
      stream: errChunk(),
    });

    await runAiChatSendTurnStreamPhase(input);

    expect(finalizeAssistantStreamCompletion).not.toHaveBeenCalled();
    expect(runAgentLoop).not.toHaveBeenCalled();
    expect(finalizeAssistantMessage).toHaveBeenCalledWith(
      'error',
      '',
      'stream exploded',
      [],
      '',
    );
    expect(setLastError).toHaveBeenCalledWith('stream exploded');
  });

  it('does not call createAssistantStream for output-cap retry when generationSource is not llm', async () => {
    const finalizeAssistantMessage = vi.fn().mockResolvedValue(undefined);
    async function* usageThenDone(): AsyncGenerator<AssistantStreamChunk> {
      yield { usage: { outputTokens: 100, inputTokens: 0, totalTokens: 100 } };
      yield { done: true };
    }
    const input = buildBaseInput({
      finalizeAssistantMessage,
      generationSource: 'local',
      outputTokenCap: 10,
      outputTokenRetryCap: 50,
      stream: usageThenDone(),
    });

    await runAiChatSendTurnStreamPhase(input);

    expect(createAssistantStream).not.toHaveBeenCalled();
    expect(finalizeAssistantStreamCompletion).toHaveBeenCalledTimes(1);
  });

  it('runs output-cap retry stream and persists upgraded generation metadata on success', async () => {
    vi.mocked(createAssistantStream).mockReturnValue({
      stream: (async function* retryOk() {
        yield { delta: 'R', done: true };
      })(),
      generationSource: 'llm',
      generationModel: 'retry-model',
    });
    const writeToolDecisionAuditLog = vi.fn().mockResolvedValue(undefined);
    const finalizeAssistantMessage = vi.fn().mockResolvedValue(undefined);
    const updateSpy = vi.fn().mockResolvedValue(undefined);
    const opening = {
      ...buildOpening(),
      db: {
        collections: {
          ai_messages: { update: updateSpy },
          audit_logs: { insert: vi.fn().mockResolvedValue(undefined) },
        },
      },
    } as unknown as PersistOpeningTurnAndBuildPromptContextResult;

    async function* primaryOverCap(): AsyncGenerator<AssistantStreamChunk> {
      yield { usage: { outputTokens: 10, inputTokens: 1, totalTokens: 11 } };
      yield { done: true };
    }

    const input = buildBaseInput({
      opening,
      writeToolDecisionAuditLog,
      finalizeAssistantMessage,
      generationSource: 'llm',
      outputTokenCap: 10,
      outputTokenRetryCap: 50,
      stream: primaryOverCap(),
    });

    await runAiChatSendTurnStreamPhase(input);

    expect(createAssistantStream).toHaveBeenCalledTimes(1);
    expect(createAssistantStream).toHaveBeenCalledWith(
      expect.objectContaining({ maxTokens: 50 }),
    );
    expect(writeToolDecisionAuditLog).toHaveBeenCalled();
    const joined = writeToolDecisionAuditLog.mock.calls.map((c) => String(c[2])).join('|');
    expect(joined).toContain('capped:cost_guard:output_token_cap_exceeded');
    expect(joined).toContain('confirmed:cost_guard:retry_budget_upgrade');
    expect(updateSpy).toHaveBeenCalled();
    expect(finalizeAssistantStreamCompletion).toHaveBeenCalledTimes(1);
    expect(finalizeAssistantMessage).toHaveBeenCalledTimes(1);
  });

  it('audits retry failure when output-cap upgrade stream returns an error chunk', async () => {
    vi.mocked(createAssistantStream).mockReturnValue({
      stream: (async function* retryErr() {
        yield { error: 'retry stream failed' };
      })(),
      generationSource: 'llm',
      generationModel: 'retry-model',
    });
    const writeToolDecisionAuditLog = vi.fn().mockResolvedValue(undefined);
    const finalizeAssistantMessage = vi.fn().mockResolvedValue(undefined);
    async function* primaryOverCap(): AsyncGenerator<AssistantStreamChunk> {
      yield { usage: { outputTokens: 10, inputTokens: 0, totalTokens: 10 } };
      yield { done: true };
    }
    const input = buildBaseInput({
      writeToolDecisionAuditLog,
      finalizeAssistantMessage,
      generationSource: 'llm',
      outputTokenCap: 10,
      outputTokenRetryCap: 50,
      stream: primaryOverCap(),
    });

    await runAiChatSendTurnStreamPhase(input);

    const joined = writeToolDecisionAuditLog.mock.calls.map((c) => String(c[2])).join('|');
    expect(joined).toContain('failed:cost_guard:retry_budget_upgrade_failed');
    expect(finalizeAssistantStreamCompletion).toHaveBeenCalledTimes(1);
    expect(finalizeAssistantMessage).toHaveBeenCalledTimes(1);
  });
});
