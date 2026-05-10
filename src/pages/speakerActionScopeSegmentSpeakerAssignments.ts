import type { LayerSegmentViewDocType } from '../types/jieyuDbDocTypes';
import type { SpeakerAssignmentLike } from './speakerActionScopeControllerTypes';

export function buildSegmentSpeakerAssignmentsOnCurrentMedia(
  segmentsByLayer: ReadonlyMap<string, LayerSegmentViewDocType[]>,
  resolveExplicitSpeakerKeyForSegment: (segment: LayerSegmentViewDocType) => string,
): SpeakerAssignmentLike[] {
  const next: SpeakerAssignmentLike[] = [];
  for (const segments of segmentsByLayer.values()) {
    for (const segment of segments) {
      const speakerKey = resolveExplicitSpeakerKeyForSegment(segment);
      if (!speakerKey) continue;
      next.push({ unitId: segment.id, speakerKey });
    }
  }
  return next;
}
