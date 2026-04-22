import type { LayerDocType, LayerLinkDocType, LayerSegmentViewDocType, LayerUnitDocType } from '../db';
import type { TranscriptionTrackDisplayMode } from '../hooks/useTranscriptionUIState';
import type { TimelineUnitView } from '../hooks/timelineUnitView';
import { getUnitSpeakerKey } from '../hooks/speakerManagement/speakerUtils';
import { resolveSegmentTimelineSourceLayer } from '../hooks/useLayerSegments';
import { buildSpeakerLayerLayoutWithOptions, type SpeakerLayerLayoutResult } from '../utils/speakerLayerLayout';

export const EMPTY_OVERLAP_CYCLE_ITEMS_BY_UNIT_ID = new Map<string, Array<{ id: string; startTime: number }>>();

export const EMPTY_SPEAKER_LAYOUT: SpeakerLayerLayoutResult = {
  placements: new Map(),
  subTrackCount: 1,
  maxConcurrentSpeakerCount: 1,
  overlapGroups: [],
  overlapCycleItemsByGroupId: new Map(),
  lockConflictCount: 0,
  lockConflictSpeakerIds: [],
};

export function normalizeSpeakerFocusKey(value: string | undefined): string {
  const trimmed = (value ?? '').trim();
  return trimmed.length > 0 ? trimmed : 'unknown-speaker';
}

export function resolveSpeakerFocusKeyFromUnit(
  unit?: Pick<LayerUnitDocType, 'speakerId' | 'speaker'>,
): string {
  if (!unit) return 'unknown-speaker';
  return normalizeSpeakerFocusKey(getUnitSpeakerKey(unit));
}

export function resolveSpeakerFocusKeyFromView(view: TimelineUnitView): string {
  return normalizeSpeakerFocusKey(view.speakerId);
}

export function resolveSpeakerFocusKeyFromSegment(
  segment: Pick<LayerSegmentViewDocType, 'speakerId' | 'parentUnitId' | 'unitId'>,
  unitById: ReadonlyMap<string, LayerUnitDocType>,
): string {
  if (segment.speakerId && segment.speakerId.trim().length > 0) {
    return normalizeSpeakerFocusKey(segment.speakerId);
  }
  const ownerUnitId = segment.parentUnitId ?? segment.unitId;
  const ownerUnit = ownerUnitId ? unitById.get(ownerUnitId) : undefined;
  return resolveSpeakerFocusKeyFromUnit(ownerUnit);
}

export function toSpeakerLayoutInputFromSegments(
  segments: LayerUnitDocType[],
  unitById: ReadonlyMap<string, LayerUnitDocType>,
): LayerUnitDocType[] {
  return segments.map((segment) => {
    const speakerKey = resolveSpeakerFocusKeyFromSegment(segment, unitById);
    return {
      id: segment.id,
      textId: segment.textId,
      mediaId: segment.mediaId,
      ...(speakerKey ? { speakerId: speakerKey } : {}),
      startTime: segment.startTime,
      endTime: segment.endTime,
      createdAt: segment.createdAt,
      updatedAt: segment.updatedAt,
    } as LayerUnitDocType;
  });
}

export function buildSegmentSpeakerIdMap(
  segments: LayerUnitDocType[],
  unitById: ReadonlyMap<string, LayerUnitDocType>,
): Map<string, string> {
  const next = new Map<string, string>();
  for (const segment of segments) {
    next.set(segment.id, resolveSpeakerFocusKeyFromSegment(segment, unitById));
  }
  return next;
}

interface SegmentSpeakerLayoutMapsOptions {
  transcriptionLayers: LayerDocType[];
  layerById: ReadonlyMap<string, LayerDocType>;
  layerLinks: ReadonlyArray<Pick<LayerLinkDocType, 'layerId' | 'transcriptionLayerKey' | 'hostTranscriptionLayerId' | 'isPreferred'>>;
  unitById: ReadonlyMap<string, LayerUnitDocType>;
  segmentsByLayer: ReadonlyMap<string, LayerUnitDocType[]> | undefined;
  defaultTranscriptionLayerId: string | undefined;
  activeSpeakerFilterKey: string | undefined;
  trackDisplayMode: TranscriptionTrackDisplayMode;
  laneLockMap: Record<string, number> | undefined;
  speakerSortKeyById: Record<string, number> | undefined;
}

export function buildSegmentSpeakerLayoutMaps({
  transcriptionLayers,
  layerById,
  layerLinks,
  unitById,
  segmentsByLayer,
  defaultTranscriptionLayerId,
  activeSpeakerFilterKey = 'all',
  trackDisplayMode,
  laneLockMap,
  speakerSortKeyById,
}: SegmentSpeakerLayoutMapsOptions): {
  segmentSpeakerLayoutByLayer: Map<string, SpeakerLayerLayoutResult>;
  segmentSpeakerIdByLayer: Map<string, Map<string, string>>;
} {
  const segmentSpeakerLayoutByLayer = new Map<string, SpeakerLayerLayoutResult>();
  const segmentSpeakerIdByLayer = new Map<string, Map<string, string>>();

  for (const layer of transcriptionLayers) {
    const sourceLayer = resolveSegmentTimelineSourceLayer(layer, layerById, defaultTranscriptionLayerId, layerLinks);
    if (!sourceLayer) continue;
    const segments = (segmentsByLayer?.get(sourceLayer.id) ?? []).filter((segment) => (
      activeSpeakerFilterKey === 'all'
        || resolveSpeakerFocusKeyFromSegment(segment, unitById) === normalizeSpeakerFocusKey(activeSpeakerFilterKey)
    ));
    const segmentAsUnits = toSpeakerLayoutInputFromSegments(segments, unitById);
    segmentSpeakerLayoutByLayer.set(
      sourceLayer.id,
      buildSpeakerLayerLayoutWithOptions(segmentAsUnits, {
        trackMode: trackDisplayMode,
        ...(laneLockMap ? { laneLockMap } : {}),
        ...(speakerSortKeyById ? { speakerSortKeyById } : {}),
      }),
    );
    segmentSpeakerIdByLayer.set(sourceLayer.id, buildSegmentSpeakerIdMap(segments, unitById));
  }

  return {
    segmentSpeakerLayoutByLayer,
    segmentSpeakerIdByLayer,
  };
}
