import type { LayerDocType, LayerUnitDocType } from '../db';
import { resolveSegmentTimelineSourceLayer, type SegmentTimelineHostLink } from '../hooks/useLayerSegments';

export interface SegmentTimelineFallbackDiagnosticEvent {
  layerId: string;
  layerType: LayerDocType['layerType'];
  fallbackUnitsCount: number;
}

const segmentTimelineFallbackDiagnostics = {
  total: 0,
  lastEvent: null as SegmentTimelineFallbackDiagnosticEvent | null,
};

function recordSegmentTimelineFallbackDiagnostic(event: SegmentTimelineFallbackDiagnosticEvent): void {
  segmentTimelineFallbackDiagnostics.total += 1;
  segmentTimelineFallbackDiagnostics.lastEvent = event;
  if (import.meta.env.DEV && import.meta.env.MODE !== 'test') {
    console.debug('[timeline-segment-fallback] source layer unresolved, fallback to unit timeline', event);
  }
}

export function getSegmentTimelineFallbackDiagnosticsForTest(): {
  total: number;
  lastEvent: SegmentTimelineFallbackDiagnosticEvent | null;
} {
  return {
    total: segmentTimelineFallbackDiagnostics.total,
    lastEvent: segmentTimelineFallbackDiagnostics.lastEvent,
  };
}

export function resetSegmentTimelineFallbackDiagnosticsForTest(): void {
  segmentTimelineFallbackDiagnostics.total = 0;
  segmentTimelineFallbackDiagnostics.lastEvent = null;
}

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
  layerLinks: ReadonlyArray<SegmentTimelineHostLink> = [],
): ReadonlyArray<LayerUnitDocType> {
  const sourceLayer = resolveSegmentTimelineSourceLayer(layer, layerById, defaultTranscriptionLayerId, layerLinks);
  if (!sourceLayer) {
    recordSegmentTimelineFallbackDiagnostic({
      layerId: layer.id,
      layerType: layer.layerType,
      fallbackUnitsCount: fallbackUnits.length,
    });
    return fallbackUnits;
  }
  return segmentsByLayer?.get(sourceLayer.id) ?? [];
}
