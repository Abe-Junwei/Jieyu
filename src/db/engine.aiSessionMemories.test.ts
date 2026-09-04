// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  getDb,
  JIEYU_DEXIE_TARGET_SCHEMA_VERSION,
  resetJieyuDatabaseSingletonForTests,
} from './engine';
import { validateAiConversationDoc } from './schemas';

describe('ai_session_memories Dexie table (v50)', () => {
  beforeEach(async () => {
    await resetJieyuDatabaseSingletonForTests();
  });

  afterEach(() => {
    // no-op
  });

  it('schema version is at least 50', async () => {
    const jieyuDb = await getDb();
    expect(jieyuDb.dexie.verno).toBeGreaterThanOrEqual(50);
    expect(JIEYU_DEXIE_TARGET_SCHEMA_VERSION).toBe(51);
  });

  it('can insert and retrieve session memory by conversationId', async () => {
    const jieyuDb = await getDb();
    const conversationId = 'conv-mem-1';
    const payload = { lastLanguage: 'cmn', toolPreferences: { autoExecute: 'ask_first' as const } };
    await jieyuDb.collections.ai_session_memories.insert({
      id: conversationId,
      conversationId,
      payload,
      updatedAt: new Date().toISOString(),
    });

    const retrieved = await jieyuDb.collections.ai_session_memories
      .findOne({ selector: { conversationId } })
      .exec();

    expect(retrieved).not.toBeNull();
    expect(retrieved!.toJSON().payload).toMatchObject({ lastLanguage: 'cmn' });
  });

  it('can update session memory by conversationId primary key', async () => {
    const jieyuDb = await getDb();
    const conversationId = 'conv-mem-update';
    await jieyuDb.collections.ai_session_memories.insert({
      id: conversationId,
      conversationId,
      payload: { lastLanguage: 'cmn' },
      updatedAt: new Date().toISOString(),
    });
    await jieyuDb.collections.ai_session_memories.update(conversationId, {
      payload: { lastLanguage: 'yue' },
      updatedAt: new Date().toISOString(),
    });
    const retrieved = await jieyuDb.collections.ai_session_memories
      .findOne({ selector: { conversationId } })
      .exec();
    expect(retrieved?.toJSON().payload).toMatchObject({ lastLanguage: 'yue' });
  });

  it('accepts AiConversationDoc.clearedAt in Zod validation', () => {
    expect(() =>
      validateAiConversationDoc({
        id: 'conv-1',
        title: 'Test',
        mode: 'assistant',
        providerId: 'mock',
        model: 'mock',
        clearedAt: '2026-05-17T00:00:00.000Z',
        createdAt: '2026-05-17T00:00:00.000Z',
        updatedAt: '2026-05-17T00:00:00.000Z',
      }),
    ).not.toThrow();
  });
});
