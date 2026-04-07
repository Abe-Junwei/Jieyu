/**
 * useVadCachedSegments — 从 VAD 缓存读取语音段的 React hook
 * React hook to retrieve cached VAD speech segments for a given mediaId.
 */

import { useMemo } from 'react';
import { vadCache, type VadCacheEntry } from '../services/vad/VadCacheService';
import type { VadSegmentLike } from '../utils/waveformAnalysisOverlays';

/**
 * 读取 VAD 缓存中的语音段。若未命中则返回 undefined（表示无 VAD 数据，而非空段列表）。
 * Returns cached VAD segments for the given mediaId, or undefined if not cached.
 */
export function useVadCachedSegments(mediaId: string | undefined): VadSegmentLike[] | undefined {
  return useMemo(() => {
    if (!mediaId) return undefined;
    const entry: VadCacheEntry | null = vadCache.get(mediaId);
    return entry?.segments;
  }, [mediaId]);
}
