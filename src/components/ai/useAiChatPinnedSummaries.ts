import { useMemo } from 'react';
import type { AiSessionMemorySummaryEntry } from '../../ai/chat/chatDomain.types';
import type { AiSessionMemory, UiChatMessage } from '../../hooks/useAiChat';
import { AI_CHAT_CARD_EMPTY_STRING_ARRAY, buildPinnedSummary } from './aiChatCardUtils';

export function useAiChatPinnedSummaries(input: {
  aiSessionMemory: AiSessionMemory | null | undefined;
  messages: UiChatMessage[];
  optimisticPinnedMessageIds: Set<string>;
  optimisticUnpinnedMessageIds: Set<string>;
  isZh: boolean;
}): {
  pinnedMessageIdsSignature: string;
  pinnedMessageIdSet: Set<string>;
  pinnedSummaryItems: Array<{ messageId: string; summary: string }>;
  hasConversationSummary: boolean;
  summaryEntries: AiSessionMemorySummaryEntry[];
} {
  const { aiSessionMemory, messages, optimisticPinnedMessageIds, optimisticUnpinnedMessageIds, isZh } = input;
  const pinnedMessageIds = aiSessionMemory?.pinnedMessageIds ?? AI_CHAT_CARD_EMPTY_STRING_ARRAY;
  const pinnedMessageIdsSignature = useMemo(() => pinnedMessageIds.join('|'), [pinnedMessageIds]);
  const pinnedMessageIdSet = useMemo(() => {
    const base = new Set(pinnedMessageIds);
    for (const id of optimisticUnpinnedMessageIds) base.delete(id);
    for (const id of optimisticPinnedMessageIds) base.add(id);
    return base;
  }, [optimisticPinnedMessageIds, optimisticUnpinnedMessageIds, pinnedMessageIds]);
  const pinnedMessageDigestItems = useMemo(() => {
    const visiblePinnedMessageIds = pinnedMessageIds.filter((messageId) => !optimisticUnpinnedMessageIds.has(messageId));
    if (visiblePinnedMessageIds.length === 0) return [];
    const digestById = new Map((aiSessionMemory?.pinnedMessageDigests ?? []).map((item) => [item.messageId, item] as const));
    const messageById = new Map(messages.map((item) => [item.id, item] as const));
    return visiblePinnedMessageIds.map((messageId) => {
      const digest = digestById.get(messageId);
      if (digest) return digest;
      const fallbackMessage = messageById.get(messageId);
      if (!fallbackMessage) return null;
      return {
        messageId,
        role: fallbackMessage.role,
        content: fallbackMessage.content,
        createdAt: '',
      };
    }).filter((item): item is NonNullable<typeof item> => Boolean(item));
  }, [aiSessionMemory?.pinnedMessageDigests, messages, optimisticUnpinnedMessageIds, pinnedMessageIds]);
  const pinnedSummaryItems = useMemo(() => (
    pinnedMessageDigestItems.map((item) => ({
      messageId: item.messageId,
      summary: buildPinnedSummary(item.content, isZh),
    }))
  ), [isZh, pinnedMessageDigestItems]);
  const summaryChain = aiSessionMemory?.summaryChain ?? [];
  const latestConversationSummary = (aiSessionMemory?.conversationSummary ?? '').trim();
  const hasConversationSummary = latestConversationSummary.length > 0 || summaryChain.length > 0;
  const summaryEntries = useMemo(() => {
    if (summaryChain.length > 0) {
      return [...summaryChain].slice(-4).reverse();
    }
    if (!latestConversationSummary) return [];
    return [{
      id: 'latest-summary',
      summary: latestConversationSummary,
      coveredTurnCount: aiSessionMemory?.summaryTurnCount ?? 0,
      createdAt: '',
    }];
  }, [aiSessionMemory?.summaryTurnCount, latestConversationSummary, summaryChain]);

  return {
    pinnedMessageIdsSignature,
    pinnedMessageIdSet,
    pinnedSummaryItems,
    hasConversationSummary,
    summaryEntries,
  };
}