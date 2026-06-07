// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import type { Dispatch, SetStateAction } from 'react';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { featureFlags } from '../../ai/config/featureFlags';
import { createConversationGenerationRef } from '../../ai/chat/conversationGeneration';
import { getDb, resetJieyuDatabaseSingletonForTests } from '../../db';
import { resetSessionMemoryStoreForTests } from '../../ai/chat/sessionMemory';
import { useAiChatConversationManager } from './useAiChatConversationManager';
import type { UiChatMessage } from './useAiChat.types';

vi.mock('./conversationListSync', () => ({
  AI_CONVERSATION_LIST_EPOCH_KEY: 'jieyu.aiChat.conversationListEpoch',
  AI_CONVERSATION_LIST_CHANNEL: 'jieyu.aiChat.conversations',
  notifyConversationListMutated: vi.fn(),
  subscribeConversationListSync: vi.fn(() => vi.fn()),
}));

describe('useAiChatConversationManager', () => {
  beforeEach(async () => {
    await resetJieyuDatabaseSingletonForTests();
    resetSessionMemoryStoreForTests();
    window.localStorage.clear();
    (featureFlags as { aiConversationManagement: boolean }).aiConversationManagement = true;
  });

  afterEach(() => {
    cleanup();
    window.localStorage.clear();
    (featureFlags as { aiConversationManagement: boolean }).aiConversationManagement = false;
  });

  it('startNewConversation creates an O(1) new row without deleting prior messages', async () => {
    const db = await getDb();
    const timestamp = '2026-05-17T10:00:00.000Z';
    await db.collections.ai_conversations.insert({
      id: 'conv-old',
      title: 'Old',
      mode: 'assistant',
      providerId: 'mock',
      model: 'mock',
      textId: 'text-1',
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    await db.collections.ai_messages.insert({
      id: 'msg-1',
      conversationId: 'conv-old',
      role: 'user',
      content: 'hello',
      status: 'done',
      createdAt: timestamp,
      updatedAt: timestamp,
    });

    const conversationIdRef = { current: 'conv-old' as string | null };
    const setConversationId = vi.fn((id: string | null) => {
      conversationIdRef.current = id;
    });
    const setMessages = vi.fn() as unknown as Dispatch<SetStateAction<UiChatMessage[]>>;
    const sessionMemoryRef = { current: {} };

    const { result, unmount } = renderHook(() =>
      useAiChatConversationManager({
        enabled: true,
        locale: 'zh-CN',
        providerId: 'mock',
        model: 'mock',
        textId: 'text-1',
        conversationId: conversationIdRef.current,
        conversationIdRef,
        setConversationId,
        conversationGenerationRef: { current: createConversationGenerationRef(0) },
        abortActiveStream: vi.fn(),
        resetChatUiState: vi.fn(),
        setMessages,
        sessionMemoryRef,
      }),
    );

    await act(async () => {
      await result.current!.startNewConversation();
    });

    const messages = await db.collections.ai_messages.findByIndex('conversationId', 'conv-old');
    expect(messages).toHaveLength(1);
    expect(conversationIdRef.current).not.toBe('conv-old');
    await waitFor(() => {
      expect(result.current?.conversations.length).toBeGreaterThanOrEqual(2);
    });
    unmount();
  });

  it('clearCurrentConversation sets clearedAt and removes messages in background', async () => {
    const db = await getDb();
    const timestamp = '2026-05-17T10:00:00.000Z';
    await db.collections.ai_conversations.insert({
      id: 'conv-clear',
      title: 'Clear me',
      mode: 'assistant',
      providerId: 'mock',
      model: 'mock',
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    await db.collections.ai_messages.insert({
      id: 'msg-clear',
      conversationId: 'conv-clear',
      role: 'user',
      content: 'bye',
      status: 'done',
      createdAt: timestamp,
      updatedAt: timestamp,
    });

    const conversationIdRef = { current: 'conv-clear' as string | null };
    const setConversationId = vi.fn((id: string | null) => {
      conversationIdRef.current = id;
    });
    const setMessages = vi.fn() as unknown as Dispatch<SetStateAction<UiChatMessage[]>>;
    const sessionMemoryRef = {
      current: {
        lastLanguage: 'cmn',
        conversationSummary: 'prior summary',
        summaryTurnCount: 3,
        responsePreferences: { style: 'concise' as const },
      },
    };

    const { result } = renderHook(() =>
      useAiChatConversationManager({
        enabled: true,
        locale: 'zh-CN',
        providerId: 'mock',
        model: 'mock',
        textId: 'text-1',
        conversationId: conversationIdRef.current,
        conversationIdRef,
        setConversationId,
        conversationGenerationRef: { current: createConversationGenerationRef(0) },
        abortActiveStream: vi.fn(),
        resetChatUiState: vi.fn(),
        setMessages,
        sessionMemoryRef,
      }),
    );

    act(() => {
      result.current!.clearCurrentConversation();
    });

    expect(setMessages).toHaveBeenCalledWith([]);
    expect(conversationIdRef.current).toBeNull();

    await waitFor(async () => {
      const conv = await db.collections.ai_conversations
        .findOne({ selector: { id: 'conv-clear' } })
        .exec();
      expect(conv?.toJSON().clearedAt).toBeTruthy();
      const messages = await db.collections.ai_messages.findByIndex('conversationId', 'conv-clear');
      expect(messages).toHaveLength(0);
      const memory = await db.collections.ai_session_memories
        .findOne({ selector: { conversationId: 'conv-clear' } })
        .exec();
      expect(memory?.toJSON().payload).toMatchObject({
        lastLanguage: 'cmn',
        responsePreferences: { style: 'concise' },
        summaryTurnCount: 0,
      });
      expect(memory?.toJSON().payload).not.toHaveProperty('conversationSummary');
    });

    await waitFor(() => {
      expect(result.current?.conversations.every((c) => c.id !== 'conv-clear')).toBe(true);
    });
  });

  it('archiveConversation moves row to archived list and switches away when active', async () => {
    const db = await getDb();
    const archiveScopeTextId = 'text-archive-scope';
    const timestamp = '2026-05-17T10:00:00.000Z';
    await db.collections.ai_conversations.insert({
      id: 'conv-a',
      title: 'A',
      mode: 'assistant',
      providerId: 'mock',
      model: 'mock',
      textId: archiveScopeTextId,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    await db.collections.ai_conversations.insert({
      id: 'conv-b',
      title: 'B',
      mode: 'assistant',
      providerId: 'mock',
      model: 'mock',
      textId: archiveScopeTextId,
      createdAt: timestamp,
      updatedAt: '2026-05-17T11:00:00.000Z',
    });

    const conversationIdRef = { current: 'conv-a' as string | null };
    const setConversationId = vi.fn((id: string | null) => {
      conversationIdRef.current = id;
    });
    const setMessages = vi.fn() as unknown as Dispatch<SetStateAction<UiChatMessage[]>>;
    const sessionMemoryRef = { current: {} };

    const { result } = renderHook(() =>
      useAiChatConversationManager({
        enabled: true,
        locale: 'zh-CN',
        providerId: 'mock',
        model: 'mock',
        textId: archiveScopeTextId,
        conversationId: conversationIdRef.current,
        conversationIdRef,
        setConversationId,
        conversationGenerationRef: { current: createConversationGenerationRef(0) },
        abortActiveStream: vi.fn(),
        resetChatUiState: vi.fn(),
        setMessages,
        sessionMemoryRef,
      }),
    );

    await act(async () => {
      await result.current!.archiveConversation('conv-a');
    });

    await waitFor(() => {
      expect(result.current?.archivedConversations.some((c) => c.id === 'conv-a')).toBe(true);
      expect(result.current?.conversations.every((c) => c.id !== 'conv-a')).toBe(true);
      expect(conversationIdRef.current).toBe('conv-b');
    });
  });

  it('deleteConversation hard-deletes messages and conversation row', async () => {
    const db = await getDb();
    const timestamp = '2026-05-17T10:00:00.000Z';
    await db.collections.ai_conversations.insert({
      id: 'conv-del',
      title: 'Delete',
      mode: 'assistant',
      providerId: 'mock',
      model: 'mock',
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    await db.collections.ai_messages.insert({
      id: 'msg-del',
      conversationId: 'conv-del',
      role: 'user',
      content: 'x',
      status: 'done',
      createdAt: timestamp,
      updatedAt: timestamp,
    });

    const conversationIdRef = { current: 'conv-del' as string | null };
    const setConversationId = vi.fn((id: string | null) => {
      conversationIdRef.current = id;
    });
    const setMessages = vi.fn() as unknown as Dispatch<SetStateAction<UiChatMessage[]>>;
    const sessionMemoryRef = { current: {} };

    const { result } = renderHook(() =>
      useAiChatConversationManager({
        enabled: true,
        locale: 'zh-CN',
        providerId: 'mock',
        model: 'mock',
        textId: 'text-1',
        conversationId: conversationIdRef.current,
        conversationIdRef,
        setConversationId,
        conversationGenerationRef: { current: createConversationGenerationRef(0) },
        abortActiveStream: vi.fn(),
        resetChatUiState: vi.fn(),
        setMessages,
        sessionMemoryRef,
      }),
    );

    await act(async () => {
      await result.current!.deleteConversation('conv-del');
    });

    await waitFor(async () => {
      const conv = await db.collections.ai_conversations
        .findOne({ selector: { id: 'conv-del' } })
        .exec();
      expect(conv).toBeNull();
      const messages = await db.collections.ai_messages.findByIndex('conversationId', 'conv-del');
      expect(messages).toHaveLength(0);
    });
  });

  it('switchConversation ignores stale load when a faster switch bumps generation', async () => {
    const convState = await import('./useAiChat.conversationState');
    let releaseSlowLoad: () => void = () => {};
    const slowLoadGate = new Promise<void>((resolve) => {
      releaseSlowLoad = resolve;
    });

    const loadSpy = vi
      .spyOn(convState, 'loadConversationUiMessages')
      .mockImplementation(async (id) => {
        if (id === 'conv-slow') {
          await slowLoadGate;
          return [{ id: 'msg-slow', role: 'user', content: 'slow content' }];
        }
        return [{ id: 'msg-fast', role: 'user', content: 'fast content' }];
      });

    const db = await getDb();
    const timestamp = '2026-05-17T10:00:00.000Z';
    for (const id of ['conv-slow', 'conv-fast'] as const) {
      await db.collections.ai_conversations.insert({
        id,
        title: id,
        mode: 'assistant',
        providerId: 'mock',
        model: 'mock',
        textId: 'text-race',
        createdAt: timestamp,
        updatedAt: timestamp,
      });
    }

    const conversationIdRef = { current: null as string | null };
    const setConversationId = vi.fn((id: string | null) => {
      conversationIdRef.current = id;
    });
    const setMessages = vi.fn() as unknown as Dispatch<SetStateAction<UiChatMessage[]>>;
    const sessionMemoryRef = { current: {} };

    const { result, unmount } = renderHook(() =>
      useAiChatConversationManager({
        enabled: true,
        locale: 'zh-CN',
        providerId: 'mock',
        model: 'mock',
        textId: 'text-race',
        conversationId: conversationIdRef.current,
        conversationIdRef,
        setConversationId,
        conversationGenerationRef: { current: createConversationGenerationRef(0) },
        abortActiveStream: vi.fn(),
        resetChatUiState: vi.fn(),
        setMessages,
        sessionMemoryRef,
      }),
    );

    let slowSwitchDone: Promise<void> | undefined;
    await act(async () => {
      slowSwitchDone = result.current!.switchConversation('conv-slow');
      await result.current!.switchConversation('conv-fast');
    });

    releaseSlowLoad();
    await act(async () => {
      await slowSwitchDone;
    });

    expect(conversationIdRef.current).toBe('conv-fast');
    const callsWithSlow = (setMessages as ReturnType<typeof vi.fn>).mock.calls.filter(
      (call) => Array.isArray(call[0]) && call[0][0]?.content === 'slow content',
    );
    const callsWithFast = (setMessages as ReturnType<typeof vi.fn>).mock.calls.filter(
      (call) => Array.isArray(call[0]) && call[0][0]?.content === 'fast content',
    );
    expect(callsWithFast.length).toBeGreaterThan(0);
    expect(callsWithSlow).toHaveLength(0);

    loadSpy.mockRestore();
    unmount();
  });
});
