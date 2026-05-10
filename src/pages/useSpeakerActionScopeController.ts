import { useCallback, useMemo } from 'react';
import type { LayerSegmentViewDocType, LayerUnitDocType } from '../types/jieyuDbDocTypes';
import { layerUsesOwnSegments } from '../hooks/useLayerSegments';
import {
  buildSpeakerFilterOptionsFromKeys,
  buildSpeakerVisualMapFromKeys,
} from '../hooks/speakerManagement/speakerUtils';
import { resolveMappedUnitIds, resolveSegmentOnlyIdsFromSelection } from './selectionIdResolvers';
import { buildSegmentByIdForSpeakerActions } from './speakerActionScopeSegmentMap';
import { buildSegmentSpeakerAssignmentsOnCurrentMedia } from './speakerActionScopeSegmentSpeakerAssignments';
import { buildSelectedBatchUnitsForSpeakerActions } from './speakerActionScopeSelectedBatchUnits';
import { buildSelectedUnitIdsForSpeakerActions } from './speakerActionScopeSelectionIds';
import { buildSpeakerAssignmentsForActions } from './speakerActionScopeSpeakerAssignments';
import type {
  UseSpeakerActionScopeControllerInput,
  UseSpeakerActionScopeControllerResult,
} from './speakerActionScopeControllerTypes';

export type { UseSpeakerActionScopeControllerResult } from './speakerActionScopeControllerTypes';

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
  const { unitDocsOnCurrentMedia, unitDocByIdOnCurrentMedia } = useMemo(() => {
    const docs: LayerUnitDocType[] = [];
    for (const unit of unitsOnCurrentMedia) {
      if (unit.kind !== 'unit') continue;
      const doc = getUnitDocById(unit.id);
      if (doc) docs.push(doc);
    }
    return {
      unitDocsOnCurrentMedia: docs,
      unitDocByIdOnCurrentMedia: new Map(docs.map((unit) => [unit.id, unit] as const)),
    };
  }, [getUnitDocById, unitsOnCurrentMedia]);

  const segmentByIdForSpeakerActions = useMemo(
    () => buildSegmentByIdForSpeakerActions(segmentsByLayer),
    [segmentsByLayer],
  );

  const resolveSpeakerAssignmentKeyForSegment = useCallback(
    (segment: LayerSegmentViewDocType) => {
      const explicitSpeakerId = segment.speakerId?.trim();
      if (explicitSpeakerId) return explicitSpeakerId;
      const ownerUnitId = segment.parentUnitId ?? segment.unitId;
      const ownerUnit = ownerUnitId ? unitDocByIdOnCurrentMedia.get(ownerUnitId) : undefined;
      return ownerUnit ? getUnitSpeakerKey(ownerUnit) : '';
    },
    [getUnitSpeakerKey, unitDocByIdOnCurrentMedia],
  );

  const resolveSpeakerKeyForSegment = useCallback(
    (segment: LayerSegmentViewDocType) => {
      const speakerKey = resolveSpeakerAssignmentKeyForSegment(segment);
      return speakerKey || 'unknown-speaker';
    },
    [resolveSpeakerAssignmentKeyForSegment],
  );

  const resolveExplicitSpeakerKeyForSegment = useCallback(
    (segment: LayerSegmentViewDocType) => segment.speakerId?.trim() ?? '',
    [],
  );

  const unitSpeakerAssignmentsOnCurrentMedia = useMemo(
    () =>
      unitDocsOnCurrentMedia.map((unit) => ({
        unitId: unit.id,
        speakerKey: getUnitSpeakerKey(unit),
      })),
    [getUnitSpeakerKey, unitDocsOnCurrentMedia],
  );

  const segmentSpeakerAssignmentsOnCurrentMedia = useMemo(
    () =>
      buildSegmentSpeakerAssignmentsOnCurrentMedia(
        segmentsByLayer,
        resolveExplicitSpeakerKeyForSegment,
      ),
    [resolveExplicitSpeakerKeyForSegment, segmentsByLayer],
  );

  const speakerVisualByTimelineUnitId = useMemo(
    () => ({
      ...buildSpeakerVisualMapFromKeys(unitSpeakerAssignmentsOnCurrentMedia, speakers),
      ...buildSpeakerVisualMapFromKeys(segmentSpeakerAssignmentsOnCurrentMedia, speakers),
    }),
    [segmentSpeakerAssignmentsOnCurrentMedia, speakers, unitSpeakerAssignmentsOnCurrentMedia],
  );

  const activeSpeakerManagementLayer = useMemo(() => {
    if (!selectedLayerId) return null;
    const layer = layers.find((item) => item.id === selectedLayerId);
    if (!layer || layer.layerType !== 'transcription') return null;
    return layerUsesOwnSegments(layer, defaultTranscriptionLayerId) ? layer : null;
  }, [defaultTranscriptionLayerId, layers, selectedLayerId]);

  const speakerAssignmentsForActions = useMemo(
    () =>
      buildSpeakerAssignmentsForActions({
        activeSpeakerManagementLayer,
        segmentsByLayer,
        resolveExplicitSpeakerKeyForSegment,
        unitSpeakerAssignmentsOnCurrentMedia,
      }),
    [
      activeSpeakerManagementLayer,
      resolveExplicitSpeakerKeyForSegment,
      segmentsByLayer,
      unitSpeakerAssignmentsOnCurrentMedia,
    ],
  );

  const speakerFilterOptionsForActions = useMemo(
    () =>
      buildSpeakerFilterOptionsFromKeys(
        speakerAssignmentsForActions,
        speakerVisualByTimelineUnitId,
      ),
    [speakerAssignmentsForActions, speakerVisualByTimelineUnitId],
  );

  const selectedUnitIdsForSpeakerActions = useMemo(
    () =>
      buildSelectedUnitIdsForSpeakerActions({
        selectedUnitIds,
        selectedTimelineUnit,
      }),
    [selectedTimelineUnit, selectedUnitIds],
  );

  const selectedSegmentIdsForSpeakerActions = useMemo(() => {
    const selectedSegmentIds = resolveSegmentOnlyIdsFromSelection({
      selectedUnitIds,
      selectedTimelineUnit,
      unitViewById,
      ...(resolveUnitViewById ? { resolveUnitViewById } : {}),
    });
    return Array.from(selectedSegmentIds).filter((id) => segmentByIdForSpeakerActions.has(id));
  }, [
    resolveUnitViewById,
    segmentByIdForSpeakerActions,
    selectedTimelineUnit,
    selectedUnitIds,
    unitViewById,
  ]);

  const selectedBatchSegmentsForSpeakerActions = useMemo(
    () =>
      selectedSegmentIdsForSpeakerActions
        .map((id) => segmentByIdForSpeakerActions.get(id))
        .filter((segment): segment is LayerSegmentViewDocType => Boolean(segment))
        .sort((a, b) => a.startTime - b.startTime),
    [segmentByIdForSpeakerActions, selectedSegmentIdsForSpeakerActions],
  );

  const fallbackUnitLayerId =
    (selectedLayerId?.trim() ?? '') || (defaultTranscriptionLayerId?.trim() ?? '');
  const selectedBatchUnits = useMemo(
    () =>
      buildSelectedBatchUnitsForSpeakerActions({
        selectedUnitIdsForSpeakerActions,
        segmentByIdForSpeakerActions,
        unitDocByIdOnCurrentMedia,
        fallbackUnitLayerId,
      }),
    [
      fallbackUnitLayerId,
      segmentByIdForSpeakerActions,
      selectedUnitIdsForSpeakerActions,
      unitDocByIdOnCurrentMedia,
    ],
  );

  const resolveSpeakerActionUnitIds = useCallback(
    (ids: Iterable<string>) => {
      return resolveMappedUnitIds(ids, unitViewById, resolveUnitViewById);
    },
    [resolveUnitViewById, unitViewById],
  );

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
