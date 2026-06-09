import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { featureFlags } from '../config/featureFlags';
import { resolveToolDecisionPipeline } from './toolDecisionPipeline';
import type { AiChatToolCall, AiPromptContext, AiSessionMemory } from './chatDomain.types';

const originalWriteGateEnabled = featureFlags.aiToolWriteGateEnabled;

function baseParams(
  overrides: {
    toolCall?: AiChatToolCall;
    aiContext?: AiPromptContext | null;
    sessionMemory?: AiSessionMemory;
  } = {},
): Parameters<typeof resolveToolDecisionPipeline>[0] {
  const toolCall = overrides.toolCall ?? {
    name: 'set_transcription_text',
    arguments: { segmentId: 'seg-1', text: 'hello' },
    requestId: 'req-write-gate',
  };
  return {
    assistantMessageId: 'ast-write-gate',
    toolCall,
    userText: 'set text',
    aiContext:
      overrides.aiContext ??
      ({
        shortTerm: {
          selectedUnitKind: 'segment',
          activeSegmentUnitId: 'seg-1',
          activeUnitId: 'seg-1',
          timelineReadModelEpoch: 1,
        },
      } as AiPromptContext),
    messageHistory: [],
    providerId: 'mock',
    model: 'mock-model',
    locale: 'en-US',
    toolDecisionMode: 'enabled',
    toolFeedbackStyle: 'detailed',
    allowDestructiveToolCalls: true,
    hasPersistedExecutionForRequest: async () => false,
    writeToolDecisionAuditLog: vi.fn(async () => {}),
    writeToolIntentAuditLog: vi.fn(async () => {}),
    sessionMemory: overrides.sessionMemory ?? {},
    updateSessionMemory: vi.fn(),
    persistSessionMemory: vi.fn(),
    setTaskSession: vi.fn(),
    setPendingToolCall: vi.fn(),
    taskSessionId: 'task-write-gate',
    markExecutedRequestId: vi.fn(),
    bumpMetric: vi.fn(),
    shouldBumpRecovery: false,
  };
}

describe('toolDecisionPipeline write gate preview routing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (featureFlags as { aiToolWriteGateEnabled: boolean }).aiToolWriteGateEnabled = true;
  });

  afterEach(() => {
    (featureFlags as { aiToolWriteGateEnabled: boolean }).aiToolWriteGateEnabled =
      originalWriteGateEnabled;
  });

  it('routes scope-valid writes to preview pending when write gate is enabled', async () => {
    const params = baseParams();
    const result = await resolveToolDecisionPipeline(params);

    expect(result.finalStatus).toBe('done');
    expect(params.setPendingToolCall).toHaveBeenCalledWith(
      expect.objectContaining({
        approvalMode: 'safety_gate',
        policyReasonCode: 'write_gate_preview_required',
        previewContract: expect.any(Object),
      }),
    );
    expect(params.writeToolDecisionAuditLog).toHaveBeenCalledWith(
      'ast-write-gate',
      'auto:set_transcription_text',
      'policy_pending:set_transcription_text:write_gate_preview_required',
      'system',
      'req-write-gate',
      expect.objectContaining({
        outcome: 'policy_pending',
        reason: 'write_gate_preview_required',
      }),
    );
  });

  it('blocks out-of-scope writes before preview routing', async () => {
    const params = baseParams({
      aiContext: { shortTerm: {} } as AiPromptContext,
    });
    const result = await resolveToolDecisionPipeline(params);

    expect(result.finalStatus).toBe('done');
    expect(result.finalContent).toContain('outside the current scope');
    expect(params.setPendingToolCall).not.toHaveBeenCalled();
  });
});
