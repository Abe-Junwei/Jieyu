import type { LayerDocType, LayerSegmentViewDocType } from '../types/jieyuDbDocTypes';
import type { SpeakerAssignmentLike } from './speakerActionScopeControllerTypes';

export function buildSpeakerAssignmentsForActions(input: {
  activeSpeakerManagementLayer: LayerDocType | null;
  segmentsByLayer: ReadonlyMap<string, LayerSegmentViewDocType[]>;
  resolveExplicitSpeakerKeyForSegment: (segment: LayerSegmentViewDocType) => string;
  unitSpeakerAssignmentsOnCurrentMedia: SpeakerAssignmentLike[];
}): SpeakerAssignmentLike[] {
  const {
    activeSpeakerManagementLayer,
    segmentsByLayer,
    resolveExplicitSpeakerKeyForSegment,
    unitSpeakerAssignmentsOnCurrentMedia,
  } = input;
  if (activeSpeakerManagementLayer) {
    return (segmentsByLayer.get(activeSpeakerManagementLayer.id) ?? [])
      .map((segment) => ({
        unitId: segment.id,
        speakerKey: resolveExplicitSpeakerKeyForSegment(segment),
      }))
      .filter((item) => item.speakerKey.length > 0);
  }

  return unitSpeakerAssignmentsOnCurrentMedia.filter((item) => item.speakerKey.length > 0);
}
