/**
 * 独立边界层的 segment 数据加载 hook | Hook for loading segment data of independent-boundary layers
 *
 * 当 layer.constraint === 'independent_boundary' 时，从 merged segmentation 视图读取该层的独立边界数据，
 * 供时间轴渲染使用。返回按 startTime 排序的 segment 数组。
 * When layer.constraint === 'independent_boundary', reads independent boundary data from the merged segmentation view
 * for timeline rendering. Returns segments sorted by startTime.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { layerTranscriptionTreeParentId, type LayerDocType, type LayerLinkDocType, type LayerUnitDocType } from '../db';
import { LayerSegmentQueryService } from '../services/LayerSegmentQueryService';
import { resolveLayerLinkHostTranscriptionLayerId } from '../utils/translationHostLinkQuery';
import { useLatest } from './useLatest';

export type SegmentTimelineHostLink = Pick<LayerLinkDocType, 'layerId' | 'transcriptionLayerKey' | 'hostTranscriptionLayerId' | 'isPreferred'>;

/** 层编辑模式 | Layer edit mode
 * unit: 继承主层 unit 边界 | Inherits main-layer unit boundaries
 * independent-segment: 独立边界（通过 merged segment 视图自由切分）| Independent boundaries (free segmentation via merged segment view)
 * time-subdivision: 时间细分（在父层 unit 范围内切分）| Time subdivision (segment within parent unit)
 */
export type LayerEditMode = 'unit' | 'independent-segment' | 'time-subdivision';

/** 判断层的编辑模式 | Determine the edit mode for a layer */
export function getLayerEditMode(
  layer: LayerDocType | undefined,
  _defaultTranscriptionLayerId?: string,
): LayerEditMode {
  if (!layer) return 'unit';
  if (layer.constraint === 'time_subdivision') return 'time-subdivision';
  // De-centered model: independent_boundary always uses segment-first editing,
  // including the previous "default transcription layer".
  if (layer.constraint === 'independent_boundary') return 'independent-segment';
  return 'unit';
}

/** 判断层是否使用独立边界 | Check if a layer uses independent boundaries
 * constraint === 'independent_boundary' → 独立边界层
 * constraint === 'independent_boundary' → independent boundary layer
 * @deprecated 请使用 getLayerEditMode() 代替 | Use getLayerEditMode() instead
 */
export function isIndependentBoundaryLayer(layer: LayerDocType, _defaultTranscriptionLayerId?: string): boolean {
  return layer.constraint === 'independent_boundary';
}

/** 判断层是否使用自有 segment 数据（独立边界或时间细分）| Check if a layer uses its own segment data */
export function layerUsesOwnSegments(layer: LayerDocType, defaultTranscriptionLayerId?: string): boolean {
  const mode = getLayerEditMode(layer, defaultTranscriptionLayerId);
  return mode === 'independent-segment' || mode === 'time-subdivision';
}

/**
 * 解析层在时间轴上应复用的 segment 来源层 | Resolve the segment source layer reused by this lane on the timeline
 */
export function resolveSegmentTimelineSourceLayer(
  layer: LayerDocType | undefined,
  layerById: ReadonlyMap<string, LayerDocType>,
  defaultTranscriptionLayerId?: string,
  layerLinks: ReadonlyArray<SegmentTimelineHostLink> = [],
): LayerDocType | undefined {
  if (!layer) return undefined;
  if (layerUsesOwnSegments(layer, defaultTranscriptionLayerId)) {
    return layer;
  }

  if (layerLinks.length > 0) {
    const links = layerLinks.filter((link) => link.layerId === layer.id);
    if (links.length > 0) {
      const preferred = links.find((link) => link.isPreferred) ?? links[0];
      if (preferred) {
        const transcriptionIdByKey = new Map<string, string>();
        for (const item of layerById.values()) {
          if (item.layerType !== 'transcription') continue;
          const key = item.key?.trim() ?? '';
          if (key.length === 0 || transcriptionIdByKey.has(key)) continue;
          transcriptionIdByKey.set(key, item.id);
        }
        const preferredHostId = resolveLayerLinkHostTranscriptionLayerId(preferred, transcriptionIdByKey);
        if (preferredHostId.length > 0) {
          const preferredHostLayer = layerById.get(preferredHostId);
          if (preferredHostLayer && layerUsesOwnSegments(preferredHostLayer, defaultTranscriptionLayerId)) {
            return preferredHostLayer;
          }
        }
      }
    }
  }

  if (layer.layerType !== 'transcription') {
    return undefined;
  }

  const parentLayerId = layerTranscriptionTreeParentId(layer)?.trim() ?? '';
  if (!parentLayerId) return undefined;

  const parentLayer = layerById.get(parentLayerId);
  if (!parentLayer) return undefined;

  return layerUsesOwnSegments(parentLayer, defaultTranscriptionLayerId)
    ? parentLayer
    : undefined;
}

/**
 * 判断层是否在时间轴上使用 segment 边界 | Check whether a layer uses segment-backed timeline boundaries
 */
export function layerUsesSegmentTimeline(
  layer: LayerDocType | undefined,
  layerById: ReadonlyMap<string, LayerDocType>,
  defaultTranscriptionLayerId?: string,
  layerLinks: ReadonlyArray<SegmentTimelineHostLink> = [],
): boolean {
  return Boolean(resolveSegmentTimelineSourceLayer(layer, layerById, defaultTranscriptionLayerId, layerLinks));
}

/**
 * 为多个独立边界层批量加载 segments | Batch-load segments for multiple independent-boundary layers
 *
 * 返回 Map<layerId, LayerUnitDocType[]>，每个数组按 startTime 升序排列。
 * Returns Map<layerId, LayerUnitDocType[]>, each array sorted by startTime ascending.
 */
export function useLayerSegments(
  layers: LayerDocType[],
  mediaId: string | undefined,
  defaultTranscriptionLayerId: string | undefined,
  _layerLinks: ReadonlyArray<SegmentTimelineHostLink> = [],
): {
  segmentsByLayer: Map<string, LayerUnitDocType[]>;
  segmentsLoadComplete: boolean;
  reloadSegments: () => Promise<void>;
  updateSegmentsLocally: (
    segmentIds: Iterable<string>,
    updater: (segment: LayerUnitDocType) => LayerUnitDocType,
  ) => void;
} {
  const [segmentsByLayer, setSegmentsByLayer] = useState<Map<string, LayerUnitDocType[]>>(
    () => new Map(),
  );
  const [segmentsLoadComplete, setSegmentsLoadComplete] = useState(false);
  const layersRef = useLatest(layers);
  const defaultLayerIdRef = useLatest(defaultTranscriptionLayerId);
  const loadSequenceRef = useRef(0);

  const loadSegments = useCallback(async () => {
    const loadSequence = loadSequenceRef.current + 1;
    loadSequenceRef.current = loadSequence;
    setSegmentsLoadComplete(false);

    if (!mediaId) {
      if (loadSequenceRef.current !== loadSequence) return;
      setSegmentsByLayer(new Map());
      setSegmentsLoadComplete(true);
      return;
    }

    const independentLayers = layersRef.current.filter(
      (l) => layerUsesOwnSegments(l, defaultLayerIdRef.current),
    );

    if (independentLayers.length === 0) {
      if (loadSequenceRef.current !== loadSequence) return;
      setSegmentsByLayer(new Map());
      setSegmentsLoadComplete(true);
      return;
    }

    const result = new Map<string, LayerUnitDocType[]>();

    for (const layer of independentLayers) {
      const segments = await LayerSegmentQueryService.listSegmentsByLayerMedia(layer.id, mediaId);
      result.set(layer.id, segments);
    }

    if (loadSequenceRef.current !== loadSequence) return;
    setSegmentsByLayer(result);
    setSegmentsLoadComplete(true);
  }, [mediaId]);

  useEffect(() => {
    void loadSegments();
  }, [loadSegments, layers, defaultTranscriptionLayerId]);

  const updateSegmentsLocally = useCallback((segmentIds: Iterable<string>, updater: (segment: LayerUnitDocType) => LayerUnitDocType) => {
    const targetIds = new Set(Array.from(segmentIds).map((id) => id.trim()).filter((id) => id.length > 0));
    if (targetIds.size === 0) return;

    setSegmentsByLayer((prev) => {
      let changed = false;
      const next = new Map(prev);
      for (const [layerId, segments] of prev) {
        let layerChanged = false;
        const nextSegments = segments.map((segment) => {
          if (!targetIds.has(segment.id)) return segment;
          const updated = updater(segment);
          if (updated !== segment) layerChanged = true;
          return updated;
        });
        if (!layerChanged) continue;
        changed = true;
        next.set(layerId, nextSegments);
      }
      return changed ? next : prev;
    });
  }, []);

  return { segmentsByLayer, segmentsLoadComplete, reloadSegments: loadSegments, updateSegmentsLocally };
}
