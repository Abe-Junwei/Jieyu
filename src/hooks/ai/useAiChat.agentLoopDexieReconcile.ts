import { useEffect, useState, type MutableRefObject } from 'react';
import { loadSessionMemoryAsync, persistSessionMemoryAsync } from '../../ai/chat/sessionMemory';
import { reconcilePendingAgentLoopCheckpointFromDexie } from '../../ai/chat/reconcileAgentLoopSessionMemoryFromDexie';
import { useLatest } from '../ui/useLatest';
import type { AiSessionMemory } from './useAiChat.types';

/** T1-c：挂载时把 `ai_tasks` 中最新可续跑 checkpoint 同步进 sessionMemory，并清理已在 DB 终态的悬挂项。 */
export function useAgentLoopSessionMemoryDexieReconcile(
  sessionMemoryRef: MutableRefObject<AiSessionMemory>,
  conversationId: string | null,
  hydrationGeneration: number,
): void {
  const [, setSessionMemoryRenderNonce] = useState(0);
  const conversationIdRef = useLatest(conversationId);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const activeConversationId = conversationIdRef.current;
    if (!activeConversationId) return;
    // Wait until binding has completed at least one Dexie hydrate for this mount/switch.
    if (hydrationGeneration === 0) return;
    let cancelled = false;
    void (async () => {
      try {
        const hydrated = await loadSessionMemoryAsync(activeConversationId);
        if (cancelled) return;
        const next = await reconcilePendingAgentLoopCheckpointFromDexie(hydrated);
        if (cancelled) return;
        if (next === hydrated) return;
        sessionMemoryRef.current = next;
        await persistSessionMemoryAsync(activeConversationId, next);
        setSessionMemoryRenderNonce((n) => n + 1);
      } catch {
        // Dexie 不可用时跳过冷启动水合 | Skip cold-start hydration when IndexedDB is unavailable
      }
    })();
    return () => {
      cancelled = true;
    };
    // Run after binding hydration bumps generation, not on raw conversationId churn.
  }, [hydrationGeneration, sessionMemoryRef, conversationIdRef]);
}
