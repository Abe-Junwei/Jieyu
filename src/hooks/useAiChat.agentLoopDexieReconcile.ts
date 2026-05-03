import { useEffect, useState, type MutableRefObject } from 'react';
import { persistSessionMemory } from '../ai/chat/sessionMemory';
import { reconcilePendingAgentLoopCheckpointFromDexie } from '../ai/chat/reconcileAgentLoopSessionMemoryFromDexie';
import type { AiSessionMemory } from './useAiChat.types';

/** T1-c：挂载时把 `ai_tasks` 中最新可续跑 checkpoint 同步进 sessionMemory，并清理已在 DB 终态的悬挂项。 */
export function useAgentLoopSessionMemoryDexieReconcile(
  sessionMemoryRef: MutableRefObject<AiSessionMemory>,
): void {
  const [, setSessionMemoryRenderNonce] = useState(0);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    let cancelled = false;
    void (async () => {
      try {
        const next = await reconcilePendingAgentLoopCheckpointFromDexie(sessionMemoryRef.current);
        if (cancelled) return;
        if (next === sessionMemoryRef.current) return;
        sessionMemoryRef.current = next;
        persistSessionMemory(next);
        setSessionMemoryRenderNonce((n) => n + 1);
      } catch {
        // Dexie 不可用时跳过冷启动水合 | Skip cold-start hydration when IndexedDB is unavailable
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionMemoryRef]);
}
