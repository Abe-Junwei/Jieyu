import { useCallback, useMemo } from 'react';
import type { LayerDocType, LayerSegmentDocType, SpeakerDocType, UtteranceDocType } from '../db';
import { layerUsesOwnSegments } from '../hooks/useLayerSegments';
import {
  buildSpeakerFilterOptionsFromKeys,
  buildSpeakerVisualMapFromKeys,
} from '../hooks/speakerManagement/speakerUtils';
import { resolveMappedUtteranceIds } from './selectionIdResolvers';

type SelectedTimelineUnitLike = {
  unitId: string;
} | null;

type SpeakerAssignmentLike = {
  unitId: string;
  speakerKey: string;
};

interface UseSpeakerActionScopeControllerInput {
  utterancesOnCurrentMedia: UtteranceDocType[];
  segmentsByLayer: ReadonlyMap<string, LayerSegmentDocType[]>;
  speakers: SpeakerDocType[];
  layers: LayerDocType[];
  defaultTranscriptionLayerId?: string;
  selectedLayerId?: string | null;
  selectedUtteranceIds: Set<string>;
  selectedTimelineUnit: SelectedTimelineUnitLike;
  getUtteranceSpeakerKey: (utterance: UtteranceDocType) => string;
}

interface UseSpeakerActionScopeControllerResult {
  speakerActionUtteranceIdByUnitId: Map<string, string>;
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
  resolveSpeakerActionUtteranceIds: (ids: Iterable<string>) => string[];
  selectedSpeakerUnitIdsForActionsSet: Set<string>;
}

export function useSpeakerActionScopeController({
  utterancesOnCurrentMedia,
  segmentsByLayer,
  speakers,
  layers,
  defaultTranscriptionLayerId,
  selectedLayerId,
  selectedUtteranceIds,
  selectedTimelineUnit,
  getUtteranceSpeakerKey,
}: UseSpeakerActionScopeControllerInput): UseSpeakerActionScopeControllerResult {
  const speakerActionUtteranceIdByUnitId = useMemo(() => {
    const map = new Map<string, string>();
    for (const utterance of utterancesOnCurrentMedia) {
      map.set(utterance.id, utterance.id);
    }
    for (const segments of segmentsByLayer.values()) {
      for (const segment of segments) {
        if (!segment.utteranceId) continue;
        map.set(segment.id, segment.utteranceId);
      }
    }
    return map;
  }, [segmentsByLayer, utterancesOnCurrentMedia]);

  const segmentByIdForSpeakerActions = useMemo(() => {
    const map = new Map<string, LayerSegmentDocType>();
    for (const segments of segmentsByLayer.values()) {
      for (const segment of segments) {
        map.set(segment.id, segment);
      }
    }
    return map;
  }, [segmentsByLayer]);

  const utteranceByIdOnCurrentMedia = useMemo(
    () => new Map(utterancesOnCurrentMedia.map((utterance) => [utterance.id, utterance] as const)),
    [utterancesOnCurrentMedia],
  );

  const resolveSpeakerAssignmentKeyForSegment = useCallback((segment: LayerSegmentDocType) => {
    const explicitSpeakerId = segment.speakerId?.trim();
    if (explicitSpeakerId) return explicitSpeakerId;
    const ownerUtterance = segment.utteranceId ? utteranceByIdOnCurrentMedia.get(segment.utteranceId) : undefined;
    return ownerUtterance ? getUtteranceSpeakerKey(ownerUtterance) : '';
  }, [getUtteranceSpeakerKey, utteranceByIdOnCurrentMedia]);

  const resolveSpeakerKeyForSegment = useCallback((segment: LayerSegmentDocType) => {
    const speakerKey = resolveSpeakerAssignmentKeyForSegment(segment);
    return speakerKey || 'unknown-speaker';
  }, [resolveSpeakerAssignmentKeyForSegment]);

  const resolveExplicitSpeakerKeyForSegment = useCallback(
    (segment: LayerSegmentDocType) => segment.speakerId?.trim() ?? '',
    [],
  );

  const utteranceSpeakerAssignmentsOnCurrentMedia = useMemo(() => (
    utterancesOnCurrentMedia.map((utterance) => ({
      unitId: utterance.id,
      speakerKey: getUtteranceSpeakerKey(utterance),
    }))
  ), [getUtteranceSpeakerKey, utterancesOnCurrentMedia]);

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
    if (selectedUtteranceIds.size > 0) {
      return Array.from(selectedUtteranceIds).map((id) => id.trim()).filter((id) => id.length > 0);
    }
    if (selectedTimelineUnit?.unitId) {
      return selectedTimelineUnit.unitId.trim().length > 0 ? [selectedTimelineUnit.unitId] : [];
    }
    return [];
  }, [selectedTimelineUnit, selectedUtteranceIds]);

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

  const resolveSpeakerActionUtteranceIds = useCallback((ids: Iterable<string>) => {
    return resolveMappedUtteranceIds(ids, speakerActionUtteranceIdByUnitId);
  }, [speakerActionUtteranceIdByUnitId]);

  const selectedSpeakerUnitIdsForActionsSet = useMemo(
    () => new Set(selectedUnitIdsForSpeakerActions),
    [selectedUnitIdsForSpeakerActions],
  );

  return {
    speakerActionUtteranceIdByUnitId,
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
    resolveSpeakerActionUtteranceIds,
    selectedSpeakerUnitIdsForActionsSet,
  };
}