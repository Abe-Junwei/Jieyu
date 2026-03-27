/**
 * 独立边界层 segment 内容加载 hook | Hook for loading segment contents of independent-boundary layers
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { getDb, type LayerDocType, type LayerSegmentContentDocType, type LayerSegmentDocType } from '../db';
import { layerUsesOwnSegments } from './useLayerSegments';

type SegmentContentByLayer = Map<string, Map<string, LayerSegmentContentDocType>>;

export function useLayerSegmentContents(
  layers: LayerDocType[],
  mediaId: string | undefined,
  segmentsByLayer: Map<string, LayerSegmentDocType[]>,
  defaultTranscriptionLayerId?: string,
): {
  segmentContentByLayer: SegmentContentByLayer;
  reloadSegmentContents: () => Promise<void>;
} {
  const [segmentContentByLayer, setSegmentContentByLayer] = useState<SegmentContentByLayer>(() => new Map());
  const layersRef = useRef(layers);
  const segmentsRef = useRef(segmentsByLayer);
  layersRef.current = layers;
  segmentsRef.current = segmentsByLayer;

  const defaultLayerIdRef = useRef(defaultTranscriptionLayerId);
  defaultLayerIdRef.current = defaultTranscriptionLayerId;

  const loadSegmentContents = useCallback(async () => {
    if (!mediaId) {
      setSegmentContentByLayer(new Map());
      return;
    }

    const independentLayers = layersRef.current.filter((layer) => layerUsesOwnSegments(layer, defaultLayerIdRef.current));
    if (independentLayers.length === 0) {
      setSegmentContentByLayer(new Map());
      return;
    }

    const db = await getDb();
    const next: SegmentContentByLayer = new Map();

    for (const layer of independentLayers) {
      const segs = segmentsRef.current.get(layer.id) ?? [];
      if (segs.length === 0) continue;
      const segmentIds = new Set(segs.map((seg) => seg.id));

      const rows = await db.dexie.layer_segment_contents.where('layerId').equals(layer.id).toArray();
      const mapBySegment = new Map<string, LayerSegmentContentDocType>();

      for (const row of rows) {
        if (!segmentIds.has(row.segmentId)) continue;
        const existing = mapBySegment.get(row.segmentId);
        if (!existing || row.updatedAt > existing.updatedAt) {
          mapBySegment.set(row.segmentId, row);
        }
      }

      if (mapBySegment.size > 0) {
        next.set(layer.id, mapBySegment);
      }
    }

    setSegmentContentByLayer(next);
  }, [mediaId]);

  useEffect(() => {
    void loadSegmentContents();
  }, [loadSegmentContents, layers, segmentsByLayer]);

  return { segmentContentByLayer, reloadSegmentContents: loadSegmentContents };
}
