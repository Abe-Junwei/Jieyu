// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as dbModule from '../../db';
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

    let resolveDexieRead!: (value: null) => void;
    const dexieRead = new Promise<null>((resolve) => {
      resolveDexieRead = resolve;
    });

    vi.spyOn(dbModule, 'getDb').mockResolvedValue({
      collections: {
        ai_session_memories: {
          findOne: () => ({
            exec: () => dexieRead,
          }),
        },
      },
    } as never);

    const loadPromise = loadSessionMemoryAsync(conversationId);

    await persistSessionMemoryAsync(conversationId, {
      preferences: { lastLanguage: 'fra' },
    });

    resolveDexieRead(null);

    await expect(loadPromise).resolves.toMatchObject({
      preferences: { lastLanguage: 'fra' },
    });
  });

  it('prefers in-memory cache over a stale Dexie row during an in-flight read', async () => {
    const conversationId = 'conv-stale-row-race';
    bindSessionMemoryConversation(conversationId);

    const staleRow = {
      toJSON: () => ({ payload: { preferences: { lastLanguage: 'cmn' } } }),
    };

    let resolveDexieRead!: (value: typeof staleRow) => void;
    const dexieRead = new Promise<typeof staleRow>((resolve) => {
      resolveDexieRead = resolve;
    });

    vi.spyOn(dbModule, 'getDb').mockResolvedValue({
      collections: {
        ai_session_memories: {
          findOne: () => ({
            exec: () => dexieRead,
          }),
        },
      },
    } as never);

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

    let resolveDexieReadA!: (value: null) => void;
    const dexieReadA = new Promise<null>((resolve) => {
      resolveDexieReadA = resolve;
    });

    const getDbSpy = vi.spyOn(dbModule, 'getDb').mockResolvedValue({
      collections: {
        ai_session_memories: {
          findOne: () => ({
            exec: () => dexieReadA,
          }),
        },
      },
    } as never);

    bindSessionMemoryConversation(conversationA);
    const loadPromiseA = loadSessionMemoryAsync(conversationA);

    bindSessionMemoryConversation(conversationB);
    persistSessionMemory({
      preferences: { lastLanguage: 'eng' },
    });

    resolveDexieReadA(null);
    await loadPromiseA;

    getDbSpy.mockRestore();
    await loadSessionMemoryAsync(conversationB);

    const db = await dbModule.getDb();
    await waitFor(async () => {
      const rowB = await db.collections.ai_session_memories
        .findOne({ selector: { conversationId: conversationB } })
        .exec();
      expect(rowB?.toJSON().payload.preferences?.lastLanguage).toBe('eng');
    });
  });
});
