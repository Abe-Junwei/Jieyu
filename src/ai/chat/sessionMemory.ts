import { createLogger } from '../../observability/logger';
import type { AiSessionMemory } from '../../hooks/useAiChat';

const AI_SESSION_MEMORY_STORAGE_KEY = 'jieyu.aiChat.sessionMemory';
const log = createLogger('aiChatSessionMemory');

export function loadSessionMemory(): AiSessionMemory {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(AI_SESSION_MEMORY_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as AiSessionMemory;
    if (!parsed || typeof parsed !== 'object') return {};
    return parsed;
  } catch (error) {
    log.warn('Failed to load AI session memory, fallback to empty state', {
      storageKey: AI_SESSION_MEMORY_STORAGE_KEY,
      error: error instanceof Error ? error.message : String(error),
    });
    return {};
  }
}

export function persistSessionMemory(mem: AiSessionMemory): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(AI_SESSION_MEMORY_STORAGE_KEY, JSON.stringify(mem));
  } catch (error) {
    log.warn('Failed to persist AI session memory', {
      storageKey: AI_SESSION_MEMORY_STORAGE_KEY,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
