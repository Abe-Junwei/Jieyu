import { describe, expect, it, vi } from 'vitest';
import type { AiChatToolCall, ToolAuditContext } from '../ai/chat/chatDomain.types';
import { resolveDestructiveGate } from './useAiChat.destructiveGate';

function createBaseAuditContext(): ToolAuditContext {
  return {
    userText: '写入当前句段转写',
    providerId: 'mock-provider',
    model: 'mock-model',
    toolDecisionMode: 'enabled',
    toolFeedbackStyle: 'concise',
  };
}

function createWriteCall(): AiChatToolCall {
  return {
    name: 'set_transcription_text',
    arguments: {
      text: 'hello',
    },
  };
}

describe('resolveDestructiveGate write-target gating', () => {
  it('runs risk check for non-destructive write tool and proceeds when target is materialized', async () => {
    const toolCall = createWriteCall();
    const onToolRiskCheck = vi.fn().mockResolvedValue(null);
    const preparePendingToolCall = vi.fn((call: AiChatToolCall) => ({
      ...call,
      arguments: {
        ...call.arguments,
        segmentId: 'seg-1',
      },
    }));
    const writeToolDecisionAuditLog = vi.fn().mockResolvedValue(undefined);
    const setTaskSession = vi.fn();
    const setPendingToolCall = vi.fn();
    const bumpFailureMetric = vi.fn();

    const result = await resolveDestructiveGate({
      assistantMessageId: 'assistant-1',
      toolCall,
      aiContext: null,
      auditContext: createBaseAuditContext(),
      locale: 'zh-CN',
      toolFeedbackStyle: 'concise',
      allowDestructiveToolCalls: false,
      onToolRiskCheck,
      preparePendingToolCall,
      writeToolDecisionAuditLog,
      setTaskSession,
      setPendingToolCall,
      taskSessionId: 'task-1',
      bumpFailureMetric,
    });

    expect(onToolRiskCheck).toHaveBeenCalledTimes(1);
    expect(onToolRiskCheck).toHaveBeenCalledWith(toolCall);
    expect(preparePendingToolCall).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ kind: 'proceed' });
    expect(setTaskSession).not.toHaveBeenCalled();
    expect(setPendingToolCall).not.toHaveBeenCalled();
    expect(writeToolDecisionAuditLog).not.toHaveBeenCalled();
    expect(bumpFailureMetric).not.toHaveBeenCalled();
  });

  it('blocks non-destructive write tool when explicit writable target is unresolved', async () => {
    const toolCall = createWriteCall();
    const onToolRiskCheck = vi.fn().mockResolvedValue({
      requiresConfirmation: false,
      riskSummary: '缺少 segmentId，写入转写文本必须显式指定目标句段。',
      impactPreview: [],
    });
    const preparePendingToolCall = vi.fn().mockResolvedValue(null);
    const writeToolDecisionAuditLog = vi.fn().mockResolvedValue(undefined);
    const setTaskSession = vi.fn();
    const setPendingToolCall = vi.fn();
    const bumpFailureMetric = vi.fn();

    const result = await resolveDestructiveGate({
      assistantMessageId: 'assistant-2',
      toolCall,
      aiContext: null,
      auditContext: createBaseAuditContext(),
      locale: 'zh-CN',
      toolFeedbackStyle: 'concise',
      allowDestructiveToolCalls: false,
      onToolRiskCheck,
      preparePendingToolCall,
      writeToolDecisionAuditLog,
      setTaskSession,
      setPendingToolCall,
      taskSessionId: 'task-2',
      bumpFailureMetric,
    });

    expect(onToolRiskCheck).toHaveBeenCalledTimes(1);
    expect(preparePendingToolCall).toHaveBeenCalledTimes(1);
    expect(result.kind).toBe('error');
    expect(bumpFailureMetric).toHaveBeenCalledTimes(1);
    expect(setTaskSession).toHaveBeenCalledWith(expect.objectContaining({
      status: 'waiting_clarify',
      toolName: 'set_transcription_text',
      clarifyReason: 'missing-unit-target',
    }));
    expect(writeToolDecisionAuditLog).toHaveBeenCalledWith(
      'assistant-2',
      'auto:set_transcription_text',
      expect.stringContaining('unresolved_write_target'),
      'ai',
      undefined,
      expect.any(Object),
    );
    expect(setPendingToolCall).not.toHaveBeenCalled();
  });

  it('applies write-target gate to explicit-target tools like auto_gloss_unit', async () => {
    const toolCall: AiChatToolCall = {
      name: 'auto_gloss_unit',
      arguments: {},
    };
    const onToolRiskCheck = vi.fn().mockResolvedValue(null);
    const preparePendingToolCall = vi.fn();
    const writeToolDecisionAuditLog = vi.fn().mockResolvedValue(undefined);
    const setTaskSession = vi.fn();
    const setPendingToolCall = vi.fn();
    const bumpFailureMetric = vi.fn();

    const result = await resolveDestructiveGate({
      assistantMessageId: 'assistant-3',
      toolCall,
      aiContext: null,
      auditContext: createBaseAuditContext(),
      locale: 'zh-CN',
      toolFeedbackStyle: 'concise',
      allowDestructiveToolCalls: false,
      onToolRiskCheck,
      preparePendingToolCall,
      writeToolDecisionAuditLog,
      setTaskSession,
      setPendingToolCall,
      taskSessionId: 'task-3',
      bumpFailureMetric,
    });

    expect(result.kind).toBe('error');
    expect(onToolRiskCheck).toHaveBeenCalledWith(toolCall);
    expect(preparePendingToolCall).toHaveBeenCalledWith(toolCall);
    expect(setTaskSession).toHaveBeenCalledTimes(1);
    expect(setPendingToolCall).not.toHaveBeenCalled();
    expect(writeToolDecisionAuditLog).toHaveBeenCalledTimes(1);
    expect(bumpFailureMetric).toHaveBeenCalledTimes(1);
  });

  it('does not treat unknown segmentPosition as a materialized target', async () => {
    const toolCall: AiChatToolCall = {
      name: 'set_transcription_text',
      arguments: {
        text: 'hello',
        segmentPosition: 'random-position',
      },
    };
    const onToolRiskCheck = vi.fn().mockResolvedValue(null);
    const preparePendingToolCall = vi.fn().mockResolvedValue(null);
    const writeToolDecisionAuditLog = vi.fn().mockResolvedValue(undefined);
    const setTaskSession = vi.fn();
    const setPendingToolCall = vi.fn();
    const bumpFailureMetric = vi.fn();

    const result = await resolveDestructiveGate({
      assistantMessageId: 'assistant-4',
      toolCall,
      aiContext: null,
      auditContext: createBaseAuditContext(),
      locale: 'zh-CN',
      toolFeedbackStyle: 'concise',
      allowDestructiveToolCalls: false,
      onToolRiskCheck,
      preparePendingToolCall,
      writeToolDecisionAuditLog,
      setTaskSession,
      setPendingToolCall,
      taskSessionId: 'task-4',
      bumpFailureMetric,
    });

    expect(result.kind).toBe('error');
    expect(preparePendingToolCall).toHaveBeenCalledWith(toolCall);
    expect(setTaskSession).toHaveBeenCalledWith(expect.objectContaining({
      status: 'waiting_clarify',
      clarifyReason: 'missing-unit-target',
    }));
    expect(writeToolDecisionAuditLog).toHaveBeenCalledWith(
      'assistant-4',
      'auto:set_transcription_text',
      expect.stringContaining('unresolved_write_target'),
      'ai',
      undefined,
      expect.any(Object),
    );
    expect(setPendingToolCall).not.toHaveBeenCalled();
    expect(bumpFailureMetric).toHaveBeenCalledTimes(1);
  });
});
