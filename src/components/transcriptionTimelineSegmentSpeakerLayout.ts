import type { LayerDocType, LayerSegmentDocType, UtteranceDocType } from '../db';
import type { TranscriptionTrackDisplayMode } from '../hooks/useTranscriptionUIState';
import { getUtteranceSpeakerKey } from '../hooks/speakerManagement/speakerUtils';
import { resolveSegmentTimelineSourceLayer } from '../hooks/useLayerSegments';
import {
  buildSpeakerLayerLayoutWithOptions,
  type SpeakerLayerLayoutResult,
} from '../utils/speakerLayerLayout';

export const EMPTY_OVERLAP_CYCLE_ITEMS_BY_UTTERANCE_ID = new Map<string, Array<{ id: string; startTime: number }>>();

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

export function resolveSpeakerFocusKeyFromUtterance(
  utterance?: Pick<UtteranceDocType, 'speakerId' | 'speaker'>,
): string {
  if (!utterance) return 'unknown-speaker';
  return normalizeSpeakerFocusKey(getUtteranceSpeakerKey(utterance));
}

export function resolveSpeakerFocusKeyFromSegment(
  segment: Pick<LayerSegmentDocType, 'speakerId' | 'utteranceId'>,
  utteranceById: ReadonlyMap<string, UtteranceDocType>,
): string {
  if (segment.speakerId && segment.speakerId.trim().length > 0) {
    return normalizeSpeakerFocusKey(segment.speakerId);
  }
  const ownerUtterance = segment.utteranceId ? utteranceById.get(segment.utteranceId) : undefined;
  return resolveSpeakerFocusKeyFromUtterance(ownerUtterance);
}

export function toSpeakerLayoutInputFromSegments(
  segments: LayerSegmentDocType[],
  utteranceById: ReadonlyMap<string, UtteranceDocType>,
): UtteranceDocType[] {
  return segments.map((segment) => {
    const speakerKey = resolveSpeakerFocusKeyFromSegment(segment, utteranceById);
    return {
      id: segment.id,
      textId: segment.textId,
      mediaId: segment.mediaId,
      ...(speakerKey ? { speakerId: speakerKey } : {}),
      startTime: segment.startTime,
      endTime: segment.endTime,
      createdAt: segment.createdAt,
      updatedAt: segment.updatedAt,
    } as UtteranceDocType;
  });
}

export function buildSegmentSpeakerIdMap(
  segments: LayerSegmentDocType[],
  utteranceById: ReadonlyMap<string, UtteranceDocType>,
): Map<string, string> {
  const next = new Map<string, string>();
  for (const segment of segments) {
    next.set(segment.id, resolveSpeakerFocusKeyFromSegment(segment, utteranceById));
  }
  return next;
}

interface SegmentSpeakerLayoutMapsOptions {
  transcriptionLayers: LayerDocType[];
  layerById: ReadonlyMap<string, LayerDocType>;
  utteranceById: ReadonlyMap<string, UtteranceDocType>;
  segmentsByLayer: ReadonlyMap<string, LayerSegmentDocType[]> | undefined;
  defaultTranscriptionLayerId: string | undefined;
  activeSpeakerFilterKey: string | undefined;
  trackDisplayMode: TranscriptionTrackDisplayMode;
  laneLockMap: Record<string, number> | undefined;
  speakerSortKeyById: Record<string, number> | undefined;
}

export function buildSegmentSpeakerLayoutMaps({
  transcriptionLayers,
  layerById,
  utteranceById,
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
    const sourceLayer = resolveSegmentTimelineSourceLayer(layer, layerById, defaultTranscriptionLayerId);
    if (!sourceLayer) continue;
    const segments = (segmentsByLayer?.get(sourceLayer.id) ?? []).filter((segment) => (
      activeSpeakerFilterKey === 'all'
        || resolveSpeakerFocusKeyFromSegment(segment, utteranceById) === normalizeSpeakerFocusKey(activeSpeakerFilterKey)
    ));
    const segmentAsUtterances = toSpeakerLayoutInputFromSegments(segments, utteranceById);
    segmentSpeakerLayoutByLayer.set(
      sourceLayer.id,
      buildSpeakerLayerLayoutWithOptions(segmentAsUtterances, {
        trackMode: trackDisplayMode,
        ...(laneLockMap ? { laneLockMap } : {}),
        ...(speakerSortKeyById ? { speakerSortKeyById } : {}),
      }),
    );
    segmentSpeakerIdByLayer.set(sourceLayer.id, buildSegmentSpeakerIdMap(segments, utteranceById));
  }

  return {
    segmentSpeakerLayoutByLayer,
    segmentSpeakerIdByLayer,
  };
}
