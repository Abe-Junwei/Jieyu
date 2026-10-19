import type { MutableRefObject } from 'react';
import { storagePort } from '../../db/storagePort';
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

        let targetConversationId = request.conversationId;
        if (!targetConversationId) {
          const existingRows = await storagePort().listRecentAiConversations(1);
          targetConversationId = existingRows[0]?.id ?? null;
        }
        if (!targetConversationId) continue;

        await storagePort().clearAiConversationMessages(targetConversationId, nowIso());
      }
    } finally {
      runningRef.current = false;
      if (requestRef.current) {
        runAiChatClearPersistenceCleanup(runningRef, requestRef);
      }
    }
  })();
}
