/**
 * 应用助手消息结果到 UI 状态和持久层
 * Apply assistant message result to UI state and persistence layer.
 */

import { getDb } from '../../db';
import { nowIso } from '../../hooks/ai/useAiChat.helpers';
import type { UiChatMessage } from '../../hooks/ai/useAiChat.types';

export interface ApplyAssistantMessageResultParams {
  messageId: string;
  content: string;
  status?: 'done' | 'error';
  errorMessage?: string | undefined;
  setMessages: (updater: (prev: UiChatMessage[]) => UiChatMessage[]) => void;
}

/**
 * 更新 messages 数组中的指定消息，并同步到 ai_messages 集合。
 * Updates the specified message in the messages array and syncs to ai_messages collection.
 */
export async function applyAssistantMessageResult(
  params: ApplyAssistantMessageResultParams,
): Promise<void> {
  const { messageId, content, status = 'done', errorMessage, setMessages } = params;

  setMessages((prev) =>
    prev.map((msg) => {
      if (msg.id !== messageId) return msg;
      if (status === 'error') {
        return { ...msg, content, status, ...(errorMessage ? { error: errorMessage } : {}) };
      }
      const { error: _ignoredError, ...rest } = msg;
      return { ...rest, content, status: 'done' };
    }),
  );

  const db = await getDb();
  await db.collections.ai_messages.update(messageId, {
    content,
    status,
    ...(errorMessage ? { errorMessage } : {}),
    updatedAt: nowIso(),
  });
}
