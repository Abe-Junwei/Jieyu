/**
 * useVadCachedSegments — 从 VAD 缓存读取语音段的 React hook
 * React hook to retrieve cached VAD speech segments for a given mediaId.
 */

import { useMemo, useSyncExternalStore } from 'react';
import { vadCache, type VadCacheEntry } from '../services/vad/VadCacheService';
import type { VadSegmentLike } from '../utils/waveformAnalysisOverlays';

export function useVadCacheEntry(mediaId: string | undefined): VadCacheEntry | null {
  return useSyncExternalStore(
    (onStoreChange) => vadCache.subscribe(onStoreChange),
    () => (mediaId ? vadCache.get(mediaId) : null),
    () => (mediaId ? vadCache.get(mediaId) : null),
  );
}

/**
 * 读取 VAD 缓存中的语音段。若未命中则返回 undefined（表示无 VAD 数据，而非空段列表）。
 * Returns cached VAD segments for the given mediaId, or undefined if not cached.
 */
export function useVadCachedSegments(mediaId: string | undefined): VadSegmentLike[] | undefined {
  const entry = useVadCacheEntry(mediaId);

  return useMemo(() => {
    return entry?.segments;
  }, [entry]);
}
