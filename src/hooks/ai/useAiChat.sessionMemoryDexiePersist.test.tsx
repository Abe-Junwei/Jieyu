// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  completeAgentLoopCheckpointTask,
  persistAgentLoopCheckpointTask,
} from '../../ai/chat/agentLoopCheckpoint';
import { resetSessionMemoryStoreForTests } from '../../ai/chat/sessionMemory';
import { resetJieyuDatabaseSingletonForTests } from '../../db';
import { useAiChat } from '../useAiChat';
import {
  readDexieSessionMemory,
  seedAiChatConversationWithSessionMemory,
} from './useAiChat.testSessionMemoryDexie.helpers';

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

describe('useAiChat sessionMemory Dexie persist readback', () => {
  beforeEach(async () => {
    await resetJieyuDatabaseSingletonForTests();
    resetSessionMemoryStoreForTests();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('reloads seeded session memory from Dexie after unmount and remount', async () => {
    const seededConversationId = await seedAiChatConversationWithSessionMemory({
      responsePreferences: { style: 'concise' },
      preferences: { lastLanguage: 'cmn' },
    });

    const first = renderHook(() => useAiChat());

    await waitFor(() => {
      expect(first.result.current.isBootstrapping).toBe(false);
      expect(first.result.current.conversationId).toBe(seededConversationId);
      expect(first.result.current.sessionMemory.responsePreferences?.style).toBe('concise');
      expect(first.result.current.sessionMemory.preferences?.lastLanguage).toBe('cmn');
    });

    first.unmount();

    const second = renderHook(() => useAiChat());

    await waitFor(() => {
      expect(second.result.current.isBootstrapping).toBe(false);
      expect(second.result.current.conversationId).toBe(seededConversationId);
      expect(second.result.current.sessionMemory.responsePreferences?.style).toBe('concise');
      expect(second.result.current.sessionMemory.preferences?.lastLanguage).toBe('cmn');
    });

    const stored = await readDexieSessionMemory(seededConversationId);
    expect(stored.responsePreferences?.style).toBe('concise');
    expect(stored.preferences?.lastLanguage).toBe('cmn');
  });

  it('clears stale pendingAgentLoopCheckpoint from Dexie when ai_task is no longer resumable', async () => {
    const taskId = await persistAgentLoopCheckpointTask({
      targetId: 'assistant-stale-checkpoint',
      checkpoint: {
        kind: 'token_budget_warning',
        originalUserText: 'stale-checkpoint',
        continuationInput: 'c1',
        step: 1,
        createdAt: '2026-05-01T12:00:00.000Z',
      },
    });
    await completeAgentLoopCheckpointTask(taskId);

    const seededConversationId = await seedAiChatConversationWithSessionMemory({
      pendingAgentLoopCheckpoint: {
        kind: 'token_budget_warning',
        taskId,
        originalUserText: 'stale-checkpoint',
        continuationInput: 'c1',
        step: 1,
        createdAt: '2026-05-01T12:00:00.000Z',
      },
    });

    const first = renderHook(() => useAiChat());

    await waitFor(() => {
      expect(first.result.current.isBootstrapping).toBe(false);
      expect(first.result.current.conversationId).toBe(seededConversationId);
      expect(first.result.current.sessionMemory.pendingAgentLoopCheckpoint).toBeUndefined();
    });

    const storedAfterReconcile = await readDexieSessionMemory(seededConversationId);
    expect(storedAfterReconcile.pendingAgentLoopCheckpoint).toBeUndefined();

    first.unmount();

    const second = renderHook(() => useAiChat());

    await waitFor(() => {
      expect(second.result.current.isBootstrapping).toBe(false);
      expect(second.result.current.sessionMemory.pendingAgentLoopCheckpoint).toBeUndefined();
    });

    const storedAfterRemount = await readDexieSessionMemory(seededConversationId);
    expect(storedAfterRemount.pendingAgentLoopCheckpoint).toBeUndefined();
  });

  it('persists deactivateSessionDirective changes to Dexie across remount', async () => {
    const seededConversationId = await seedAiChatConversationWithSessionMemory({
      responsePreferences: { style: 'concise' },
      directiveLedger: [
        {
          id: 'dir-reload-1',
          category: 'response',
          scope: 'long_term',
          text: '简洁',
          action: 'accepted',
          source: 'user_explicit',
          confidence: 0.9,
          createdAt: '2026-04-26T00:00:00.000Z',
          targetPath: 'responsePreferences.style',
          value: 'concise',
        },
      ],
    });

    const first = renderHook(() => useAiChat());

    await waitFor(() => {
      expect(first.result.current.isBootstrapping).toBe(false);
      expect(first.result.current.conversationId).toBe(seededConversationId);
      expect(first.result.current.sessionMemory.responsePreferences?.style).toBe('concise');
    });

    await act(async () => {
      first.result.current.deactivateSessionDirective('dir-reload-1');
    });

    await waitFor(async () => {
      const stored = await readDexieSessionMemory(seededConversationId);
      expect(stored.responsePreferences).toBeUndefined();
      expect(stored.directiveLedger?.find((e) => e.id === 'dir-reload-1')?.action).toBe(
        'superseded',
      );
    });

    first.unmount();

    const second = renderHook(() => useAiChat());

    await waitFor(() => {
      expect(second.result.current.isBootstrapping).toBe(false);
      expect(second.result.current.sessionMemory.responsePreferences).toBeUndefined();
      expect(
        second.result.current.sessionMemory.directiveLedger?.find((e) => e.id === 'dir-reload-1')
          ?.action,
      ).toBe('superseded');
    });
  });
});
