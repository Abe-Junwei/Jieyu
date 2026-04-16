import type { AiRecommendationEvent, AiRecommendationTelemetry, AiSessionMemory } from './chatDomain.types';

const MAX_RECENT_EVENTS = 24;

export function updateSessionMemoryWithRecommendationEvent(
  memory: AiSessionMemory,
  event: AiRecommendationEvent,
): AiSessionMemory {
  const current = memory.recommendationTelemetry ?? {};
  const recentEvents = [...(current.recentEvents ?? []), event].slice(-MAX_RECENT_EVENTS);

  const next: AiRecommendationTelemetry = {
    ...current,
    recentEvents,
  };

  if (event.type === 'shown') {
    next.shownCount = (current.shownCount ?? 0) + 1;
    if (event.source === 'llm') {
      next.llmShownCount = (current.llmShownCount ?? 0) + 1;
    } else {
      next.fallbackShownCount = (current.fallbackShownCount ?? 0) + 1;
    }
    next.lastShownAt = event.timestamp;
    next.lastShownPrompt = event.prompt;
  } else if (event.type === 'accepted_exact') {
    next.acceptedExactCount = (current.acceptedExactCount ?? 0) + 1;
    next.lastAcceptedAt = event.timestamp;
    next.lastAcceptedPrompt = event.prompt;
  } else if (event.type === 'accepted_edited') {
    next.acceptedEditedCount = (current.acceptedEditedCount ?? 0) + 1;
    next.lastAcceptedAt = event.timestamp;
    next.lastAcceptedPrompt = event.prompt;
  }

  return {
    ...memory,
    recommendationTelemetry: next,
  };
}
