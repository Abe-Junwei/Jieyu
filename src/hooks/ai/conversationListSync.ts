/** G2e: cross-tab conversation list invalidation (BroadcastChannel + localStorage epoch). */

export const AI_CONVERSATION_LIST_EPOCH_KEY = 'jieyu.aiChat.conversationListEpoch';
export const AI_CONVERSATION_LIST_CHANNEL = 'jieyu.aiChat.conversations';

export type ConversationListSyncPayload = Readonly<{
  type: 'mutated';
  conversationId?: string;
  textId?: string;
  epoch: number;
}>;

export function notifyConversationListMutated(
  payload: Omit<ConversationListSyncPayload, 'epoch' | 'type'> & { type?: 'mutated' } = {},
): void {
  const epoch = Date.now();
  const message: ConversationListSyncPayload = {
    type: 'mutated',
    epoch,
    ...(payload.conversationId ? { conversationId: payload.conversationId } : {}),
    ...(payload.textId ? { textId: payload.textId } : {}),
  };

  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(AI_CONVERSATION_LIST_EPOCH_KEY, String(epoch));
    }
  } catch {
    // best-effort
  }

  if (typeof BroadcastChannel === 'undefined') return;
  try {
    const channel = new BroadcastChannel(AI_CONVERSATION_LIST_CHANNEL);
    channel.postMessage(message);
    channel.close();
  } catch {
    // best-effort
  }
}

export function subscribeConversationListSync(onMutated: () => void): () => void {
  if (typeof window === 'undefined') return () => {};

  const handleStorage = (event: StorageEvent) => {
    if (event.key !== AI_CONVERSATION_LIST_EPOCH_KEY) return;
    onMutated();
  };

  let channel: BroadcastChannel | null = null;
  const handleBroadcast = () => {
    onMutated();
  };

  window.addEventListener('storage', handleStorage);
  if (typeof BroadcastChannel !== 'undefined') {
    channel = new BroadcastChannel(AI_CONVERSATION_LIST_CHANNEL);
    channel.addEventListener('message', handleBroadcast);
  }

  return () => {
    window.removeEventListener('storage', handleStorage);
    channel?.removeEventListener('message', handleBroadcast);
    channel?.close();
  };
}
