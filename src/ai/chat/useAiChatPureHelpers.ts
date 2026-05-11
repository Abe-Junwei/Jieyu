/**
 * P2: Pure helpers extracted from useAiChat.ts to reduce hook line count.
 * No React runtime dependencies.
 */
import type { MutableRefObject, Dispatch, SetStateAction } from 'react';
import { persistSessionMemory } from './sessionMemory';
import type { AiSessionMemory } from '../../hooks/ai/useAiChat.types';
import { updateSessionMemoryWithRecommendationEvent } from './recommendationTelemetry';
import { applyAssistantMessageResult } from './applyAssistantMessageResult';
import type { AiRecommendationEvent, UiChatMessage } from '../../hooks/ai/useAiChat.types';

export function setActiveSourceSetIdInSessionMemory(
  sessionMemory: AiSessionMemory,
  id: string | null,
): AiSessionMemory {
  if (id != null) {
    return { ...sessionMemory, activeSourceSetId: id };
  }
  const { activeSourceSetId: _ignored, ...rest } = sessionMemory;
  return rest;
}

export function trackRecommendationEventInSessionMemory(
  sessionMemory: AiSessionMemory,
  event: AiRecommendationEvent,
): AiSessionMemory {
  const next = updateSessionMemoryWithRecommendationEvent(sessionMemory, event);
  persistSessionMemory(next);
  return next;
}

export function abortAiChatStream(
  abortRef: MutableRefObject<AbortController | null>,
  setIsStreaming: (v: boolean) => void,
): void {
  const controller = abortRef.current;
  if (!controller) return;
  controller.abort();
  abortRef.current = null;
  setIsStreaming(false);
}

export function createApplyAssistantMessageResultWrapper(
  setMessages: Dispatch<SetStateAction<UiChatMessage[]>>,
) {
  return async (
    messageId: string,
    content: string,
    status: 'done' | 'error' = 'done',
    errorMessage?: string,
  ) => {
    await applyAssistantMessageResult({ messageId, content, status, errorMessage, setMessages });
  };
}
