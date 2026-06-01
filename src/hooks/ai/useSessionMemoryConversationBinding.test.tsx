// @vitest-environment jsdom
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { getDb, resetJieyuDatabaseSingletonForTests } from '../../db';
import {
  bindSessionMemoryConversation,
  persistSessionMemoryAsync,
  resetSessionMemoryStoreForTests,
} from '../../ai/chat/sessionMemory';
import type { AiSessionMemory } from './useAiChat.types';
import { useSessionMemoryConversationBinding } from './useSessionMemoryConversationBinding';

describe('useSessionMemoryConversationBinding', () => {
  beforeEach(async () => {
    await resetJieyuDatabaseSingletonForTests();
    resetSessionMemoryStoreForTests();
  });

  it('binds and hydrates session memory when conversationId is set', async () => {
    const conversationId = 'conv-bind-hook';
    await persistSessionMemoryAsync(conversationId, {
      preferences: { lastLanguage: 'eng' },
    });
    bindSessionMemoryConversation(null);

    const sessionMemoryRef = { current: {} as AiSessionMemory };

    renderHook(() => useSessionMemoryConversationBinding(conversationId, sessionMemoryRef));

    await waitFor(() => {
      expect(sessionMemoryRef.current.preferences?.lastLanguage).toBe('eng');
    });

    const db = await getDb();
    const row = await db.collections.ai_session_memories
      .findOne({ selector: { conversationId } })
      .exec();
    expect(row?.toJSON().payload.preferences?.lastLanguage).toBe('eng');
  });

  it('clears stale ref on conversation switch before hydrating the next conversation', async () => {
    await persistSessionMemoryAsync('conv-a', { preferences: { lastLanguage: 'cmn' } });
    await persistSessionMemoryAsync('conv-b', { preferences: { lastLanguage: 'eng' } });

    const sessionMemoryRef = { current: {} as AiSessionMemory };
    const { rerender } = renderHook(
      ({ id }: { id: string | null }) => useSessionMemoryConversationBinding(id, sessionMemoryRef),
      { initialProps: { id: 'conv-a' as string | null } },
    );

    await waitFor(() => {
      expect(sessionMemoryRef.current.preferences?.lastLanguage).toBe('cmn');
    });

    rerender({ id: 'conv-b' });
    expect(sessionMemoryRef.current).toEqual({});

    await waitFor(() => {
      expect(sessionMemoryRef.current.preferences?.lastLanguage).toBe('eng');
    });

    const db = await getDb();
    const row = await db.collections.ai_session_memories
      .findOne({ selector: { conversationId: 'conv-b' } })
      .exec();
    expect(row?.toJSON().payload.preferences?.lastLanguage).toBe('eng');
  });

  it('clears bind and ref when conversationId becomes null', async () => {
    const sessionMemoryRef = {
      current: { preferences: { lastLanguage: 'cmn' } } as AiSessionMemory,
    };

    const { rerender } = renderHook(
      ({ id }: { id: string | null }) => useSessionMemoryConversationBinding(id, sessionMemoryRef),
      { initialProps: { id: 'conv-clear' as string | null } },
    );

    rerender({ id: null });

    await waitFor(() => {
      expect(sessionMemoryRef.current).toEqual({});
    });
  });
});
