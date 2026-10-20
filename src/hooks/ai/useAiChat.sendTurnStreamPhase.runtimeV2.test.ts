// @vitest-environment jsdom
/**
 * The send-turn stream phase on the real ToolLoopAgent turn (runAiRuntimeV2Turn).
 * Only the language model, the MCP transport and the local tool executor are mocked.
 */
import type { Dispatch, SetStateAction } from 'react';
import { renderHook } from '@testing-library/react';
import { simulateReadableStream } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChatOrchestrator } from '../../ai/ChatOrchestrator';
import { featureFlags } from '../../ai/config/featureFlags';
import { getDefaultAiChatSettings } from '../../ai/providers/providerCatalog';
import { createMetricTags } from '../../observability/metrics';
import { db } from '../../db';
import {
  bumpConversationGeneration,
  createConversationGenerationRef,
} from '../../ai/chat/conversationGeneration';
import { loadTurnState, unansweredApprovals } from '../../ai/runtime/aiRuntimeV2Pending';
import { PILOT_TOOL_SEARCH_NAME } from '../../ai/runtime/toolLoopAgentPilot';
import * as localContextToolExecutors from '../../ai/chat/localContextToolExecutors';
import * as externalMcpTurnBridge from '../../ai/mcp/client/externalMcpTurnBridge';
import type { PersistOpeningTurnAndBuildPromptContextResult } from './useAiChat.sendPersistTurnAndBuildPromptContext';
import {
  createInitialSendTurnStreamPhaseState,
  runAiChatSendTurnStreamPhase,
  type RunAiChatSendTurnStreamPhaseInput,
} from './useAiChat.sendTurnStreamPhase';
import { useAiChatPendingToolCall } from './useAiChat.pendingToolCall';
import { runAgentLoop } from './useAiChat.agentLoopRunner';
import type {
  AiInteractionMetrics,
  AiSessionMemory,
  AiTaskSession,
  PendingAiToolCall,
  UiChatMessage,
} from './useAiChat.types';

const { modelRef } = vi.hoisted(() => ({ modelRef: { current: null as unknown } }));

vi.mock('../../ai/runtime/aiRuntimeV2Turn', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../ai/runtime/aiRuntimeV2Turn')>();
  return { ...actual, createAiSdkModelFromSettings: () => modelRef.current };
});

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

vi.mock('react-dom', () => ({ flushSync: (fn: () => void) => fn() }));

vi.mock('./useAiChat.agentLoopRunner', () => ({ runAgentLoop: vi.fn() }));

const usage = {
  inputTokens: { total: 3, noCache: 3, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 2, text: 2, reasoning: 0 },
};

function toolCallsStream(calls: Array<[string, string]>) {
  return {
    stream: simulateReadableStream({
      chunks: [
        { type: 'stream-start' as const, warnings: [] },
        ...calls.map(([toolName, input]) => ({
          type: 'tool-call' as const,
          toolCallId: `c-${toolName}`,
          toolName,
          input,
        })),
        {
          type: 'finish' as const,
          finishReason: { unified: 'tool-calls' as const, raw: undefined },
          usage,
        },
      ],
    }),
  };
}

function searchStream(query: string) {
  return toolCallsStream([[PILOT_TOOL_SEARCH_NAME, JSON.stringify({ query })]]);
}

function textStream(text: string) {
  return {
    stream: simulateReadableStream({
      chunks: [
        { type: 'stream-start' as const, warnings: [] },
        { type: 'text-start' as const, id: 't' },
        { type: 'text-delta' as const, id: 't', delta: text },
        { type: 'text-end' as const, id: 't' },
        {
          type: 'finish' as const,
          finishReason: { unified: 'stop' as const, raw: undefined },
          usage,
        },
      ],
    }),
  };
}

const EXT_TOOL = 'extmcp__mcp-example-test-search_works__0badc0de';
const ORIGIN = 'https://mcp.example.test/mcp';

function mcpForm(requestState: string) {
  return {
    origin: ORIGIN,
    toolName: 'search_works',
    arguments: {},
    requestState,
    requests: [
      {
        id: 'github_login',
        message: 'Please provide your GitHub username',
        fields: [{ name: 'name', required: true }],
      },
    ],
  };
}

function buildOpening(): PersistOpeningTurnAndBuildPromptContextResult {
  const fakeDb = {
    collections: {
      ai_messages: { update: vi.fn().mockResolvedValue(undefined) },
      audit_logs: { insert: vi.fn().mockResolvedValue(undefined) },
    },
  };
  return {
    db: fakeDb as unknown as PersistOpeningTurnAndBuildPromptContextResult['db'],
    activeConversationId: 'conv-1',
    history: [],
    historyCharBudget: 8000,
    maxContextChars: 32000,
    aiContext: null,
    responsePolicy: {
      locale: 'en-US',
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

interface Harness {
  input: RunAiChatSendTurnStreamPhaseInput;
  cards: Array<PendingAiToolCall | null>;
  audits: string[];
  stored: () => string | undefined;
}

function buildHarness(
  over: Partial<RunAiChatSendTurnStreamPhaseInput> = {},
  flags: Partial<typeof featureFlags> = {},
): Harness {
  const assistantId = 'ast-v2';
  const cards: Array<PendingAiToolCall | null> = [];
  const audits: string[] = [];
  const finalizeAssistantMessage = vi.fn().mockResolvedValue(undefined);
  const noop = vi.fn();
  const settings = { ...getDefaultAiChatSettings('deepseek'), apiKey: 'k' };
  const taskSession: AiTaskSession = { id: 'task-1', status: 'idle', updatedAt: '' };
  const assistantMsg: UiChatMessage = {
    id: assistantId,
    role: 'assistant',
    content: '',
    status: 'streaming',
  };
  const input: RunAiChatSendTurnStreamPhaseInput = {
    phaseState: createInitialSendTurnStreamPhaseState(),
    commitPrimaryStreamUsage: vi.fn(),
    recordCompletionSuccessMetric: vi.fn(),
    opening: buildOpening(),
    sendTurnConversationId: 'conv-1',
    stream: (async function* legacy() {
      yield { delta: 'legacy stream must not run' };
      yield { done: true };
    })(),
    generationSource: 'local',
    controller: new AbortController(),
    effectiveUserText: 'verify u1 and search works',
    agentLoopSourceUserText: 'verify u1 and search works',
    resumeCheckpoint: null,
    verticalWorkflowSelection: null,
    verticalOutputEnvelopeSeed: null,
    userMsg: { id: 'usr-1', role: 'user', content: 'hi', status: 'done' },
    assistantId,
    shouldTrackRemoteStatus: false,
    timeoutHandle: null,
    sendStartedAtMs: 0,
    aiMetricTags: createMetricTags('ai-chat', { provider: 'deepseek', model: 'deepseek-chat' }),
    conversationGenerationRef: createConversationGenerationRef(0),
    streamGenerationAtStart: 0,
    queueFlushAssistantDraft: vi.fn(),
    awaitQueuedPersistence: vi.fn().mockResolvedValue(undefined),
    finalizeAssistantMessage,
    provider: { id: 'deepseek', label: 'DeepSeek' },
    flags: {
      ...featureFlags,
      aiAgentRuntimeV2Enabled: true,
      aiExternalMcpSendTurnEnabled: true,
      aiExternalMcpTrustEnabled: true,
      ...flags,
    },
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
    setPendingToolCall: ((value: SetStateAction<PendingAiToolCall | null>) => {
      cards.push(typeof value === 'function' ? value(cards.at(-1) ?? null) : value);
    }) as Dispatch<SetStateAction<PendingAiToolCall | null>>,
    messagesRef: { current: [assistantMsg] },
    metricsRef: { current: { ...zeroMetrics } },
    sessionMemoryRef: { current: {} as AiSessionMemory },
    settingsRef: { current: settings },
    toolFeedbackLocaleRef: { current: 'en-US' },
    getContextRef: { current: () => null },
    toolDecisionModeRef: { current: 'enabled' },
    onToolRiskCheckRef: { current: undefined },
    preparePendingToolCallRef: { current: undefined },
    onToolCallRef: { current: undefined },
    taskSessionRef: { current: taskSession },
    backgroundMemoryRuntimeRef: { current: null },
    allowDestructiveToolCalls: true,
    hasPersistedExecutionForRequest: vi.fn(async () => false),
    writeToolDecisionAuditLog: vi.fn(async (_id: string, _old: string, next: string) => {
      audits.push(next);
    }),
    writeToolIntentAuditLog: vi.fn().mockResolvedValue(undefined),
    markExecutedRequestId: noop,
    bumpMetric: noop,
    localToolCallCountRef: { current: 0 },
    onPushAdoptionItemsRef: { current: undefined },
    ...over,
  };
  return {
    input,
    cards,
    audits,
    stored: () => finalizeAssistantMessage.mock.calls.at(-1)?.[1] as string | undefined,
  };
}

function renderPendingCard(card: PendingAiToolCall, audits: string[]) {
  const pendingRef = { current: card as PendingAiToolCall | null };
  const stored = new Map<string, { content: string; status: string | undefined }>();
  const { result } = renderHook(() =>
    useAiChatPendingToolCall({
      providerId: 'deepseek',
      settingsRef: { current: getDefaultAiChatSettings('deepseek') },
      toolDecisionModeRef: { current: 'enabled' },
      pendingToolCallRef: pendingRef,
      taskSessionRef: { current: { id: 'task-1', status: 'idle', updatedAt: '' } },
      sessionMemoryRef: { current: {} as AiSessionMemory },
      toolFeedbackLocale: 'en-US',
      applyAssistantMessageResult: async (id, content, status) => {
        stored.set(id, { content, status });
      },
      hasPersistedExecutionForRequest: async () => false,
      writeToolDecisionAuditLog: async (_id, _old, next) => {
        audits.push(next);
      },
      markExecutedRequestId: vi.fn(),
      setPendingToolCall: (value) => {
        pendingRef.current = typeof value === 'function' ? value(pendingRef.current) : value;
      },
      setTaskSession: vi.fn(),
      bumpMetric: vi.fn(),
      conversationIdRef: { current: 'conv-1' },
    }),
  );
  return { hook: result, pendingRef, stored };
}

beforeEach(async () => {
  await db.table('ai_runtime_v2_turns').clear();
  vi.mocked(runAgentLoop).mockReset();
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
  vi.mocked(externalMcpTurnBridge.listRuntimeV2ExternalMcpTools).mockResolvedValue([
    {
      name: EXT_TOOL,
      origin: ORIGIN,
      toolName: 'search_works',
      description: 'Search.',
      inputSchema: { type: 'object', properties: {} },
    },
  ]);
  vi.mocked(externalMcpTurnBridge.executeExternalMcpCall).mockReset();
  vi.mocked(localContextToolExecutors.executeLocalContextToolCall).mockReset();
});

describe('ToolLoopAgent turn: MCP input card', () => {
  it('keeps the input card when an approval arrives in the same step, and shows the approval once the card closes', async () => {
    vi.mocked(externalMcpTurnBridge.executeExternalMcpCall).mockResolvedValue({
      name: EXT_TOOL,
      ok: false,
      reason: 'input_required',
      form: mcpForm('STATE-1'),
    });
    const model = new MockLanguageModelV4({
      doStream: [
        searchStream('search works'),
        toolCallsStream([
          [EXT_TOOL, '{}'],
          ['batch_apply', '{"action":"verify","unitIds":["u1"]}'],
        ]),
        textStream('the model must not run again'),
      ],
    });
    modelRef.current = model;
    const h = buildHarness();

    await runAiChatSendTurnStreamPhase(h.input);

    expect(model.doStreamCalls).toHaveLength(2);
    const shown = h.cards.filter(Boolean) as PendingAiToolCall[];
    expect(shown).toHaveLength(1);
    expect(shown[0]!.mcpInput?.requestState).toBe('STATE-1');
    expect(shown[0]!.conversationIdAtCapture).toBe('conv-1');
    expect(h.stored()).not.toContain('STATE-1');
    expect(h.stored()).not.toContain('GitHub');

    const loaded = await loadTurnState('conv-1', Date.now());
    expect(loaded.kind).toBe('active');
    if (loaded.kind !== 'active') return;
    expect(unansweredApprovals(loaded.state.messages).map((a) => a.toolName)).toEqual([
      'batch_apply',
    ]);

    const { hook, pendingRef } = renderPendingCard(shown[0]!, h.audits);
    await hook.current.cancelPendingToolCall();
    expect(pendingRef.current?.call.name).toBe('batch_apply');
    expect(pendingRef.current?.runtimeV2?.conversationId).toBe('conv-1');
  });
});

describe('ToolLoopAgent turn: stop and conversation switch', () => {
  function modelCallingExternalTool() {
    const model = new MockLanguageModelV4({
      doStream: [
        searchStream('search works'),
        toolCallsStream([[EXT_TOOL, '{}']]),
        textStream('after'),
      ],
    });
    modelRef.current = model;
    return model;
  }

  it('passes the abort signal into the external call and shows no card after Stop', async () => {
    modelCallingExternalTool();
    const h = buildHarness();
    let seenSignal: AbortSignal | undefined;
    vi.mocked(externalMcpTurnBridge.executeExternalMcpCall).mockImplementation(
      async (call, _runId, _retry, signal) => {
        seenSignal = signal;
        h.input.controller.abort();
        return { name: call.name, ok: false, reason: 'input_required', form: mcpForm('S') };
      },
    );
    await runAiChatSendTurnStreamPhase(h.input);
    expect(seenSignal).toBeInstanceOf(AbortSignal);
    expect(seenSignal?.aborted).toBe(true);
    expect(h.cards.filter(Boolean)).toHaveLength(0);
  });

  it('shows no card when the conversation changed while the tool ran', async () => {
    modelCallingExternalTool();
    const h = buildHarness();
    vi.mocked(externalMcpTurnBridge.executeExternalMcpCall).mockImplementation(async (call) => {
      bumpConversationGeneration(h.input.conversationGenerationRef);
      return { name: call.name, ok: false, reason: 'input_required', form: mcpForm('S') };
    });
    await runAiChatSendTurnStreamPhase(h.input);
    expect(h.cards.filter(Boolean)).toHaveLength(0);
  });
});

describe('ToolLoopAgent turn: approved batch_apply', () => {
  it('runs batch_apply from the confirm card and stores formatted text, not raw JSON', async () => {
    const execute = vi.mocked(localContextToolExecutors.executeLocalContextToolCall);
    execute.mockResolvedValue({
      ok: true,
      name: 'batch_apply',
      result: {
        action: 'verify',
        items: [{ unitId: 'u1', preview: 'Would apply verify to u1' }],
        _readModel: { source: 'segment_meta' },
      },
    });
    modelRef.current = new MockLanguageModelV4({
      doStream: [toolCallsStream([['batch_apply', '{"action":"verify","unitIds":["u1"]}']])],
    });
    const h = buildHarness();

    await runAiChatSendTurnStreamPhase(h.input);

    expect(execute).not.toHaveBeenCalled();
    const card = h.cards.filter(Boolean).at(-1) as PendingAiToolCall;
    expect(card.call.name).toBe('batch_apply');
    expect(card.runtimeV2?.conversationId).toBe('conv-1');

    const { hook, stored } = renderPendingCard(card, h.audits);
    await hook.current.confirmPendingToolCall();

    expect(execute).toHaveBeenCalledTimes(1);
    const text = stored.get('ast-v2')?.content ?? '';
    expect(text).not.toBe('');
    expect(text).not.toContain('_readModel');
    expect(text).not.toContain('{"');
    expect(stored.get('ast-v2')?.status).toBe('done');
    expect(h.audits).toContain('confirmed:batch_apply');
  });
});

describe('ToolLoopAgent turn: execution audit', () => {
  it('writes an execution audit row for local reads and corpus queries', async () => {
    vi.mocked(localContextToolExecutors.executeLocalContextToolCall).mockImplementation(
      async (call) => ({ ok: call.name === 'list_units', name: call.name, result: {} }),
    );
    modelRef.current = new MockLanguageModelV4({
      doStream: [
        searchStream('concordance kwic'),
        toolCallsStream([
          ['list_units', '{"limit":8}'],
          ['concordance_kwic', '{"gloss":"PST"}'],
        ]),
        textStream('done'),
      ],
    });
    const h = buildHarness({}, { corpusAnalysisQueryToolsEnabled: true });

    await runAiChatSendTurnStreamPhase(h.input);

    expect(h.audits).toEqual(
      expect.arrayContaining(['auto_confirmed:list_units', 'auto_failed:concordance_kwic']),
    );
  });
});

describe('ToolLoopAgent turn: external MCP call cap', () => {
  it('runs at most 5 external MCP calls per turn and tells the model the rest hit the cap', async () => {
    vi.mocked(externalMcpTurnBridge.executeExternalMcpCall).mockImplementation(async (call) => ({
      name: call.name,
      ok: true,
    }));
    const calls = Array.from({ length: 7 }, (_, i) => ({
      type: 'tool-call' as const,
      toolCallId: `ext-${i}`,
      toolName: EXT_TOOL,
      input: '{}',
    }));
    const model = new MockLanguageModelV4({
      doStream: [
        searchStream('search works'),
        {
          stream: simulateReadableStream({
            chunks: [
              { type: 'stream-start' as const, warnings: [] },
              ...calls,
              {
                type: 'finish' as const,
                finishReason: { unified: 'tool-calls' as const, raw: undefined },
                usage,
              },
            ],
          }),
        },
        textStream('done'),
      ],
    });
    modelRef.current = model;
    const h = buildHarness();

    await runAiChatSendTurnStreamPhase(h.input);

    expect(externalMcpTurnBridge.executeExternalMcpCall).toHaveBeenCalledTimes(5);
    expect(model.doStreamCalls).toHaveLength(3);
    const prompt = JSON.stringify(model.doStreamCalls[2]!.prompt);
    expect(prompt.match(/turn_call_limit/g)).toHaveLength(2);
  });
});
