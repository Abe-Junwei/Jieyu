import type { TranslationLayerDocType } from '../db';
import type { LayerLinkEdge } from '../services/LayerIdBridgeService';

export interface LayerLinkConnectorSegment {
  column: number;
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
  existing.push(segment);
  segmentsByLayerId[layerId] = existing;
}

export function buildLayerLinkConnectorLayout(
  allLayers: TranslationLayerDocType[],
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
  const parentIndexByKey = new Map<string, number>();
  
  allLayers.forEach((layer, index) => {
    if (layer.layerType === 'transcription') {
      parentIndexByKey.set(layer.key, index);
    }
  });

  const parentTapRowIndices = new Set<number>();
  const childTapRowIndices = new Set<number>();
  let minRowIndex = Number.POSITIVE_INFINITY;
  let maxRowIndex = Number.NEGATIVE_INFINITY;

  for (const link of layerLinks) {
    const parentIndex = parentIndexByKey.get(link.transcriptionLayerKey)
      ?? layerIndexByRef.get(link.transcriptionLayerKey);
    const targetLayerId = link.targetLayerId;
    const childIndex = layerIndexByRef.get(targetLayerId);
    if (parentIndex === undefined || childIndex === undefined || childIndex <= parentIndex) continue;
    parentTapRowIndices.add(parentIndex);
    childTapRowIndices.add(childIndex);
    if (parentIndex < minRowIndex) minRowIndex = parentIndex;
    if (childIndex > maxRowIndex) maxRowIndex = childIndex;
  }

  if (!Number.isFinite(minRowIndex) || !Number.isFinite(maxRowIndex) || (parentTapRowIndices.size === 0 && childTapRowIndices.size === 0)) {
    return { maxColumns: 0, segmentsByLayerId: {} };
  }

  const segmentsByLayerId: Record<string, LayerLinkConnectorSegment[]> = {};

  for (let rowIndex = minRowIndex; rowIndex <= maxRowIndex; rowIndex += 1) {
    const layer = allLayers[rowIndex];
    if (!layer) continue;
    pushSegment(segmentsByLayerId, layer.id, {
      column: 0,
      role: rowIndex === minRowIndex && rowIndex === maxRowIndex
        ? 'bus-single'
        : rowIndex === minRowIndex
          ? 'bus-start'
          : rowIndex === maxRowIndex
            ? 'bus-end'
            : 'bus-middle',
    });
  }

  parentTapRowIndices.forEach((rowIndex) => {
    const layer = allLayers[rowIndex];
    if (!layer) return;
    pushSegment(segmentsByLayerId, layer.id, {
      column: 0,
      role: 'tap-parent',
    });
  });

  childTapRowIndices.forEach((rowIndex) => {
    const layer = allLayers[rowIndex];
    if (!layer) return;
    pushSegment(segmentsByLayerId, layer.id, {
      column: 0,
      role: 'tap-child',
    });
  });

  return {
    maxColumns: 1,
    segmentsByLayerId,
  };
}

export function getLayerLinkStackWidth(maxColumns: number): number {
  if (maxColumns <= 0) return 0;
  return 12 + ((maxColumns - 1) * 8);
}
