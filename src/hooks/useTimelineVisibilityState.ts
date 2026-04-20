import { useCallback, useState } from 'react';

export type ComparisonCompactMode = 'both' | 'source' | 'target';
export type ComparisonLayerRole = 'source' | 'target';

export function isComparisonLayerCollapsed(mode: ComparisonCompactMode, role: ComparisonLayerRole): boolean {
  if (role === 'source') return mode === 'target';
  return mode === 'source';
}

export function toggleComparisonCompactModeForLayer(
  mode: ComparisonCompactMode,
  role: ComparisonLayerRole,
): ComparisonCompactMode {
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