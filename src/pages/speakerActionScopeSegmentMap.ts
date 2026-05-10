import type { LayerSegmentViewDocType } from '../types/jieyuDbDocTypes';

export function buildSegmentByIdForSpeakerActions(
  segmentsByLayer: ReadonlyMap<string, LayerSegmentViewDocType[]>,
): Map<string, LayerSegmentViewDocType> {
  const map = new Map<string, LayerSegmentViewDocType>();
  for (const segments of segmentsByLayer.values()) {
    for (const segment of segments) {
      map.set(segment.id, segment);
    }
  }
  return map;
}
