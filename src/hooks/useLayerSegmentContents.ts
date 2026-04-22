/**
 * 独立边界层 segment 内容加载 hook | Hook for loading segment contents of independent-boundary layers
 */
import { useCallback, useEffect, useState } from 'react';
import { type LayerDocType, type LayerLinkDocType, type LayerUnitContentDocType, type LayerUnitDocType } from '../db';
import { LayerSegmentQueryService } from '../services/LayerSegmentQueryService';
import { useLatest } from './useLatest';
import { resolveSegmentTimelineSourceLayer } from './useLayerSegments';

type SegmentContentByLayer = Map<string, Map<string, LayerUnitContentDocType>>;

export function useLayerSegmentContents(
  layers: LayerDocType[],
  mediaId: string | undefined,
  segmentsByLayer: Map<string, LayerUnitDocType[]>,
  defaultTranscriptionLayerId?: string,
  layerLinks: ReadonlyArray<Pick<LayerLinkDocType, 'layerId' | 'transcriptionLayerKey' | 'hostTranscriptionLayerId' | 'isPreferred'>> = [],
): {
  segmentContentByLayer: SegmentContentByLayer;
  reloadSegmentContents: () => Promise<void>;
} {
  const [segmentContentByLayer, setSegmentContentByLayer] = useState<SegmentContentByLayer>(() => new Map());
  const layersRef = useLatest(layers);
  const segmentsRef = useLatest(segmentsByLayer);
  const defaultLayerIdRef = useLatest(defaultTranscriptionLayerId);

  const loadSegmentContents = useCallback(async () => {
    if (!mediaId) {
      setSegmentContentByLayer(new Map());
      return;
    }

    const layerById = new Map(layersRef.current.map((layer) => [layer.id, layer] as const));
    const segmentBackedLayers = layersRef.current
      .map((layer) => ({
        layer,
        sourceLayer: resolveSegmentTimelineSourceLayer(layer, layerById, defaultLayerIdRef.current, layerLinks),
      }))
      .filter((item): item is { layer: LayerDocType; sourceLayer: LayerDocType } => Boolean(item.sourceLayer));

    if (segmentBackedLayers.length === 0) {
      setSegmentContentByLayer(new Map());
      return;
    }

    const next: SegmentContentByLayer = new Map();

    for (const { layer, sourceLayer } of segmentBackedLayers) {
      const segs = segmentsRef.current.get(sourceLayer.id) ?? [];
      if (segs.length === 0) continue;
      const segmentIds = segs.map((seg) => seg.id);
      const rows = await LayerSegmentQueryService.listSegmentContentsBySegmentIds(segmentIds, {
        layerId: layer.id,
      });
      const mapBySegment = new Map<string, LayerUnitContentDocType>();

      for (const row of rows) {
        const segmentId = row.segmentId ?? row.unitId;
        if (!segmentId) continue;
        const existing = mapBySegment.get(segmentId);
        if (!existing || row.updatedAt >= existing.updatedAt) {
          mapBySegment.set(segmentId, row);
        }
      }

      if (mapBySegment.size > 0) {
        next.set(layer.id, mapBySegment);
      }
    }

    setSegmentContentByLayer(next);
  }, [layerLinks, mediaId]);

  useEffect(() => {
    void loadSegmentContents();
  }, [loadSegmentContents, layers, segmentsByLayer]);

  return { segmentContentByLayer, reloadSegmentContents: loadSegmentContents };
}
