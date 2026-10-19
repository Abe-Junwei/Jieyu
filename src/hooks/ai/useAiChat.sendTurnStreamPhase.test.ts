// @vitest-environment jsdom

import type { Dispatch, SetStateAction } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChatOrchestrator } from '../../ai/ChatOrchestrator';
import { featureFlags } from '../../ai/config/featureFlags';
import { t } from '../../i18n';
import { getDefaultAiChatSettings } from '../../ai/providers/providerCatalog';
import { createMetricTags } from '../../observability/metrics';
import type { VerticalWorkflowOutputEnvelopeV0 } from '../../ai/vertical/verticalWorkflowSelection';
import { getVerticalWorkflowV0 } from '../../ai/vertical/verticalWorkflowRegistry';
import type { PersistOpeningTurnAndBuildPromptContextResult } from './useAiChat.sendPersistTurnAndBuildPromptContext';
import {
  createInitialSendTurnStreamPhaseState,
  runAiChatSendTurnStreamPhase,
  type RunAiChatSendTurnStreamPhaseInput,
} from './useAiChat.sendTurnStreamPhase';
import type {
  AiInteractionMetrics,
  AiSessionMemory,
  AiTaskSession,
  UiChatMessage,
} from './useAiChat.types';
import { finalizeAssistantStreamCompletion } from './useAiChat.streamCompletionPhase';
import { runAgentLoop, type AgentLoopRunnerResult } from './useAiChat.agentLoopRunner';
import {
  bumpConversationGeneration,
  createConversationGenerationRef,
} from '../../ai/chat/conversationGeneration';
import { createAssistantStream, type AssistantStreamChunk } from './useAiChat.streamFactory';
import * as localContextToolExecutors from '../../ai/chat/localContextToolExecutors';
import * as externalMcpTurnBridge from '../../ai/mcp/client/externalMcpTurnBridge';

const { runAiRuntimeV2TurnMock } = vi.hoisted(() => ({
  runAiRuntimeV2TurnMock: vi.fn(),
}));

vi.mock('../../ai/chat/localContextToolExecutors', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../ai/chat/localContextToolExecutors')>();
  return { ...actual, executeLocalContextToolCall: vi.fn() };
});

vi.mock('../../ai/mcp/client/externalMcpTurnBridge', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../ai/mcp/client/externalMcpTurnBridge')>();
  return {
    ...actual,
    listRuntimeV2ExternalMcpTools: vi.fn(async () => []),
    executeExternalMcpCall: vi.fn(),
  };
});

vi.mock('../../ai/runtime/aiRuntimeV2Turn', () => ({
  isNoToolsThisSession: () => false,
  createAiSdkModelFromSettings: () => ({ specificationVersion: 'v4' }),
  withLegacyFallback: async function* (primary: AsyncGenerator<unknown>) {
    yield* primary;
  },
  runAiRuntimeV2Turn: (params: unknown) => runAiRuntimeV2TurnMock(params),
}));

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
    responsePolicy: {
      locale: 'zh-CN',
      style: 'detailed',
    } as PersistOpeningTurnAndBuildPromptContextResult['responsePolicy'],
    routingPlan: {} as PersistOpeningTurnAndBuildPromptContextResult['routingPlan'],
    contextBlock: '',
    ragCitations: [],
    memoryRecallShape: undefined,
    clarifyFastPathCall: null,
    systemPrompt: 'system',
    verticalOutputEnvelopeSeed: null,
  };
}

function buildBaseInput(
  over: Partial<RunAiChatSendTurnStreamPhaseInput> = {},
): RunAiChatSendTurnStreamPhaseInput {
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
    conversationGenerationRef: createConversationGenerationRef(0),
    streamGenerationAtStart: 0,
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
    setConnectionTestStatus: noop as Dispatch<
      SetStateAction<import('./useAiChat.types').AiConnectionTestStatus>
    >,
    setConnectionTestMessage: noop as Dispatch<SetStateAction<string | null>>,
    setTaskSession: noop as Dispatch<SetStateAction<AiTaskSession>>,
    setMetrics: noop as Dispatch<SetStateAction<AiInteractionMetrics>>,
    setPendingToolCall: noop as Dispatch<
      SetStateAction<import('./useAiChat.types').PendingAiToolCall | null>
    >,
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
    onPushAdoptionItemsRef: { current: undefined },
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

  it('skips stream delta UI updates after conversation generation bump (G0c)', async () => {
    const generationRef = createConversationGenerationRef(0);
    const streamGenerationAtStart = generationRef.current;
    const setMessages = vi.fn();

    async function* deltas(): AsyncGenerator<AssistantStreamChunk> {
      yield { delta: 'before-clear' };
      bumpConversationGeneration(generationRef);
      yield { delta: 'after-clear' };
      yield { done: true };
    }

    const input = buildBaseInput({
      setMessages: setMessages as unknown as Dispatch<SetStateAction<UiChatMessage[]>>,
      conversationGenerationRef: generationRef,
      streamGenerationAtStart,
      stream: deltas(),
    });

    await runAiChatSendTurnStreamPhase(input);

    expect(setMessages).toHaveBeenCalledTimes(1);
    const firstUpdater = setMessages.mock.calls[0]?.[0];
    expect(typeof firstUpdater).toBe('function');
    if (typeof firstUpdater === 'function') {
      const assistantId = input.assistantId;
      const next = firstUpdater([
        { id: assistantId, role: 'assistant', content: '', status: 'streaming' },
      ]);
      expect(next.find((m: UiChatMessage) => m.id === assistantId)?.content).toBe('before-clear');
    }
  });

  it('after a conversation switch, a finished turn does not start another tool loop', async () => {
    const generationRef = createConversationGenerationRef(0);
    const streamGenerationAtStart = generationRef.current;
    bumpConversationGeneration(generationRef);
    const finalizeAssistantMessage = vi.fn().mockResolvedValue(undefined);
    async function* finished(): AsyncGenerator<AssistantStreamChunk> {
      yield { delta: 'kept' };
      yield { done: true };
    }
    await runAiChatSendTurnStreamPhase(
      buildBaseInput({
        conversationGenerationRef: generationRef,
        streamGenerationAtStart,
        finalizeAssistantMessage,
        stream: finished(),
      }),
    );
    expect(runAgentLoop).not.toHaveBeenCalled();
    expect(createAssistantStream).not.toHaveBeenCalled();
    expect(finalizeAssistantMessage).toHaveBeenCalledWith('done', 'final-body', undefined, [], '');
  });

  it('after a conversation switch, an error does not land on the new session', async () => {
    const generationRef = createConversationGenerationRef(0);
    const streamGenerationAtStart = generationRef.current;
    bumpConversationGeneration(generationRef);
    const setLastError = vi.fn();
    const finalizeAssistantMessage = vi.fn().mockResolvedValue(undefined);
    async function* failed(): AsyncGenerator<AssistantStreamChunk> {
      yield { error: 'boom' };
    }
    await runAiChatSendTurnStreamPhase(
      buildBaseInput({
        conversationGenerationRef: generationRef,
        streamGenerationAtStart,
        setLastError: setLastError as unknown as Dispatch<SetStateAction<string | null>>,
        finalizeAssistantMessage,
        stream: failed(),
      }),
    );
    expect(setLastError).not.toHaveBeenCalled();
    expect(runAgentLoop).not.toHaveBeenCalled();
    expect(finalizeAssistantMessage).toHaveBeenCalledWith('error', '', 'boom', [], '');
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
    expect(finalizeAssistantMessage).toHaveBeenCalledWith('done', '', undefined, [], '');
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
    expect(finalizeAssistantMessage).toHaveBeenCalledWith('done', 'final-body', undefined, [], '');
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
      status: 'degraded',
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
        workflow: getVerticalWorkflowV0('annotation_qa'),
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
    expect(env).toEqual(
      expect.objectContaining({
        verticalOutputEnvelopeSeed,
        verticalWorkflowSelection: expect.objectContaining({ workflowId: 'annotation_qa' }),
      }),
    );
    expect(auditInsert).toHaveBeenCalled();
    const payload = auditInsert.mock.calls.find(
      (call) => (call[0] as { field?: string }).field === 'ai_vertical_workflow_result',
    )?.[0] as
      { field: string; oldValue: string; newValue: string; metadataJson: string } | undefined;
    expect(payload?.oldValue).toBe('annotation_qa');
    expect(payload?.newValue).toBe('done');
    const meta = JSON.parse(payload!.metadataJson) as {
      completionPath: string;
      workflowId: string;
      envelope: { evidencePacketCount: number; status?: string };
    };
    expect(meta.completionPath).toBe('stream_done');
    expect(meta.workflowId).toBe('annotation_qa');
    expect(meta.envelope.evidencePacketCount).toBe(0);
    expect(meta.envelope.status).toBe('degraded');
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
    expect(finalizeAssistantMessage).toHaveBeenCalledWith('error', '', 'stream exploded', [], '');
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
    expect(createAssistantStream).toHaveBeenCalledWith(expect.objectContaining({ maxTokens: 50 }));
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

  it('pushes adoption items when elan_flex_compatibility report has adoptionCandidateIds', async () => {
    const reportJson = JSON.stringify({
      reportId: 'rpt-1',
      findings: [
        {
          findingId: 'f001',
          kind: 'tier_mapping',
          severity: 'warning',
          title: 'Tier mapping issue',
          description: 'desc',
          recommendedAction: 'fix it',
          adoptionCandidateId: 'adopt-1',
          evidencePackets: [
            {
              schemaVersion: 0,
              id: 'ep-1',
              sourceType: 'segment',
              sourceId: 'seg-1',
              quote: 'q',
              confidence: 0.8,
              reasonCode: 'rc',
            },
          ],
        },
        {
          findingId: 'f002',
          kind: 'time_gap',
          severity: 'info',
          title: 'No adoption',
          description: 'desc2',
          recommendedAction: 'ignore',
          evidencePackets: [],
        },
      ],
      summary: 'Two findings',
      exportTargets: ['elan', 'flex'],
    });
    vi.mocked(runAgentLoop).mockResolvedValue({
      resolvedContent: reportJson,
      resolvedStatus: 'done',
      resolvedErrorMessage: undefined,
      resolvedConnectionErrorMessage: undefined,
      resolvedLocalToolResults: undefined,
      loopExecuted: false,
      assistantReasoningContent: '',
      totalOutputTokens: 0,
      reportedInputTokens: 0,
    } as AgentLoopRunnerResult);
    const finalizeAssistantMessage = vi.fn().mockResolvedValue(undefined);
    const onPushAdoptionItems = vi.fn();
    async function* oneDone(): AsyncGenerator<AssistantStreamChunk> {
      yield { done: true };
    }
    const verticalOutputEnvelopeSeed: VerticalWorkflowOutputEnvelopeV0 = {
      schemaVersion: 0,
      workflowId: 'elan_flex_compatibility',
      writeMode: 'propose_only',
      outputKind: 'compatibility_report',
      evidencePackets: [],
      generatedAt: '2026-01-01T00:00:00.000Z',
      status: 'ready',
    };
    const input = buildBaseInput({
      finalizeAssistantMessage,
      stream: oneDone(),
      verticalOutputEnvelopeSeed,
      onPushAdoptionItemsRef: { current: onPushAdoptionItems },
    });

    await runAiChatSendTurnStreamPhase(input);

    expect(onPushAdoptionItems).toHaveBeenCalledTimes(1);
    const items = onPushAdoptionItems.mock.calls[0]![0];
    expect(items).toHaveLength(1);
    expect(items[0].workflowId).toBe('elan_flex_compatibility');
    expect(items[0].requestId).toBe('adopt-1');
    expect(items[0].evidencePacketIds).toEqual(['ep-1']);
  });

  it('marks composed workflow for reflection retry when reflection is flagged', async () => {
    vi.mocked(runAgentLoop).mockResolvedValue({
      resolvedContent: 'finding [1] [2]',
      resolvedStatus: 'done',
      resolvedErrorMessage: undefined,
      resolvedConnectionErrorMessage: undefined,
      resolvedLocalToolResults: undefined,
      loopExecuted: false,
      assistantReasoningContent: '',
      totalOutputTokens: 0,
      reportedInputTokens: 0,
    } as AgentLoopRunnerResult);
    const finalizeAssistantMessage = vi.fn().mockResolvedValue(undefined);
    async function* oneDone(): AsyncGenerator<AssistantStreamChunk> {
      yield { done: true };
    }
    const sessionMemory: AiSessionMemory = {
      composedWorkflowState: {
        templateId: 'annotation_qa_then_lexeme_candidates',
        currentStepIndex: 0,
        stepResults: {},
        status: 'running',
        originalUserText: 'test',
      },
    };
    const verticalOutputEnvelopeSeed: VerticalWorkflowOutputEnvelopeV0 = {
      schemaVersion: 0,
      workflowId: 'annotation_qa',
      writeMode: 'propose_only',
      outputKind: 'qa_findings',
      evidencePackets: [
        {
          schemaVersion: 0,
          id: 'ep-1',
          sourceType: 'segment',
          sourceId: 'seg-1',
          quote: 'q',
          confidence: 0.8,
          reasonCode: 'rc',
        },
      ],
      generatedAt: '2026-01-01T00:00:00.000Z',
      status: 'ready',
    };
    const input = buildBaseInput({
      finalizeAssistantMessage,
      stream: oneDone(),
      verticalOutputEnvelopeSeed,
      sessionMemoryRef: { current: sessionMemory },
    });

    await runAiChatSendTurnStreamPhase(input);

    expect(vi.mocked(runAgentLoop)).toHaveBeenCalledTimes(1);
    // sessionMemoryRef.current is reassigned, so inspect the ref, not the original variable
    const updatedComposed = input.sessionMemoryRef.current.composedWorkflowState;
    expect(updatedComposed!.pendingReflectionRetryStepIndex).toBe(0);
    expect(updatedComposed!.stepReflectionRetryCounts).toEqual({ 0: 1 });
  });

  describe('corpus_analysis_report', () => {
    const workflow = getVerticalWorkflowV0('corpus_analysis_report');
    const corpusSelection = {
      workflowId: 'corpus_analysis_report' as const,
      workflow,
      confidence: 1,
      source: 'rule_v0' as const,
      reasonCode: 'keyword_match' as const,
      matchedKeyword: '反例',
    };
    const corpusSeed: VerticalWorkflowOutputEnvelopeV0 = {
      schemaVersion: 0,
      workflowId: 'corpus_analysis_report',
      writeMode: 'read_only',
      outputKind: 'answer',
      evidencePackets: [],
      generatedAt: '2026-01-01T00:00:00.000Z',
      status: 'ready',
    };
    const claimsJson = JSON.stringify({
      claims: [{ claimId: 'c1', text: '文献也这样记。', rowIds: ['ev_ext_literature_h1'] }],
    });

    it('never stores the unverified draft, even when the stream errors', async () => {
      async function* deltaThenError(): AsyncGenerator<AssistantStreamChunk> {
        yield { delta: claimsJson };
        yield { error: 'boom' };
      }
      const finalizeAssistantMessage = vi.fn().mockResolvedValue(undefined);
      const queueFlushAssistantDraft = vi.fn();
      await runAiChatSendTurnStreamPhase(
        buildBaseInput({
          stream: deltaThenError(),
          finalizeAssistantMessage,
          queueFlushAssistantDraft,
          verticalWorkflowSelection: corpusSelection,
          verticalOutputEnvelopeSeed: corpusSeed,
        }),
      );
      expect(queueFlushAssistantDraft).not.toHaveBeenCalled();
      expect(finalizeAssistantMessage).toHaveBeenCalledWith('error', '', 'boom', [], '');
    });

    it('renders external evidence packets that reach finalize', async () => {
      vi.mocked(finalizeAssistantStreamCompletion).mockResolvedValue({
        finalContent: claimsJson,
        finalStatus: 'done',
        evidencePackets: [
          {
            schemaVersion: 0,
            id: 'ev_ext_literature_h1',
            sourceType: 'document',
            sourceId: 'h1',
            title: 'A Grammar',
            page: '42',
            quote: 'The suffix marks past tense.',
            confidence: 0.5,
            reasonCode: 'external_mcp_literature',
          },
        ],
      });
      vi.mocked(runAgentLoop).mockResolvedValue({
        resolvedContent: claimsJson,
        resolvedStatus: 'done',
        resolvedErrorMessage: undefined,
        resolvedConnectionErrorMessage: undefined,
        resolvedLocalToolResults: undefined,
        loopExecuted: false,
        assistantReasoningContent: '',
        totalOutputTokens: 0,
        reportedInputTokens: 0,
      } as AgentLoopRunnerResult);
      async function* oneDone(): AsyncGenerator<AssistantStreamChunk> {
        yield { delta: claimsJson };
        yield { done: true };
      }
      const finalizeAssistantMessage = vi.fn().mockResolvedValue(undefined);
      const queueFlushAssistantDraft = vi.fn();
      await runAiChatSendTurnStreamPhase(
        buildBaseInput({
          stream: oneDone(),
          finalizeAssistantMessage,
          queueFlushAssistantDraft,
          verticalWorkflowSelection: corpusSelection,
          verticalOutputEnvelopeSeed: corpusSeed,
        }),
      );
      expect(queueFlushAssistantDraft).not.toHaveBeenCalled();
      const stored = finalizeAssistantMessage.mock.calls[0]?.[1] as string;
      expect(stored).toBe('文献也这样记。\n- A Grammar p.42 「The suffix marks past tense.」');
    });

    it('checks claims against corpus tool results from the v2 turn', async () => {
      vi.mocked(localContextToolExecutors.executeLocalContextToolCall).mockResolvedValue({
        ok: true,
        name: 'concordance_kwic',
        result: {
          hits: [{ morphemeId: 'm2', unitId: 'u1', target: { form: 'ka', gloss: 'go' } }],
        },
      });
      const cited = JSON.stringify({
        claims: [{ claimId: 'c1', text: '过去时只出现在这个动词之后。', rowIds: ['m2'] }],
      });
      runAiRuntimeV2TurnMock.mockImplementation(async function* (params: {
        decide: (
          call: { name: string; arguments: Record<string, unknown>; requestId: string },
          mode: string,
        ) => Promise<unknown>;
      }) {
        await params.decide(
          { name: 'concordance_kwic', arguments: { gloss: 'go' }, requestId: 'r1' },
          'auto',
        );
        yield { delta: cited };
        yield { done: true };
      });
      vi.mocked(runAgentLoop).mockResolvedValue({
        resolvedContent: cited,
        resolvedStatus: 'done',
        resolvedErrorMessage: undefined,
        resolvedConnectionErrorMessage: undefined,
        resolvedLocalToolResults: undefined,
        loopExecuted: false,
        assistantReasoningContent: '',
        totalOutputTokens: 0,
        reportedInputTokens: 0,
      } as AgentLoopRunnerResult);
      const finalizeAssistantMessage = vi.fn().mockResolvedValue(undefined);
      await runAiChatSendTurnStreamPhase(
        buildBaseInput({
          stream: (async function* () {
            yield { done: true };
          })(),
          finalizeAssistantMessage,
          flags: { ...featureFlags, aiAgentRuntimeV2Enabled: true },
          verticalWorkflowSelection: corpusSelection,
          verticalOutputEnvelopeSeed: corpusSeed,
        }),
      );
      const loopState = vi.mocked(runAgentLoop).mock.calls[0]?.[1];
      expect(loopState?.resolvedLocalToolResults).toBeUndefined();
      expect(localContextToolExecutors.executeLocalContextToolCall).toHaveBeenCalled();
      const stored = finalizeAssistantMessage.mock.calls[0]?.[1] as string;
      expect(stored).toBe('过去时只出现在这个动词之后。\n- u1 ka go');
    });

    it('checks claims against external evidence returned by the v2 turn', async () => {
      const toolName = 'extmcp__https---mcp.example.test-mcp__search_literature';
      vi.mocked(externalMcpTurnBridge.listRuntimeV2ExternalMcpTools).mockResolvedValue([
        {
          name: toolName,
          origin: 'https://mcp.example.test/mcp',
          toolName: 'search_literature',
          description: 'Search.',
          inputSchema: { type: 'object', properties: {} },
        },
      ]);
      vi.mocked(externalMcpTurnBridge.executeExternalMcpCall).mockResolvedValue({
        name: toolName,
        ok: true,
        evidencePackets: [
          {
            schemaVersion: 0,
            id: 'ev_ext_literature_h1',
            sourceType: 'document',
            sourceId: 'h1',
            title: 'A Grammar',
            page: '42',
            quote: 'The suffix marks past tense.',
            confidence: 0.5,
            reasonCode: 'external_mcp_literature',
          },
        ],
      });
      runAiRuntimeV2TurnMock.mockImplementation(async function* (params: {
        decide: (
          call: { name: string; arguments: Record<string, unknown>; requestId: string },
          mode: string,
        ) => Promise<unknown>;
      }) {
        await params.decide({ name: toolName, arguments: {}, requestId: 'r1' }, 'auto');
        yield { delta: claimsJson };
        yield { done: true };
      });
      vi.mocked(runAgentLoop).mockResolvedValue({
        resolvedContent: claimsJson,
        resolvedStatus: 'done',
        resolvedErrorMessage: undefined,
        resolvedConnectionErrorMessage: undefined,
        resolvedLocalToolResults: undefined,
        loopExecuted: false,
        assistantReasoningContent: '',
        totalOutputTokens: 0,
        reportedInputTokens: 0,
      } as AgentLoopRunnerResult);
      const finalizeAssistantMessage = vi.fn().mockResolvedValue(undefined);
      await runAiChatSendTurnStreamPhase(
        buildBaseInput({
          stream: (async function* () {
            yield { done: true };
          })(),
          finalizeAssistantMessage,
          flags: {
            ...featureFlags,
            aiAgentRuntimeV2Enabled: true,
            aiExternalMcpSendTurnEnabled: true,
            aiExternalMcpTrustEnabled: true,
          },
          verticalWorkflowSelection: corpusSelection,
          verticalOutputEnvelopeSeed: corpusSeed,
        }),
      );
      const stored = finalizeAssistantMessage.mock.calls[0]?.[1] as string;
      expect(stored).toBe('文献也这样记。\n- A Grammar p.42 「The suffix marks past tense.」');
    });
  });

  it('runs list_units on v2 and does not continue the old loop', async () => {
    vi.mocked(localContextToolExecutors.executeLocalContextToolCall).mockResolvedValue({
      ok: true,
      name: 'list_units',
      result: { matches: [{ unitId: 'u1' }], _readModel: { source: 'timeline_index' } },
    });
    runAiRuntimeV2TurnMock.mockImplementation(async function* (params: {
      decide: (
        call: { name: string; arguments: Record<string, unknown>; requestId: string },
        mode: string,
      ) => Promise<{ finalContent: string }>;
    }) {
      const decision = await params.decide(
        { name: 'list_units', arguments: { limit: 8 }, requestId: 'r1' },
        'auto',
      );
      yield { delta: decision.finalContent };
      yield { done: true };
    });
    vi.mocked(runAgentLoop).mockImplementation(async (_deps, state) => ({
      resolvedContent: state.resolvedContent,
      resolvedStatus: state.resolvedStatus,
      resolvedErrorMessage: state.resolvedErrorMessage,
      resolvedConnectionErrorMessage: state.resolvedConnectionErrorMessage,
      resolvedLocalToolResults: state.resolvedLocalToolResults,
      loopExecuted: false,
      assistantReasoningContent: '',
      totalOutputTokens: 0,
      reportedInputTokens: 0,
    }));
    const finalizeAssistantMessage = vi.fn().mockResolvedValue(undefined);
    await runAiChatSendTurnStreamPhase(
      buildBaseInput({
        stream: (async function* () {
          yield { done: true };
        })(),
        finalizeAssistantMessage,
        flags: { ...featureFlags, aiAgentRuntimeV2Enabled: true },
      }),
    );
    const loopState = vi.mocked(runAgentLoop).mock.calls.at(-1)?.[1];
    expect(loopState?.resolvedLocalToolResults).toBeUndefined();
    const stored = finalizeAssistantMessage.mock.calls[0]?.[1] as string;
    expect(stored).toContain('u1');
    expect(stored).not.toContain('_readModel');
  });

  it('holds batch_apply for approval and returns the preview only after that', async () => {
    const execute = vi.mocked(localContextToolExecutors.executeLocalContextToolCall);
    execute.mockClear();
    execute.mockResolvedValue({
      ok: true,
      name: 'batch_apply',
      result: {
        items: [{ preview: 'Would apply verify to u1' }],
        _readModel: { source: 'segment_meta' },
      },
    });
    const setPendingToolCall = vi.fn();
    runAiRuntimeV2TurnMock.mockImplementation(async function* (params: {
      decide: (
        call: { name: string; arguments: Record<string, unknown>; requestId: string },
        mode: string,
      ) => Promise<{ finalContent: string; pending: boolean }>;
      requestApproval: (
        call: { name: string; arguments: Record<string, unknown>; requestId: string },
        approvalId: string,
      ) => Promise<{ pending: boolean; text: string }>;
    }) {
      const missing = await params.requestApproval(
        { name: 'batch_apply', arguments: {}, requestId: 'r0' },
        'approval-0',
      );
      expect(missing.pending).toBe(false);
      expect(execute).not.toHaveBeenCalled();
      const held = await params.requestApproval(
        { name: 'batch_apply', arguments: { action: 'verify', unitIds: ['u1'] }, requestId: 'r1' },
        'approval-1',
      );
      expect(held.pending).toBe(true);
      expect(execute).not.toHaveBeenCalled();
      const early = await params.decide(
        { name: 'batch_apply', arguments: { action: 'verify', unitIds: ['u1'] }, requestId: 'r1' },
        'auto',
      );
      expect(early.pending).toBe(false);
      expect(execute).not.toHaveBeenCalled();
      const decision = await params.decide(
        { name: 'batch_apply', arguments: { action: 'verify', unitIds: ['u1'] }, requestId: 'r1' },
        'approved',
      );
      yield { delta: decision.finalContent };
      yield { done: true };
    });
    vi.mocked(runAgentLoop).mockImplementation(async (_deps, state) => ({
      resolvedContent: state.resolvedContent,
      resolvedStatus: state.resolvedStatus,
      resolvedErrorMessage: state.resolvedErrorMessage,
      resolvedConnectionErrorMessage: state.resolvedConnectionErrorMessage,
      resolvedLocalToolResults: state.resolvedLocalToolResults,
      loopExecuted: false,
      assistantReasoningContent: '',
      totalOutputTokens: 0,
      reportedInputTokens: 0,
    }));
    const finalizeAssistantMessage = vi.fn().mockResolvedValue(undefined);
    await runAiChatSendTurnStreamPhase(
      buildBaseInput({
        stream: (async function* () {
          yield { done: true };
        })(),
        finalizeAssistantMessage,
        setPendingToolCall,
        flags: { ...featureFlags, aiAgentRuntimeV2Enabled: true },
      }),
    );
    const card = setPendingToolCall.mock.calls.at(-1)?.[0] as {
      runtimeV2?: { approvalId: string };
      impactPreview?: string[];
    };
    expect(card.runtimeV2?.approvalId).toBe('approval-1');
    expect(card.impactPreview).toEqual(['verify u1']);
    const loopState = vi.mocked(runAgentLoop).mock.calls.at(-1)?.[1];
    expect(loopState?.resolvedLocalToolResults).toBeUndefined();
    const stored = finalizeAssistantMessage.mock.calls[0]?.[1] as string;
    expect(stored).toContain('Would apply verify to u1');
    expect(stored).not.toContain('_readModel');
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('shows an MCP input card without giving the prompt to the model', async () => {
    const toolName = 'extmcp__https---mcp.example.test-mcp__search_works';
    vi.mocked(externalMcpTurnBridge.listRuntimeV2ExternalMcpTools).mockResolvedValue([
      {
        name: toolName,
        origin: 'https://mcp.example.test/mcp',
        toolName: 'search_works',
        description: 'Search.',
        inputSchema: { type: 'object', properties: {} },
      },
    ]);
    vi.mocked(externalMcpTurnBridge.executeExternalMcpCall).mockResolvedValue({
      name: toolName,
      ok: false,
      reason: 'input_required',
      form: {
        origin: 'https://mcp.example.test/mcp',
        toolName: 'search_works',
        arguments: {},
        requestState: 'opaque-state',
        requests: [
          {
            id: 'github_login',
            message: 'Please provide your GitHub username',
            fields: [{ name: 'name', required: true }],
          },
        ],
      },
    });
    runAiRuntimeV2TurnMock.mockImplementation(async function* (params: {
      decide: (
        call: { name: string; arguments: Record<string, unknown>; requestId: string },
        mode: string,
      ) => Promise<{ finalContent: string }>;
    }) {
      const decision = await params.decide(
        { name: toolName, arguments: {}, requestId: 'r1' },
        'auto',
      );
      yield { delta: decision.finalContent };
      yield { done: true };
    });
    vi.mocked(runAgentLoop).mockImplementation(async (_deps, state) => ({
      resolvedContent: state.resolvedContent,
      resolvedStatus: state.resolvedStatus,
      resolvedErrorMessage: state.resolvedErrorMessage,
      resolvedConnectionErrorMessage: state.resolvedConnectionErrorMessage,
      resolvedLocalToolResults: state.resolvedLocalToolResults,
      loopExecuted: false,
      assistantReasoningContent: '',
      totalOutputTokens: 0,
      reportedInputTokens: 0,
    }));
    const setPendingToolCall = vi.fn();
    const finalizeAssistantMessage = vi.fn().mockResolvedValue(undefined);
    await runAiChatSendTurnStreamPhase(
      buildBaseInput({
        stream: (async function* () {
          yield { done: true };
        })(),
        finalizeAssistantMessage,
        setPendingToolCall,
        flags: {
          ...featureFlags,
          aiAgentRuntimeV2Enabled: true,
          aiExternalMcpSendTurnEnabled: true,
          aiExternalMcpTrustEnabled: true,
        },
      }),
    );
    const card = setPendingToolCall.mock.calls.at(-1)?.[0] as {
      mcpInput?: { requestState?: string; requests: Array<{ message: string }> };
    };
    expect(card.mcpInput?.requests[0]?.message).toBe('Please provide your GitHub username');
    const stored = finalizeAssistantMessage.mock.calls[0]?.[1] as string;
    expect(stored).toContain(t('zh-CN', 'ai.externalMcp.inputNeeded'));
    expect(stored).not.toContain('opaque-state');
    expect(stored).not.toContain('GitHub');
  });
});
