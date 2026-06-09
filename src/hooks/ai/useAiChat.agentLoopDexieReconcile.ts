import { useEffect, useRef, useState, type MutableRefObject } from 'react';
import { persistSessionMemoryAsync } from '../../ai/chat/sessionMemory';
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
  /** Global latest checkpoint hydrate is mount-only; conversation switches must not pull another row's handoff. */
  const allowGlobalHydrateRef = useRef(true);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const activeConversationId = conversationIdRef.current;
    if (!activeConversationId) return;
    // Wait until binding has completed at least one Dexie hydrate for this mount/switch.
    if (hydrationGeneration === 0) return;
    let cancelled = false;
    void (async () => {
      try {
        if (conversationIdRef.current !== activeConversationId) return;
        const allowGlobalHydrate = allowGlobalHydrateRef.current;
        const reconcileBase = sessionMemoryRef.current;
        const next = await reconcilePendingAgentLoopCheckpointFromDexie(reconcileBase, {
          allowGlobalHydrate,
        });
        if (cancelled) return;
        if (conversationIdRef.current !== activeConversationId) return;
        if (allowGlobalHydrate) {
          allowGlobalHydrateRef.current = false;
        }
        const latestRef = sessionMemoryRef.current;
        if (latestRef !== reconcileBase) {
          const merged = await reconcilePendingAgentLoopCheckpointFromDexie(latestRef, {
            allowGlobalHydrate: false,
          });
          if (merged === latestRef) return;
          sessionMemoryRef.current = merged;
          await persistSessionMemoryAsync(activeConversationId, merged);
        } else if (next !== reconcileBase) {
          sessionMemoryRef.current = next;
          await persistSessionMemoryAsync(activeConversationId, next);
        } else {
          return;
        }
        if (conversationIdRef.current !== activeConversationId) return;
        setSessionMemoryRenderNonce((n) => n + 1);
      } catch {
        // Dexie 不可用时跳过冷启动水合 | Skip cold-start hydration when IndexedDB is unavailable
      }
    })();
    return () => {
      cancelled = true;
    };
    // Run after binding hydration bumps generation; cancel when conversation changes mid-flight.
  }, [hydrationGeneration, sessionMemoryRef, conversationIdRef]);
}
