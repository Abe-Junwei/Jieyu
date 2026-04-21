import { useCallback, useState } from 'react';

export type PairedReadingCompactMode = 'both' | 'source' | 'target';
export type PairedReadingLayerRole = 'source' | 'target';

export function isPairedReadingLayerCollapsed(mode: PairedReadingCompactMode, role: PairedReadingLayerRole): boolean {
  if (role === 'source') return mode === 'target';
  return mode === 'source';
}

export function togglePairedReadingCompactModeForLayer(
  mode: PairedReadingCompactMode,
  role: PairedReadingLayerRole,
): PairedReadingCompactMode {
  if (role === 'source') {
    return mode === 'target' ? 'both' : 'target';
  }
  return mode === 'source' ? 'both' : 'source';
}

export function useCollapsedLayerIds(initialLayerIds?: Iterable<string>) {
  const [collapsedLayerIds, setCollapsedLayerIds] = useState<Set<string>>(
    () => new Set(initialLayerIds ?? []),
  );

  const toggleLayerCollapsed = useCallback((layerId: string) => {
    setCollapsedLayerIds((prev) => {
      const next = new Set(prev);
      if (next.has(layerId)) {
        next.delete(layerId);
      } else {
        next.add(layerId);
      }
      return next;
    });
  }, []);

  return {
    collapsedLayerIds,
    setCollapsedLayerIds,
    toggleLayerCollapsed,
  };
}