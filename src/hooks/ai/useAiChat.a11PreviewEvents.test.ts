import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AiChatToolCall, AiChatToolResult, AiSessionMemory } from '../useAiChat';
import { buildToolAuditContext } from '../../ai/chat/toolCallHelpers';

async function loadWithPreviewFlag() {
  vi.resetModules();
  vi.doMock('../../ai/config/featureFlags', () => ({
    featureFlags: {
      aiAgentUiPreviewEnabled: true,
      aiToolWriteGateEnabled: false,
      aiToolCallExecutorAutoRetryEnabled: false,
    },
  }));
  const events = await import('../../ai/runtime/agentUiEvents');
  const pipeline = await import('./useAiChat.toolDecisionPipeline');
  const confirm = await import('./useAiChat.confirmExecution');
  return { events, pipeline, confirm };
}

describe('A11 preview events on pipeline and confirm', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.doUnmock('../../ai/config/featureFlags');
    vi.resetModules();
  });

  it('emits write_blocked with agentRunId when destructive preference denies the tool', async () => {
    const { events, pipeline } = await loadWithPreviewFlag();
    const received: Array<{ kind: string; agentRunId?: string; triage?: string }> = [];
    events.getDefaultAgentUiEventBus().subscribe((event) => {
      received.push(event);
    });

    const result = await pipeline.resolveToolDecisionPipeline({
      assistantMessageId: 'ast-1',
      toolCall: {
        name: 'delete_transcription_segment',
        arguments: { segmentId: 'unit-1' },
        requestId: 'req-1',
      },
      userText: 'delete segment unit-1',
      aiContext: null,
      messageHistory: [],
      providerId: 'mock',
      model: 'mock-model',
      locale: 'en-US',
      toolDecisionMode: 'enabled',
      toolFeedbackStyle: 'detailed',
      allowDestructiveToolCalls: true,
      agentRunId: 'run_block_1',
      hasPersistedExecutionForRequest: async () => false,
      writeToolDecisionAuditLog: vi.fn(async () => {}),
      writeToolIntentAuditLog: vi.fn(async () => {}),
      sessionMemory: { safetyPreferences: { denyDestructive: true } },
      updateSessionMemory: vi.fn(),
      persistSessionMemory: vi.fn(),
      setTaskSession: vi.fn(),
      setPendingToolCall: vi.fn(),
      taskSessionId: 'task-1',
      markExecutedRequestId: vi.fn(),
      bumpMetric: vi.fn(),
      shouldBumpRecovery: false,
    });

    expect(result.finalStatus).toBe('done');
    expect(received.some((e) => e.kind === 'write_blocked' && e.agentRunId === 'run_block_1')).toBe(
      true,
    );
    expect(received.find((e) => e.kind === 'write_blocked')?.triage).toBe('abandon');
  });

  it('emits write_preview_pending when ask-first turns a write into confirmation', async () => {
    const { events, pipeline } = await loadWithPreviewFlag();
    const received: Array<{ kind: string; agentRunId?: string; preview?: { kind: string } }> = [];
    events.getDefaultAgentUiEventBus().subscribe((event) => {
      received.push(event);
    });

    await pipeline.resolveToolDecisionPipeline({
      assistantMessageId: 'ast-1',
      toolCall: {
        name: 'set_transcription_text',
        arguments: { segmentId: 'unit-1', text: 'hello' },
        requestId: 'req-2',
      },
      userText: 'set text',
      aiContext: null,
      messageHistory: [],
      providerId: 'mock',
      model: 'mock-model',
      locale: 'en-US',
      toolDecisionMode: 'enabled',
      toolFeedbackStyle: 'detailed',
      allowDestructiveToolCalls: true,
      agentRunId: 'run_pending_1',
      hasPersistedExecutionForRequest: async () => false,
      writeToolDecisionAuditLog: vi.fn(async () => {}),
      writeToolIntentAuditLog: vi.fn(async () => {}),
      sessionMemory: { toolPreferences: { autoExecute: 'ask_first' } },
      updateSessionMemory: vi.fn(),
      persistSessionMemory: vi.fn(),
      setTaskSession: vi.fn(),
      setPendingToolCall: vi.fn(),
      taskSessionId: 'task-1',
      markExecutedRequestId: vi.fn(),
      bumpMetric: vi.fn(),
      shouldBumpRecovery: false,
    });

    const pendingEvent = received.find((e) => e.kind === 'write_preview_pending');
    expect(pendingEvent?.agentRunId).toBe('run_pending_1');
    expect(pendingEvent?.preview?.kind).toBe('single_tool');
  });

  it('emits write_confirmed and readbacks lastToolName after propose_changes commit', async () => {
    const { events, confirm } = await loadWithPreviewFlag();
    const received: Array<{ kind: string; agentRunId?: string; toolName?: string }> = [];
    events.getDefaultAgentUiEventBus().subscribe((event) => {
      received.push(event);
    });

    let memory: AiSessionMemory = {};
    const updateSessionMemory = vi.fn((next: AiSessionMemory) => {
      memory = next;
    });
    const persistSessionMemory = vi.fn((next: AiSessionMemory) => {
      memory = next;
    });

    await confirm.executeConfirmedProposedChangeBatch({
      assistantMessageId: 'asst-1',
      parentCall: {
        name: 'propose_changes',
        requestId: 'parent-req-1',
        arguments: { changes: [] },
      },
      childCalls: [
        {
          name: 'set_transcription_text',
          arguments: { segmentId: 'a', text: 'ta' },
        } satisfies AiChatToolCall,
      ],
      auditContext: {
        ...buildToolAuditContext('', 'p', 'm', 'enabled', 'concise'),
        agentRunId: 'run_confirm_1',
      },
      locale: 'en-US',
      toolFeedbackStyle: 'concise',
      hasPersistedExecutionForRequest: async () => false,
      applyAssistantMessageResult: vi.fn(async () => {}),
      onToolCall: vi.fn(async (): Promise<AiChatToolResult> => ({ ok: true, message: 'ok' })),
      writeToolDecisionAuditLog: vi.fn(async () => {}),
      setTaskSession: vi.fn(),
      taskSessionId: 'ts-1',
      markExecutedRequestId: vi.fn(),
      sessionMemory: memory,
      updateSessionMemory,
      persistSessionMemory,
      bumpMetric: vi.fn(),
    });

    expect(memory.lastToolName).toBe('set_transcription_text');
    expect(persistSessionMemory).toHaveBeenCalled();
    expect(
      received.some((e) => e.kind === 'write_confirmed' && e.agentRunId === 'run_confirm_1'),
    ).toBe(true);
  });
});
