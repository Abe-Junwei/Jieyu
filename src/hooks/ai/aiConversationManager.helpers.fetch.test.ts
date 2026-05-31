// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { getDb, resetJieyuDatabaseSingletonForTests } from '../../db';
import {
  fetchAllConversationRows,
  MAX_CONVERSATION_LIST_ROWS,
} from './aiConversationManager.helpers';

describe('fetchAllConversationRows', () => {
  beforeEach(async () => {
    await resetJieyuDatabaseSingletonForTests();
  });

  it('returns at most MAX_CONVERSATION_LIST_ROWS by updatedAt desc without full table scan', async () => {
    const db = await getDb();
    const total = MAX_CONVERSATION_LIST_ROWS + 25;
    const base = Date.parse('2026-01-01T00:00:00.000Z');

    for (let i = 0; i < total; i += 1) {
      const updatedAt = new Date(base + i * 60_000).toISOString();
      await db.collections.ai_conversations.insert({
        id: `conv-${i}`,
        title: `t-${i}`,
        mode: 'assistant',
        providerId: 'mock',
        model: 'mock',
        createdAt: updatedAt,
        updatedAt,
      });
    }

    const rows = await fetchAllConversationRows();
    expect(rows).toHaveLength(MAX_CONVERSATION_LIST_ROWS);
    expect(rows[0]?.id).toBe(`conv-${total - 1}`);
    expect(rows.at(-1)?.id).toBe(`conv-${total - MAX_CONVERSATION_LIST_ROWS}`);
  });
});
