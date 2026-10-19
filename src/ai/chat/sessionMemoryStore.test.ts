// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AiSessionMemory } from './chatDomain.types';
import * as dbModule from '../../db';
import * as sessionMemoryRows from '../../db/storagePortAiSessionMemory';
import {
  bindSessionMemoryConversation,
  loadSessionMemoryAsync,
  persistSessionMemory,
  persistSessionMemoryAsync,
  resetSessionMemoryStoreForTests,
} from './sessionMemory';

describe('loadSessionMemoryAsync', () => {
  beforeEach(async () => {
    await dbModule.resetJieyuDatabaseSingletonForTests();
    resetSessionMemoryStoreForTests();
    bindSessionMemoryConversation(null);
    vi.restoreAllMocks();
  });

  it('prefers in-memory cache updated during an in-flight Dexie read', async () => {
    const conversationId = 'conv-hydration-race';
    bindSessionMemoryConversation(conversationId);

    let resolveDexieRead!: (value: undefined) => void;
    const dexieRead = new Promise<undefined>((resolve) => {
      resolveDexieRead = resolve;
    });

    const originalRead = sessionMemoryRows.readAiSessionMemory;
    vi.spyOn(sessionMemoryRows, 'readAiSessionMemory').mockImplementation((id) =>
      id === conversationId ? dexieRead : originalRead(id),
    );

    const loadPromise = loadSessionMemoryAsync(conversationId);

    await persistSessionMemoryAsync(conversationId, {
      preferences: { lastLanguage: 'fra' },
    });

    resolveDexieRead(undefined);

    await expect(loadPromise).resolves.toMatchObject({
      preferences: { lastLanguage: 'fra' },
    });
  });

  it('prefers in-memory cache over a stale Dexie row during an in-flight read', async () => {
    const conversationId = 'conv-stale-row-race';
    bindSessionMemoryConversation(conversationId);

    const staleRow = {
      id: conversationId,
      conversationId,
      payload: { preferences: { lastLanguage: 'cmn' } },
      updatedAt: '2020-01-01T00:00:00.000Z',
    };

    let resolveDexieRead!: (value: typeof staleRow) => void;
    const dexieRead = new Promise<typeof staleRow>((resolve) => {
      resolveDexieRead = resolve;
    });

    const originalRead = sessionMemoryRows.readAiSessionMemory;
    vi.spyOn(sessionMemoryRows, 'readAiSessionMemory').mockImplementation((id) =>
      id === conversationId ? dexieRead : originalRead(id),
    );

    const loadPromise = loadSessionMemoryAsync(conversationId);

    await persistSessionMemoryAsync(conversationId, {
      preferences: { lastLanguage: 'yue' },
    });

    resolveDexieRead(staleRow);

    await expect(loadPromise).resolves.toMatchObject({
      preferences: { lastLanguage: 'yue' },
    });
  });

  it('does not mark a switched-away conversation hydrated from a stale in-flight load', async () => {
    const conversationA = 'conv-stale-hydrate-a';
    const conversationB = 'conv-stale-hydrate-b';

    let resolveDexieReadA!: (value: undefined) => void;
    const dexieReadA = new Promise<undefined>((resolve) => {
      resolveDexieReadA = resolve;
    });

    const originalRead = sessionMemoryRows.readAiSessionMemory;
    const getDbSpy = vi
      .spyOn(sessionMemoryRows, 'readAiSessionMemory')
      .mockImplementation((id) => (id === conversationA ? dexieReadA : originalRead(id)));

    bindSessionMemoryConversation(conversationA);
    const loadPromiseA = loadSessionMemoryAsync(conversationA);

    bindSessionMemoryConversation(conversationB);
    persistSessionMemory({
      preferences: { lastLanguage: 'eng' },
    });

    resolveDexieReadA(undefined);
    await loadPromiseA;

    getDbSpy.mockRestore();
    await loadSessionMemoryAsync(conversationB);

    const db = await dbModule.getDb();
    await waitFor(async () => {
      const rowB = await db.collections.ai_session_memories
        .findOne({ selector: { conversationId: conversationB } })
        .exec();
      expect(
        (rowB?.toJSON().payload as AiSessionMemory | undefined)?.preferences?.lastLanguage,
      ).toBe('eng');
    });
  });
});
