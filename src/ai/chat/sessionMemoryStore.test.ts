// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as dbModule from '../../db';
import {
  bindSessionMemoryConversation,
  loadSessionMemoryAsync,
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
});
