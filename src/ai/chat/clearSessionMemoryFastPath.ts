/**
 * G0b: Strip clear-sensitive session memory fields without full normalize + persist.
 */
import type { AiSessionMemory } from '../../hooks/ai/useAiChat.types';

export function clearSessionMemoryFastPath(sessionMemory: AiSessionMemory): AiSessionMemory {
  const {
    conversationSummary: _conversationSummary,
    summaryChain: _summaryChain,
    summaryQualityWarning: _summaryQualityWarning,
    summaryTurnCount: _summaryTurnCount,
    pinnedMessageIds: _pinnedMessageIds,
    pinnedMessageDigests: _pinnedMessageDigests,
    pinnedDirectiveRefs: _pinnedDirectiveRefs,
    pendingAgentLoopCheckpoint: _pendingAgentLoopCheckpoint,
    ...rest
  } = sessionMemory;
  return {
    ...rest,
    summaryTurnCount: 0,
  };
}
