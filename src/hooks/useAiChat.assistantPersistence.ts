import type { Dispatch, SetStateAction } from 'react';
import { nowIso } from './useAiChat.helpers';
import { getDb } from '../db';
import type { AiMessageCitation } from '../db';
import type { UiChatMessage } from './useAiChat.types';

interface RefLike<T> {
  current: T;
}

type AiChatDb = Awaited<ReturnType<typeof getDb>>;

interface CreateAssistantPersistenceHelpersOptions {
  assistantId: string;
  setMessages: Dispatch<SetStateAction<UiChatMessage[]>>;
  streamPersistIntervalMsRef: RefLike<number>;
  getDbRef: () => AiChatDb | null;
  getActiveConversationId: () => string | null;
}

export function createAssistantPersistenceHelpers({
  assistantId,
  setMessages,
  streamPersistIntervalMsRef,
  getDbRef,
  getActiveConversationId,
}: CreateAssistantPersistenceHelpersOptions) {
  let lastPersistedAssistantContent = '';
  let lastPersistedAt = 0;

  const updateConversationTimestamp = async () => {
    const dbRef = getDbRef();
    const activeConversationId = getActiveConversationId();
    if (!dbRef || !activeConversationId) return;

    const conversation = await dbRef.collections.ai_conversations.findOne({
      selector: { id: activeConversationId },
    }).exec();
    if (!conversation) return;

    await dbRef.collections.ai_conversations.insert({
      ...conversation.toJSON(),
      updatedAt: nowIso(),
    });
  };

  const flushAssistantDraft = async (content: string, force = false): Promise<void> => {
    const dbRef = getDbRef();
    if (!dbRef) return;
    if (content === lastPersistedAssistantContent) return;

    const now = Date.now();
    if (!force && now - lastPersistedAt < streamPersistIntervalMsRef.current) return;

    const existing = await dbRef.collections.ai_messages.findOne({ selector: { id: assistantId } }).exec();
    if (!existing) return;

    await dbRef.collections.ai_messages.insert({
      ...existing.toJSON(),
      content,
      updatedAt: nowIso(),
    });
    lastPersistedAssistantContent = content;
    lastPersistedAt = now;
  };

  const finalizeAssistantMessage = async (
    status: 'done' | 'error' | 'aborted',
    content: string,
    errorMessage?: string,
    citations?: AiMessageCitation[],
    reasoningContent?: string,
  ) => {
    setMessages((prev) => prev.map((msg) => {
      if (msg.id !== assistantId) return msg;
      if (status === 'error') {
        return {
          ...msg,
          content,
          status,
          ...(errorMessage ? { error: errorMessage } : {}),
          ...(citations ? { citations } : {}),
          ...(reasoningContent ? { reasoningContent } : {}),
        };
      }
      return {
        ...msg,
        content,
        status,
        ...(citations ? { citations } : {}),
        ...(reasoningContent ? { reasoningContent } : {}),
      };
    }));

    const dbRef = getDbRef();
    if (!dbRef) return;

    const existing = await dbRef.collections.ai_messages.findOne({ selector: { id: assistantId } }).exec();
    if (existing) {
      await dbRef.collections.ai_messages.insert({
        ...existing.toJSON(),
        content,
        status,
        ...(errorMessage ? { errorMessage } : {}),
        ...(citations ? { citations } : {}),
        ...(reasoningContent ? { reasoningContent } : {}),
        updatedAt: nowIso(),
      });
    }

    await updateConversationTimestamp();
  };

  return {
    flushAssistantDraft,
    finalizeAssistantMessage,
  };
}
