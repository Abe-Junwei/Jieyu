import { newMessageId, nowIso } from '../../hooks/useAiChat.helpers';
import type { AiTaskSession } from '../../hooks/useAiChat.types';

export function createIdleTaskSession(): AiTaskSession {
  return {
    id: newMessageId('task'),
    status: 'idle',
    updatedAt: nowIso(),
  };
}
