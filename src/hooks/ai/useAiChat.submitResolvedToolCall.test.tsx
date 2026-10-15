// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { featureFlags, resolveAiAgentRuntimeV2Enabled } from '../../ai/config/featureFlags';
import { isAiToolWritePreviewRequired } from '../../ai/policy/aiToolPolicyMatrix';
import { db } from '../../db';
import { dispatchResolvedVoiceIntent } from '../../services/assistantVoiceIntentDispatch';
import type { VoiceIntent } from '../../services/IntentRouter';
import { useAiChatToolAudit } from './useAiChat.toolAudit';
import { submitResolvedToolCall } from './useAiChat.submitResolvedToolCall';

const toolIntent: VoiceIntent = {
  type: 'tool',
  toolName: 'set_translation_text',
  params: { segmentId: 'seg-1', layerId: 'layer-1', text: 'hi' },
  raw: '把这句译成 hi',
};

beforeEach(async () => {
  await db.open();
  await Promise.all(db.tables.map((table) => table.clear()));
});

describe('voice tool intent through the shared decision pipeline', () => {
  it('writes a decision audit that can be read back, and executes only when the write gate is open', async () => {
    const onToolCall = vi.fn(async () => ({ ok: true, message: 'saved' }));
    const sendToAiChat = vi.fn();
    const { result } = renderHook(() => useAiChatToolAudit());
    const audit = result.current;

    await dispatchResolvedVoiceIntent({
      locale: 'zh-CN',
      safeMode: false,
      sessionId: 'sess-voice',
      intent: toolIntent,
      sttResult: {
        text: toolIntent.raw,
        confidence: 0.9,
        lang: 'zh',
        isFinal: true,
        engine: 'web-speech',
      },
      llmFallbackFailed: false,
      intentRouter: {
        shouldConfirmFuzzyAction: () => false,
        isDestructiveAction: () => false,
      },
      executeAction: vi.fn(),
      sendToAiChat,
      queueAiThinking: vi.fn(),
      setError: vi.fn(),
      setAgentState: vi.fn(),
      setPendingConfirm: vi.fn(),
      inputModality: 'voice',
      executeVoiceToolCall: async (call) => {
        const submitted = await submitResolvedToolCall(
          {
            ensureConversation: async () => 'conv-voice',
            providerId: 'test-provider',
            model: 'test-model',
            locale: 'zh-CN',
            toolDecisionMode: 'enabled',
            toolFeedbackStyle: 'concise',
            allowDestructiveToolCalls: true,
            messages: [],
            setMessages: () => undefined,
            getContext: () => null,
            onToolCall,
            hasPersistedExecutionForRequest: audit.hasPersistedExecutionForRequest,
            writeToolDecisionAuditLog: audit.writeToolDecisionAuditLog,
            writeToolIntentAuditLog: audit.writeToolIntentAuditLog,
            sessionMemory: {},
            updateSessionMemory: () => undefined,
            setTaskSession: () => undefined,
            setPendingToolCall: () => undefined,
            taskSessionId: 'task-voice',
            markExecutedRequestId: audit.markExecutedRequestId,
            bumpMetric: () => undefined,
            conversationGeneration: { current: 0 },
          },
          {
            name: call.name,
            arguments: call.arguments,
            userText: call.userText ?? '',
          },
        );
        return {
          ok: submitted.status !== 'error',
          pending: submitted.status === 'pending',
          message: submitted.content,
        };
      },
    });

    expect(sendToAiChat).not.toHaveBeenCalled();
    const userLines = (await db.ai_messages.toArray())
      .filter((row) => row.role === 'user')
      .map((row) => row.content);
    expect(userLines).toEqual(['把这句译成 hi']);
    const rows = (await db.audit_logs.where('collection').equals('ai_messages').toArray()).filter(
      (row) => row.field === 'ai_tool_call_decision',
    );
    expect(rows.length).toBeGreaterThan(0);
    const decision = rows[rows.length - 1]?.newValue ?? '';
    const previewFirst =
      (featureFlags.aiToolWriteGateEnabled || resolveAiAgentRuntimeV2Enabled()) &&
      isAiToolWritePreviewRequired('set_translation_text');
    if (previewFirst) {
      expect(decision).toContain('policy_pending:set_translation_text');
      expect(onToolCall).not.toHaveBeenCalled();
    } else {
      expect(decision).toBe('auto_confirmed:set_translation_text');
      expect(onToolCall).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'set_translation_text',
          arguments: { segmentId: 'seg-1', layerId: 'layer-1', text: 'hi' },
        }),
      );
    }
  });
});
