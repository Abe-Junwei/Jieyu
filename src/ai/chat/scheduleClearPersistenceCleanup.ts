/**
 * P2: Schedule async persistence cleanup — extracted from useAiChat.ts
 * Pure logic: no React dependencies.
 */
import type { MutableRefObject } from 'react';
import type { AiChatClearPersistenceRequest } from '../../hooks/useAiChat.persistenceCleanup';

export function scheduleClearPersistenceCleanup(
  clearPersistRequestRef: MutableRefObject<AiChatClearPersistenceRequest | null>,
  conversationId: string | null,
  runClearPersistenceCleanup: () => void,
): void {
  clearPersistRequestRef.current = { conversationId };
  runClearPersistenceCleanup();
}
