import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from './engine';
import { StorageReadbackError } from './storageReadbackError';
import { storagePort } from './storagePort';
import { patchAiConversation as patchChatAiConversation } from './storagePortChatConversations';
import type { AiConversationDoc, AiMessageDoc } from './types';

const NOW = '2026-10-18T00:00:00.000Z';

function conversation(id: string, updatedAt: string): AiConversationDoc {
  return {
    id,
    title: 'Chat',
    mode: 'assistant',
    providerId: 'mock',
    model: 'mock',
    createdAt: NOW,
    updatedAt,
  };
}

describe('storage port conversations', () => {
  beforeEach(async () => {
    await db.open();
    await Promise.all(db.tables.map((table) => table.clear()));
  });

  it('lists recent conversations newest first and patches a title', async () => {
    await db.ai_conversations.bulkPut([
      conversation('older', '2026-10-18T00:00:00.000Z'),
      conversation('newer', '2026-10-18T02:00:00.000Z'),
    ]);
    await expect(storagePort().listRecentAiConversations(1)).resolves.toMatchObject([
      { id: 'newer' },
    ]);
    await expect(
      storagePort().patchAiConversation('older', {
        title: 'Renamed',
        updatedAt: '2026-10-18T03:00:00.000Z',
      }),
    ).resolves.toMatchObject({ id: 'older', title: 'Renamed' });
    await expect(db.ai_conversations.get('older')).resolves.toMatchObject({ title: 'Renamed' });
    await expect(
      storagePort().patchAiConversation('missing', { title: 'x' }),
    ).resolves.toBeUndefined();
  });

  it('keeps concurrent title and timestamp patches from failing read-back', async () => {
    await db.ai_conversations.put(conversation('conv', NOW));
    const titlePatch = storagePort().patchAiConversation('conv', {
      title: 'Renamed',
      updatedAt: '2026-10-18T03:00:00.000Z',
    });
    const timestampPatch = patchChatAiConversation('conv', {
      updatedAt: '2026-10-18T04:00:00.000Z',
    });
    await expect(Promise.all([titlePatch, timestampPatch])).resolves.toEqual([
      expect.objectContaining({ id: 'conv' }),
      expect.objectContaining({ id: 'conv' }),
    ]);
    await expect(db.ai_conversations.get('conv')).resolves.toMatchObject({
      id: 'conv',
      title: 'Renamed',
    });
  });

  it('still throws StorageReadbackError when the stored conversation does not match the patch', async () => {
    await db.ai_conversations.put(conversation('conv', NOW));
    vi.spyOn(db.ai_conversations, 'get')
      .mockResolvedValueOnce(conversation('conv', NOW))
      .mockResolvedValueOnce({ ...conversation('conv', NOW), title: 'tampered' });
    try {
      await expect(
        storagePort().patchAiConversation('conv', {
          title: 'Renamed',
          updatedAt: '2026-10-18T03:00:00.000Z',
        }),
      ).rejects.toBeInstanceOf(StorageReadbackError);
    } finally {
      vi.restoreAllMocks();
    }
  });

  it('clears messages and stamps the conversation updatedAt', async () => {
    await db.ai_conversations.put(conversation('conv-1', NOW));
    const message: AiMessageDoc = {
      id: 'msg-1',
      conversationId: 'conv-1',
      role: 'user',
      content: 'hello',
      status: 'done',
      createdAt: NOW,
      updatedAt: NOW,
    };
    await db.ai_messages.put(message);
    await expect(
      storagePort().clearAiConversationMessages('conv-1', '2026-10-18T04:00:00.000Z'),
    ).resolves.toBe(true);
    await expect(db.ai_messages.where('conversationId').equals('conv-1').count()).resolves.toBe(0);
    await expect(db.ai_conversations.get('conv-1')).resolves.toMatchObject({
      updatedAt: '2026-10-18T04:00:00.000Z',
      title: 'Chat',
    });
  });
});
