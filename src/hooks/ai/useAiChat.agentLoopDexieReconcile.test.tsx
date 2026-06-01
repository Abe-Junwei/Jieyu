// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { persistAgentLoopCheckpointTask } from '../../ai/chat/agentLoopCheckpoint';
import {
  persistSessionMemoryAsync,
  resetSessionMemoryStoreForTests,
} from '../../ai/chat/sessionMemory';
import { resetJieyuDatabaseSingletonForTests } from '../../db';
import type { AiSessionMemory } from './useAiChat.types';
import { useAgentLoopSessionMemoryDexieReconcile } from './useAiChat.agentLoopDexieReconcile';
import { useSessionMemoryConversationBinding } from './useSessionMemoryConversationBinding';
import { readDexieSessionMemory } from './useAiChat.testSessionMemoryDexie.helpers';

describe('useAgentLoopSessionMemoryDexieReconcile', () => {
  beforeEach(async () => {
    await resetJieyuDatabaseSingletonForTests();
    resetSessionMemoryStoreForTests();
  });

  it('does not persist stale in-memory state from a previous conversation after switch', async () => {
    await persistSessionMemoryAsync('conv-a', {
      preferences: { lastLanguage: 'cmn' },
    });
    await persistSessionMemoryAsync('conv-b', {
      preferences: { lastLanguage: 'eng' },
    });

    const sessionMemoryRef = {
      current: { preferences: { lastLanguage: 'cmn' } } as AiSessionMemory,
    };

    renderHook(() => {
      const hydrationGeneration = useSessionMemoryConversationBinding('conv-b', sessionMemoryRef);
      useAgentLoopSessionMemoryDexieReconcile(sessionMemoryRef, 'conv-b', hydrationGeneration);
      return hydrationGeneration;
    });

    await waitFor(() => {
      expect(sessionMemoryRef.current.preferences?.lastLanguage).toBe('eng');
    });

    const stored = await readDexieSessionMemory('conv-b');
    expect(stored.preferences?.lastLanguage).toBe('eng');
  });

  it('does not mirror a global agent-loop handoff into another conversation on switch', async () => {
    await persistAgentLoopCheckpointTask({
      targetId: 'assistant-conv-a',
      checkpoint: {
        kind: 'token_budget_warning',
        originalUserText: 'conv-a-handoff',
        continuationInput: 'payload-a',
        step: 1,
        createdAt: '2026-05-01T00:00:00.000Z',
      },
    });
    await persistSessionMemoryAsync('conv-a', {
      preferences: { lastLanguage: 'cmn' },
    });
    await persistSessionMemoryAsync('conv-b', {
      preferences: { lastLanguage: 'eng' },
    });

    const sessionMemoryRef = {
      current: { preferences: { lastLanguage: 'cmn' } } as AiSessionMemory,
    };

    const { rerender } = renderHook(
      ({ id }: { id: string }) => {
        const hydrationGeneration = useSessionMemoryConversationBinding(id, sessionMemoryRef);
        useAgentLoopSessionMemoryDexieReconcile(sessionMemoryRef, id, hydrationGeneration);
        return hydrationGeneration;
      },
      { initialProps: { id: 'conv-a' } },
    );

    await waitFor(() => {
      expect(sessionMemoryRef.current.pendingAgentLoopCheckpoint?.originalUserText).toBe(
        'conv-a-handoff',
      );
    });

    rerender({ id: 'conv-b' });

    await waitFor(() => {
      expect(sessionMemoryRef.current.preferences?.lastLanguage).toBe('eng');
    });

    expect(sessionMemoryRef.current.pendingAgentLoopCheckpoint).toBeUndefined();

    const storedB = await readDexieSessionMemory('conv-b');
    expect(storedB.pendingAgentLoopCheckpoint).toBeUndefined();
    expect(storedB.preferences?.lastLanguage).toBe('eng');
  });
});
