// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { db } from '../../db';
import { featureFlags } from '../ai/config/featureFlags';
import { useAiChat } from './useAiChat';

let lastSystemPrompt = '';

vi.mock('../ai/ChatOrchestrator', () => {
  class MockChatOrchestrator {
    sendMessage(input: { systemPrompt?: string; options?: { signal?: AbortSignal }; history?: Array<{ role: string; content: string }>; userText?: string }) {
      lastSystemPrompt = input.systemPrompt ?? '';
      const signal = input.options?.signal;
      const userText = input.userText ?? input.history?.[input.history.length - 1]?.content ?? '';
      async function* stream() {
        if (userText.includes('请解释删除层命令是什么意思')) {
          yield { delta: '{"tool_call":{"name":"delete_layer","arguments":{"layerId":"layer-1"}}}' };
          yield { delta: '', done: true };
          return;
        }
        if (userText.includes('set_translation_text和set_transcription_text有什么区别')) {
          yield { delta: '{"tool_call":{"name":"set_translation_text","arguments":{"utteranceId":"u1","text":"x"}}}' };
          yield { delta: '', done: true };
          return;
        }
        if (userText.includes('__TOOL_DELETE_LAYER__')) {
          yield { delta: '{"tool_call":{"name":"delete_layer","arguments":{"layerId":"layer-1"}}}' };
          yield { delta: '', done: true };
          return;
        }
        if (userText.includes('__TOOL_DELETE_SEGMENT__')) {
          yield { delta: '{"tool_call":{"name":"delete_transcription_segment","arguments":{"utteranceId":"u1"}}}' };
          yield { delta: '', done: true };
          return;
        }
        if (userText.includes('__LEGACY_PENDING_SEGMENT_TEXT__')) {
          yield { delta: '我识别到你想执行“delete_transcription_segment”。这个操作风险较高，我先暂停，等你确认后再继续。' };
          yield { delta: '', done: true };
          return;
        }
        if (userText.includes('删除当前句段')) {
          yield { delta: '{"tool_call":{"name":"delete_transcription_segment","arguments":{}}}' };
          yield { delta: '', done: true };
          return;
        }
        if (userText.trim() === '这个') {
          yield { delta: '{"tool_call":{"name":"delete_transcription_segment","arguments":{}}}' };
          yield { delta: '', done: true };
          return;
        }
        if (userText.includes('删除之')) {
          yield { delta: '{"tool_call":{"name":"delete_transcription_segment","arguments":{}}}' };
          yield { delta: '', done: true };
          return;
        }
        if (userText.includes('__TOOL_RENAME_LAYER__')) {
          yield { delta: '{"tool_call":{"name":"set_transcription_text","arguments":{"utteranceId":"u1","text":"hello"}}}' };
          yield { delta: '', done: true };
          return;
        }
        if (userText.includes('__TOOL_INVALID_ARGS__')) {
          yield { delta: '{"tool_call":{"name":"set_transcription_text","arguments":{"utteranceId":"u1"}}}' };
          yield { delta: '', done: true };
          return;
        }
        if (userText.includes('__TOOL_SET_TRANSLATION_MISSING_LAYER__')) {
          yield { delta: '{"tool_call":{"name":"set_translation_text","arguments":{"utteranceId":"u1","text":"译文"}}}' };
          yield { delta: '', done: true };
          return;
        }
        if (userText.includes('__TOOL_CLEAR_TRANSLATION_MISSING_LAYER__')) {
          yield { delta: '{"tool_call":{"name":"clear_translation_segment","arguments":{"utteranceId":"u1"}}}' };
          yield { delta: '', done: true };
          return;
        }
        if (userText.includes('__TOOL_LINK_MISSING_TARGETS__')) {
          yield { delta: '{"tool_call":{"name":"link_translation_layer","arguments":{}}}' };
          yield { delta: '', done: true };
          return;
        }
        if (userText.includes('__TOOL_CREATE_TRANSCRIPTION_LAYER_UND__')) {
          yield { delta: '{"tool_call":{"name":"create_transcription_layer","arguments":{"languageId":"und"}}}' };
          yield { delta: '', done: true };
          return;
        }
        if (userText.includes('__TOOL_MIXED_REPLY__')) {
          yield { delta: '{"tool_call":{"name":"set_transcription_text","arguments":{"utteranceId":"u1","text":"hello"}}}\n---\n好的，我已经处理完毕。' };
          yield { delta: '', done: true };
          return;
        }
        if (userText.includes('__EMPTY_REPLY__')) {
          yield { delta: '', done: true };
          return;
        }
        if (userText.includes('__PLAIN_REPLY__')) {
          yield { delta: '这是普通对话回复。' };
          yield { delta: '', done: true };
          return;
        }
        if (userText.includes('__STALL_NO_FIRST_CHUNK__')) {
          while (!signal?.aborted) {
            await new Promise((resolve) => setTimeout(resolve, 5));
          }
          throw new DOMException('aborted', 'AbortError');
        }
        if (userText.includes('切分此句段')) {
          yield { delta: '{"tool_call":{"name":"create_transcription_segment","arguments":{"utteranceId":"u1"}}}' };
          yield { delta: '', done: true };
          return;
        }
        if (userText.includes('可以把当前句段转写改为你好么')) {
          yield { delta: '{"tool_call":{"name":"set_transcription_text","arguments":{"utteranceId":"u1","text":"你好"}}}' };
          yield { delta: '', done: true };
          return;
        }
        if (userText.includes('这个句段呢？')) {
          yield { delta: '{"tool_call":{"name":"create_transcription_segment","arguments":{"utteranceId":"u1"}}}' };
          yield { delta: '', done: true };
          return;
        }
        if (userText.includes('你好')) {
          yield { delta: '{"tool_call":{"name":"set_transcription_text","arguments":{"text":"hello"}}}' };
          yield { delta: '', done: true };
          return;
        }
        if (userText.includes('删除日本语翻译层')) {
          yield { delta: '{"tool_call":{"name":"delete_layer","arguments":{}}}' };
          yield { delta: '', done: true };
          return;
        }
        yield { delta: 'x' };
        while (!signal?.aborted) {
          await new Promise((resolve) => setTimeout(resolve, 5));
        }
        throw new DOMException('aborted', 'AbortError');
      }
      return { messages: [], stream: stream() };
    }
  }
  return { ChatOrchestrator: MockChatOrchestrator };
});

async function clearAiTables(): Promise<void> {
  await Promise.all([
    db.ai_messages.clear(),
    db.ai_conversations.clear(),
    db.audit_logs.clear(),
  ]);
}

function clearAiLocalStorage(): void {
  window.localStorage.removeItem('jieyu.aiChat.settings');
  window.localStorage.removeItem('jieyu.aiChat.settings.secure');
}

describe('useAiChat abort and recovery', () => {
  beforeEach(async () => {
    lastSystemPrompt = '';
    clearAiLocalStorage();
    (featureFlags as { aiChatGrayMode: boolean; aiChatRollbackMode: boolean }).aiChatGrayMode = false;
    (featureFlags as { aiChatGrayMode: boolean; aiChatRollbackMode: boolean }).aiChatRollbackMode = false;
    await db.open();
    await clearAiTables();
  });

  afterEach(async () => {
    cleanup();
    vi.restoreAllMocks();
    (featureFlags as { aiChatGrayMode: boolean; aiChatRollbackMode: boolean }).aiChatGrayMode = false;
    (featureFlags as { aiChatGrayMode: boolean; aiChatRollbackMode: boolean }).aiChatRollbackMode = false;
    clearAiLocalStorage();
    await clearAiTables();
  });

  it('should mark assistant message as aborted when stream is stopped', async () => {
    const { result } = renderHook(() => useAiChat());

    await waitFor(() => {
      expect(result.current.isBootstrapping).toBe(false);
    });

    let sendPromise: Promise<void> | undefined;
    await act(async () => {
      sendPromise = result.current.send('测试中断');
    });

    await act(async () => {
      result.current.stop();
    });

    await act(async () => {
      await sendPromise;
    });

    await waitFor(async () => {
      const rows = await db.ai_messages.toArray();
      const assistant = rows.find((row) => row.role === 'assistant');
      expect(assistant?.status).toBe('aborted');
    });
  });

  it('should convert stale streaming rows to aborted during bootstrapping', async () => {
    const now = new Date().toISOString();
    await db.ai_conversations.put({
      id: 'conv-zombie',
      title: 'zombie',
      mode: 'assistant',
      providerId: 'mock',
      model: 'mock-1',
      createdAt: now,
      updatedAt: now,
    });
    await db.ai_messages.put({
      id: 'msg-zombie',
      conversationId: 'conv-zombie',
      role: 'assistant',
      content: 'incomplete',
      status: 'streaming',
      createdAt: now,
      updatedAt: now,
    });

    const { result } = renderHook(() => useAiChat());

    await waitFor(() => {
      expect(result.current.isBootstrapping).toBe(false);
    });

    await waitFor(async () => {
      const zombie = await db.ai_messages.get('msg-zombie');
      expect(zombie?.status).toBe('aborted');
    });
  });

  it('should preserve chat session when provider changes', async () => {
    const { result } = renderHook(() => useAiChat());

    await waitFor(() => {
      expect(result.current.isBootstrapping).toBe(false);
    });

    let sendPromise: Promise<void> | undefined;
    await act(async () => {
      sendPromise = result.current.send('hello');
    });
    await act(async () => {
      result.current.stop();
    });
    await act(async () => {
      await sendPromise;
    });

    expect(result.current.messages.length).toBeGreaterThan(0);

    await act(async () => {
      result.current.updateSettings({ providerKind: 'deepseek' });
    });

    expect(result.current.messages.length).toBeGreaterThan(0);
  });

  it('should preserve api keys per provider when switching', async () => {
    const { result } = renderHook(() => useAiChat());

    await waitFor(() => {
      expect(result.current.isBootstrapping).toBe(false);
    });

    await act(async () => {
      result.current.updateSettings({ providerKind: 'deepseek' });
    });
    await act(async () => {
      result.current.updateSettings({ apiKey: 'sk-deepseek-1' });
    });
    expect(result.current.settings.apiKey).toBe('sk-deepseek-1');

    await act(async () => {
      result.current.updateSettings({ providerKind: 'qwen' });
    });
    expect(result.current.settings.apiKey).toBe('');

    await act(async () => {
      result.current.updateSettings({ apiKey: 'sk-qwen-1' });
    });
    expect(result.current.settings.apiKey).toBe('sk-qwen-1');

    await act(async () => {
      result.current.updateSettings({ providerKind: 'deepseek' });
    });
    expect(result.current.settings.apiKey).toBe('sk-deepseek-1');

    await act(async () => {
      result.current.updateSettings({ providerKind: 'qwen' });
    });
    expect(result.current.settings.apiKey).toBe('sk-qwen-1');
  });

  it('should include persona-specific system prompt when configured', async () => {
    const { result } = renderHook(() => useAiChat({ systemPersonaKey: 'glossing' }));

    await waitFor(() => {
      expect(result.current.isBootstrapping).toBe(false);
    });

    let sendPromise: Promise<void> | undefined;
    await act(async () => {
      sendPromise = result.current.send('请分析这句的词素切分');
    });

    await act(async () => {
      result.current.stop();
    });

    await act(async () => {
      await sendPromise;
    });

    expect(lastSystemPrompt).toContain('形态学与语义标注助手');
  });

  it('should migrate legacy plaintext settings into secure storage', async () => {
    window.localStorage.setItem('jieyu.aiChat.settings', JSON.stringify({
      providerKind: 'deepseek',
      baseUrl: 'https://api.deepseek.com/v1',
      model: 'deepseek-chat',
      apiKey: 'sk-plain-legacy',
    }));

    const { result } = renderHook(() => useAiChat());

    await waitFor(() => {
      expect(result.current.isBootstrapping).toBe(false);
      expect(result.current.settings.providerKind).toBe('deepseek');
    });

    await waitFor(() => {
      const securePayload = window.localStorage.getItem('jieyu.aiChat.settings.secure');
      expect(securePayload).toBeTruthy();
      expect(securePayload).not.toContain('sk-plain-legacy');
      expect(window.localStorage.getItem('jieyu.aiChat.settings')).toBeNull();
    });
  });

  it('should capture context debug snapshot after sending message', async () => {
    const { result } = renderHook(() => useAiChat({
      getContext: () => ({
        shortTerm: {
          page: 'transcription',
          selectedText: 'x'.repeat(200),
          recentEdits: ['edit-a', 'edit-b'],
        },
        longTerm: {
          recommendations: ['r1', 'r2', 'r3'],
          topLexemes: ['lex1', 'lex2'],
        },
      }),
      maxContextChars: 120,
      historyCharBudget: 80,
    }));

    await waitFor(() => {
      expect(result.current.isBootstrapping).toBe(false);
    });

    let sendPromise: Promise<void> | undefined;
    await act(async () => {
      sendPromise = result.current.send('触发上下文快照');
    });

    await waitFor(() => {
      expect(result.current.contextDebugSnapshot).not.toBeNull();
    });

    const snapshot = result.current.contextDebugSnapshot;
    expect(snapshot?.persona).toBe('transcription');
    expect(snapshot?.maxContextChars).toBe(120);
    expect(snapshot?.historyCharBudget).toBe(80);
    expect(snapshot?.contextChars).toBeLessThanOrEqual(120);
    expect(snapshot?.contextPreview.length ?? 0).toBeLessThanOrEqual(1200);

    await act(async () => {
      result.current.stop();
    });
    await act(async () => {
      await sendPromise;
    });
  });

  it('should queue destructive tool calls for confirmation by default', async () => {
    const onToolCall = vi.fn();
    const { result } = renderHook(() => useAiChat({ onToolCall }));

    await waitFor(() => {
      expect(result.current.isBootstrapping).toBe(false);
    });

    await act(async () => {
      await result.current.send('__TOOL_DELETE_LAYER__');
    });

    await waitFor(() => {
      expect(result.current.isStreaming).toBe(false);
    });

    expect(onToolCall).not.toHaveBeenCalled();
    expect(result.current.pendingToolCall?.call.name).toBe('delete_layer');
    expect(result.current.pendingToolCall?.riskSummary).toContain('将删除整层数据');
    expect(result.current.pendingToolCall?.impactPreview?.length ?? 0).toBeGreaterThan(0);
    expect(result.current.pendingToolCall?.impactPreview?.[0]).toContain('文本会被一并移除');
    const assistant = result.current.messages.find((item) => item.role === 'assistant');
    expect(assistant?.content).toContain('风险较高');
  });

  it('should rewrite legacy risk narration to clarification without raw tool key', async () => {
    const onToolCall = vi.fn();
    const { result } = renderHook(() => useAiChat({ onToolCall }));

    await waitFor(() => {
      expect(result.current.isBootstrapping).toBe(false);
    });

    await act(async () => {
      await result.current.send('__LEGACY_PENDING_SEGMENT_TEXT__');
    });

    await waitFor(() => {
      expect(result.current.isStreaming).toBe(false);
    });

    const assistant = result.current.messages.find((item) => item.role === 'assistant');
    expect(assistant?.content).toContain('删除句段');
    expect(assistant?.content).not.toContain('delete_transcription_segment');
    expect(result.current.pendingToolCall).toBeNull();
    expect(onToolCall).not.toHaveBeenCalled();
  });

  it('should resolve current segment deletion to pending confirmation using selected context', async () => {
    const onToolCall = vi.fn();
    const { result } = renderHook(() => useAiChat({
      onToolCall,
      getContext: () => ({
        shortTerm: {
          page: 'transcription',
          selectedUtteranceId: 'u-current',
        },
      }),
    }));

    await waitFor(() => {
      expect(result.current.isBootstrapping).toBe(false);
    });

    await act(async () => {
      await result.current.send('删除当前句段');
    });

    await waitFor(() => {
      expect(result.current.isStreaming).toBe(false);
    });

    expect(result.current.pendingToolCall?.call.name).toBe('delete_transcription_segment');
    expect(result.current.pendingToolCall?.call.arguments.utteranceId).toBe('u-current');
    const assistant = result.current.messages.find((item) => item.role === 'assistant');
    expect(assistant?.content).toContain('删除句段');
    expect(assistant?.content).toContain('风险较高');
    expect(onToolCall).not.toHaveBeenCalled();
  });

  it('should treat 删除之 as actionable deletion with selected target context', async () => {
    const onToolCall = vi.fn();
    const { result } = renderHook(() => useAiChat({
      onToolCall,
      getContext: () => ({
        shortTerm: {
          page: 'transcription',
          selectedUtteranceId: 'u-current',
        },
      }),
    }));

    await waitFor(() => {
      expect(result.current.isBootstrapping).toBe(false);
    });

    await act(async () => {
      await result.current.send('删除之');
    });

    await waitFor(() => {
      expect(result.current.isStreaming).toBe(false);
    });

    expect(result.current.pendingToolCall?.call.name).toBe('delete_transcription_segment');
    expect(result.current.pendingToolCall?.call.arguments.utteranceId).toBe('u-current');
    expect(onToolCall).not.toHaveBeenCalled();
  });

  it('should execute delete after clarification when user selects target and replies 这个', async () => {
    const onToolCall = vi.fn().mockResolvedValue({ ok: true, message: '句段已删除。' });
    let selectedUtteranceId = '';
    const { result } = renderHook(() => useAiChat({
      onToolCall,
      getContext: () => ({
        shortTerm: {
          page: 'transcription',
          ...(selectedUtteranceId ? { selectedUtteranceId } : {}),
        },
      }),
    }));

    await waitFor(() => {
      expect(result.current.isBootstrapping).toBe(false);
    });

    await act(async () => {
      await result.current.send('删除当前句段');
    });

    await waitFor(() => {
      expect(result.current.isStreaming).toBe(false);
    });

    expect(onToolCall).toHaveBeenCalledTimes(0);
    const clarifyAssistant = result.current.messages.find((item) => item.role === 'assistant');
    expect(clarifyAssistant?.content).toContain('缺少目标句段');

    selectedUtteranceId = 'u1';

    await act(async () => {
      await result.current.send('这个');
    });

    await waitFor(() => {
      expect(result.current.isStreaming).toBe(false);
    });

    await waitFor(() => {
      expect(result.current.pendingToolCall).not.toBeNull();
    });
    expect(result.current.pendingToolCall?.call.name).toBe('delete_transcription_segment');
    expect(result.current.pendingToolCall?.call.arguments.utteranceId).toBe('u1');

    await act(async () => {
      await result.current.confirmPendingToolCall();
    });

    expect(onToolCall).toHaveBeenCalledTimes(1);
    const firstCall = onToolCall.mock.calls[0]?.[0];
    expect(firstCall?.name).toBe('delete_transcription_segment');
    expect(firstCall?.arguments.utteranceId).toBe('u1');
  });

  it('should auto-execute destructive tool call when risk check marks it as low risk', async () => {
    const onToolCall = vi.fn().mockResolvedValue({ ok: true, message: '句段已删除。' });
    const onToolRiskCheck = vi.fn().mockReturnValue({ requiresConfirmation: false });
    const { result } = renderHook(() => useAiChat({ onToolCall, onToolRiskCheck }));

    await waitFor(() => {
      expect(result.current.isBootstrapping).toBe(false);
    });

    await act(async () => {
      await result.current.send('__TOOL_DELETE_SEGMENT__');
    });

    await waitFor(() => {
      expect(result.current.isStreaming).toBe(false);
    });

    expect(onToolRiskCheck).toHaveBeenCalledTimes(1);
    expect(onToolCall).toHaveBeenCalledTimes(1);
    expect(result.current.pendingToolCall).toBeNull();
    const assistant = result.current.messages.find((item) => item.role === 'assistant');
    expect(assistant?.status).toBe('done');
    expect(assistant?.content).toContain('句段已删除');
  });

  it('should use custom risk preview from risk check when confirmation is required', async () => {
    const onToolCall = vi.fn();
    const onToolRiskCheck = vi.fn().mockReturnValue({
      requiresConfirmation: true,
      riskSummary: '自定义风险摘要',
      impactPreview: ['自定义影响A', '自定义影响B'],
    });
    const { result } = renderHook(() => useAiChat({ onToolCall, onToolRiskCheck }));

    await waitFor(() => {
      expect(result.current.isBootstrapping).toBe(false);
    });

    await act(async () => {
      await result.current.send('__TOOL_DELETE_LAYER__');
    });

    await waitFor(() => {
      expect(result.current.pendingToolCall).not.toBeNull();
    });

    expect(onToolRiskCheck).toHaveBeenCalledTimes(1);
    expect(onToolCall).not.toHaveBeenCalled();
    expect(result.current.pendingToolCall?.riskSummary).toBe('自定义风险摘要');
    expect(result.current.pendingToolCall?.impactPreview).toEqual(['自定义影响A', '自定义影响B']);
  });

  it('should execute destructive tool call after explicit confirmation', async () => {
    const onToolCall = vi.fn().mockResolvedValue({ ok: true, message: '已删除目标层' });
    const { result } = renderHook(() => useAiChat({ onToolCall }));

    await waitFor(() => {
      expect(result.current.isBootstrapping).toBe(false);
    });

    await act(async () => {
      await result.current.send('__TOOL_DELETE_LAYER__');
    });

    await waitFor(() => {
      expect(result.current.pendingToolCall).not.toBeNull();
    });

    await act(async () => {
      await result.current.confirmPendingToolCall();
    });

    expect(onToolCall).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(result.current.pendingToolCall).toBeNull();
    });
    const assistant = result.current.messages.find((item) => item.role === 'assistant');
    expect(assistant?.content).toContain('我已经按你的意思完成了这个操作');
    expect(assistant?.content).toContain('已删除目标层');

    const auditRows = await db.audit_logs.toArray();
    const decisionLog = auditRows.find((row) => row.field === 'ai_tool_call_decision');
    expect(decisionLog?.newValue).toBe('confirmed:delete_layer');
    expect(decisionLog?.source).toBe('human');
  });

  it('should cancel destructive tool call and keep it unexecuted', async () => {
    const onToolCall = vi.fn();
    const { result } = renderHook(() => useAiChat({ onToolCall }));

    await waitFor(() => {
      expect(result.current.isBootstrapping).toBe(false);
    });

    await act(async () => {
      await result.current.send('__TOOL_DELETE_LAYER__');
    });

    await waitFor(() => {
      expect(result.current.pendingToolCall).not.toBeNull();
    });

    await act(async () => {
      await result.current.cancelPendingToolCall();
    });

    expect(onToolCall).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(result.current.pendingToolCall).toBeNull();
    });
    const assistant = result.current.messages.find((item) => item.role === 'assistant');
    expect(assistant?.content).toContain('已取消');

    const auditRows = await db.audit_logs.toArray();
    const decisionLog = auditRows.find((row) => row.field === 'ai_tool_call_decision');
    expect(decisionLog?.newValue).toBe('cancelled:delete_layer');
    expect(decisionLog?.source).toBe('human');
  });

  it('should write confirm_failed exception audit log when tool execution throws', async () => {
    const onToolCall = vi.fn().mockRejectedValue(new Error('boom'));
    const { result } = renderHook(() => useAiChat({ onToolCall }));

    await waitFor(() => {
      expect(result.current.isBootstrapping).toBe(false);
    });

    await act(async () => {
      await result.current.send('__TOOL_DELETE_LAYER__');
    });

    await waitFor(() => {
      expect(result.current.pendingToolCall).not.toBeNull();
    });

    await act(async () => {
      await result.current.confirmPendingToolCall();
    });

    const assistant = result.current.messages.find((item) => item.role === 'assistant');
    expect(assistant?.content).toContain('没有成功');

    const auditRows = await db.audit_logs.toArray();
    const decisionLog = auditRows.find((row) => row.field === 'ai_tool_call_decision');
    expect(decisionLog?.newValue).toBe('confirm_failed:delete_layer:exception');
    expect(decisionLog?.source).toBe('human');
  });

  it('should set error status when auto-executed tool call fails', async () => {
    const onToolCall = vi.fn().mockResolvedValue({ ok: false, message: '重命名失败' });
    const { result } = renderHook(() => useAiChat({ onToolCall }));

    await waitFor(() => {
      expect(result.current.isBootstrapping).toBe(false);
    });

    await act(async () => {
      await result.current.send('__TOOL_RENAME_LAYER__');
    });

    await waitFor(() => {
      expect(result.current.isStreaming).toBe(false);
    });

    const assistant = result.current.messages.find((item) => item.role === 'assistant');
    expect(assistant?.status).toBe('error');
    expect(assistant?.content).toContain('没有成功');
    expect(result.current.lastError).toBe('重命名失败');
  });

  it('should write auto audit log for non-destructive tool execution', async () => {
    const onToolCall = vi.fn().mockResolvedValue({ ok: true, message: '已重命名' });
    const { result } = renderHook(() => useAiChat({ onToolCall }));

    await waitFor(() => {
      expect(result.current.isBootstrapping).toBe(false);
    });

    await act(async () => {
      await result.current.send('__TOOL_RENAME_LAYER__');
    });

    await waitFor(() => {
      expect(result.current.isStreaming).toBe(false);
    });

    const assistant = result.current.messages.find((item) => item.role === 'assistant');
    expect(assistant?.status).toBe('done');
    expect(assistant?.content).toContain('我已经按你的意思完成了这个操作');
    expect(assistant?.content).toContain('已重命名');

    const auditRows = await db.audit_logs.toArray();
    const decisionLog = auditRows.find((row) => row.field === 'ai_tool_call_decision');
    expect(decisionLog?.newValue).toBe('auto_confirmed:set_transcription_text');
    expect(decisionLog?.oldValue).toBe('auto:set_transcription_text');
    expect(decisionLog?.source).toBe('ai');
  });

  it('should persist structured replay metadata for auto tool decisions', async () => {
    const onToolCall = vi.fn().mockResolvedValue({ ok: true, message: '已重命名' });
    const { result } = renderHook(() => useAiChat({ onToolCall }));

    await waitFor(() => {
      expect(result.current.isBootstrapping).toBe(false);
    });

    await act(async () => {
      await result.current.send('__TOOL_RENAME_LAYER__');
    });

    await waitFor(() => {
      expect(result.current.isStreaming).toBe(false);
    });

    const auditRows = await db.audit_logs.toArray();
    const decisionLog = auditRows.find((row) => row.field === 'ai_tool_call_decision');
    expect(decisionLog?.requestId).toMatch(/^toolreq_/);
    expect(typeof decisionLog?.metadataJson).toBe('string');

    const metadata = JSON.parse(decisionLog?.metadataJson ?? '{}') as {
      phase?: string;
      executed?: boolean;
      toolCall?: { name?: string; arguments?: { utteranceId?: string; text?: string }; requestId?: string };
      context?: { userText?: string; providerId?: string; model?: string };
    };

    expect(metadata.phase).toBe('decision');
    expect(metadata.executed).toBe(true);
    expect(metadata.toolCall?.name).toBe('set_transcription_text');
    expect(metadata.toolCall?.arguments).toEqual({ utteranceId: 'u1', text: 'hello' });
    expect(metadata.toolCall?.requestId).toBe(decisionLog?.requestId);
    expect(metadata.context?.userText).toBe('__TOOL_RENAME_LAYER__');
    expect(metadata.context?.providerId).toBe('mock');
    expect(typeof metadata.context?.model).toBe('string');
  });

  it('should allow intentional repeated execution across remounts when request scope changes', async () => {
    const onToolCall = vi.fn().mockResolvedValue({ ok: true, message: '已重命名' });
    const first = renderHook(() => useAiChat({ onToolCall }));

    await waitFor(() => {
      expect(first.result.current.isBootstrapping).toBe(false);
    });

    await act(async () => {
      await first.result.current.send('__TOOL_RENAME_LAYER__');
    });

    await waitFor(() => {
      expect(first.result.current.isStreaming).toBe(false);
    });

    expect(onToolCall).toHaveBeenCalledTimes(1);
    first.unmount();

    const second = renderHook(() => useAiChat({ onToolCall }));

    await waitFor(() => {
      expect(second.result.current.isBootstrapping).toBe(false);
    });

    await act(async () => {
      await second.result.current.send('__TOOL_RENAME_LAYER__');
    });

    await waitFor(() => {
      expect(second.result.current.isStreaming).toBe(false);
    });

    expect(onToolCall).toHaveBeenCalledTimes(2);
    const assistant = second.result.current.messages.find((item) => item.role === 'assistant');
    expect(assistant?.status).toBe('done');
    expect(assistant?.content).toContain('已重命名');
  });

  it('should render concise tool feedback when configured', async () => {
    const onToolCall = vi.fn().mockResolvedValue({ ok: true, message: '已重命名' });
    const { result } = renderHook(() => useAiChat({ onToolCall }));

    await waitFor(() => {
      expect(result.current.isBootstrapping).toBe(false);
    });

    await act(async () => {
      result.current.updateSettings({ toolFeedbackStyle: 'concise' });
    });

    await act(async () => {
      await result.current.send('__TOOL_RENAME_LAYER__');
    });

    await waitFor(() => {
      expect(result.current.isStreaming).toBe(false);
    });

    const assistant = result.current.messages.find((item) => item.role === 'assistant');
    expect(assistant?.status).toBe('done');
    expect(assistant?.content).toContain('已完成（set_transcription_text）：已重命名');
    expect(assistant?.content).not.toContain('我已经按你的意思完成了这个操作');
  });

  it('should write auto_failed audit log when auto-executed tool throws', async () => {
    const onToolCall = vi.fn().mockRejectedValue(new Error('network'));
    const { result } = renderHook(() => useAiChat({ onToolCall }));

    await waitFor(() => {
      expect(result.current.isBootstrapping).toBe(false);
    });

    await act(async () => {
      await result.current.send('__TOOL_RENAME_LAYER__');
    });

    await waitFor(() => {
      expect(result.current.isStreaming).toBe(false);
    });

    const assistant = result.current.messages.find((item) => item.role === 'assistant');
    expect(assistant?.status).toBe('error');
    expect(result.current.lastError).toBe('network');

    const auditRows = await db.audit_logs.toArray();
    const decisionLog = auditRows.find((row) => row.field === 'ai_tool_call_decision');
    expect(decisionLog?.newValue).toBe('auto_failed:set_transcription_text:exception');
  });

  it('should ignore tool call when user message has no action intent', async () => {
    const onToolCall = vi.fn().mockResolvedValue({ ok: true, message: '不应执行' });
    const { result } = renderHook(() => useAiChat({ onToolCall }));

    await waitFor(() => {
      expect(result.current.isBootstrapping).toBe(false);
    });

    await act(async () => {
      await result.current.send('你好');
    });

    await waitFor(() => {
      expect(result.current.isStreaming).toBe(false);
    });

    expect(onToolCall).not.toHaveBeenCalled();
    expect(result.current.pendingToolCall).toBeNull();
    const assistant = result.current.messages.find((item) => item.role === 'assistant');
    expect(assistant?.status).toBe('done');
    expect(assistant?.content).toContain('你好，我在');
  });

  it('should ignore tool call for meta explanation questions', async () => {
    const onToolCall = vi.fn().mockResolvedValue({ ok: true, message: '不应执行' });
    const { result } = renderHook(() => useAiChat({ onToolCall }));

    await waitFor(() => {
      expect(result.current.isBootstrapping).toBe(false);
    });

    await act(async () => {
      await result.current.send('请解释删除层命令是什么意思');
    });

    await waitFor(() => {
      expect(result.current.isStreaming).toBe(false);
    });

    expect(onToolCall).not.toHaveBeenCalled();
    expect(result.current.pendingToolCall).toBeNull();
    const assistant = result.current.messages.find((item) => item.role === 'assistant');
    expect(assistant?.status).toBe('done');
    expect(assistant?.content).toContain('不会执行工具操作');
  });

  it('should ignore tool call for technical comparison discussion', async () => {
    const onToolCall = vi.fn().mockResolvedValue({ ok: true, message: '不应执行' });
    const { result } = renderHook(() => useAiChat({ onToolCall }));

    await waitFor(() => {
      expect(result.current.isBootstrapping).toBe(false);
    });

    await act(async () => {
      await result.current.send('set_translation_text和set_transcription_text有什么区别？');
    });

    await waitFor(() => {
      expect(result.current.isStreaming).toBe(false);
    });

    expect(onToolCall).not.toHaveBeenCalled();
    expect(result.current.pendingToolCall).toBeNull();
    const assistant = result.current.messages.find((item) => item.role === 'assistant');
    expect(assistant?.status).toBe('done');
    expect(assistant?.content).toContain('不会执行工具操作');
  });

  it('should block sending new message when a high-risk tool call is pending', async () => {
    const onToolCall = vi.fn();
    const { result } = renderHook(() => useAiChat({ onToolCall }));

    await waitFor(() => {
      expect(result.current.isBootstrapping).toBe(false);
    });

    await act(async () => {
      await result.current.send('__TOOL_DELETE_LAYER__');
    });

    await waitFor(() => {
      expect(result.current.pendingToolCall).not.toBeNull();
    });

    const messageCountBefore = result.current.messages.length;
    await act(async () => {
      await result.current.send('继续执行');
    });

    expect(result.current.messages.length).toBe(messageCountBefore);
    expect(result.current.lastError).toContain('待确认');
    expect(result.current.pendingToolCall).not.toBeNull();
    expect(onToolCall).not.toHaveBeenCalled();
  });

  it('should block sending new message while previous reply is still streaming', async () => {
    const { result } = renderHook(() => useAiChat());

    await waitFor(() => {
      expect(result.current.isBootstrapping).toBe(false);
    });

    let firstSend: Promise<void> | undefined;
    await act(async () => {
      firstSend = result.current.send('测试中断');
    });

    await waitFor(() => {
      expect(result.current.isStreaming).toBe(true);
    });

    const messageCountBefore = result.current.messages.length;
    await act(async () => {
      await result.current.send('第二条');
    });

    expect(result.current.messages.length).toBe(messageCountBefore);
    expect(result.current.lastError).toContain('上一条回复仍在生成中');

    await act(async () => {
      result.current.stop();
    });
    await act(async () => {
      await firstSend;
    });
  });

  it('should allow sending a new message immediately after stop is requested', async () => {
    const { result } = renderHook(() => useAiChat());

    await waitFor(() => {
      expect(result.current.isBootstrapping).toBe(false);
    });

    let firstSend: Promise<void> | undefined;
    await act(async () => {
      firstSend = result.current.send('测试中断');
    });

    await waitFor(() => {
      expect(result.current.isStreaming).toBe(true);
    });

    await act(async () => {
      result.current.stop();
    });

    await act(async () => {
      await result.current.send('你好');
    });

    await act(async () => {
      await firstSend;
    });

    await waitFor(() => {
      expect(result.current.isStreaming).toBe(false);
    });

    const userMessages = result.current.messages.filter((item) => item.role === 'user');
    expect(userMessages.some((item) => item.content === '测试中断')).toBe(true);
    expect(userMessages.some((item) => item.content === '你好')).toBe(true);
    expect(result.current.lastError ?? '').not.toContain('上一条回复仍在生成中');
  });

  it('should reject auto tool execution when arguments are invalid', async () => {
    const onToolCall = vi.fn().mockResolvedValue({ ok: true, message: '不应执行' });
    const { result } = renderHook(() => useAiChat({ onToolCall }));

    await waitFor(() => {
      expect(result.current.isBootstrapping).toBe(false);
    });

    await act(async () => {
      await result.current.send('__TOOL_INVALID_ARGS__');
    });

    await waitFor(() => {
      expect(result.current.isStreaming).toBe(false);
    });

    expect(onToolCall).not.toHaveBeenCalled();
    const assistant = result.current.messages.find((item) => item.role === 'assistant');
    expect(assistant?.status).toBe('error');
    expect(assistant?.content).toContain('参数校验失败');
    expect(result.current.lastError).toContain('参数校验失败');

    const auditRows = await db.audit_logs.toArray();
    const decisionLog = auditRows.find((row) => row.field === 'ai_tool_call_decision');
    expect(decisionLog?.newValue).toBe('auto_failed:set_transcription_text:invalid_args');
    expect(decisionLog?.source).toBe('ai');
  });

  it('should parse and execute tool call from mixed json + narrative response', async () => {
    const onToolCall = vi.fn().mockResolvedValue({ ok: true, message: '转写文本已写入。' });
    const { result } = renderHook(() => useAiChat({ onToolCall }));

    await waitFor(() => {
      expect(result.current.isBootstrapping).toBe(false);
    });

    await act(async () => {
      await result.current.send('__TOOL_MIXED_REPLY__');
    });

    await waitFor(() => {
      expect(result.current.isStreaming).toBe(false);
    });

    expect(onToolCall).toHaveBeenCalledTimes(1);
    const assistant = result.current.messages.find((item) => item.role === 'assistant');
    expect(assistant?.status).toBe('done');
    expect(assistant?.content).toContain('set_transcription_text');
    expect(assistant?.content).toContain('转写文本已写入。');
    expect(assistant?.content).not.toContain('好的，我已经处理完毕');
  });

  it('should show explicit error message when provider returns empty reply', async () => {
    const onToolCall = vi.fn();
    const { result } = renderHook(() => useAiChat({ onToolCall }));

    await waitFor(() => {
      expect(result.current.isBootstrapping).toBe(false);
    });

    await act(async () => {
      await result.current.send('__EMPTY_REPLY__');
    });

    await waitFor(() => {
      expect(result.current.isStreaming).toBe(false);
    });

    const assistant = result.current.messages.find((item) => item.role === 'assistant');
    expect(assistant?.status).toBe('error');
    expect(assistant?.content).toContain('没有收到模型的有效回复');
    expect(result.current.lastError).toBe('模型返回空响应');
    expect(onToolCall).not.toHaveBeenCalled();
  });

  it('should mark connection status success after real chat receives first chunk', async () => {
    const { result } = renderHook(() => useAiChat());

    await waitFor(() => {
      expect(result.current.isBootstrapping).toBe(false);
    });

    await act(async () => {
      result.current.updateSettings({ providerKind: 'deepseek', apiKey: 'sk-test' });
    });

    await act(async () => {
      await result.current.send('你好');
    });

    await waitFor(() => {
      expect(result.current.isStreaming).toBe(false);
    });

    expect(result.current.connectionTestStatus).toBe('success');
  });

  it('should keep plain chat available while tool decision chain is in rollback mode', async () => {
    (featureFlags as { aiChatRollbackMode: boolean }).aiChatRollbackMode = true;
    const onToolCall = vi.fn();
    const { result } = renderHook(() => useAiChat({ onToolCall }));

    await waitFor(() => {
      expect(result.current.isBootstrapping).toBe(false);
    });

    await act(async () => {
      await result.current.send('__PLAIN_REPLY__');
    });

    await waitFor(() => {
      expect(result.current.isStreaming).toBe(false);
    });

    expect(result.current.toolDecisionMode).toBe('rollback');
    expect(onToolCall).not.toHaveBeenCalled();
    const assistant = result.current.messages.find((item) => item.role === 'assistant');
    expect(assistant?.status).toBe('done');
    expect(assistant?.content).toContain('这是普通对话回复');
  });

  it('should skip tool execution and only audit in gray mode', async () => {
    (featureFlags as { aiChatGrayMode: boolean }).aiChatGrayMode = true;
    const onToolCall = vi.fn().mockResolvedValue({ ok: true, message: '不应执行' });
    const { result } = renderHook(() => useAiChat({ onToolCall }));

    await waitFor(() => {
      expect(result.current.isBootstrapping).toBe(false);
    });

    await act(async () => {
      await result.current.send('__TOOL_RENAME_LAYER__');
    });

    await waitFor(() => {
      expect(result.current.isStreaming).toBe(false);
    });

    expect(result.current.toolDecisionMode).toBe('gray');
    expect(onToolCall).not.toHaveBeenCalled();
    expect(result.current.pendingToolCall).toBeNull();
    const assistant = result.current.messages.find((item) => item.role === 'assistant');
    expect(assistant?.status).toBe('done');
    expect(assistant?.content).toContain('灰度模式');

    const auditRows = await db.audit_logs.toArray();
    const decisionLog = auditRows.find((row) => row.field === 'ai_tool_call_decision');
    expect(decisionLog?.newValue).toBe('gray_skipped:set_transcription_text');
    expect(decisionLog?.source).toBe('system');
  });

  it('should skip tool execution in rollback mode without disabling chat stream', async () => {
    (featureFlags as { aiChatRollbackMode: boolean }).aiChatRollbackMode = true;
    const onToolCall = vi.fn().mockResolvedValue({ ok: true, message: '不应执行' });
    const { result } = renderHook(() => useAiChat({ onToolCall }));

    await waitFor(() => {
      expect(result.current.isBootstrapping).toBe(false);
    });

    await act(async () => {
      await result.current.send('__TOOL_RENAME_LAYER__');
    });

    await waitFor(() => {
      expect(result.current.isStreaming).toBe(false);
    });

    expect(result.current.toolDecisionMode).toBe('rollback');
    expect(onToolCall).not.toHaveBeenCalled();
    const assistant = result.current.messages.find((item) => item.role === 'assistant');
    expect(assistant?.status).toBe('done');
    expect(assistant?.content).toContain('回滚模式');

    const auditRows = await db.audit_logs.toArray();
    const decisionLog = auditRows.find((row) => row.field === 'ai_tool_call_decision');
    expect(decisionLog?.newValue).toBe('rollback_skipped:set_transcription_text');
    expect(decisionLog?.source).toBe('system');
  });

  it('should show upstream timeout error when first chunk does not arrive in time', async () => {
    const { result } = renderHook(() => useAiChat({ firstChunkTimeoutMs: 30 }));

    await waitFor(() => {
      expect(result.current.isBootstrapping).toBe(false);
    });

    await act(async () => {
      result.current.updateSettings({ providerKind: 'deepseek', apiKey: 'sk-test' });
    });

    await act(async () => {
      await result.current.send('__STALL_NO_FIRST_CHUNK__');
    });

    await waitFor(() => {
      expect(result.current.isStreaming).toBe(false);
    });

    const assistant = result.current.messages.find((item) => item.role === 'assistant');
    expect(assistant?.status).toBe('error');
    expect(result.current.lastError).toContain('首包超时');
    expect(result.current.connectionTestStatus).toBe('error');
  });

  it('should not enforce first-chunk timeout for ollama local provider', async () => {
    const { result } = renderHook(() => useAiChat({ firstChunkTimeoutMs: 30 }));

    await waitFor(() => {
      expect(result.current.isBootstrapping).toBe(false);
    });

    await act(async () => {
      result.current.updateSettings({ providerKind: 'ollama', baseUrl: 'http://localhost:11434' });
    });

    let sendPromise: Promise<void> | undefined;
    await act(async () => {
      sendPromise = result.current.send('__STALL_NO_FIRST_CHUNK__');
    });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 80));
    });

    expect(result.current.isStreaming).toBe(true);
    expect(result.current.lastError ?? '').not.toContain('首包超时');

    await act(async () => {
      result.current.stop();
    });
    await act(async () => {
      await sendPromise;
    });

    await waitFor(() => {
      expect(result.current.isStreaming).toBe(false);
    });
  });

  it('should treat split-segment command as actionable intent', async () => {
    const onToolCall = vi.fn().mockResolvedValue({ ok: true, message: '已在当前句段后创建新区间。' });
    const { result } = renderHook(() => useAiChat({ onToolCall }));

    await waitFor(() => {
      expect(result.current.isBootstrapping).toBe(false);
    });

    await act(async () => {
      await result.current.send('切分此句段');
    });

    await waitFor(() => {
      expect(result.current.isStreaming).toBe(false);
    });

    expect(onToolCall).toHaveBeenCalledTimes(1);
    const assistant = result.current.messages.find((item) => item.role === 'assistant');
    expect(assistant?.status).toBe('done');
    expect(assistant?.content).toContain('create_transcription_segment');
    expect(assistant?.content).toContain('已在当前句段后创建新区间。');
  });

  it('should treat polite question style edit request as actionable intent', async () => {
    const onToolCall = vi.fn().mockResolvedValue({ ok: true, message: '已更新转写。' });
    const { result } = renderHook(() => useAiChat({ onToolCall }));

    await waitFor(() => {
      expect(result.current.isBootstrapping).toBe(false);
    });

    await act(async () => {
      await result.current.send('可以把当前句段转写改为你好么？');
    });

    await waitFor(() => {
      expect(result.current.isStreaming).toBe(false);
    });

    expect(onToolCall).toHaveBeenCalledTimes(1);
    const firstCall = onToolCall.mock.calls[0]?.[0];
    expect(firstCall?.name).toBe('set_transcription_text');
    expect(firstCall?.arguments.utteranceId).toBe('u1');
    expect(firstCall?.arguments.text).toBe('你好');
  });

  it('should ask for clarification when intent score is in gray zone', async () => {
    const onToolCall = vi.fn().mockResolvedValue({ ok: true, message: '不应执行' });
    const { result } = renderHook(() => useAiChat({ onToolCall }));

    await waitFor(() => {
      expect(result.current.isBootstrapping).toBe(false);
    });

    await act(async () => {
      await result.current.send('这个句段呢？');
    });

    await waitFor(() => {
      expect(result.current.isStreaming).toBe(false);
    });

    expect(onToolCall).not.toHaveBeenCalled();
    const assistant = result.current.messages.find((item) => item.role === 'assistant');
    expect(assistant?.status).toBe('done');
    expect(assistant?.content).toContain('还不够确定');

    const auditRows = await db.audit_logs.toArray();
    const intentLog = auditRows.find((row) => row.field === 'ai_tool_call_intent');
    expect(intentLog?.newValue).toContain('"decision":"clarify"');
  });

  it('should expose task session and candidate-style target clarification metadata', async () => {
    const onToolCall = vi.fn().mockResolvedValue({ ok: true, message: '不应执行' });
    const { result } = renderHook(() => useAiChat({ onToolCall }));

    await waitFor(() => {
      expect(result.current.isBootstrapping).toBe(false);
    });

    await act(async () => {
      await result.current.send('删除当前句段');
    });

    await waitFor(() => {
      expect(result.current.isStreaming).toBe(false);
    });

    expect(onToolCall).not.toHaveBeenCalled();
    expect(result.current.taskSession.status).toBe('waiting_clarify');
    expect(result.current.taskSession.toolName).toBe('delete_transcription_segment');
    expect(result.current.taskSession.clarifyReason).toBe('missing-utterance-target');

    const assistant = result.current.messages.find((item) => item.role === 'assistant');
    expect(assistant?.content).toContain('第1个/这个');
  });

  it('should include recovery next-step hints when tool execution fails', async () => {
    const onToolCall = vi.fn().mockResolvedValue({ ok: false, message: '未找到目标句段：u404' });
    const { result } = renderHook(() => useAiChat({ onToolCall }));

    await waitFor(() => {
      expect(result.current.isBootstrapping).toBe(false);
    });

    await act(async () => {
      await result.current.send('__TOOL_RENAME_LAYER__');
    });

    await waitFor(() => {
      expect(result.current.isStreaming).toBe(false);
    });

    const assistant = result.current.messages.find((item) => item.role === 'assistant');
    expect(assistant?.status).toBe('error');
    expect(assistant?.content).toContain('建议下一步');
  });

  it('should enrich delete_layer args from user text for language-specific translation-layer deletion', async () => {
    const onToolCall = vi.fn().mockResolvedValue({ ok: true, message: '已删除层：trl-jpn' });
    const { result } = renderHook(() => useAiChat({ onToolCall }));

    await waitFor(() => {
      expect(result.current.isBootstrapping).toBe(false);
    });

    await act(async () => {
      await result.current.send('删除日本语翻译层');
    });

    await waitFor(() => {
      expect(result.current.isStreaming).toBe(false);
    });

    await waitFor(() => {
      expect(result.current.pendingToolCall).not.toBeNull();
    });

    const pending = result.current.pendingToolCall;
    expect(pending?.call.name).toBe('delete_layer');
    expect(pending?.call.arguments.layerType).toBe('translation');
    expect(pending?.call.arguments.languageQuery).toBe('日本语');

    await act(async () => {
      await result.current.confirmPendingToolCall();
    });

    expect(onToolCall).toHaveBeenCalledTimes(1);
    const firstCall = onToolCall.mock.calls[0]?.[0];
    expect(firstCall?.name).toBe('delete_layer');
    expect(firstCall?.arguments.layerType).toBe('translation');
    expect(firstCall?.arguments.languageQuery).toBe('日本语');

    const assistant = result.current.messages.find((item) => item.role === 'assistant');
    expect(assistant?.status).toBe('done');
    expect(assistant?.content).toContain('delete_layer');
    expect(assistant?.content).toContain('已删除层：trl-jpn');
  });

  it('should resolve set_translation_text targets from selected context before execution', async () => {
    const onToolCall = vi.fn().mockResolvedValue({ ok: true, message: '翻译文本已写入。' });
    const { result } = renderHook(() => useAiChat({
      onToolCall,
      getContext: () => ({
        shortTerm: {
          page: 'transcription',
          selectedUtteranceId: 'u-selected',
          selectedLayerId: 'trl-selected',
          selectedLayerType: 'translation',
          selectedTranslationLayerId: 'trl-selected',
        },
      }),
    }));

    await waitFor(() => {
      expect(result.current.isBootstrapping).toBe(false);
    });

    await act(async () => {
      await result.current.send('__TOOL_SET_TRANSLATION_MISSING_LAYER__');
    });

    await waitFor(() => {
      expect(result.current.isStreaming).toBe(false);
    });

    expect(onToolCall).toHaveBeenCalledTimes(1);
    const firstCall = onToolCall.mock.calls[0]?.[0];
    expect(firstCall?.name).toBe('set_translation_text');
    expect(firstCall?.arguments.utteranceId).toBe('u1');
    expect(firstCall?.arguments.layerId).toBe('trl-selected');
  });

  it('should clarify when translation-layer target cannot be resolved', async () => {
    const onToolCall = vi.fn().mockResolvedValue({ ok: true, message: '不应执行' });
    const { result } = renderHook(() => useAiChat({ onToolCall }));

    await waitFor(() => {
      expect(result.current.isBootstrapping).toBe(false);
    });

    await act(async () => {
      await result.current.send('__TOOL_SET_TRANSLATION_MISSING_LAYER__');
    });

    await waitFor(() => {
      expect(result.current.isStreaming).toBe(false);
    });

    expect(onToolCall).not.toHaveBeenCalled();
    const assistant = result.current.messages.find((item) => item.role === 'assistant');
    expect(assistant?.status).toBe('done');
    expect(assistant?.content).toContain('缺少目标翻译层');
  });

  it('should resolve clear_translation_segment targets from selected context', async () => {
    const onToolCall = vi.fn().mockResolvedValue({ ok: true, message: '翻译已清空。' });
    const { result } = renderHook(() => useAiChat({
      onToolCall,
      getContext: () => ({
        shortTerm: {
          page: 'transcription',
          selectedUtteranceId: 'u-selected',
          selectedLayerId: 'trl-selected',
          selectedLayerType: 'translation',
        },
      }),
    }));

    await waitFor(() => {
      expect(result.current.isBootstrapping).toBe(false);
    });

    await act(async () => {
      await result.current.send('__TOOL_CLEAR_TRANSLATION_MISSING_LAYER__');
    });

    await waitFor(() => {
      expect(result.current.isStreaming).toBe(false);
    });

    expect(onToolCall).toHaveBeenCalledTimes(1);
    const firstCall = onToolCall.mock.calls[0]?.[0];
    expect(firstCall?.name).toBe('clear_translation_segment');
    expect(firstCall?.arguments.utteranceId).toBe('u1');
    expect(firstCall?.arguments.layerId).toBe('trl-selected');
  });

  it('should clarify when link targets cannot be resolved', async () => {
    const onToolCall = vi.fn().mockResolvedValue({ ok: true, message: '不应执行' });
    const { result } = renderHook(() => useAiChat({ onToolCall }));

    await waitFor(() => {
      expect(result.current.isBootstrapping).toBe(false);
    });

    await act(async () => {
      await result.current.send('__TOOL_LINK_MISSING_TARGETS__');
    });

    await waitFor(() => {
      expect(result.current.isStreaming).toBe(false);
    });

    expect(onToolCall).not.toHaveBeenCalled();
    const assistant = result.current.messages.find((item) => item.role === 'assistant');
    expect(assistant?.status).toBe('done');
    expect(assistant?.content).toContain('缺少目标层');
  });

  it('should clarify instead of creating und transcription layer when language target is ambiguous', async () => {
    const onToolCall = vi.fn().mockResolvedValue({ ok: true, message: '不应执行' });
    const { result } = renderHook(() => useAiChat({ onToolCall }));

    await waitFor(() => {
      expect(result.current.isBootstrapping).toBe(false);
    });

    await act(async () => {
      await result.current.send('__TOOL_CREATE_TRANSCRIPTION_LAYER_UND__');
    });

    await waitFor(() => {
      expect(result.current.isStreaming).toBe(false);
    });

    expect(onToolCall).not.toHaveBeenCalled();
    const assistant = result.current.messages.find((item) => item.role === 'assistant');
    expect(assistant?.status).toBe('done');
    expect(assistant?.content).toContain('缺少明确语言或目标层');
  });

  it('should call onMessageComplete with finalized assistant content', async () => {
    const onMessageComplete = vi.fn();
    const { result } = renderHook(() => useAiChat({ onMessageComplete }));

    await waitFor(() => {
      expect(result.current.isBootstrapping).toBe(false);
    });

    await act(async () => {
      await result.current.send('__PLAIN_REPLY__');
    });

    await waitFor(() => {
      expect(result.current.isStreaming).toBe(false);
    });

    expect(onMessageComplete).toHaveBeenCalledTimes(1);
    const [assistantMessageId, content] = onMessageComplete.mock.calls[0] ?? [];
    expect(typeof assistantMessageId).toBe('string');
    expect(content).toContain('普通对话回复');
  });
});
