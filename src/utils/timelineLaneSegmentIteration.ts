import type { LayerDocType, LayerUnitDocType } from '../db';
import { resolveSegmentTimelineSourceLayer } from '../hooks/useLayerSegments';

/**
 * 独立边界语段时间轴：解析当前层应对齐的 segment 宿主层，并返回该层上的 segment 行列表；
 * 若无 segment 宿主则回落为整轨单元列表（媒体轨用 timelineRenderUnits，文本壳用 unitsOnCurrentMedia）。
 */
export function listSegmentTimelineUnitsForLayer(
  layer: LayerDocType,
  layerById: ReadonlyMap<string, LayerDocType>,
  segmentsByLayer: ReadonlyMap<string, LayerUnitDocType[]> | undefined,
  fallbackUnits: ReadonlyArray<LayerUnitDocType>,
  defaultTranscriptionLayerId?: string,
): ReadonlyArray<LayerUnitDocType> {
  const sourceLayer = resolveSegmentTimelineSourceLayer(layer, layerById, defaultTranscriptionLayerId);
  if (!sourceLayer) {
    return fallbackUnits;
  }
  return segmentsByLayer?.get(sourceLayer.id) ?? [];
}
