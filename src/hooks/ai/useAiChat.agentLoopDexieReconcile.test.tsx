// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
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
});
