// @vitest-environment jsdom

import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { featureFlags } from '../../ai/config/featureFlags';
import { getDb, resetJieyuDatabaseSingletonForTests } from '../../db';
import { resetSessionMemoryStoreForTests } from '../../ai/chat/sessionMemory';
import { useAiChat } from '../useAiChat';

vi.mock('../../ai/ChatOrchestrator', () => {
  class MockChatOrchestrator {
    sendMessage() {
      async function* stream() {
        yield { delta: 'ok' };
        yield { delta: '', done: true };
      }
      return { messages: [], stream: stream() };
    }
  }
  return { ChatOrchestrator: MockChatOrchestrator };
});

vi.mock('./conversationListSync', () => ({
  AI_CONVERSATION_LIST_EPOCH_KEY: 'jieyu.aiChat.conversationListEpoch',
  AI_CONVERSATION_LIST_CHANNEL: 'jieyu.aiChat.conversations',
  notifyConversationListMutated: vi.fn(),
  subscribeConversationListSync: vi.fn(() => vi.fn()),
}));

describe('useAiChat clear (G1e conversation management)', () => {
  const textId = 'text-clear-proxy';

  beforeEach(async () => {
    window.localStorage.removeItem('jieyu.aiChat.settings');
    window.localStorage.removeItem('jieyu.aiChat.settings.secure');
    (featureFlags as { aiConversationManagement: boolean }).aiConversationManagement = true;
    await resetJieyuDatabaseSingletonForTests();
    resetSessionMemoryStoreForTests();
    window.localStorage.clear();
  });

  afterEach(() => {
    cleanup();
    (featureFlags as { aiConversationManagement: boolean }).aiConversationManagement = false;
  });

  it('clear() soft-clears the active conversation instead of bulk-deleting it', async () => {
    const db = await getDb();
    const timestamp = '2026-05-17T12:00:00.000Z';
    await db.collections.ai_conversations.insert({
      id: 'conv-proxy',
      title: 'Proxy clear',
      mode: 'assistant',
      providerId: 'mock',
      model: 'mock',
      textId,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    await db.collections.ai_messages.insert({
      id: 'msg-proxy',
      conversationId: 'conv-proxy',
      role: 'user',
      content: 'hello',
      status: 'done',
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    await db.collections.ai_session_memories.insert({
      id: 'conv-proxy',
      conversationId: 'conv-proxy',
      payload: { preferences: { lastLanguage: 'cmn' } },
      updatedAt: timestamp,
    });

    const { result } = renderHook(() => useAiChat({ textId }));

    await waitFor(() => {
      expect(result.current.isBootstrapping).toBe(false);
      expect(result.current.conversationId).toBe('conv-proxy');
      expect(result.current.messages.length).toBeGreaterThan(0);
    });
    expect(result.current.conversationManagement).not.toBeNull();

    act(() => {
      result.current.clear();
    });

    expect(result.current.messages).toHaveLength(0);
    expect(result.current.conversationId).toBeNull();

    await waitFor(async () => {
      const conv = await db.collections.ai_conversations
        .findOne({ selector: { id: 'conv-proxy' } })
        .exec();
      expect(conv).not.toBeNull();
      expect(conv?.toJSON().clearedAt).toBeTruthy();
      const messages = await db.collections.ai_messages.findByIndex('conversationId', 'conv-proxy');
      expect(messages).toHaveLength(0);
    });
  });
});
