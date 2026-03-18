// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { db } from '../../db';
import { useAiChat } from './useAiChat';

let lastSystemPrompt = '';

vi.mock('../ai/ChatOrchestrator', () => {
  class MockChatOrchestrator {
    sendMessage(input: { systemPrompt?: string; options?: { signal?: AbortSignal }; history?: Array<{ role: string; content: string }>; userText?: string }) {
      lastSystemPrompt = input.systemPrompt ?? '';
      const signal = input.options?.signal;
      const userText = input.userText ?? input.history?.[input.history.length - 1]?.content ?? '';
      async function* stream() {
        if (userText.includes('__TOOL_DELETE_LAYER__')) {
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
    await db.open();
    await clearAiTables();
  });

  afterEach(async () => {
    cleanup();
    vi.restoreAllMocks();
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
    const assistant = result.current.messages.find((item) => item.role === 'assistant');
    expect(assistant?.content).toContain('执行待确认');
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
    expect(assistant?.content).toContain('执行成功');

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
    expect(assistant?.content).toContain('执行已取消');

    const auditRows = await db.audit_logs.toArray();
    const decisionLog = auditRows.find((row) => row.field === 'ai_tool_call_decision');
    expect(decisionLog?.newValue).toBe('cancelled:delete_layer');
    expect(decisionLog?.source).toBe('human');
  });
});
