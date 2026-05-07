/**
 * Background memory runtime 工厂
 * Extracted from useAiChat.ts to reduce hook size.
 */

import { AI_CHAT_BACKGROUND_MEMORY_SANDBOX_PROFILE, createAiChatBackgroundMemoryRuntime, type AiChatBackgroundMemoryRuntime } from '../../hooks/useAiChat.backgroundMemory';
import { featureFlags } from '../config/featureFlags';
import { persistSessionMemory } from './sessionMemory';
import type { AiSessionMemory } from './chatDomain.types';

export function createBackgroundMemoryRuntime(
  sessionMemoryRef: { current: AiSessionMemory },
  getContextRef: { current: (() => { shortTerm?: { workspaceTextId?: string } | null } | null) | undefined },
): AiChatBackgroundMemoryRuntime {
  return createAiChatBackgroundMemoryRuntime({
    enabled: featureFlags.aiBackgroundMemoryExtractorEnabled,
    sandboxEnabled: featureFlags.aiBackgroundToolSandboxEnabled,
    sandboxProfile: AI_CHAT_BACKGROUND_MEMORY_SANDBOX_PROFILE,
    flushQuotaEnabled: featureFlags.aiBackgroundMemorySessionWriteQuotaEnabled,
    flushQuotaMaxCompletedWriteFlushesPerConversation: featureFlags.aiBackgroundMemorySessionWriteQuotaMax,
    getSessionMemory: () => sessionMemoryRef.current,
    setSessionMemory: (nextMemory) => {
      sessionMemoryRef.current = nextMemory;
    },
    persistSessionMemory,
    getProjectId: () => getContextRef.current?.()?.shortTerm?.workspaceTextId ?? null,
  });
}
