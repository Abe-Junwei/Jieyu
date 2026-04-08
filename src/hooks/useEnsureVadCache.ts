import { useEffect } from 'react';
import { ensureVadCacheForMedia } from '../services/vad/VadMediaCacheService';

export function useEnsureVadCache(mediaId: string | undefined, mediaUrl: string | undefined): void {
  useEffect(() => {
    if (!mediaId || !mediaUrl) return;
    void ensureVadCacheForMedia({ mediaId, mediaUrl });
  }, [mediaId, mediaUrl]);
}
