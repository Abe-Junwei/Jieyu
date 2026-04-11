import { useEffect } from 'react';
import { ensureVadCacheForMedia } from '../services/vad/VadMediaCacheService';

export function useEnsureVadCache(mediaId: string | undefined, mediaUrl: string | undefined, mediaBlobSize?: number): void {
  useEffect(() => {
    if (!mediaId || !mediaUrl) return;
    void ensureVadCacheForMedia({ mediaId, mediaUrl, ...(mediaBlobSize !== undefined && { mediaBlobSize }) });
  }, [mediaId, mediaUrl, mediaBlobSize]);
}
