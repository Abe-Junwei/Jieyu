import type { MutableRefObject } from 'react';
import { getDb } from '../db';
import { nowIso } from './useAiChat.helpers';

export interface AiChatClearPersistenceRequest {
  conversationId: string | null;
}

export function runAiChatClearPersistenceCleanup(
  runningRef: MutableRefObject<boolean>,
  requestRef: MutableRefObject<AiChatClearPersistenceRequest | null>,
): void {
  if (runningRef.current) return;
  runningRef.current = true;
  void (async () => {
    try {
      while (true) {
        const request = requestRef.current;
        requestRef.current = null;
        if (!request) break;

        const db = await getDb();
        let targetConversationId = request.conversationId;
        if (!targetConversationId) {
          const existingRows = (await db.collections.ai_conversations.find().exec())
            .map((doc) => doc.toJSON())
            .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
          targetConversationId = existingRows[0]?.id ?? null;
        }
        if (!targetConversationId) continue;

        await db.collections.ai_messages.removeBySelector({ conversationId: targetConversationId });
        const conversation = await db.collections.ai_conversations.findOne({ selector: { id: targetConversationId } }).exec();
        if (conversation) {
          const row = conversation.toJSON();
          await db.collections.ai_conversations.insert({
            ...row,
            updatedAt: nowIso(),
          });
        }
      }
    } finally {
      runningRef.current = false;
      if (requestRef.current) {
        runAiChatClearPersistenceCleanup(runningRef, requestRef);
      }
    }
  })();
}
