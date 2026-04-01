import type { LayerDocType } from '../db';
import { buildLayerBundles } from '../services/LayerOrderingService';

export interface LayerLinkConnectorSegment {
  column: number;
  colorIndex: number;
  role: 'bundle-root' | 'bundle-child-middle' | 'bundle-child-end';
}

export interface LayerLinkConnectorLayout {
  maxColumns: number;
  segmentsByLayerId: Record<string, LayerLinkConnectorSegment[]>;
}

function pushSegment(
  segmentsByLayerId: Record<string, LayerLinkConnectorSegment[]>,
  layerId: string,
  segment: LayerLinkConnectorSegment,
): void {
  const existing = segmentsByLayerId[layerId] ?? [];
  if (existing.some((item) => item.column === segment.column && item.role === segment.role && item.colorIndex === segment.colorIndex)) {
    return;
  }
  existing.push(segment);
  segmentsByLayerId[layerId] = existing;
}

const CONNECTOR_COLOR_PALETTE = [
  {
    base: 'color-mix(in srgb, var(--state-info-solid) 62%, transparent)',
    active: 'color-mix(in srgb, var(--state-info-solid) 88%, transparent)',
  },
  {
    base: 'color-mix(in srgb, var(--state-success-solid) 62%, transparent)',
    active: 'color-mix(in srgb, var(--state-success-solid) 88%, transparent)',
  },
  {
    base: 'color-mix(in srgb, var(--state-warning-text) 62%, transparent)',
    active: 'color-mix(in srgb, var(--state-warning-text) 88%, transparent)',
  },
  {
    base: 'color-mix(in srgb, var(--state-info-solid) 52%, var(--state-danger-solid) 10%)',
    active: 'color-mix(in srgb, var(--state-info-solid) 74%, var(--state-danger-solid) 14%)',
  },
  {
    base: 'color-mix(in srgb, var(--state-danger-solid) 62%, transparent)',
    active: 'color-mix(in srgb, var(--state-danger-solid) 88%, transparent)',
  },
  {
    base: 'color-mix(in srgb, var(--text-secondary) 62%, transparent)',
    active: 'color-mix(in srgb, var(--text-primary) 88%, transparent)',
  },
] as const;

export function getLayerLinkConnectorColors(colorIndex: number): { base: string; active: string } {
  return CONNECTOR_COLOR_PALETTE[colorIndex % CONNECTOR_COLOR_PALETTE.length] ?? CONNECTOR_COLOR_PALETTE[0];
}

export function buildLayerLinkConnectorLayout(
  allLayers: LayerDocType[],
  _layerLinks: ReadonlyArray<unknown>,
): LayerLinkConnectorLayout {
  if (allLayers.length === 0) {
    return { maxColumns: 0, segmentsByLayerId: {} };
  }

  const segmentsByLayerId: Record<string, LayerLinkConnectorSegment[]> = {};
  const orderedBundles = buildLayerBundles(allLayers)
    .filter((bundle) => !bundle.detached)
    .map((bundle) => ({
      root: bundle.root,
      dependents: [...bundle.transcriptionDependents, ...bundle.translationDependents],
    }))
    .filter((bundle) => bundle.dependents.length > 0);

  orderedBundles.forEach((bundle, colorIndex) => {
    const column = colorIndex;
    pushSegment(segmentsByLayerId, bundle.root.id, {
      column,
      colorIndex,
      role: 'bundle-root',
    });

    bundle.dependents.forEach((layer, dependentIndex) => {
      pushSegment(segmentsByLayerId, layer.id, {
        column,
        colorIndex,
        role: dependentIndex === bundle.dependents.length - 1
          ? 'bundle-child-end'
          : 'bundle-child-middle',
      });
    });
  });

  return {
    maxColumns: orderedBundles.length,
    segmentsByLayerId,
  };
}

export function getLayerLinkStackWidth(maxColumns: number): number {
  if (maxColumns <= 0) return 0;
  return 18;
}
