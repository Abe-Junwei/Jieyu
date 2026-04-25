import { setSessionMemoryMessagePinned } from '../ai/chat/sessionMemory';
import { applyUserDirectivesToSessionMemory } from '../ai/memory/userDirectiveRegistry';
import { extractUserDirectives } from '../ai/memory/userDirectiveExtractor';
import type { AiSessionMemory, UiChatMessage } from './useAiChat.types';
import { nowIso } from './useAiChat.helpers';

export function resolvePinnedMessageSessionMemory(
  memory: AiSessionMemory,
  messages: readonly UiChatMessage[],
  messageId: string,
): AiSessionMemory {
  const normalizedMessageId = messageId.trim();
  if (!normalizedMessageId) return memory;
  const currentlyPinned = (memory.pinnedMessageIds ?? []).includes(normalizedMessageId);
  let nextMemory = setSessionMemoryMessagePinned(memory, normalizedMessageId, !currentlyPinned);
  if (!currentlyPinned) {
    const message = messages.find((item) => item.id === normalizedMessageId);
    if (!message) return nextMemory;
    nextMemory = {
      ...nextMemory,
      pinnedMessageDigests: [
        ...(nextMemory.pinnedMessageDigests ?? []).filter((item) => item.messageId !== normalizedMessageId),
        { messageId: normalizedMessageId, role: message.role, content: message.content, createdAt: nowIso() },
      ].slice(-24),
    };
    if (message.role !== 'user') return nextMemory;
    const application = applyUserDirectivesToSessionMemory(nextMemory, extractUserDirectives({
      userText: message.content,
      source: 'pinned_message',
      sourceMessageId: normalizedMessageId,
    }));
    return {
      ...application.nextMemory,
      pinnedDirectiveRefs: [
        ...(application.nextMemory.pinnedDirectiveRefs ?? []),
        ...application.ledgerEntries.filter((entry) => entry.action === 'accepted').map((entry) => entry.id),
      ].slice(-24),
    };
  }
  return {
    ...nextMemory,
    pinnedMessageDigests: (nextMemory.pinnedMessageDigests ?? []).filter((item) => item.messageId !== normalizedMessageId),
  };
}
