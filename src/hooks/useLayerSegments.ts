/**
 * 独立边界层的 segment 数据加载 hook | Hook for loading segment data of independent-boundary layers
 *
 * 当 layer.constraint === 'independent_boundary' 时，从 layer_segments 表读取该层的独立边界数据，
 * 供时间轴渲染使用。返回按 startTime 排序的 segment 数组。
 * When layer.constraint === 'independent_boundary', reads independent boundary data from layer_segments table
 * for timeline rendering. Returns segments sorted by startTime.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { getDb, type LayerDocType, type LayerSegmentDocType } from '../db';

/** 层编辑模式 | Layer edit mode
 * utterance: 继承主层 utterance 边界 | Inherits main-layer utterance boundaries
 * independent-segment: 独立边界（layer_segments 自由切分）| Independent boundaries (free segmentation)
 * time-subdivision: 时间细分（在父层 utterance 范围内切分）| Time subdivision (segment within parent utterance)
 */
export type LayerEditMode = 'utterance' | 'independent-segment' | 'time-subdivision';

/** 判断层的编辑模式 | Determine the edit mode for a layer */
export function getLayerEditMode(
  layer: LayerDocType | undefined,
  defaultTranscriptionLayerId?: string,
): LayerEditMode {
  if (!layer) return 'utterance';
  if (layer.constraint === 'time_subdivision') return 'time-subdivision';
  if (layer.constraint === 'independent_boundary' && layer.id !== defaultTranscriptionLayerId) return 'independent-segment';
  return 'utterance';
}

/** 判断层是否使用独立边界 | Check if a layer uses independent boundaries
 * constraint === 'independent_boundary' 且不是默认转写层 → 独立边界层
 * constraint === 'independent_boundary' AND not the default transcription layer → independent boundary layer
 * @deprecated 请使用 getLayerEditMode() 代替 | Use getLayerEditMode() instead
 */
export function isIndependentBoundaryLayer(layer: LayerDocType, defaultTranscriptionLayerId?: string): boolean {
  return layer.constraint === 'independent_boundary'
    && layer.id !== defaultTranscriptionLayerId;
}

/** 判断层是否使用自有 segment 数据（独立边界或时间细分）| Check if a layer uses its own segment data */
export function layerUsesOwnSegments(layer: LayerDocType, defaultTranscriptionLayerId?: string): boolean {
  const mode = getLayerEditMode(layer, defaultTranscriptionLayerId);
  return mode === 'independent-segment' || mode === 'time-subdivision';
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
  defaultTranscriptionLayerId: string | undefined,
): {
  segmentsByLayer: Map<string, LayerSegmentDocType[]>;
  reloadSegments: () => Promise<void>;
} {
  const [segmentsByLayer, setSegmentsByLayer] = useState<Map<string, LayerSegmentDocType[]>>(
    () => new Map(),
  );
  const layersRef = useRef(layers);
  layersRef.current = layers;
  const defaultLayerIdRef = useRef(defaultTranscriptionLayerId);
  defaultLayerIdRef.current = defaultTranscriptionLayerId;

  const loadSegments = useCallback(async () => {
    if (!mediaId) {
      setSegmentsByLayer(new Map());
      return;
    }

    const independentLayers = layersRef.current.filter(
      (l) => layerUsesOwnSegments(l, defaultLayerIdRef.current),
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
  }, [loadSegments, layers, defaultTranscriptionLayerId]);

  return { segmentsByLayer, reloadSegments: loadSegments };
}
