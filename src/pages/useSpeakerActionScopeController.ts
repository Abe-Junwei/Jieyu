import { useCallback, useMemo } from 'react';
import type { LayerDocType, LayerSegmentViewDocType, LayerUnitDocType, SpeakerDocType } from '../db';
import { layerUsesOwnSegments } from '../hooks/useLayerSegments';
import type { TimelineUnit } from '../hooks/transcriptionTypes';
import type { TimelineUnitView } from '../hooks/timelineUnitView';
import { buildSpeakerFilterOptionsFromKeys, buildSpeakerVisualMapFromKeys } from '../hooks/speakerManagement/speakerUtils';
import { resolveMappedUnitIds, resolveSegmentOnlyIdsFromSelection } from './selectionIdResolvers';

type SpeakerAssignmentLike = {
  unitId: string;
  speakerKey: string;
};

interface UseSpeakerActionScopeControllerInput {
  /** Unified current-media rows (same ordering as timeline digest). */
  unitsOnCurrentMedia: ReadonlyArray<TimelineUnitView>;
  unitViewById: ReadonlyMap<string, TimelineUnitView>;
  resolveUnitViewById?: (unitId: string) => TimelineUnitView | undefined;
  getUnitDocById: (id: string) => LayerUnitDocType | undefined;
  segmentsByLayer: ReadonlyMap<string, LayerSegmentViewDocType[]>;
  speakers: SpeakerDocType[];
  layers: LayerDocType[];
  defaultTranscriptionLayerId?: string;
  selectedLayerId?: string | null;
  selectedUnitIds: Set<string>;
  selectedTimelineUnit: TimelineUnit | null;
  getUnitSpeakerKey: (unit: LayerUnitDocType) => string;
}

interface UseSpeakerActionScopeControllerResult {
  segmentByIdForSpeakerActions: Map<string, LayerSegmentViewDocType>;
  resolveSpeakerKeyForSegment: (segment: LayerSegmentViewDocType) => string;
  resolveExplicitSpeakerKeyForSegment: (segment: LayerSegmentViewDocType) => string;
  segmentSpeakerAssignmentsOnCurrentMedia: SpeakerAssignmentLike[];
  speakerVisualByTimelineUnitId: Record<string, { name: string; color: string }>;
  activeSpeakerManagementLayer: LayerDocType | null;
  speakerFilterOptionsForActions: Array<{ key: string; name: string; count: number; color?: string }>;
  selectedUnitIdsForSpeakerActions: string[];
  selectedSegmentIdsForSpeakerActions: string[];
  selectedBatchSegmentsForSpeakerActions: LayerSegmentViewDocType[];
  selectedBatchUnits: TimelineUnitView[];
  resolveSpeakerActionUnitIds: (ids: Iterable<string>) => string[];
  selectedSpeakerUnitIdsForActionsSet: Set<string>;
}

export function useSpeakerActionScopeController({
  unitsOnCurrentMedia,
  unitViewById,
  resolveUnitViewById,
  getUnitDocById,
  segmentsByLayer,
  speakers,
  layers,
  defaultTranscriptionLayerId,
  selectedLayerId,
  selectedUnitIds,
  selectedTimelineUnit,
  getUnitSpeakerKey,
}: UseSpeakerActionScopeControllerInput): UseSpeakerActionScopeControllerResult {
  const unitDocsOnCurrentMedia = useMemo(() => {
    const docs: LayerUnitDocType[] = [];
    for (const unit of unitsOnCurrentMedia) {
      if (unit.kind !== 'unit') continue;
      const doc = getUnitDocById(unit.id);
      if (doc) docs.push(doc);
    }
    return docs;
  }, [getUnitDocById, unitsOnCurrentMedia]);

  const unitDocByIdOnCurrentMedia = useMemo(
    () => new Map(unitDocsOnCurrentMedia.map((unit) => [unit.id, unit] as const)),
    [unitDocsOnCurrentMedia],
  );

  const segmentByIdForSpeakerActions = useMemo(() => {
    const map = new Map<string, LayerSegmentViewDocType>();
    for (const segments of segmentsByLayer.values()) {
      for (const segment of segments) {
        map.set(segment.id, segment);
      }
    }
    return map;
  }, [segmentsByLayer]);

  const resolveSpeakerAssignmentKeyForSegment = useCallback((segment: LayerSegmentViewDocType) => {
    const explicitSpeakerId = segment.speakerId?.trim();
    if (explicitSpeakerId) return explicitSpeakerId;
    const ownerUnitId = segment.parentUnitId ?? segment.unitId;
    const ownerUnit = ownerUnitId ? unitDocByIdOnCurrentMedia.get(ownerUnitId) : undefined;
    return ownerUnit ? getUnitSpeakerKey(ownerUnit) : '';
  }, [getUnitSpeakerKey, unitDocByIdOnCurrentMedia]);

  const resolveSpeakerKeyForSegment = useCallback((segment: LayerSegmentViewDocType) => {
    const speakerKey = resolveSpeakerAssignmentKeyForSegment(segment);
    return speakerKey || 'unknown-speaker';
  }, [resolveSpeakerAssignmentKeyForSegment]);

  const resolveExplicitSpeakerKeyForSegment = useCallback(
    (segment: LayerSegmentViewDocType) => segment.speakerId?.trim() ?? '',
    [],
  );

  const unitSpeakerAssignmentsOnCurrentMedia = useMemo(() => (
    unitDocsOnCurrentMedia.map((unit) => ({
      unitId: unit.id,
      speakerKey: getUnitSpeakerKey(unit),
    }))
  ), [getUnitSpeakerKey, unitDocsOnCurrentMedia]);

  const segmentSpeakerAssignmentsOnCurrentMedia = useMemo(() => {
    const next: SpeakerAssignmentLike[] = [];
    for (const segments of segmentsByLayer.values()) {
      for (const segment of segments) {
        const speakerKey = resolveExplicitSpeakerKeyForSegment(segment);
        if (!speakerKey) continue;
        next.push({ unitId: segment.id, speakerKey });
      }
    }
    return next;
  }, [resolveExplicitSpeakerKeyForSegment, segmentsByLayer]);

  const speakerVisualByTimelineUnitId = useMemo(() => ({
    ...buildSpeakerVisualMapFromKeys(unitSpeakerAssignmentsOnCurrentMedia, speakers),
    ...buildSpeakerVisualMapFromKeys(segmentSpeakerAssignmentsOnCurrentMedia, speakers),
  }), [segmentSpeakerAssignmentsOnCurrentMedia, speakers, unitSpeakerAssignmentsOnCurrentMedia]);

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

    return unitSpeakerAssignmentsOnCurrentMedia.filter((item) => item.speakerKey.length > 0);
  }, [activeSpeakerManagementLayer, resolveExplicitSpeakerKeyForSegment, segmentsByLayer, unitSpeakerAssignmentsOnCurrentMedia]);

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

  const selectedSegmentIdsForSpeakerActions = useMemo(() => {
    const selectedSegmentIds = resolveSegmentOnlyIdsFromSelection({
      selectedUnitIds,
      selectedTimelineUnit,
      unitViewById,
      ...(resolveUnitViewById ? { resolveUnitViewById } : {}),
    });
    return Array.from(selectedSegmentIds).filter((id) => segmentByIdForSpeakerActions.has(id));
  }, [resolveUnitViewById, segmentByIdForSpeakerActions, selectedTimelineUnit, selectedUnitIds, unitViewById]);

  const selectedBatchSegmentsForSpeakerActions = useMemo(
    () => selectedSegmentIdsForSpeakerActions
      .map((id) => segmentByIdForSpeakerActions.get(id))
      .filter((segment): segment is LayerSegmentViewDocType => Boolean(segment))
      .sort((a, b) => a.startTime - b.startTime),
    [segmentByIdForSpeakerActions, selectedSegmentIdsForSpeakerActions],
  );

  const fallbackUnitLayerId = (selectedLayerId?.trim() ?? '')
    || (defaultTranscriptionLayerId?.trim() ?? '');
  const selectedBatchUnits = useMemo(() => {
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
  }, [fallbackUnitLayerId, segmentByIdForSpeakerActions, selectedUnitIdsForSpeakerActions, unitDocByIdOnCurrentMedia]);

  const resolveSpeakerActionUnitIds = useCallback((ids: Iterable<string>) => {
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
    resolveSpeakerActionUnitIds,
    selectedSpeakerUnitIdsForActionsSet,
  };
}