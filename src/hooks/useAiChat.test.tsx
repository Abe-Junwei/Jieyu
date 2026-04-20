// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { db } from '../db';
import { featureFlags } from '../ai/config/featureFlags';
import { useAiChat, type AiChatToolCall } from './useAiChat';
import { INITIAL_METRICS } from './useAiChat.config';

let lastSystemPrompt = '';

vi.mock('../ai/ChatOrchestrator', () => {
  class MockChatOrchestrator {
    sendMessage(input: { systemPrompt?: string; options?: { signal?: AbortSignal }; history?: Array<{ role: string; content: string }>; userText?: string }) {
      lastSystemPrompt = input.systemPrompt ?? '';
      const signal = input.options?.signal;
      const userText = input.userText ?? input.history?.[input.history.length - 1]?.content ?? '';
      async function* stream() {
        if (userText.includes('请解释删除层命令是什么意思')) {
          yield { delta: '{"tool_call":{"name":"delete_layer","arguments":{"layerType":"transcription","languageQuery":"中文"}}}' };
          yield { delta: '', done: true };
          return;
        }
        if (userText.includes('set_translation_text和set_transcription_text有什么区别')) {
          yield { delta: '{"tool_call":{"name":"set_translation_text","arguments":{"unitId":"u1","text":"x"}}}' };
          yield { delta: '', done: true };
          return;
        }
        if (userText.includes('__TOOL_DELETE_LAYER__')) {
          yield { delta: '{"tool_call":{"name":"delete_layer","arguments":{"layerType":"transcription","languageQuery":"中文"}}}' };
          yield { delta: '', done: true };
          return;
        }
        if (userText.includes('__TOOL_PROPOSE_CHANGES__')) {
          yield {
            delta: '{"tool_call":{"name":"propose_changes","arguments":{"description":"demo","changes":[{"tool":"set_transcription_text","arguments":{"segmentId":"u1","text":"hi"}}]}}}',
          };
          yield { delta: '', done: true };
          return;
        }
        if (userText.includes('__TOOL_PROPOSE_CHANGES_INVALID__')) {
          yield {
            delta: '{"tool_call":{"name":"propose_changes","arguments":{"changes":[]}}}',
          };
          yield { delta: '', done: true };
          return;
        }
        if (userText.includes('__TOOL_DELETE_SEGMENT__')) {
          yield { delta: '{"tool_call":{"name":"delete_transcription_segment","arguments":{"unitId":"u1"}}}' };
          yield { delta: '', done: true };
          return;
        }
        if (userText.includes('__TOOL_DELETE_SELECTED_SEGMENTS__')) {
          yield { delta: '{"tool_call":{"name":"delete_transcription_segment","arguments":{}}}' };
          yield { delta: '', done: true };
          return;
        }
        if (userText.includes('删除第五个句段')) {
          yield { delta: '{"tool_call":{"name":"delete_transcription_segment","arguments":{}}}' };
          yield { delta: '', done: true };
          return;
        }
        if (userText.includes('删除第一条句段')) {
          yield { delta: '{"tool_call":{"name":"delete_transcription_segment","arguments":{}}}' };
          yield { delta: '', done: true };
          return;
        }
        if (userText.includes('删除前一个句段')) {
          yield { delta: '{"tool_call":{"name":"delete_transcription_segment","arguments":{}}}' };
          yield { delta: '', done: true };
          return;
        }
        if (userText.includes('删除后一个句段')) {
          yield { delta: '{"tool_call":{"name":"delete_transcription_segment","arguments":{}}}' };
          yield { delta: '', done: true };
          return;
        }
        if (userText.includes('删除倒数第二个句段')) {
          yield { delta: '{"tool_call":{"name":"delete_transcription_segment","arguments":{}}}' };
          yield { delta: '', done: true };
          return;
        }
        if (userText.includes('删除中间那个句段')) {
          yield { delta: '{"tool_call":{"name":"delete_transcription_segment","arguments":{}}}' };
          yield { delta: '', done: true };
          return;
        }
        if (userText.includes('删除最后一个句段')) {
          yield { delta: '{"tool_call":{"name":"delete_transcription_segment","arguments":{}}}' };
          yield { delta: '', done: true };
          return;
        }
        if (userText.includes('delete the previous segment')) {
          yield { delta: '{"tool_call":{"name":"delete_transcription_segment","arguments":{}}}' };
          yield { delta: '', done: true };
          return;
        }
        if (userText.includes('delete the last segment')) {
          yield { delta: '{"tool_call":{"name":"delete_transcription_segment","arguments":{}}}' };
          yield { delta: '', done: true };
          return;
        }
        if (userText.includes('把第五个句段转写改为你好')) {
          yield { delta: '{"tool_call":{"name":"set_transcription_text","arguments":{"text":"你好"}}}' };
          yield { delta: '', done: true };
          return;
        }
        if (userText.includes('set the fifth segment transcription to hello')) {
          yield { delta: '{"tool_call":{"name":"set_transcription_text","arguments":{"text":"hello"}}}' };
          yield { delta: '', done: true };
          return;
        }
        if (userText.includes('清空最后一个句段翻译')) {
          yield { delta: '{"tool_call":{"name":"clear_translation_segment","arguments":{}}}' };
          yield { delta: '', done: true };
          return;
        }
        if (userText.includes('__TOOL_MERGE_NEXT_CURRENT_SEGMENT__')) {
          yield { delta: '{"tool_call":{"name":"merge_next","arguments":{}}}' };
          yield { delta: '', done: true };
          return;
        }
        if (userText.includes('__LEGACY_TOOL_MERGE_SELECTED_SEGMENTS__')) {
          yield { delta: '{"tool_call":{"name":"merge_transcription_segments","arguments":{"unitIds":["utt-legacy-1","utt-legacy-2"]}}}' };
          yield { delta: '', done: true };
          return;
        }
        if (userText.includes('clear translation of the last segment')) {
          yield { delta: '{"tool_call":{"name":"clear_translation_segment","arguments":{}}}' };
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
          yield { delta: '{"tool_call":{"name":"set_transcription_text","arguments":{"unitId":"u1","text":"hello"}}}' };
          yield { delta: '', done: true };
          return;
        }
        if (userText.includes('__TOOL_INVALID_ARGS__')) {
          yield { delta: '{"tool_call":{"name":"set_transcription_text","arguments":{"unitId":"u1"}}}' };
          yield { delta: '', done: true };
          return;
        }
        if (userText.includes('__TOOL_SET_TRANSLATION_MISSING_LAYER__')) {
          yield { delta: '{"tool_call":{"name":"set_translation_text","arguments":{"unitId":"u1","text":"译文"}}}' };
          yield { delta: '', done: true };
          return;
        }
        if (userText.includes('__TOOL_CLEAR_TRANSLATION_MISSING_LAYER__')) {
          yield { delta: '{"tool_call":{"name":"clear_translation_segment","arguments":{"unitId":"u1"}}}' };
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
        if (userText.includes('__TOOL_CREATE_TRANSCRIPTION_LAYER__')) {
          yield { delta: '{"tool_call":{"name":"create_transcription_layer","arguments":{"languageId":"eng"}}}' };
          yield { delta: '', done: true };
          return;
        }
        if (userText.includes('__TOOL_MIXED_REPLY__')) {
          yield { delta: '{"tool_call":{"name":"set_transcription_text","arguments":{"unitId":"u1","text":"hello"}}}\n---\n好的，我已经处理完毕。' };
          yield { delta: '', done: true };
          return;
        }
        if (userText.includes('合并句段')) {
          yield { delta: '{"tool_call":{"name":"merge_transcription_segments","arguments":{"segmentId":"seg_1775124896485_puuzw8"}}}' };
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
        if (userText.includes('__LOCAL_CONTEXT_TOOL_FENCED__') && !userText.includes('__LOCAL_TOOL_RESULT__')) {
          yield {
            delta: [
              '```json',
              '{"tool_call":{"name":"get_current_selection","arguments":{}}}',
              '```',
            ].join('\n'),
          };
          yield { delta: '', done: true };
          return;
        }
        if (userText.includes('__LOCAL_CONTEXT_TOOL_CALLS_SINGLE__') && !userText.includes('__LOCAL_TOOL_RESULT__')) {
          yield {
            delta: JSON.stringify({
              tool_calls: [
                { name: 'get_current_selection', arguments: {} },
              ],
            }),
          };
          yield { delta: '', done: true };
          return;
        }
        if (userText.includes('__LOCAL_TOOL_RESULT__')) {
          yield { delta: '基于本地上下文，这是下一步回复。' };
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
          yield { delta: '{"tool_call":{"name":"split_transcription_segment","arguments":{}}}' };
          yield { delta: '', done: true };
          return;
        }
        if (userText.includes('可以把当前句段转写改为你好么')) {
          yield { delta: '{"tool_call":{"name":"set_transcription_text","arguments":{"unitId":"u1","text":"你好"}}}' };
          yield { delta: '', done: true };
          return;
        }
        if (userText.includes('这个句段呢？')) {
          yield { delta: '{"tool_call":{"name":"create_transcription_segment","arguments":{"unitId":"u1"}}}' };
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
        if (userText.includes('__TOOL_DELETE_LAYER_HALLUCINATED_ID__')) {
          yield { delta: '{"tool_call":{"name":"delete_layer","arguments":{"layerId":"transcription_layer_1","layerType":"transcription"}}}' };
          yield { delta: '', done: true };
          return;
        }
        if (userText.includes('__TOOL_SET_TEXT_HALLUCINATED_UNIT__')) {
          yield { delta: '{"tool_call":{"name":"set_transcription_text","arguments":{"unitId":"utt_fake_999","text":"hello"}}}' };
          yield { delta: '', done: true };
          return;
        }
        if (userText.includes('__TOOL_SET_TRANSLATION_HALLUCINATED_LAYER__')) {
          yield { delta: '{"tool_call":{"name":"set_translation_text","arguments":{"layerId":"translation_layer_fake","unitId":"u1","text":"hi"}}}' };
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

const defaultSelectedSegmentShortTerm = {
  page: 'transcription',
  activeUnitId: 'utt-current',
  activeSegmentUnitId: 'seg-current',
  selectedUnitKind: 'segment' as const,
};

const defaultSelectedTranslationShortTerm = {
  ...defaultSelectedSegmentShortTerm,
  activeUnitId: 'utt-selected',
  activeSegmentUnitId: 'seg-selected',
  selectedLayerId: 'trl-selected',
  selectedLayerType: 'translation' as const,
  selectedTranslationLayerId: 'trl-selected',
};

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

  it('should inject concise response-style instruction into system prompt', async () => {
    const { result } = renderHook(() => useAiChat());

    await waitFor(() => {
      expect(result.current.isBootstrapping).toBe(false);
    });

    await act(async () => {
      result.current.updateSettings({ toolFeedbackStyle: 'concise' });
    });

    await act(async () => {
      await result.current.send('__PLAIN_REPLY__');
    });

    await waitFor(() => {
      expect(result.current.isStreaming).toBe(false);
    });

    expect(lastSystemPrompt).toContain('自然语言回复风格：简洁模式');
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
    expect(assistant?.content).toContain('你想继续');
  });

  it('should queue propose_changes for confirmation with child tool calls', async () => {
    const onToolCall = vi.fn();
    const { result } = renderHook(() => useAiChat({ onToolCall }));

    await waitFor(() => {
      expect(result.current.isBootstrapping).toBe(false);
    });

    await act(async () => {
      await result.current.send('__TOOL_PROPOSE_CHANGES__');
    });

    await waitFor(() => {
      expect(result.current.isStreaming).toBe(false);
    });

    expect(onToolCall).not.toHaveBeenCalled();
    expect(result.current.pendingToolCall?.call.name).toBe('propose_changes');
    expect(result.current.pendingToolCall?.proposedChildCalls?.length).toBe(1);
    expect(result.current.pendingToolCall?.proposedChildCalls?.[0]?.name).toBe('set_transcription_text');
    expect(result.current.taskSession.status).toBe('waiting_confirm');
  });

  it('should fail propose_changes with empty changes before confirmation', async () => {
    const onToolCall = vi.fn();
    const { result } = renderHook(() => useAiChat({ onToolCall }));

    await waitFor(() => {
      expect(result.current.isBootstrapping).toBe(false);
    });

    await act(async () => {
      await result.current.send('__TOOL_PROPOSE_CHANGES_INVALID__');
    });

    await waitFor(() => {
      expect(result.current.isStreaming).toBe(false);
    });

    expect(onToolCall).not.toHaveBeenCalled();
    expect(result.current.pendingToolCall).toBeNull();
    expect(result.current.taskSession.status).toBe('idle');
  });

  it('should execute proposed child tools after confirmation', async () => {
    const onToolCall = vi.fn().mockResolvedValue({ ok: true, message: 'ok' });
    const { result } = renderHook(() => useAiChat({ onToolCall }));

    await waitFor(() => {
      expect(result.current.isBootstrapping).toBe(false);
    });

    await act(async () => {
      await result.current.send('__TOOL_PROPOSE_CHANGES__');
    });

    await waitFor(() => {
      expect(result.current.isStreaming).toBe(false);
    });

    await act(async () => {
      await result.current.confirmPendingToolCall();
    });

    await waitFor(() => {
      expect(result.current.pendingToolCall).toBeNull();
    });

    expect(onToolCall).toHaveBeenCalledTimes(1);
    const confirmed = onToolCall.mock.calls[0]?.[0] as AiChatToolCall;
    expect(confirmed?.name).toBe('set_transcription_text');
    expect(confirmed?.arguments.segmentId).toBe('u1');
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

  it('should require segment selection before resolving current segment deletion', async () => {
    const onToolCall = vi.fn();
    const { result } = renderHook(() => useAiChat({
      onToolCall,
      getContext: () => ({
        shortTerm: {
          page: 'transcription',
          activeUnitId: 'u-current',
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

    expect(result.current.pendingToolCall).toBeNull();
    expect(result.current.taskSession.status).toBe('waiting_clarify');
    const assistant = result.current.messages.find((item) => item.role === 'assistant');
    expect(assistant?.content).toContain('缺少目标句段');
    expect(onToolCall).not.toHaveBeenCalled();
  });

  it('should resolve current segment deletion to segmentId when a segment unit is selected', async () => {
    const onToolCall = vi.fn();
    const { result } = renderHook(() => useAiChat({
      onToolCall,
      getContext: () => ({
        shortTerm: {
          page: 'transcription',
          activeUnitId: 'utt-parent',
          activeSegmentUnitId: 'seg-current',
          selectedUnitKind: 'segment',
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

    expect(result.current.pendingToolCall?.call.arguments.segmentId).toBe('seg-current');
    expect(result.current.pendingToolCall?.call.arguments.unitId).toBeUndefined();
    expect(onToolCall).not.toHaveBeenCalled();
  });

  it('should resolve deleting the first segment without requiring manual selection', async () => {
    const onToolCall = vi.fn();
    const onToolRiskCheck = vi.fn().mockReturnValue({ requiresConfirmation: true, riskSummary: '将删除第 1 个句段' });
    const preparePendingToolCall = vi.fn((call: AiChatToolCall) => ({
      ...call,
      arguments: {
        segmentId: 'seg-1',
      },
    }));
    const { result } = renderHook(() => useAiChat({ onToolCall, onToolRiskCheck, preparePendingToolCall }));

    await waitFor(() => {
      expect(result.current.isBootstrapping).toBe(false);
    });

    await act(async () => {
      await result.current.send('删除第一条句段');
    });

    await waitFor(() => {
      expect(result.current.isStreaming).toBe(false);
    });

    expect(result.current.taskSession.status).toBe('waiting_confirm');
    expect(result.current.pendingToolCall?.call.name).toBe('delete_transcription_segment');
    expect(result.current.pendingToolCall?.call.arguments.segmentIndex).toBe(1);
    expect(result.current.pendingToolCall?.executionCall?.arguments.segmentId).toBe('seg-1');
    const assistant = result.current.messages.find((item) => item.role === 'assistant');
    expect(assistant?.content).toContain('删除句段');
    expect(assistant?.content).toContain('等你确认');
    expect(onToolCall).not.toHaveBeenCalled();
  });

  it('should resolve delete-all request to selected segmentIds and confirm with batch payload', async () => {
    const onToolCall = vi.fn().mockResolvedValue({ ok: true, message: '已删除 2 个句段' });
    const { result } = renderHook(() => useAiChat({
      onToolCall,
      getContext: () => ({
        shortTerm: {
          page: 'transcription',
          selectedUnitKind: 'segment',
          selectedUnitIds: ['seg-a', 'seg-b'],
        },
      }),
    }));

    await waitFor(() => {
      expect(result.current.isBootstrapping).toBe(false);
    });

    await act(async () => {
      await result.current.send('删除全部句段');
    });

    await waitFor(() => {
      expect(result.current.isStreaming).toBe(false);
    });

    await waitFor(() => {
      expect(result.current.pendingToolCall).not.toBeNull();
    });

    expect(result.current.pendingToolCall?.call.arguments.segmentIds).toEqual(['seg-a', 'seg-b']);

    await act(async () => {
      await result.current.confirmPendingToolCall();
    });

    expect(onToolCall).toHaveBeenCalledTimes(1);
    expect(onToolCall.mock.calls[0]?.[0]?.arguments.segmentIds).toEqual(['seg-a', 'seg-b']);
  });

  it('should resolve merge-with-previous command to merge_prev instead of split clarification', async () => {
    const onToolCall = vi.fn().mockResolvedValue({ ok: true, message: '已合并上一个句段。' });
    const { result } = renderHook(() => useAiChat({
      onToolCall,
      getContext: () => ({
        shortTerm: {
          page: 'transcription',
          selectedUnitKind: 'segment',
          activeUnitId: 'utt-current',
          activeSegmentUnitId: 'seg-current',
        },
      }),
    }));

    await waitFor(() => {
      expect(result.current.isBootstrapping).toBe(false);
    });

    await act(async () => {
      await result.current.send('和前一句段合并');
    });

    await waitFor(() => {
      expect(result.current.isStreaming).toBe(false);
    });

    const assistant = result.current.messages.find((item) => item.role === 'assistant');
    expect(assistant?.content).not.toContain('切分句段');
    expect(assistant?.content).not.toContain('意图不够明确');
    expect(result.current.lastError).toBeNull();
    expect(onToolCall).toHaveBeenCalledTimes(1);
    expect(onToolCall.mock.calls[0]?.[0]).toMatchObject({
      name: 'merge_prev',
      arguments: {
        segmentId: 'seg-current',
      },
    });
  });

  it('should resolve merge_next to the current selected segment when the model omits ids', async () => {
    const onToolCall = vi.fn().mockResolvedValue({ ok: true, message: '已合并下一个句段。' });
    const { result } = renderHook(() => useAiChat({
      onToolCall,
      getContext: () => ({
        shortTerm: {
          page: 'transcription',
          selectedUnitKind: 'segment',
          activeUnitId: 'utt-current',
          activeSegmentUnitId: 'seg-current',
        },
      }),
    }));

    await waitFor(() => {
      expect(result.current.isBootstrapping).toBe(false);
    });

    await act(async () => {
      await result.current.send('__TOOL_MERGE_NEXT_CURRENT_SEGMENT__');
    });

    await waitFor(() => {
      expect(result.current.isStreaming).toBe(false);
    });

    expect(result.current.lastError).toBeNull();
    expect(onToolCall).toHaveBeenCalledTimes(1);
    expect(onToolCall.mock.calls[0]?.[0]).toMatchObject({
      name: 'merge_next',
      arguments: {
        segmentId: 'seg-current',
      },
    });
  });

  it('should resolve selected-segment merge command to merge_transcription_segments', async () => {
    const onToolCall = vi.fn().mockResolvedValue({ ok: true, message: '已合并 2 个句段。' });
    const { result } = renderHook(() => useAiChat({
      onToolCall,
      getContext: () => ({
        shortTerm: {
          page: 'transcription',
          selectedUnitKind: 'segment',
          selectedUnitIds: ['seg-a', 'seg-b'],
        },
      }),
    }));

    await waitFor(() => {
      expect(result.current.isBootstrapping).toBe(false);
    });

    await act(async () => {
      await result.current.send('合并两个句段');
    });

    await waitFor(() => {
      expect(result.current.isStreaming).toBe(false);
    });

    await waitFor(() => {
      expect(Boolean(result.current.pendingToolCall || onToolCall.mock.calls.length > 0)).toBe(true);
    });

    const resolvedCall = result.current.pendingToolCall?.call ?? onToolCall.mock.calls[0]?.[0];
    expect(resolvedCall?.name).toBe('merge_transcription_segments');
    expect(resolvedCall?.arguments.segmentIds).toEqual(['seg-a', 'seg-b']);
  });

  it('should rewrite legacy unitIds merge payloads to selected segmentIds', async () => {
    const onToolCall = vi.fn().mockResolvedValue({ ok: true, message: '已合并 2 个句段。' });
    const { result } = renderHook(() => useAiChat({
      onToolCall,
      getContext: () => ({
        shortTerm: {
          page: 'transcription',
          selectedUnitKind: 'segment',
          selectedUnitIds: ['seg-a', 'seg-b'],
        },
      }),
    }));

    await waitFor(() => {
      expect(result.current.isBootstrapping).toBe(false);
    });

    await act(async () => {
      await result.current.send('__LEGACY_TOOL_MERGE_SELECTED_SEGMENTS__');
    });

    await waitFor(() => {
      expect(result.current.isStreaming).toBe(false);
    });

    await waitFor(() => {
      expect(Boolean(result.current.pendingToolCall || onToolCall.mock.calls.length > 0)).toBe(true);
    });

    const resolvedCall = result.current.pendingToolCall?.call ?? onToolCall.mock.calls[0]?.[0];
    expect(resolvedCall?.name).toBe('merge_transcription_segments');
    expect(resolvedCall?.arguments.segmentIds).toEqual(['seg-a', 'seg-b']);
    expect(resolvedCall?.arguments.unitIds).toBeUndefined();
  });

  it('should require segment selection for 删除之 deictic deletion', async () => {
    const onToolCall = vi.fn();
    const { result } = renderHook(() => useAiChat({
      onToolCall,
      getContext: () => ({
        shortTerm: {
          page: 'transcription',
          activeUnitId: 'u-current',
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

    expect(result.current.pendingToolCall).toBeNull();
    expect(result.current.taskSession.status).toBe('waiting_clarify');
    expect(onToolCall).not.toHaveBeenCalled();
  });

  it('should execute delete after clarification when user selects target and replies 这个', async () => {
    const onToolCall = vi.fn().mockResolvedValue({ ok: true, message: '句段已删除。' });
    let activeSegmentUnitId = '';
    const { result } = renderHook(() => useAiChat({
      onToolCall,
      getContext: () => ({
        shortTerm: {
          page: 'transcription',
          selectedUnitKind: 'segment',
          ...(activeSegmentUnitId ? { activeSegmentUnitId } : {}),
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

    activeSegmentUnitId = 'seg-1';

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
    expect(result.current.pendingToolCall?.call.arguments.segmentId).toBe('seg-1');

    await act(async () => {
      await result.current.confirmPendingToolCall();
    });

    expect(onToolCall).toHaveBeenCalledTimes(1);
    const firstCall = onToolCall.mock.calls[0]?.[0];
    expect(firstCall?.name).toBe('delete_transcription_segment');
    expect(firstCall?.arguments.segmentId).toBe('seg-1');
  });

  it('should auto-execute destructive tool call when risk check marks it as low risk', async () => {
    const onToolCall = vi.fn().mockResolvedValue({ ok: true, message: '句段已删除。' });
    const onToolRiskCheck = vi.fn().mockReturnValue({ requiresConfirmation: false });
    const { result } = renderHook(() => useAiChat({
      onToolCall,
      onToolRiskCheck,
      getContext: () => ({
        shortTerm: {
          ...defaultSelectedSegmentShortTerm,
          activeUnitId: 'utt-delete',
          activeSegmentUnitId: 'seg-delete',
        },
      }),
    }));

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

  it('should stop before confirmation when delete_layer target is ambiguous in risk check', async () => {
    const onToolCall = vi.fn();
    const onToolRiskCheck = vi.fn().mockReturnValue({
      requiresConfirmation: false,
      riskSummary: '匹配到多个转写层，请改用 layerId 精确指定。',
      impactPreview: [],
    });
    const { result } = renderHook(() => useAiChat({ onToolCall, onToolRiskCheck }));

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
    expect(result.current.pendingToolCall).toBeNull();
    expect(result.current.taskSession.status).toBe('waiting_clarify');
    const assistant = result.current.messages.find((item) => item.role === 'assistant');
    expect(assistant?.status).toBe('error');
    expect(assistant?.content).toContain('你想删除哪个转写层');
    expect(assistant?.content).not.toContain('第1个/第2个');
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
    expect(assistant?.content).toContain('已完成“删除层”');
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
    expect(assistant?.content).toContain('没有完成');

    const auditRows = await db.audit_logs.toArray();
    const decisionLog = auditRows.find((row) => row.field === 'ai_tool_call_decision');
    expect(decisionLog?.newValue).toBe('confirm_failed:delete_layer:exception');
    expect(decisionLog?.source).toBe('human');
  });

  it('should set error status when auto-executed tool call fails', async () => {
    const onToolCall = vi.fn().mockResolvedValue({ ok: false, message: '重命名失败' });
    const { result } = renderHook(() => useAiChat({
      onToolCall,
      getContext: () => ({ shortTerm: defaultSelectedSegmentShortTerm }),
    }));

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
    expect(assistant?.content).toContain('没有完成');
    expect(result.current.lastError).toBe('重命名失败');
  });

  it('should write auto audit log for non-destructive tool execution', async () => {
    const onToolCall = vi.fn().mockResolvedValue({ ok: true, message: '已重命名' });
    const { result } = renderHook(() => useAiChat({
      onToolCall,
      getContext: () => ({ shortTerm: defaultSelectedSegmentShortTerm }),
    }));

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
    expect(assistant?.content).toContain('已完成“写入转写”');
    expect(assistant?.content).toContain('已重命名');

    const auditRows = await db.audit_logs.toArray();
    const decisionLog = auditRows.find((row) => row.field === 'ai_tool_call_decision');
    expect(decisionLog?.newValue).toBe('auto_confirmed:set_transcription_text');
    expect(decisionLog?.oldValue).toBe('auto:set_transcription_text');
    expect(decisionLog?.source).toBe('ai');
  });

  it('should persist structured replay metadata for auto tool decisions', async () => {
    const onToolCall = vi.fn().mockResolvedValue({ ok: true, message: '已重命名' });
    const { result } = renderHook(() => useAiChat({
      onToolCall,
      getContext: () => ({ shortTerm: defaultSelectedSegmentShortTerm }),
    }));

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
      toolCall?: { name?: string; arguments?: { segmentId?: string; text?: string }; requestId?: string };
      context?: { userText?: string; providerId?: string; model?: string };
    };

    expect(metadata.phase).toBe('decision');
    expect(metadata.executed).toBe(true);
    expect(metadata.toolCall?.name).toBe('set_transcription_text');
    expect(metadata.toolCall?.arguments).toEqual({ segmentId: 'seg-current', text: 'hello' });
    expect(metadata.toolCall?.requestId).toBe(decisionLog?.requestId);
    expect(metadata.context?.userText).toBe('__TOOL_RENAME_LAYER__');
    expect(metadata.context?.providerId).toBe('mock');
    expect(typeof metadata.context?.model).toBe('string');
  });

  it('should allow intentional repeated execution across remounts when request scope changes', async () => {
    const onToolCall = vi.fn().mockResolvedValue({ ok: true, message: '已重命名' });
    const first = renderHook(() => useAiChat({
      onToolCall,
      getContext: () => ({ shortTerm: defaultSelectedSegmentShortTerm }),
    }));

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

    const second = renderHook(() => useAiChat({
      onToolCall,
      getContext: () => ({ shortTerm: defaultSelectedSegmentShortTerm }),
    }));

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
    expect(assistant?.content).toContain('已完成');
  });

  it('should persist assistant generation metadata across remounts', async () => {
    const first = renderHook(() => useAiChat());

    await waitFor(() => {
      expect(first.result.current.isBootstrapping).toBe(false);
    });

    await act(async () => {
      await first.result.current.send('__PLAIN_REPLY__');
    });

    await waitFor(() => {
      expect(first.result.current.isStreaming).toBe(false);
    });

    const firstAssistant = first.result.current.messages.find((item) => item.role === 'assistant');
    expect(firstAssistant?.generationSource).toBe('llm');
  expect(firstAssistant?.generationModel).toBe('mock-1');

    const persistedAssistant = (await db.ai_messages.toArray()).find((row) => row.role === 'assistant');
    expect(persistedAssistant?.generationSource).toBe('llm');
  expect(persistedAssistant?.generationModel).toBe('mock-1');

    first.unmount();

    const second = renderHook(() => useAiChat());

    await waitFor(() => {
      expect(second.result.current.isBootstrapping).toBe(false);
    });

    const restoredAssistant = second.result.current.messages.find((item) => item.role === 'assistant');
    expect(restoredAssistant?.content).toContain('普通对话回复');
    expect(restoredAssistant?.generationSource).toBe('llm');
    expect(restoredAssistant?.generationModel).toBe('mock-1');
  });

  it('should render concise tool feedback when configured', async () => {
    const onToolCall = vi.fn().mockResolvedValue({ ok: true, message: '已重命名' });
    const { result } = renderHook(() => useAiChat({
      onToolCall,
      getContext: () => ({ shortTerm: defaultSelectedSegmentShortTerm }),
    }));

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
    expect(assistant?.content).toContain('已完成写入转写：已重命名');
    expect(assistant?.content).not.toContain('set_transcription_text');
  });

  it('should write auto_failed audit log when auto-executed tool throws', async () => {
    const onToolCall = vi.fn().mockRejectedValue(new Error('network'));
    const { result } = renderHook(() => useAiChat({
      onToolCall,
      getContext: () => ({ shortTerm: defaultSelectedSegmentShortTerm }),
    }));

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

  it('should render concise non-action fallback when configured', async () => {
    const onToolCall = vi.fn().mockResolvedValue({ ok: true, message: '不应执行' });
    const { result } = renderHook(() => useAiChat({ onToolCall }));

    await waitFor(() => {
      expect(result.current.isBootstrapping).toBe(false);
    });

    await act(async () => {
      result.current.updateSettings({ toolFeedbackStyle: 'concise' });
    });

    await act(async () => {
      await result.current.send('你好');
    });

    await waitFor(() => {
      expect(result.current.isStreaming).toBe(false);
    });

    expect(onToolCall).not.toHaveBeenCalled();
    const assistant = result.current.messages.find((item) => item.role === 'assistant');
    expect(assistant?.status).toBe('done');
    expect(assistant?.content).toContain('可继续提问');
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
    const { result } = renderHook(() => useAiChat({
      onToolCall,
      getContext: () => ({ shortTerm: defaultSelectedSegmentShortTerm }),
    }));

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
    const { result } = renderHook(() => useAiChat({
      onToolCall,
      getContext: () => ({ shortTerm: defaultSelectedSegmentShortTerm }),
    }));

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
    expect(assistant?.content).toContain('已完成“写入转写”');
    expect(assistant?.content).toContain('转写文本已写入。');
    expect(assistant?.content).not.toContain('好的，我已经处理完毕');
  });

  it('should not expose unsupported merge tool json when no segment is selected', async () => {
    const onToolCall = vi.fn();
    const { result } = renderHook(() => useAiChat({
      onToolCall,
      getContext: () => ({
        shortTerm: {
          page: 'transcription',
        },
      }),
    }));

    await waitFor(() => {
      expect(result.current.isBootstrapping).toBe(false);
    });

    await act(async () => {
      await result.current.send('合并句段');
    });

    await waitFor(() => {
      expect(result.current.isStreaming).toBe(false);
    });

    expect(onToolCall).not.toHaveBeenCalled();
    expect(result.current.pendingToolCall).toBeNull();

    const assistant = result.current.messages.find((item) => item.role === 'assistant');
    expect(assistant?.status).toBe('done');
    expect(assistant?.content).toContain('缺少目标句段');
    expect(assistant?.content).toContain('合并句段');
    expect(assistant?.content).not.toContain('merge_transcription_segments');
    expect(assistant?.content).not.toContain('tool_call');
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
    const { result } = renderHook(() => useAiChat({
      onToolCall,
      getContext: () => ({ shortTerm: defaultSelectedSegmentShortTerm }),
    }));

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
    const { result } = renderHook(() => useAiChat({
      onToolCall,
      getContext: () => ({ shortTerm: defaultSelectedSegmentShortTerm }),
    }));

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
    const onToolCall = vi.fn().mockResolvedValue({ ok: true, message: '已在 12.50s 处切分当前句段。' });
    const { result } = renderHook(() => useAiChat({
      onToolCall,
      getContext: () => ({
        shortTerm: {
          ...defaultSelectedSegmentShortTerm,
          activeUnitId: 'u1',
          activeSegmentUnitId: 'seg1',
          selectedUnitStartSec: 10,
          selectedUnitEndSec: 14,
          audioTimeSec: 12.5,
        },
      }),
    }));

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
    const firstCall = onToolCall.mock.calls[0]?.[0];
    expect(firstCall?.name).toBe('split_transcription_segment');
    expect(firstCall?.arguments.segmentId).toBe('seg1');
    expect(firstCall?.arguments.splitTime).toBe(12.5);
  });

  it('should clarify split position when cursor location is unavailable, then split after replying 这里', async () => {
    const onToolCall = vi.fn().mockResolvedValue({ ok: true, message: '已在 12.00s 处切分当前句段。' });
    let cursor: number | undefined;
    const { result } = renderHook(() => useAiChat({
      onToolCall,
      getContext: () => ({
        shortTerm: {
          ...defaultSelectedSegmentShortTerm,
          activeUnitId: 'u1',
          activeSegmentUnitId: 'seg1',
          selectedUnitStartSec: 10,
          selectedUnitEndSec: 14,
          ...(cursor !== undefined ? { audioTimeSec: cursor } : {}),
        },
      }),
    }));

    await waitFor(() => {
      expect(result.current.isBootstrapping).toBe(false);
    });

    await act(async () => {
      await result.current.send('切分此句段');
    });

    await waitFor(() => {
      expect(result.current.isStreaming).toBe(false);
    });

    expect(onToolCall).toHaveBeenCalledTimes(0);
    expect(result.current.messages[result.current.messages.length - 1]?.content ?? '').toMatch(/切分的位置|在哪个位置/);

    cursor = 12;
    await act(async () => {
      await result.current.send('这里');
    });

    await waitFor(() => {
      expect(result.current.isStreaming).toBe(false);
    });

    expect(onToolCall).toHaveBeenCalledTimes(1);
    const firstCall = onToolCall.mock.calls[0]?.[0];
    expect(firstCall?.name).toBe('split_transcription_segment');
    expect(firstCall?.arguments.segmentId).toBe('seg1');
    expect(firstCall?.arguments.splitTime).toBe(12);
  });

  it('should treat polite question style edit request as actionable intent', async () => {
    const onToolCall = vi.fn().mockResolvedValue({ ok: true, message: '已更新转写。' });
    const { result } = renderHook(() => useAiChat({
      onToolCall,
      getContext: () => ({ shortTerm: defaultSelectedSegmentShortTerm }),
    }));

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
    expect(firstCall?.arguments.segmentId).toBe('seg-current');
    expect(firstCall?.arguments.text).toBe('你好');
  });

  it('should ask for clarification when intent score is in gray zone', async () => {
    const onToolCall = vi.fn().mockResolvedValue({ ok: true, message: '不应执行' });
    const { result } = renderHook(() => useAiChat({
      onToolCall,
      getContext: () => ({ shortTerm: defaultSelectedSegmentShortTerm }),
    }));

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
    expect(result.current.taskSession.clarifyReason).toBe('missing-unit-target');

    const assistant = result.current.messages.find((item) => item.role === 'assistant');
    expect(assistant?.content).toContain('补充对应 ID');
    expect(assistant?.content).not.toContain('第1个/这个');
  });

  it('should include recovery next-step hints when tool execution fails', async () => {
    const onToolCall = vi.fn().mockResolvedValue({ ok: false, message: '网络请求超时' });
    const { result } = renderHook(() => useAiChat({
      onToolCall,
      getContext: () => ({ shortTerm: defaultSelectedSegmentShortTerm }),
    }));

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

  it('should use unified natural-language prompt when segment target is missing', async () => {
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
    expect(assistant?.status).toBe('done');
    expect(assistant?.content).toContain('缺少目标句段');
    expect(assistant?.content).not.toContain('我尝试执行了这个操作');
    expect(assistant?.content).not.toContain('建议下一步');
  });

  it('should use concise natural-language prompt when create_transcription_layer fails by conflict', async () => {
    const onToolCall = vi.fn().mockResolvedValue({ ok: false, message: '创建转写层失败，请检查语言或别名是否冲突。' });
    const { result } = renderHook(() => useAiChat({ onToolCall }));

    await waitFor(() => {
      expect(result.current.isBootstrapping).toBe(false);
    });

    await act(async () => {
      await result.current.send('__TOOL_CREATE_TRANSCRIPTION_LAYER__');
    });

    await waitFor(() => {
      expect(result.current.isStreaming).toBe(false);
    });

    const assistant = result.current.messages.find((item) => item.role === 'assistant');
    expect(assistant?.status).toBe('error');
    expect(assistant?.content).toContain('你想新建哪个转写层');
    expect(assistant?.content).not.toContain('我尝试执行了这个操作');
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
    expect(assistant?.content).toContain('已完成“删除层”');
    expect(assistant?.content).toContain('已删除层：trl-jpn');
  });

  it('should resolve set_translation_text targets from selected context before execution', async () => {
    const onToolCall = vi.fn().mockResolvedValue({ ok: true, message: '翻译文本已写入。' });
    const { result } = renderHook(() => useAiChat({
      onToolCall,
      getContext: () => ({
        shortTerm: {
          ...defaultSelectedTranslationShortTerm,
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
    // 幻觉防护：LLM 的 segment/unit 幻觉目标被上下文真实 segment 替换 | Hallucination guard: the model target is replaced by the real segment from context
    expect(firstCall?.arguments.segmentId).toBe('seg-selected');
    expect(firstCall?.arguments.layerId).toBe('trl-selected');
  });

  it('should clarify when translation-layer target cannot be resolved', async () => {
    const onToolCall = vi.fn().mockResolvedValue({ ok: true, message: '不应执行' });
    const { result } = renderHook(() => useAiChat({
      onToolCall,
      getContext: () => ({ shortTerm: defaultSelectedSegmentShortTerm }),
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
          ...defaultSelectedTranslationShortTerm,
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
    // 幻觉防护：LLM 的 segment/unit 幻觉目标被上下文真实 segment 替换 | Hallucination guard: the model target is replaced by the real segment from context
    expect(firstCall?.arguments.segmentId).toBe('seg-selected');
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

  it('should clarify instead of auto-linking when user does not explicitly refer to current layer pair', async () => {
    const onToolCall = vi.fn().mockResolvedValue({ ok: true, message: '不应执行' });
    const { result } = renderHook(() => useAiChat({
      onToolCall,
      getContext: () => ({
        shortTerm: {
          selectedLayerId: 'trl-selected',
          selectedLayerType: 'translation',
          selectedTranslationLayerId: 'trl-selected',
          selectedTranscriptionLayerId: 'trc-selected',
        },
      }),
    }));

    await waitFor(() => {
      expect(result.current.isBootstrapping).toBe(false);
    });

    await act(async () => {
      await result.current.send('关联翻译层');
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

  it('resets interaction metrics when clearing the conversation', async () => {
    const { result } = renderHook(() => useAiChat({}));

    await waitFor(() => {
      expect(result.current.isBootstrapping).toBe(false);
    });

    await act(async () => {
      await result.current.send('__PLAIN_REPLY__');
    });

    await waitFor(() => {
      expect(result.current.isStreaming).toBe(false);
    });

    expect(result.current.metrics.turnCount).toBeGreaterThan(0);
    expect(result.current.messages.length).toBeGreaterThan(0);

    await act(async () => {
      result.current.clear();
    });

    expect(result.current.messages).toHaveLength(0);
    expect(result.current.metrics).toEqual({ ...INITIAL_METRICS });
  });

  it('should count output tokens using actual model output text during local-tool agent loop', async () => {
    const { result } = renderHook(() => useAiChat({
      getContext: () => ({
        shortTerm: {
          page: 'transcription',
          selectedUnitKind: 'segment',
          activeSegmentUnitId: 'seg-current',
        },
      }),
    }));

    await waitFor(() => {
      expect(result.current.isBootstrapping).toBe(false);
    });

    await act(async () => {
      await result.current.send('__LOCAL_CONTEXT_TOOL_FENCED__');
    });

    await waitFor(() => {
      expect(result.current.isStreaming).toBe(false);
    });

    const secondModelOutput = '基于本地上下文，这是下一步回复。';
    const assistant = result.current.messages.find((item) => item.role === 'assistant');
    expect(assistant?.content).toContain(secondModelOutput);

    expect(result.current.metrics.totalOutputTokens).toBeGreaterThanOrEqual(0);
    expect(result.current.metrics.currentTurnTokens).toBeGreaterThanOrEqual(result.current.metrics.totalOutputTokens);

    const stepLogs = await db.audit_logs
      .where('[collection+field+timestamp]')
      .between(
        ['ai_messages', 'ai_agent_loop_step', ''],
        ['ai_messages', 'ai_agent_loop_step', '\uffff'],
      )
      .toArray();
    expect(stepLogs.length).toBeGreaterThan(0);
  });

  it('should execute local tool when model returns single-item tool_calls array', async () => {
    const { result } = renderHook(() => useAiChat({
      getContext: () => ({
        shortTerm: {
          page: 'transcription',
          selectedUnitKind: 'segment',
          activeSegmentUnitId: 'seg-current',
        },
      }),
    }));

    await waitFor(() => {
      expect(result.current.isBootstrapping).toBe(false);
    });

    await act(async () => {
      await result.current.send('__LOCAL_CONTEXT_TOOL_CALLS_SINGLE__');
    });

    await waitFor(() => {
      expect(result.current.isStreaming).toBe(false);
    });

    const assistant = result.current.messages.find((item) => item.role === 'assistant');
    expect(assistant?.content).toContain('基于本地上下文，这是下一步回复。');
  });

  it('should reset task session to idle after loop budget warning', async () => {
    const { result } = renderHook(() => useAiChat({
      getContext: () => ({
        shortTerm: {
          page: 'transcription',
          selectedUnitKind: 'segment',
          activeSegmentUnitId: 'seg-current',
        },
      }),
    }));

    await waitFor(() => {
      expect(result.current.isBootstrapping).toBe(false);
    });

    const veryLongPrompt = `__LOCAL_CONTEXT_TOOL_FENCED__ ${'x'.repeat(12000)}`;
    await act(async () => {
      await result.current.send(veryLongPrompt);
    });

    await waitFor(() => {
      expect(result.current.isStreaming).toBe(false);
    });

    const assistant = result.current.messages.find((item) => item.role === 'assistant');
    expect(assistant?.content).toMatch(/如需我继续完成这项查询|If you want me to continue this lookup/);
    expect(result.current.taskSession.status).toBe('idle');
  });

  it('should resume from the saved loop checkpoint when user replies continue', async () => {
    const { result } = renderHook(() => useAiChat({
      getContext: () => ({
        shortTerm: {
          page: 'transcription',
          selectedUnitKind: 'segment',
          activeSegmentUnitId: 'seg-current',
        },
      }),
    }));

    await waitFor(() => {
      expect(result.current.isBootstrapping).toBe(false);
    });

    const veryLongPrompt = `__LOCAL_CONTEXT_TOOL_FENCED__ ${'x'.repeat(12000)}`;
    await act(async () => {
      await result.current.send(veryLongPrompt);
    });

    await waitFor(() => {
      expect(result.current.isStreaming).toBe(false);
    });

    const warnedAssistant = result.current.messages.find((item) => item.role === 'assistant');
    expect(warnedAssistant?.content).toMatch(/如需我继续完成这项查询|If you want me to continue this lookup/);
    expect(warnedAssistant?.content).not.toContain('```json');
    expect(warnedAssistant?.content).not.toContain('"tool_call"');

    const storedBefore = JSON.parse(window.localStorage.getItem('jieyu.aiChat.sessionMemory') ?? '{}') as {
      pendingAgentLoopCheckpoint?: { step?: number };
    };
    expect(storedBefore.pendingAgentLoopCheckpoint?.step).toBe(1);

    await act(async () => {
      await result.current.send('继续');
    });

    await waitFor(() => {
      expect(result.current.isStreaming).toBe(false);
    });

    const resumedAssistant = result.current.messages.find((item) => item.role === 'assistant');
    expect(resumedAssistant?.content).toContain('基于本地上下文，这是下一步回复。');

    const storedAfter = JSON.parse(window.localStorage.getItem('jieyu.aiChat.sessionMemory') ?? '{}') as {
      pendingAgentLoopCheckpoint?: unknown;
    };
    expect(storedAfter.pendingAgentLoopCheckpoint).toBeUndefined();
  });

  it('should track interaction metrics across tool execution lifecycle', async () => {
    const onToolCall = vi.fn<(call: { name: string; arguments: Record<string, unknown> }) => Promise<{ ok: boolean; message: string }>>()
      .mockResolvedValueOnce({ ok: false, message: '目标不存在' })
      .mockResolvedValueOnce({ ok: true, message: '已完成' });
    const { result } = renderHook(() => useAiChat({
      onToolCall,
      getContext: () => ({ shortTerm: defaultSelectedSegmentShortTerm }),
    }));

    await waitFor(() => {
      expect(result.current.isBootstrapping).toBe(false);
    });

    // 首轮：执行失败 | First turn: tool execution fails
    await act(async () => {
      await result.current.send('__TOOL_RENAME_LAYER__');
    });
    await waitFor(() => {
      expect(result.current.isStreaming).toBe(false);
    });
    expect(result.current.metrics.turnCount).toBe(1);
    expect(result.current.metrics.failureCount).toBe(1);
    expect(result.current.metrics.successCount).toBe(0);

    // 二轮：执行成功 | Second turn: tool execution succeeds
    await act(async () => {
      await result.current.send('__TOOL_RENAME_LAYER__');
    });
    await waitFor(() => {
      expect(result.current.isStreaming).toBe(false);
    });
    expect(result.current.metrics.turnCount).toBe(2);
    expect(result.current.metrics.successCount).toBe(1);
    expect(result.current.metrics.failureCount).toBe(1);
  });

  it('should bump clarifyCount when planner requires target clarification', async () => {
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

    expect(result.current.metrics.clarifyCount).toBe(1);
    expect(result.current.taskSession.status).toBe('waiting_clarify');
  });

  it('should bump cancelCount when user cancels a pending tool call', async () => {
    const onToolCall = vi.fn().mockResolvedValue({ ok: true, message: '已删除' });
    const onToolRiskCheck = vi.fn().mockReturnValue({ requiresConfirmation: true, riskSummary: '将删除' });
    const { result } = renderHook(() => useAiChat({
      onToolCall,
      onToolRiskCheck,
      getContext: () => ({ shortTerm: defaultSelectedSegmentShortTerm }),
    }));

    await waitFor(() => {
      expect(result.current.isBootstrapping).toBe(false);
    });

    await act(async () => {
      await result.current.send('__TOOL_DELETE_SEGMENT__');
    });
    await waitFor(() => {
      expect(result.current.isStreaming).toBe(false);
    });

    expect(result.current.pendingToolCall).not.toBeNull();

    await act(async () => {
      await result.current.cancelPendingToolCall();
    });

    expect(result.current.metrics.cancelCount).toBe(1);
    expect(result.current.pendingToolCall).toBeNull();
  });

  it('should include previewContract on pending destructive tool call', async () => {
    const onToolCall = vi.fn().mockResolvedValue({ ok: true, message: '已删除' });
    const onToolRiskCheck = vi.fn().mockReturnValue({ requiresConfirmation: true, riskSummary: '将删除' });
    const { result } = renderHook(() => useAiChat({
      onToolCall,
      onToolRiskCheck,
      getContext: () => ({ shortTerm: defaultSelectedSegmentShortTerm }),
    }));

    await waitFor(() => {
      expect(result.current.isBootstrapping).toBe(false);
    });

    await act(async () => {
      await result.current.send('__TOOL_DELETE_SEGMENT__');
    });
    await waitFor(() => {
      expect(result.current.isStreaming).toBe(false);
    });

    expect(result.current.pendingToolCall).not.toBeNull();
    expect(result.current.pendingToolCall?.previewContract).toBeDefined();
    expect(result.current.pendingToolCall?.previewContract?.reversible).toBe(true);
    expect(result.current.pendingToolCall?.previewContract?.affectedCount).toBe(1);
    expect(result.current.pendingToolCall?.previewContract?.cascadeTypes).toContain('translation');
  });

  it('should resolve delete-all request to allSegments without any selection', async () => {
    const onToolCall = vi.fn().mockResolvedValue({ ok: true, message: '已删除' });
    const onToolRiskCheck = vi.fn().mockReturnValue({ requiresConfirmation: true, riskSummary: '将删除全部句段' });
    const preparePendingToolCall = vi.fn((call: AiChatToolCall) => ({
      ...call,
      arguments: {
        segmentIds: ['seg1', 'seg2', 'seg3'],
      },
    }));
    const { result } = renderHook(() => useAiChat({
      onToolCall,
      onToolRiskCheck,
      preparePendingToolCall,
      getContext: () => ({
        shortTerm: {
          page: 'transcription',
        },
        longTerm: {
          projectStats: {
            unitCount: 3,
            translationLayerCount: 0,
            aiConfidenceAvg: null,
          },
          topLexemes: [],
          recommendations: [],
        },
      }),
    }));

    await waitFor(() => {
      expect(result.current.isBootstrapping).toBe(false);
    });

    await act(async () => {
      await result.current.send('删除全部句段');
    });

    await waitFor(() => {
      expect(result.current.isStreaming).toBe(false);
    });

    await waitFor(() => {
      expect(result.current.pendingToolCall).not.toBeNull();
    });

    expect(result.current.pendingToolCall?.call.name).toBe('delete_transcription_segment');
    expect(result.current.pendingToolCall?.call.arguments.allSegments).toBe(true);
    expect(result.current.pendingToolCall?.executionCall?.arguments.segmentIds).toEqual(['seg1', 'seg2', 'seg3']);
    expect(result.current.pendingToolCall?.previewContract?.affectedCount).toBe(3);
  });

  it('should keep delete-all preview count at 0 when context stats are missing', async () => {
    const onToolCall = vi.fn().mockResolvedValue({ ok: true, message: '已删除' });
    const onToolRiskCheck = vi.fn().mockReturnValue({ requiresConfirmation: true, riskSummary: '将删除全部句段' });
    const preparePendingToolCall = vi.fn((call: AiChatToolCall) => ({
      ...call,
      arguments: {
        segmentIds: ['seg1'],
      },
    }));
    const { result } = renderHook(() => useAiChat({
      onToolCall,
      onToolRiskCheck,
      preparePendingToolCall,
      getContext: () => ({
        shortTerm: {
          page: 'transcription',
        },
      }),
    }));

    await waitFor(() => {
      expect(result.current.isBootstrapping).toBe(false);
    });

    await act(async () => {
      await result.current.send('删除全部句段');
    });

    await waitFor(() => {
      expect(result.current.pendingToolCall).not.toBeNull();
    });

    expect(result.current.pendingToolCall?.previewContract?.affectedCount).toBe(1);
  });

  it('should prefer current scope count for delete-all preview when scope and project totals differ', async () => {
    const onToolCall = vi.fn().mockResolvedValue({ ok: true, message: '已删除' });
    const onToolRiskCheck = vi.fn().mockReturnValue({ requiresConfirmation: true, riskSummary: '将删除全部句段' });
    const preparePendingToolCall = vi.fn((call: AiChatToolCall) => ({
      ...call,
      arguments: {
        segmentIds: ['seg-1', 'seg-2'],
      },
    }));
    const { result } = renderHook(() => useAiChat({
      onToolCall,
      onToolRiskCheck,
      preparePendingToolCall,
      getContext: () => ({
        shortTerm: {
          page: 'transcription',
          currentScopeUnitCount: 2,
          currentMediaUnitCount: 2,
          projectUnitCount: 5,
        },
        longTerm: {
          projectStats: {
            unitCount: 5,
            translationLayerCount: 0,
            aiConfidenceAvg: null,
          },
          topLexemes: [],
          recommendations: [],
        },
      }),
    }));

    await waitFor(() => {
      expect(result.current.isBootstrapping).toBe(false);
    });

    await act(async () => {
      await result.current.send('删除全部句段');
    });

    await waitFor(() => {
      expect(result.current.pendingToolCall).not.toBeNull();
    });

    expect(result.current.pendingToolCall?.previewContract?.affectedCount).toBe(2);
  });

  it('should fail delete-all before confirmation when concrete targets cannot be materialized', async () => {
    const onToolCall = vi.fn();
    const onToolRiskCheck = vi.fn().mockReturnValue({
      requiresConfirmation: false,
      riskSummary: '当前页面没有可删除的句段。',
      impactPreview: [],
    });
    const preparePendingToolCall = vi.fn((call: AiChatToolCall) => call);
    const { result } = renderHook(() => useAiChat({
      onToolCall,
      onToolRiskCheck,
      preparePendingToolCall,
      getContext: () => ({
        shortTerm: {
          page: 'transcription',
        },
      }),
    }));

    await waitFor(() => {
      expect(result.current.isBootstrapping).toBe(false);
    });

    await act(async () => {
      await result.current.send('删除全部句段');
    });

    await waitFor(() => {
      expect(result.current.isStreaming).toBe(false);
    });

    expect(result.current.pendingToolCall).toBeNull();
    expect(onToolCall).not.toHaveBeenCalled();
    const assistant = result.current.messages.find((item) => item.role === 'assistant');
    expect(assistant?.status).toBe('error');
    expect(assistant?.content).toContain('当前页面没有可删除的句段');
  });

  it('should resolve ordinal delete request to segmentIndex without any selection', async () => {
    const onToolCall = vi.fn().mockResolvedValue({ ok: true, message: '已删除' });
    const onToolRiskCheck = vi.fn().mockReturnValue({ requiresConfirmation: true, riskSummary: '将删除第 5 个句段' });
    const preparePendingToolCall = vi.fn((call: AiChatToolCall) => ({
      ...call,
      arguments: {
        segmentId: 'seg5',
      },
    }));
    const { result } = renderHook(() => useAiChat({
      onToolCall,
      onToolRiskCheck,
      preparePendingToolCall,
      getContext: () => ({
        shortTerm: {
          page: 'transcription',
        },
        longTerm: {
          projectStats: {
            unitCount: 8,
            translationLayerCount: 0,
            aiConfidenceAvg: null,
          },
          topLexemes: [],
          recommendations: [],
        },
      }),
    }));

    await waitFor(() => {
      expect(result.current.isBootstrapping).toBe(false);
    });

    await act(async () => {
      await result.current.send('删除第五个句段');
    });

    await waitFor(() => {
      expect(result.current.pendingToolCall).not.toBeNull();
    });

    expect(result.current.pendingToolCall?.call.arguments.segmentIndex).toBe(5);
    expect(result.current.pendingToolCall?.executionCall?.arguments.segmentId).toBe('seg5');
  });

  it('should resolve ordinal delete request to last segment selector without any selection', async () => {
    const onToolCall = vi.fn().mockResolvedValue({ ok: true, message: '已删除' });
    const onToolRiskCheck = vi.fn().mockReturnValue({ requiresConfirmation: true, riskSummary: '将删除最后一个句段' });
    const preparePendingToolCall = vi.fn((call: AiChatToolCall) => ({
      ...call,
      arguments: {
        segmentId: 'seg8',
      },
    }));
    const { result } = renderHook(() => useAiChat({ onToolCall, onToolRiskCheck, preparePendingToolCall }));

    await waitFor(() => {
      expect(result.current.isBootstrapping).toBe(false);
    });

    await act(async () => {
      await result.current.send('删除最后一个句段');
    });

    await waitFor(() => {
      expect(result.current.pendingToolCall).not.toBeNull();
    });

    expect(result.current.pendingToolCall?.call.arguments.segmentPosition).toBe('last');
    expect(result.current.pendingToolCall?.executionCall?.arguments.segmentId).toBe('seg8');
  });

  it('should resolve English delete request to last segment selector without any selection', async () => {
    const onToolCall = vi.fn().mockResolvedValue({ ok: true, message: 'Deleted' });
    const onToolRiskCheck = vi.fn().mockReturnValue({ requiresConfirmation: true, riskSummary: 'Will delete the last segment' });
    const preparePendingToolCall = vi.fn((call: AiChatToolCall) => ({
      ...call,
      arguments: {
        segmentId: 'seg8',
      },
    }));
    const { result } = renderHook(() => useAiChat({ onToolCall, onToolRiskCheck, preparePendingToolCall }));

    await waitFor(() => {
      expect(result.current.isBootstrapping).toBe(false);
    });

    await act(async () => {
      await result.current.send('delete the last segment');
    });

    await waitFor(() => {
      expect(result.current.pendingToolCall).not.toBeNull();
    });

    expect(result.current.pendingToolCall?.call.arguments.segmentPosition).toBe('last');
    expect(result.current.pendingToolCall?.executionCall?.arguments.segmentId).toBe('seg8');
  });

  it('should clarify previous-segment delete when there is no current anchor', async () => {
    const onToolCall = vi.fn();
    const { result } = renderHook(() => useAiChat({
      onToolCall,
      getContext: () => ({
        shortTerm: {
          page: 'home',
        },
      }),
    }));

    await waitFor(() => {
      expect(result.current.isBootstrapping).toBe(false);
    });

    await act(async () => {
      await result.current.send('删除前一个句段');
    });

    await waitFor(() => {
      expect(result.current.isStreaming).toBe(false);
    });

    expect(onToolCall).not.toHaveBeenCalled();
    expect(result.current.pendingToolCall).toBeNull();
    expect(result.current.taskSession.status).toBe('waiting_clarify');
    expect(result.current.taskSession.toolName).toBe('delete_transcription_segment');
    expect(result.current.taskSession.clarifyReason).toBe('missing-unit-target');
  });

  it('should clarify English previous-segment delete when there is no current anchor', async () => {
    const onToolCall = vi.fn();
    const { result } = renderHook(() => useAiChat({
      onToolCall,
      getContext: () => ({
        shortTerm: {
          page: 'home',
        },
      }),
    }));

    await waitFor(() => {
      expect(result.current.isBootstrapping).toBe(false);
    });

    await act(async () => {
      await result.current.send('delete the previous segment');
    });

    await waitFor(() => {
      expect(result.current.isStreaming).toBe(false);
    });

    expect(onToolCall).not.toHaveBeenCalled();
    expect(result.current.pendingToolCall).toBeNull();
    expect(result.current.taskSession.status).toBe('waiting_clarify');
    expect(result.current.taskSession.toolName).toBe('delete_transcription_segment');
    expect(result.current.taskSession.clarifyReason).toBe('missing-unit-target');
  });

  it('should resolve previous-segment delete when there is a current anchor', async () => {
    const onToolCall = vi.fn().mockResolvedValue({ ok: true, message: '已删除' });
    const onToolRiskCheck = vi.fn().mockReturnValue({ requiresConfirmation: true, riskSummary: '将删除前一个句段' });
    const preparePendingToolCall = vi.fn((call: AiChatToolCall) => ({
      ...call,
      arguments: {
        segmentId: 'seg1',
      },
    }));
    const { result } = renderHook(() => useAiChat({
      onToolCall,
      onToolRiskCheck,
      preparePendingToolCall,
      getContext: () => ({
        shortTerm: {
          ...defaultSelectedSegmentShortTerm,
          activeUnitId: 'u2',
          activeSegmentUnitId: 'seg2',
        },
      }),
    }));

    await waitFor(() => {
      expect(result.current.isBootstrapping).toBe(false);
    });

    await act(async () => {
      await result.current.send('删除前一个句段');
    });

    await waitFor(() => {
      expect(result.current.pendingToolCall).not.toBeNull();
    });

    expect(result.current.pendingToolCall?.call.arguments.segmentPosition).toBe('previous');
    expect(result.current.pendingToolCall?.executionCall?.arguments.segmentId).toBe('seg1');
  });

  it('should fail semantic ordinal delete before confirmation when concrete target cannot be materialized', async () => {
    const onToolCall = vi.fn();
    const onToolRiskCheck = vi.fn().mockReturnValue({
      requiresConfirmation: false,
      riskSummary: '当前页面无法定位到目标句段。',
      impactPreview: [],
    });
    const preparePendingToolCall = vi.fn((call: AiChatToolCall) => call);
    const { result } = renderHook(() => useAiChat({
      onToolCall,
      onToolRiskCheck,
      preparePendingToolCall,
    }));

    await waitFor(() => {
      expect(result.current.isBootstrapping).toBe(false);
    });

    await act(async () => {
      await result.current.send('删除第一个句段');
    });

    await waitFor(() => {
      expect(result.current.isStreaming).toBe(false);
    });

    expect(result.current.pendingToolCall).toBeNull();
    expect(onToolCall).not.toHaveBeenCalled();
    const assistant = result.current.messages.find((item) => item.role === 'assistant');
    expect(assistant?.status).toBe('error');
    expect(assistant?.content).toContain('当前页面无法定位到目标句段');
  });

  it('should auto-execute set_transcription_text with ordinal selector', async () => {
    const onToolCall = vi.fn().mockResolvedValue({ ok: true, message: '已写入' });
    const { result } = renderHook(() => useAiChat({ onToolCall }));

    await waitFor(() => {
      expect(result.current.isBootstrapping).toBe(false);
    });

    await act(async () => {
      await result.current.send('把第五个句段转写改为你好');
    });

    await waitFor(() => {
      expect(result.current.isStreaming).toBe(false);
    });

    expect(onToolCall).toHaveBeenCalledTimes(1);
    const firstCall = onToolCall.mock.calls[0]?.[0];
    expect(firstCall?.name).toBe('set_transcription_text');
    expect(firstCall?.arguments.text).toBe('你好');
    expect(firstCall?.arguments.segmentIndex).toBe(5);
  });

  it('should auto-execute English set_transcription_text with ordinal selector', async () => {
    const onToolCall = vi.fn().mockResolvedValue({ ok: true, message: 'Written' });
    const { result } = renderHook(() => useAiChat({ onToolCall }));

    await waitFor(() => {
      expect(result.current.isBootstrapping).toBe(false);
    });

    await act(async () => {
      await result.current.send('set the fifth segment transcription to hello');
    });

    await waitFor(() => {
      expect(result.current.isStreaming).toBe(false);
    });

    expect(onToolCall).toHaveBeenCalledTimes(1);
    const firstCall = onToolCall.mock.calls[0]?.[0];
    expect(firstCall?.name).toBe('set_transcription_text');
    expect(firstCall?.arguments.text).toBe('hello');
    expect(firstCall?.arguments.segmentIndex).toBe(5);
  });

  it('should auto-execute clear_translation_segment with last selector and selected translation layer', async () => {
    const onToolCall = vi.fn().mockResolvedValue({ ok: true, message: '已清空' });
    const { result } = renderHook(() => useAiChat({
      onToolCall,
      getContext: () => ({
        shortTerm: {
          page: 'transcription',
          activeUnitId: 'u2',
          selectedLayerId: 'tr-layer-1',
          selectedLayerType: 'translation',
          selectedTranslationLayerId: 'tr-layer-1',
        },
      }),
    }));

    await waitFor(() => {
      expect(result.current.isBootstrapping).toBe(false);
    });

    await act(async () => {
      await result.current.send('清空最后一个句段翻译');
    });

    await waitFor(() => {
      expect(result.current.isStreaming).toBe(false);
    });

    expect(onToolCall).toHaveBeenCalledTimes(1);
    const firstCall = onToolCall.mock.calls[0]?.[0];
    expect(firstCall?.name).toBe('clear_translation_segment');
    expect(firstCall?.arguments.segmentPosition).toBe('last');
    expect(firstCall?.arguments.layerId).toBe('tr-layer-1');
  });

  it('should auto-execute English clear_translation_segment with last selector and selected translation layer', async () => {
    const onToolCall = vi.fn().mockResolvedValue({ ok: true, message: 'Cleared' });
    const { result } = renderHook(() => useAiChat({
      onToolCall,
      getContext: () => ({
        shortTerm: {
          page: 'transcription',
          activeUnitId: 'u2',
          selectedLayerId: 'tr-layer-1',
          selectedLayerType: 'translation',
          selectedTranslationLayerId: 'tr-layer-1',
        },
      }),
    }));

    await waitFor(() => {
      expect(result.current.isBootstrapping).toBe(false);
    });

    await act(async () => {
      await result.current.send('clear translation of the last segment');
    });

    await waitFor(() => {
      expect(result.current.isStreaming).toBe(false);
    });

    expect(onToolCall).toHaveBeenCalledTimes(1);
    const firstCall = onToolCall.mock.calls[0]?.[0];
    expect(firstCall?.name).toBe('clear_translation_segment');
    expect(firstCall?.arguments.segmentPosition).toBe('last');
    expect(firstCall?.arguments.layerId).toBe('tr-layer-1');
  });

  it('should keep semantic pending call but execute snapshotted concrete segment target on confirm', async () => {
    const onToolCall = vi.fn().mockResolvedValue({ ok: true, message: '已删除' });
    const onToolRiskCheck = vi.fn().mockReturnValue({ requiresConfirmation: true, riskSummary: '将删除最后一个句段' });
    let preparedTargetId = 'seg3';
    const preparePendingToolCall = vi.fn((call: AiChatToolCall) => ({
      ...call,
      arguments: {
        segmentId: preparedTargetId,
      },
    }));
    const { result } = renderHook(() => useAiChat({
      onToolCall,
      onToolRiskCheck,
      preparePendingToolCall,
    }));

    await waitFor(() => {
      expect(result.current.isBootstrapping).toBe(false);
    });

    await act(async () => {
      await result.current.send('删除最后一个句段');
    });

    await waitFor(() => {
      expect(result.current.pendingToolCall).not.toBeNull();
    });

    expect(result.current.pendingToolCall?.call.arguments.segmentPosition).toBe('last');
  expect(result.current.pendingToolCall?.executionCall?.arguments.segmentId).toBe('seg3');

  preparedTargetId = 'seg1';

    await act(async () => {
      await result.current.confirmPendingToolCall();
    });

    await waitFor(() => {
      expect(onToolCall).toHaveBeenCalledTimes(1);
    });

    const confirmedCall = onToolCall.mock.calls[0]?.[0];
    expect(confirmedCall?.arguments.segmentId).toBe('seg3');
    expect(confirmedCall?.arguments.segmentPosition).toBeUndefined();
  });

  it('should keep semantic pending call but execute snapshotted concrete batch targets on confirm', async () => {
    const onToolCall = vi.fn().mockResolvedValue({ ok: true, message: '已删除' });
    const onToolRiskCheck = vi.fn().mockReturnValue({ requiresConfirmation: true, riskSummary: '将删除全部句段' });
    let preparedIds = ['seg1', 'seg2', 'seg3'];
    const preparePendingToolCall = vi.fn((call: AiChatToolCall) => ({
      ...call,
      arguments: {
        segmentIds: preparedIds,
      },
    }));
    const { result } = renderHook(() => useAiChat({
      onToolCall,
      onToolRiskCheck,
      preparePendingToolCall,
      getContext: () => ({
        shortTerm: {
          page: 'transcription',
        },
        longTerm: {
          projectStats: {
            unitCount: 3,
            translationLayerCount: 0,
            aiConfidenceAvg: null,
          },
          topLexemes: [],
          recommendations: [],
        },
      }),
    }));

    await waitFor(() => {
      expect(result.current.isBootstrapping).toBe(false);
    });

    await act(async () => {
      await result.current.send('删除全部句段');
    });

    await waitFor(() => {
      expect(result.current.pendingToolCall).not.toBeNull();
    });

    expect(result.current.pendingToolCall?.call.arguments.allSegments).toBe(true);
  expect(result.current.pendingToolCall?.executionCall?.arguments.segmentIds).toEqual(['seg1', 'seg2', 'seg3']);

  preparedIds = ['seg9'];

    await act(async () => {
      await result.current.confirmPendingToolCall();
    });

    await waitFor(() => {
      expect(onToolCall).toHaveBeenCalledTimes(1);
    });

    const confirmedCall = onToolCall.mock.calls[0]?.[0];
    expect(confirmedCall?.arguments.segmentIds).toEqual(['seg1', 'seg2', 'seg3']);
    expect(confirmedCall?.arguments.allSegments).toBeUndefined();
  });

  it('should discard hallucinated layerId and clarify when no context layer matches', async () => {
    const onToolCall = vi.fn();
    const { result } = renderHook(() => useAiChat({ onToolCall }));

    await waitFor(() => {
      expect(result.current.isBootstrapping).toBe(false);
    });

    await act(async () => {
      await result.current.send('__TOOL_DELETE_LAYER_HALLUCINATED_ID__');
    });
    await waitFor(() => {
      expect(result.current.isStreaming).toBe(false);
    });

    // 幻觉 ID 被丢弃后，无 layerType/languageQuery → 应落入 clarify
    // Hallucinated ID discarded, no layerType/languageQuery → should clarify
    expect(onToolCall).not.toHaveBeenCalled();
    expect(result.current.pendingToolCall).toBeNull();
    expect(result.current.taskSession.status).toBe('waiting_clarify');
    expect(result.current.taskSession.clarifyReason).toBe('missing-layer-target');
  });

  it('should use context selectedTranscriptionLayerId when hallucinated layerId is discarded', async () => {
    const onToolCall = vi.fn();
    const onToolRiskCheck = vi.fn().mockReturnValue({ requiresConfirmation: true, riskSummary: '将删除' });
    const { result } = renderHook(() => useAiChat({
      onToolCall,
      onToolRiskCheck,
      getContext: () => ({
        shortTerm: {
          selectedLayerId: 'real_layer_42',
          selectedLayerType: 'transcription' as const,
          selectedTranscriptionLayerId: 'real_layer_42',
        },
      }),
    }));

    await waitFor(() => {
      expect(result.current.isBootstrapping).toBe(false);
    });

    await act(async () => {
      await result.current.send('__TOOL_DELETE_LAYER_HALLUCINATED_ID__');
    });
    await waitFor(() => {
      expect(result.current.isStreaming).toBe(false);
    });

    // 幻觉 ID 被丢弃，推断出 layerType=transcription 但无 languageQuery；
    // 有 selectedTranscriptionLayerId → 自动填充真实 ID → 进入确认
    // Hallucinated ID discarded, inferred transcription type, fills from context → pending confirm
    expect(result.current.pendingToolCall).not.toBeNull();
    expect(result.current.pendingToolCall?.call.arguments.layerId).toBe('real_layer_42');
  });

  it('should replace hallucinated unitId with context currentSegmentId', async () => {
    const onToolCall = vi.fn().mockResolvedValue({ ok: true, message: 'done' });
    const { result } = renderHook(() => useAiChat({
      onToolCall,
      getContext: () => ({
        shortTerm: {
          ...defaultSelectedSegmentShortTerm,
          activeUnitId: 'utt_real_001',
          activeSegmentUnitId: 'seg_real_001',
          selectedTranscriptionLayerId: 'layer_trans_1',
        },
      }),
    }));

    await waitFor(() => {
      expect(result.current.isBootstrapping).toBe(false);
    });

    await act(async () => {
      await result.current.send('__TOOL_SET_TEXT_HALLUCINATED_UNIT__');
    });
    await waitFor(() => {
      expect(result.current.isStreaming).toBe(false);
    });

    // 幻觉 unitId 被替换为上下文真实 segment ID | Hallucinated unitId replaced by the real segment ID from context
    expect(onToolCall).toHaveBeenCalledWith(
      expect.objectContaining({
        arguments: expect.objectContaining({ segmentId: 'seg_real_001' }),
      }),
    );
  });

  it('should replace hallucinated translationLayerId with context selectedTranslationLayerId', async () => {
    const onToolCall = vi.fn().mockResolvedValue({ ok: true, message: 'done' });
    const { result } = renderHook(() => useAiChat({
      onToolCall,
      getContext: () => ({
        shortTerm: {
          ...defaultSelectedTranslationShortTerm,
          activeUnitId: 'utt_real_001',
          activeSegmentUnitId: 'seg_real_001',
          selectedTranslationLayerId: 'layer_trans_real_42',
        },
      }),
    }));

    await waitFor(() => {
      expect(result.current.isBootstrapping).toBe(false);
    });

    await act(async () => {
      await result.current.send('__TOOL_SET_TRANSLATION_HALLUCINATED_LAYER__');
    });
    await waitFor(() => {
      expect(result.current.isStreaming).toBe(false);
    });

    // 幻觉 layerId 被替换为上下文翻译层 ID | Hallucinated layerId replaced by context translation layer
    expect(onToolCall).toHaveBeenCalledWith(
      expect.objectContaining({
        arguments: expect.objectContaining({
          layerId: 'layer_trans_real_42',
          segmentId: 'seg_real_001',
        }),
      }),
    );
  });

  it('should still use host-aware selectedTranslationLayerId when selected layer is transcription', async () => {
    const onToolCall = vi.fn().mockResolvedValue({ ok: true, message: 'done' });
    const { result } = renderHook(() => useAiChat({
      onToolCall,
      getContext: () => ({
        shortTerm: {
          ...defaultSelectedSegmentShortTerm,
          selectedLayerId: 'layer_transcription_host_fr',
          selectedLayerType: 'transcription' as const,
          selectedTranscriptionLayerId: 'layer_transcription_host_fr',
          selectedTranslationLayerId: 'layer_translation_child_fr',
          activeUnitId: 'utt_real_002',
          activeSegmentUnitId: 'seg_real_002',
        },
      }),
    }));

    await waitFor(() => {
      expect(result.current.isBootstrapping).toBe(false);
    });

    await act(async () => {
      await result.current.send('__TOOL_SET_TRANSLATION_HALLUCINATED_LAYER__');
    });
    await waitFor(() => {
      expect(result.current.isStreaming).toBe(false);
    });

    // 选中层是转写层时，也必须沿用上下文中已解析出的宿主子译文层 | Even when selected layer is transcription, use host-aware child translation layer from context.
    expect(onToolCall).toHaveBeenCalledWith(
      expect.objectContaining({
        arguments: expect.objectContaining({
          layerId: 'layer_translation_child_fr',
          segmentId: 'seg_real_002',
        }),
      }),
    );
  });
});
