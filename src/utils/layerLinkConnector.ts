import type { LayerDocType } from '../db';
import type { LayerLinkEdge } from '../services/LayerIdBridgeService';

export interface LayerLinkConnectorSegment {
  column: number;
  colorIndex: number;
  role: 'bus-start' | 'bus-middle' | 'bus-end' | 'bus-single' | 'tap-parent' | 'tap-child';
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

function resolveBundleRootId(layer: LayerDocType, layerById: ReadonlyMap<string, LayerDocType>): string {
  let current: LayerDocType | undefined = layer;
  const visited = new Set<string>();
  while (current?.parentLayerId) {
    if (visited.has(current.id)) break;
    visited.add(current.id);
    const parent = layerById.get(current.parentLayerId);
    if (!parent) break;
    current = parent;
  }
  return current?.id ?? layer.id;
}

export function buildLayerLinkConnectorLayout(
  allLayers: LayerDocType[],
  layerLinks: LayerLinkEdge[],
): LayerLinkConnectorLayout {
  if (allLayers.length === 0 || layerLinks.length === 0) {
    return { maxColumns: 0, segmentsByLayerId: {} };
  }

  // 兼容历史数据：链接里可能存的是 layer.id 或 layer.key | Backward compatibility: links may store either layer.id or layer.key.
  const layerIndexByRef = new Map<string, number>();
  allLayers.forEach((layer, index) => {
    layerIndexByRef.set(layer.id, index);
    if (layer.key) {
      layerIndexByRef.set(layer.key, index);
    }
  });
  const layerByRef = new Map<string, LayerDocType>();
  allLayers.forEach((layer) => {
    layerByRef.set(layer.id, layer);
    if (layer.key) layerByRef.set(layer.key, layer);
  });

  type ConnectorEdge = {
    bundleRootId: string;
    parentIndex: number;
    childIndex: number;
  };

  const seenEdges = new Set<string>();
  const edges: ConnectorEdge[] = [];

  for (const layer of allLayers) {
    if (!layer.parentLayerId) continue;
    const parentLayer = layerByRef.get(layer.parentLayerId);
    const parentIndex = parentLayer ? layerIndexByRef.get(parentLayer.id) : undefined;
    const childIndex = layerIndexByRef.get(layer.id);
    if (!parentLayer || parentIndex === undefined || childIndex === undefined || parentIndex === childIndex) continue;
    const bundleRootId = resolveBundleRootId(parentLayer, layerByRef);
    const edgeKey = `${parentLayer.id}->${layer.id}`;
    if (seenEdges.has(edgeKey)) continue;
    seenEdges.add(edgeKey);
    edges.push({
      bundleRootId,
      parentIndex,
      childIndex,
    });
  }

  for (const link of layerLinks) {
    const parentLayer = layerByRef.get(link.transcriptionLayerKey);
    const targetLayer = layerByRef.get(link.targetLayerId);
    const parentIndex = parentLayer ? layerIndexByRef.get(parentLayer.id) : undefined;
    const childIndex = targetLayer ? layerIndexByRef.get(targetLayer.id) : undefined;
    if (!parentLayer || !targetLayer || parentIndex === undefined || childIndex === undefined || parentIndex === childIndex) continue;
    const bundleRootId = resolveBundleRootId(parentLayer, layerByRef);
    const edgeKey = `${parentLayer.id}->${targetLayer.id}`;
    if (seenEdges.has(edgeKey)) continue;
    seenEdges.add(edgeKey);
    edges.push({
      bundleRootId,
      parentIndex,
      childIndex,
    });
  }

  if (edges.length === 0) {
    return { maxColumns: 0, segmentsByLayerId: {} };
  }

  const segmentsByLayerId: Record<string, LayerLinkConnectorSegment[]> = {};
  const edgesByBundle = new Map<string, ConnectorEdge[]>();
  for (const edge of edges) {
    const bucket = edgesByBundle.get(edge.bundleRootId);
    if (bucket) bucket.push(edge);
    else edgesByBundle.set(edge.bundleRootId, [edge]);
  }

  const orderedBundles = Array.from(edgesByBundle.entries())
    .map(([bundleRootId, bundleEdges]) => ({
      bundleRootId,
      bundleEdges,
      minRowIndex: Math.min(...bundleEdges.flatMap((edge) => [edge.parentIndex, edge.childIndex])),
      maxRowIndex: Math.max(...bundleEdges.flatMap((edge) => [edge.parentIndex, edge.childIndex])),
    }))
    .sort((left, right) => left.minRowIndex - right.minRowIndex || left.bundleRootId.localeCompare(right.bundleRootId));

  orderedBundles.forEach((bundle, colorIndex) => {
    const column = colorIndex;
    const parentTapRowIndices = new Set<number>();
    const childTapRowIndices = new Set<number>();

    for (const edge of bundle.bundleEdges) {
      parentTapRowIndices.add(edge.parentIndex);
      childTapRowIndices.add(edge.childIndex);
    }

    for (let rowIndex = bundle.minRowIndex; rowIndex <= bundle.maxRowIndex; rowIndex += 1) {
      const layer = allLayers[rowIndex];
      if (!layer) continue;
      pushSegment(segmentsByLayerId, layer.id, {
        column,
        colorIndex,
        role: rowIndex === bundle.minRowIndex && rowIndex === bundle.maxRowIndex
          ? 'bus-single'
          : rowIndex === bundle.minRowIndex
            ? 'bus-start'
            : rowIndex === bundle.maxRowIndex
              ? 'bus-end'
              : 'bus-middle',
      });
    }

    parentTapRowIndices.forEach((rowIndex) => {
      const layer = allLayers[rowIndex];
      if (!layer) return;
      pushSegment(segmentsByLayerId, layer.id, {
        column,
        colorIndex,
        role: 'tap-parent',
      });
    });

    childTapRowIndices.forEach((rowIndex) => {
      const layer = allLayers[rowIndex];
      if (!layer) return;
      pushSegment(segmentsByLayerId, layer.id, {
        column,
        colorIndex,
        role: 'tap-child',
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
  return 12 + ((maxColumns - 1) * 8);
}
