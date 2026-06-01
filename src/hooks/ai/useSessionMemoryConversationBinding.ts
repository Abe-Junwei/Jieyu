import { useEffect, useLayoutEffect, useRef, useState, type MutableRefObject } from 'react';
import { createLogger } from '../../observability/logger';
import { bindSessionMemoryConversation, loadSessionMemoryAsync } from '../../ai/chat/sessionMemory';
import type { AiSessionMemory } from './useAiChat.types';

const log = createLogger('useSessionMemoryConversationBinding');

/**
 * Keeps Dexie session memory aligned with the active conversation:
 * bind before sync persist, hydrate ref from Dexie on conversationId changes.
 */
export function useSessionMemoryConversationBinding(
  conversationId: string | null,
  sessionMemoryRef: MutableRefObject<AiSessionMemory>,
): number {
  const [hydrationGeneration, setHydrationGeneration] = useState(0);
  const previousConversationIdRef = useRef<string | null>(null);

  // Clear stale memory on conversation switch (not initial mount) before passive effects run.
  useLayoutEffect(() => {
    bindSessionMemoryConversation(conversationId);
    const previousConversationId = previousConversationIdRef.current;
    previousConversationIdRef.current = conversationId;
    if (conversationId === null) {
      sessionMemoryRef.current = {};
      return;
    }
    if (previousConversationId !== null && previousConversationId !== conversationId) {
      sessionMemoryRef.current = {};
    }
  }, [conversationId, sessionMemoryRef]);

  useEffect(() => {
    if (!conversationId) {
      setHydrationGeneration((generation) => generation + 1);
      return;
    }

    // Prevent stale in-memory state from the previous conversation leaking into persist paths.
    sessionMemoryRef.current = {};

    let cancelled = false;
    void loadSessionMemoryAsync(conversationId)
      .then((memory) => {
        if (cancelled) return;
        sessionMemoryRef.current = memory;
        setHydrationGeneration((generation) => generation + 1);
      })
      .catch((error) => {
        if (cancelled) return;
        log.warn('Failed to hydrate session memory for conversation', {
          conversationId,
          error: error instanceof Error ? error.message : String(error),
        });
        sessionMemoryRef.current = {};
        setHydrationGeneration((generation) => generation + 1);
      });

    return () => {
      cancelled = true;
    };
  }, [conversationId, sessionMemoryRef]);

  return hydrationGeneration;
}
