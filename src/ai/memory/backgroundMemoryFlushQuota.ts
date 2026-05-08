/**
 * In-memory per-conversation counter for completed background memory flushes that performed a write.
 * Resets on hook remount / full page reload (SPA session scope).
 */
export function createBackgroundMemoryFlushQuotaState() {
  const completedWriteFlushesByConversation = new Map<string, number>();
  return {
    getCompletedWriteFlushCount(conversationId: string): number {
      return completedWriteFlushesByConversation.get(conversationId) ?? 0;
    },
    consumeSuccessfulWriteFlush(conversationId: string): void {
      const next = (completedWriteFlushesByConversation.get(conversationId) ?? 0) + 1;
      completedWriteFlushesByConversation.set(conversationId, next);
    },
  };
}
