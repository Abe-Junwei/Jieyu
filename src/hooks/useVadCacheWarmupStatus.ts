import { useSyncExternalStore } from 'react';
import { getVadCacheWarmupStatus, subscribeVadCacheWarmupStatus, type VadCacheWarmupStatus } from '../services/vad/VadMediaCacheService';

export function useVadCacheWarmupStatus(mediaId: string | undefined): VadCacheWarmupStatus | null {
  return useSyncExternalStore(
    (onStoreChange) => subscribeVadCacheWarmupStatus(mediaId, onStoreChange),
    () => getVadCacheWarmupStatus(mediaId),
    () => getVadCacheWarmupStatus(mediaId),
  );
}