// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  bindSessionMemoryConversation,
  loadSessionMemoryAsync,
  resetSessionMemoryStoreForTests,
} from '../../ai/chat/sessionMemory';
import { getDb, resetJieyuDatabaseSingletonForTests } from '../../db';
import {
  readDexieSessionMemory,
  seedAiChatConversationWithSessionMemory,
} from './useAiChat.testSessionMemoryDexie.helpers';

describe('useAiChat.testSessionMemoryDexie.helpers', () => {
  beforeEach(async () => {
    await resetJieyuDatabaseSingletonForTests();
    resetSessionMemoryStoreForTests();
  });

  it('seeds session memory readable via collections API', async () => {
    const conversationId = await seedAiChatConversationWithSessionMemory({
      responsePreferences: { style: 'concise' },
    });
    const stored = await readDexieSessionMemory(conversationId);
    expect(stored.responsePreferences?.style).toBe('concise');

    const db = await getDb();
    const row = await db.collections.ai_session_memories
      .findOne({ selector: { conversationId } })
      .exec();
    expect(row?.toJSON().payload).toMatchObject({ responsePreferences: { style: 'concise' } });
  });

  it('loadSessionMemoryAsync hydrates seeded payload after bind', async () => {
    const conversationId = await seedAiChatConversationWithSessionMemory({
      responsePreferences: { style: 'concise' },
    });
    bindSessionMemoryConversation(conversationId);
    const loaded = await loadSessionMemoryAsync(conversationId);
    expect(loaded.responsePreferences?.style).toBe('concise');
  });
});
