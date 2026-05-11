/**
 * P2: Session memory reset logic extracted from useAiChat.ts clear handler.
 * Pure logic: no React dependencies.
 */
import { clearConversationSummaryMemory, persistSessionMemory } from './sessionMemory';
import type { AiSessionMemory } from '../../hooks/ai/useAiChat.types';

export function resetSessionMemoryForClear(sessionMemory: AiSessionMemory): AiSessionMemory {
  let next = clearConversationSummaryMemory(sessionMemory);
  if (next.pendingAgentLoopCheckpoint) {
    const { pendingAgentLoopCheckpoint: _ignored, ...rest } = next;
    next = rest;
  }
  persistSessionMemory(next);
  return next;
}
