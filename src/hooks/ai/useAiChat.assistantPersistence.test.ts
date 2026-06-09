// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { describe, expect, it, vi } from 'vitest';
import { getDb, resetJieyuDatabaseSingletonForTests } from '../../db';
import {
  createConversationGenerationRef,
  bumpConversationGeneration,
} from '../../ai/chat/conversationGeneration';
import { createAssistantPersistenceHelpers } from './useAiChat.assistantPersistence';
import type { UiChatMessage } from './useAiChat.types';

const assistantId = 'assistant-stale-finalize';
const conversationId = 'conv-stale-finalize';

async function seedStreamingAssistantMessage(): Promise<void> {
  const db = await getDb();
  const now = '2026-06-06T00:00:00.000Z';
  await db.collections.ai_conversations.insert({
    id: conversationId,
    title: 'Stale finalize test',
    mode: 'assistant',
    providerId: 'openai',
    model: 'gpt-4',
    createdAt: now,
    updatedAt: now,
  });
  await db.collections.ai_messages.insert({
    id: assistantId,
    conversationId,
    role: 'assistant',
    content: 'partial stream',
    status: 'streaming',
    createdAt: now,
    updatedAt: now,
  });
}

describe('createAssistantPersistenceHelpers finalizeAssistantMessage', () => {
  it('persists terminal status to Dexie when conversation generation is stale (G0c)', async () => {
    await resetJieyuDatabaseSingletonForTests();
    await seedStreamingAssistantMessage();

    const generationRef = createConversationGenerationRef(0);
    const streamGenerationAtStart = generationRef.current;
    bumpConversationGeneration(generationRef);

    const setMessages = vi.fn();
    const messagesRef = {
      current: [
        {
          id: assistantId,
          role: 'assistant',
          content: 'partial stream',
          status: 'streaming',
        } satisfies UiChatMessage,
      ],
    };

    const db = await getDb();
    const { finalizeAssistantMessage } = createAssistantPersistenceHelpers({
      assistantId,
      setMessages,
      messagesRef,
      streamPersistIntervalMsRef: { current: 0 },
      getDbRef: () => db,
      getActiveConversationId: () => 'conv-other-active',
      conversationGenerationRef: generationRef,
      streamGenerationAtStart,
    });

    await finalizeAssistantMessage('aborted', 'partial stream', 'Interrupted');

    expect(setMessages).not.toHaveBeenCalled();

    const row = await db.collections.ai_messages.findOne({ selector: { id: assistantId } }).exec();
    expect(row?.toJSON()).toMatchObject({
      content: 'partial stream',
      status: 'aborted',
      errorMessage: 'Interrupted',
    });
  });
});
