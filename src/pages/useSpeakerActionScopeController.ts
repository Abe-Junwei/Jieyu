import { useCallback, useMemo } from 'react';
import type { LayerDocType, LayerSegmentDocType, SpeakerDocType, UtteranceDocType } from '../db';
import { layerUsesOwnSegments } from '../hooks/useLayerSegments';
import type { TimelineUnitView } from '../hooks/timelineUnitView';
import {
  buildSpeakerFilterOptionsFromKeys,
  buildSpeakerVisualMapFromKeys,
} from '../hooks/speakerManagement/speakerUtils';
import { resolveMappedUnitIds } from './selectionIdResolvers';

type SelectedTimelineUnitLike = {
  unitId: string;
} | null;

type SpeakerAssignmentLike = {
  unitId: string;
  speakerKey: string;
};

interface UseSpeakerActionScopeControllerInput {
  /** Unified current-media rows (same ordering as timeline digest). */
  unitsOnCurrentMedia: ReadonlyArray<TimelineUnitView>;
  unitViewById: ReadonlyMap<string, TimelineUnitView>;
  resolveUnitViewById?: (unitId: string) => TimelineUnitView | undefined;
  getUtteranceDocById: (id: string) => UtteranceDocType | undefined;
  segmentsByLayer: ReadonlyMap<string, LayerSegmentDocType[]>;
  speakers: SpeakerDocType[];
  layers: LayerDocType[];
  defaultTranscriptionLayerId?: string;
  selectedLayerId?: string | null;
  selectedUnitIds: Set<string>;
  selectedTimelineUnit: SelectedTimelineUnitLike;
  getUtteranceSpeakerKey: (utterance: UtteranceDocType) => string;
}

interface UseSpeakerActionScopeControllerResult {
  segmentByIdForSpeakerActions: Map<string, LayerSegmentDocType>;
  resolveSpeakerKeyForSegment: (segment: LayerSegmentDocType) => string;
  resolveExplicitSpeakerKeyForSegment: (segment: LayerSegmentDocType) => string;
  segmentSpeakerAssignmentsOnCurrentMedia: SpeakerAssignmentLike[];
  speakerVisualByTimelineUnitId: Record<string, { name: string; color: string }>;
  activeSpeakerManagementLayer: LayerDocType | null;
  speakerFilterOptionsForActions: Array<{ key: string; name: string; count: number; color?: string }>;
  selectedUnitIdsForSpeakerActions: string[];
  selectedSegmentIdsForSpeakerActions: string[];
  selectedBatchSegmentsForSpeakerActions: LayerSegmentDocType[];
  selectedBatchUnits: TimelineUnitView[];
  resolveSpeakerActionUtteranceIds: (ids: Iterable<string>) => string[];
  selectedSpeakerUnitIdsForActionsSet: Set<string>;
}

export function useSpeakerActionScopeController({
  unitsOnCurrentMedia,
  unitViewById,
  resolveUnitViewById,
  getUtteranceDocById,
  segmentsByLayer,
  speakers,
  layers,
  defaultTranscriptionLayerId,
  selectedLayerId,
  selectedUnitIds,
  selectedTimelineUnit,
  getUtteranceSpeakerKey,
}: UseSpeakerActionScopeControllerInput): UseSpeakerActionScopeControllerResult {
  const utteranceDocsOnCurrentMedia = useMemo(() => {
    const docs: UtteranceDocType[] = [];
    for (const unit of unitsOnCurrentMedia) {
      if (unit.kind !== 'utterance') continue;
      const doc = getUtteranceDocById(unit.id);
      if (doc) docs.push(doc);
    }
    return docs;
  }, [getUtteranceDocById, unitsOnCurrentMedia]);

  const utteranceDocByIdOnCurrentMedia = useMemo(
    () => new Map(utteranceDocsOnCurrentMedia.map((utterance) => [utterance.id, utterance] as const)),
    [utteranceDocsOnCurrentMedia],
  );

  const segmentByIdForSpeakerActions = useMemo(() => {
    const map = new Map<string, LayerSegmentDocType>();
    for (const segments of segmentsByLayer.values()) {
      for (const segment of segments) {
        map.set(segment.id, segment);
      }
    }
    return map;
  }, [segmentsByLayer]);

  const resolveSpeakerAssignmentKeyForSegment = useCallback((segment: LayerSegmentDocType) => {
    const explicitSpeakerId = segment.speakerId?.trim();
    if (explicitSpeakerId) return explicitSpeakerId;
    const ownerUtterance = segment.utteranceId ? utteranceDocByIdOnCurrentMedia.get(segment.utteranceId) : undefined;
    return ownerUtterance ? getUtteranceSpeakerKey(ownerUtterance) : '';
  }, [getUtteranceSpeakerKey, utteranceDocByIdOnCurrentMedia]);

  const resolveSpeakerKeyForSegment = useCallback((segment: LayerSegmentDocType) => {
    const speakerKey = resolveSpeakerAssignmentKeyForSegment(segment);
    return speakerKey || 'unknown-speaker';
  }, [resolveSpeakerAssignmentKeyForSegment]);

  const resolveExplicitSpeakerKeyForSegment = useCallback(
    (segment: LayerSegmentDocType) => segment.speakerId?.trim() ?? '',
    [],
  );

  const utteranceSpeakerAssignmentsOnCurrentMedia = useMemo(() => (
    utteranceDocsOnCurrentMedia.map((utterance) => ({
      unitId: utterance.id,
      speakerKey: getUtteranceSpeakerKey(utterance),
    }))
  ), [getUtteranceSpeakerKey, utteranceDocsOnCurrentMedia]);

  const segmentSpeakerAssignmentsOnCurrentMedia = useMemo(() => {
    const next: SpeakerAssignmentLike[] = [];
    for (const segments of segmentsByLayer.values()) {
      for (const segment of segments) {
        const speakerKey = resolveSpeakerAssignmentKeyForSegment(segment);
        if (!speakerKey) continue;
        next.push({ unitId: segment.id, speakerKey });
      }
    }
    return next;
  }, [resolveSpeakerAssignmentKeyForSegment, segmentsByLayer]);

  const speakerVisualByTimelineUnitId = useMemo(() => ({
    ...buildSpeakerVisualMapFromKeys(utteranceSpeakerAssignmentsOnCurrentMedia, speakers),
    ...buildSpeakerVisualMapFromKeys(segmentSpeakerAssignmentsOnCurrentMedia, speakers),
  }), [segmentSpeakerAssignmentsOnCurrentMedia, speakers, utteranceSpeakerAssignmentsOnCurrentMedia]);

  const activeSpeakerManagementLayer = useMemo(() => {
    if (!selectedLayerId) return null;
    const layer = layers.find((item) => item.id === selectedLayerId);
    if (!layer || layer.layerType !== 'transcription') return null;
    return layerUsesOwnSegments(layer, defaultTranscriptionLayerId) ? layer : null;
  }, [defaultTranscriptionLayerId, layers, selectedLayerId]);

  const speakerAssignmentsForActions = useMemo(() => {
    if (activeSpeakerManagementLayer) {
      return (segmentsByLayer.get(activeSpeakerManagementLayer.id) ?? [])
        .map((segment) => ({
          unitId: segment.id,
          speakerKey: resolveExplicitSpeakerKeyForSegment(segment),
        }))
        .filter((item) => item.speakerKey.length > 0);
    }

    return utteranceSpeakerAssignmentsOnCurrentMedia.filter((item) => item.speakerKey.length > 0);
  }, [activeSpeakerManagementLayer, resolveExplicitSpeakerKeyForSegment, segmentsByLayer, utteranceSpeakerAssignmentsOnCurrentMedia]);

  const speakerFilterOptionsForActions = useMemo(
    () => buildSpeakerFilterOptionsFromKeys(speakerAssignmentsForActions, speakerVisualByTimelineUnitId),
    [speakerAssignmentsForActions, speakerVisualByTimelineUnitId],
  );

  const selectedUnitIdsForSpeakerActions = useMemo(() => {
    if (selectedUnitIds.size > 0) {
      return Array.from(selectedUnitIds).map((id) => id.trim()).filter((id) => id.length > 0);
    }
    if (selectedTimelineUnit?.unitId) {
      return selectedTimelineUnit.unitId.trim().length > 0 ? [selectedTimelineUnit.unitId] : [];
    }
    return [];
  }, [selectedTimelineUnit, selectedUnitIds]);

  const selectedSegmentIdsForSpeakerActions = useMemo(() => (
    Array.from(new Set(selectedUnitIdsForSpeakerActions.filter((id) => segmentByIdForSpeakerActions.has(id))))
  ), [segmentByIdForSpeakerActions, selectedUnitIdsForSpeakerActions]);

  const selectedBatchSegmentsForSpeakerActions = useMemo(
    () => selectedSegmentIdsForSpeakerActions
      .map((id) => segmentByIdForSpeakerActions.get(id))
      .filter((segment): segment is LayerSegmentDocType => Boolean(segment))
      .sort((a, b) => a.startTime - b.startTime),
    [segmentByIdForSpeakerActions, selectedSegmentIdsForSpeakerActions],
  );

  const fallbackUtteranceLayerId = (selectedLayerId?.trim() ?? '')
    || (defaultTranscriptionLayerId?.trim() ?? '');
  const selectedBatchUnits = useMemo(() => {
    const units: TimelineUnitView[] = [];
    for (const unitId of selectedUnitIdsForSpeakerActions) {
      const segment = segmentByIdForSpeakerActions.get(unitId);
      if (segment) {
        units.push({
          id: segment.id,
          kind: 'segment',
          layerRole: segment.utteranceId ? 'referring' : 'independent',
          mediaId: segment.mediaId,
          layerId: segment.layerId,
          startTime: segment.startTime,
          endTime: segment.endTime,
          text: '',
          ...(segment.speakerId ? { speakerId: segment.speakerId } : {}),
          ...(segment.utteranceId ? { parentUtteranceId: segment.utteranceId } : {}),
        });
        continue;
      }
      const utterance = utteranceDocByIdOnCurrentMedia.get(unitId);
      if (!utterance) continue;
      units.push({
        id: utterance.id,
        kind: 'utterance',
        layerRole: 'independent',
        mediaId: utterance.mediaId ?? '',
        layerId: fallbackUtteranceLayerId,
        startTime: utterance.startTime,
        endTime: utterance.endTime,
        text: '',
        ...(utterance.speakerId ? { speakerId: utterance.speakerId } : {}),
      });
    }
    return units.sort((left, right) => left.startTime - right.startTime);
  }, [fallbackUtteranceLayerId, segmentByIdForSpeakerActions, selectedUnitIdsForSpeakerActions, utteranceDocByIdOnCurrentMedia]);

  const resolveSpeakerActionUtteranceIds = useCallback((ids: Iterable<string>) => {
    return resolveMappedUnitIds(ids, unitViewById, resolveUnitViewById);
  }, [resolveUnitViewById, unitViewById]);

  const selectedSpeakerUnitIdsForActionsSet = useMemo(
    () => new Set(selectedUnitIdsForSpeakerActions),
    [selectedUnitIdsForSpeakerActions],
  );

  return {
    segmentByIdForSpeakerActions,
    resolveSpeakerKeyForSegment,
    resolveExplicitSpeakerKeyForSegment,
    segmentSpeakerAssignmentsOnCurrentMedia,
    speakerVisualByTimelineUnitId,
    activeSpeakerManagementLayer,
    speakerFilterOptionsForActions,
    selectedUnitIdsForSpeakerActions,
    selectedSegmentIdsForSpeakerActions,
    selectedBatchSegmentsForSpeakerActions,
    selectedBatchUnits,
    resolveSpeakerActionUtteranceIds,
    selectedSpeakerUnitIdsForActionsSet,
  };
}