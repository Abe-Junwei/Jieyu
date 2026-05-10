import type { LayerSegmentViewDocType, LayerUnitDocType } from '../types/jieyuDbDocTypes';
import type { TimelineUnitView } from '../hooks/timelineUnitView';

export function buildSelectedBatchUnitsForSpeakerActions(input: {
  selectedUnitIdsForSpeakerActions: string[];
  segmentByIdForSpeakerActions: Map<string, LayerSegmentViewDocType>;
  unitDocByIdOnCurrentMedia: Map<string, LayerUnitDocType>;
  fallbackUnitLayerId: string;
}): TimelineUnitView[] {
  const {
    selectedUnitIdsForSpeakerActions,
    segmentByIdForSpeakerActions,
    unitDocByIdOnCurrentMedia,
    fallbackUnitLayerId,
  } = input;
  const units: TimelineUnitView[] = [];
  for (const unitId of selectedUnitIdsForSpeakerActions) {
    const segment = segmentByIdForSpeakerActions.get(unitId);
    if (segment) {
      const ownerUnitId = (segment.parentUnitId ?? segment.unitId)?.trim() ?? '';
      units.push({
        id: segment.id,
        kind: 'segment',
        layerRole: ownerUnitId ? 'referring' : 'independent',
        mediaId: segment.mediaId ?? '',
        layerId: segment.layerId ?? fallbackUnitLayerId,
        startTime: segment.startTime,
        endTime: segment.endTime,
        text: '',
        ...(segment.speakerId ? { speakerId: segment.speakerId } : {}),
        ...(ownerUnitId ? { parentUnitId: ownerUnitId } : {}),
      });
      continue;
    }
    const unit = unitDocByIdOnCurrentMedia.get(unitId);
    if (!unit) continue;
    units.push({
      id: unit.id,
      kind: 'unit',
      layerRole: 'independent',
      mediaId: unit.mediaId ?? '',
      layerId: fallbackUnitLayerId,
      startTime: unit.startTime,
      endTime: unit.endTime,
      text: '',
      ...(unit.speakerId ? { speakerId: unit.speakerId } : {}),
    });
  }
  return units.sort((left, right) => left.startTime - right.startTime);
}
