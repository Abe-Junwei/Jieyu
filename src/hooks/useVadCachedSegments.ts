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
 *
 * TODO: 当前 VAD 缓存仅在录音时写入（麦克风音频），尚未对已加载媒体文件运行 VAD 并填充缓存。
 * 需要在媒体加载/波形就绪时增加一条 VAD 执行路径，才能在分析叠加层中真正利用此数据。
 */
export function useVadCachedSegments(mediaId: string | undefined): VadSegmentLike[] | undefined {
  return useMemo(() => {
    if (!mediaId) return undefined;
    const entry: VadCacheEntry | null = vadCache.get(mediaId);
    return entry?.segments;
  }, [mediaId]);
}
