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
  { base: 'rgba(14, 116, 144, 0.62)', active: 'rgba(8, 145, 178, 0.88)' },
  { base: 'rgba(21, 128, 61, 0.62)', active: 'rgba(22, 163, 74, 0.88)' },
  { base: 'rgba(180, 83, 9, 0.62)', active: 'rgba(217, 119, 6, 0.88)' },
  { base: 'rgba(109, 40, 217, 0.62)', active: 'rgba(124, 58, 237, 0.88)' },
  { base: 'rgba(190, 24, 93, 0.62)', active: 'rgba(219, 39, 119, 0.88)' },
  { base: 'rgba(55, 65, 81, 0.62)', active: 'rgba(31, 41, 55, 0.88)' },
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
