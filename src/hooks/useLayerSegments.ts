/**
 * 独立边界层的 segment 数据加载 hook | Hook for loading segment data of independent-boundary layers
 *
 * 当 layer.constraint === 'none' 时，从 layer_segments 表读取该层的独立边界数据，
 * 供时间轴渲染使用。返回按 startTime 排序的 segment 数组。
 * When layer.constraint === 'none', reads independent boundary data from layer_segments table
 * for timeline rendering. Returns segments sorted by startTime.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { getDb, type LayerDocType, type LayerSegmentDocType } from '../db';
import { featureFlags } from '../ai/config/featureFlags';

/** 判断层是否使用独立边界 | Check if a layer uses independent boundaries */
export function isIndependentBoundaryLayer(layer: LayerDocType): boolean {
  return featureFlags.segmentBoundaryV2Enabled && layer.constraint === 'none';
}

/**
 * 为多个独立边界层批量加载 segments | Batch-load segments for multiple independent-boundary layers
 *
 * 返回 Map<layerId, LayerSegmentDocType[]>，每个数组按 startTime 升序排列。
 * Returns Map<layerId, LayerSegmentDocType[]>, each array sorted by startTime ascending.
 */
export function useLayerSegments(
  layers: LayerDocType[],
  mediaId: string | undefined,
): {
  segmentsByLayer: Map<string, LayerSegmentDocType[]>;
  reloadSegments: () => Promise<void>;
} {
  const [segmentsByLayer, setSegmentsByLayer] = useState<Map<string, LayerSegmentDocType[]>>(
    () => new Map(),
  );
  const layersRef = useRef(layers);
  layersRef.current = layers;

  const loadSegments = useCallback(async () => {
    if (!mediaId || !featureFlags.segmentBoundaryV2Enabled) {
      setSegmentsByLayer(new Map());
      return;
    }

    const independentLayers = layersRef.current.filter(
      (l) => l.constraint === 'none',
    );

    if (independentLayers.length === 0) {
      setSegmentsByLayer(new Map());
      return;
    }

    const db = await getDb();
    const result = new Map<string, LayerSegmentDocType[]>();

    for (const layer of independentLayers) {
      const segments = await db.dexie.layer_segments
        .where('[layerId+mediaId]')
        .equals([layer.id, mediaId])
        .toArray();
      segments.sort((a, b) => a.startTime - b.startTime);
      result.set(layer.id, segments);
    }

    setSegmentsByLayer(result);
  }, [mediaId]);

  useEffect(() => {
    void loadSegments();
  }, [loadSegments, layers]);

  return { segmentsByLayer, reloadSegments: loadSegments };
}
