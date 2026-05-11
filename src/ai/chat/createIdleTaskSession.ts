import { newMessageId, nowIso } from '../../hooks/ai/useAiChat.helpers';
import type { AiTaskSession } from '../../hooks/ai/useAiChat.types';

export function createIdleTaskSession(): AiTaskSession {
  return {
    id: newMessageId('task'),
    status: 'idle',
    updatedAt: nowIso(),
  };
}
