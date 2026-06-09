import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react';
import type {
  LayerDocType,
  LayerUnitContentDocType,
  LayerUnitDocType,
  SpeakerDocType,
} from '../types/jieyuDbDocTypes';
import type { SaveState, TimelineUnit } from '../hooks/transcription/transcriptionTypes';
import type {
  SpeakerActionDialogState,
  SpeakerFilterOption,
} from '../hooks/speakerManagement/types';
import { getSpeakerDisplayNameByKey } from '../hooks/speakerManagement/speakerUtils';
import {
  buildMixedSelectionSpeakerSummary,
  type SpeakerFormat,
  type SpeakerTranslate,
} from '../hooks/speakerManagement/speakerI18n';
import { createMetricTags, recordMetric } from '../observability/metrics';
import { useSpeakerActionMixedSelectionMutationCluster } from './useSpeakerActionMixedSelectionMutationCluster';
import { useSpeakerActionSegmentMutationCluster } from './useSpeakerActionSegmentMutationCluster';
import { useSpeakerActionRoutingHandlers } from './useSpeakerActionRoutingHandlers';

type SegmentUpdater = (segment: LayerUnitDocType) => LayerUnitDocType;

interface UseSpeakerActionRoutingControllerInput {
  activeSpeakerManagementLayer: LayerDocType | null;
  segmentsByLayer: ReadonlyMap<string, LayerUnitDocType[]>;
  segmentContentByLayer: ReadonlyMap<string, ReadonlyMap<string, LayerUnitContentDocType>>;
  resolveExplicitSpeakerKeyForSegment: (segment: LayerUnitDocType) => string;
  resolveSpeakerKeyForSegment: (segment: LayerUnitDocType) => string;
  selectedBatchSegmentsForSpeakerActions: LayerUnitDocType[];
  selectedUnitIdsForSpeakerActions: string[];
  segmentByIdForSpeakerActions: ReadonlyMap<string, LayerUnitDocType>;
  resolveSpeakerActionUnitIds: (ids: Iterable<string>) => string[];
  selectedBatchUnits: LayerUnitDocType[];
  selectedSpeakerSummary: string;
  unitsOnCurrentMedia: LayerUnitDocType[];
  getUnitSpeakerKey: (unit: LayerUnitDocType) => string;
  speakerFilterOptionsForActions: SpeakerFilterOption[];
  speakerOptions: SpeakerDocType[];
  speakerByIdMap: ReadonlyMap<string, SpeakerDocType>;
  speakerDraftName: string;
  setSpeakerDraftName: Dispatch<SetStateAction<string>>;
  batchSpeakerId: string;
  setBatchSpeakerId: Dispatch<SetStateAction<string>>;
  speakerSaving: boolean;
  setActiveSpeakerFilterKey: Dispatch<SetStateAction<string>>;
  speakerDialogStateBase: SpeakerActionDialogState | null;
  closeSpeakerDialogBase: () => void;
  updateSpeakerDialogDraftNameBase: (value: string) => void;
  updateSpeakerDialogTargetKeyBase: (speakerKey: string) => void;
  confirmSpeakerDialogBase: () => Promise<void>;
  handleSelectSpeakerUnits: (speakerKey: string) => void;
  handleClearSpeakerAssignments: (speakerKey: string) => void;
  handleExportSpeakerSegments: (speakerKey: string) => void;
  handleAssignSpeakerToUnits: (unitIds: Iterable<string>, speakerId?: string) => Promise<void>;
  handleAssignSpeakerToSelected: () => Promise<void>;
  handleCreateSpeakerAndAssign: () => Promise<void>;
  refreshSpeakers: () => Promise<void>;
  refreshSpeakerReferenceStats: () => Promise<void>;
  selectedTimelineUnit: TimelineUnit | null;
  selectTimelineUnit: (unit: TimelineUnit | null) => void;
  setSelectedUnitIds: Dispatch<SetStateAction<Set<string>>>;
  formatTime: (seconds: number) => string;
  t: SpeakerTranslate;
  tf: SpeakerFormat;
  pushUndo: (label: string) => void;
  undo: () => Promise<void>;
  reloadSegments: () => Promise<void>;
  refreshSegmentUndoSnapshot: () => Promise<void>;
  updateSegmentsLocally: (segmentIds: Iterable<string>, updater: SegmentUpdater) => void;
  setSaveState: (state: SaveState) => void;
  setUnits: Dispatch<SetStateAction<LayerUnitDocType[]>>;
  setSpeakers: Dispatch<SetStateAction<SpeakerDocType[]>>;
  openSpeakerManagementPanel: (draftName?: string) => void;
}

interface UseSpeakerActionRoutingControllerResult {
  speakerSavingRouted: boolean;
  selectedSpeakerSummaryForActions: string;
  speakerDialogStateRouted: SpeakerActionDialogState | null;
  closeSpeakerDialogRouted: () => void;
  updateSpeakerDialogDraftNameRouted: (value: string) => void;
  updateSpeakerDialogTargetKeyRouted: (speakerKey: string) => void;
  confirmSpeakerDialogRouted: () => Promise<void>;
  handleAssignSpeakerToSegments: (
    segmentIds: Iterable<string>,
    speakerId?: string,
  ) => Promise<void>;
  handleSelectSpeakerUnitsRouted: (speakerKey: string) => void;
  handleClearSpeakerAssignmentsRouted: (speakerKey: string) => void;
  handleExportSpeakerSegmentsRouted: (speakerKey: string) => void;
  handleAssignSpeakerToSelectedRouted: () => Promise<void>;
  handleClearSpeakerOnSelectedRouted: () => Promise<void>;
  handleCreateSpeakerAndAssignRouted: () => Promise<void>;
  speakerQuickActions: {
    selectedCount: number;
    speakerOptions: Array<{ id: string; name: string }>;
    onAssignToSelection: (speakerId: string) => void;
    onClearSelection: () => void;
    onOpenCreateAndAssignPanel: () => void;
  };
  selectedSpeakerIdsForTrackLock: string[];
  selectedSpeakerNamesForTrackLock: string[];
}

export function useSpeakerActionRoutingController({
  activeSpeakerManagementLayer,
  segmentsByLayer,
  segmentContentByLayer,
  resolveExplicitSpeakerKeyForSegment,
  resolveSpeakerKeyForSegment,
  selectedBatchSegmentsForSpeakerActions,
  selectedUnitIdsForSpeakerActions,
  segmentByIdForSpeakerActions,
  resolveSpeakerActionUnitIds,
  selectedBatchUnits,
  selectedSpeakerSummary,
  unitsOnCurrentMedia,
  getUnitSpeakerKey,
  speakerFilterOptionsForActions,
  speakerOptions,
  speakerByIdMap,
  speakerDraftName,
  setSpeakerDraftName,
  batchSpeakerId,
  setBatchSpeakerId,
  speakerSaving,
  setActiveSpeakerFilterKey,
  speakerDialogStateBase,
  closeSpeakerDialogBase,
  updateSpeakerDialogDraftNameBase,
  updateSpeakerDialogTargetKeyBase,
  confirmSpeakerDialogBase,
  handleSelectSpeakerUnits,
  handleClearSpeakerAssignments,
  handleExportSpeakerSegments,
  handleAssignSpeakerToUnits,
  handleAssignSpeakerToSelected,
  handleCreateSpeakerAndAssign,
  refreshSpeakers,
  refreshSpeakerReferenceStats,
  selectedTimelineUnit,
  selectTimelineUnit,
  setSelectedUnitIds,
  formatTime,
  t,
  tf,
  pushUndo,
  undo,
  reloadSegments,
  refreshSegmentUndoSnapshot,
  updateSegmentsLocally,
  setSaveState,
  setUnits,
  setSpeakers,
  openSpeakerManagementPanel,
}: UseSpeakerActionRoutingControllerInput): UseSpeakerActionRoutingControllerResult {
  const [segmentSpeakerDialogState, setSegmentSpeakerDialogState] =
    useState<SpeakerActionDialogState | null>(null);
  const [segmentSpeakerDialogBusy, setSegmentSpeakerDialogBusy] = useState(false);
  const speakerSavingRouted = speakerSaving || segmentSpeakerDialogBusy;

  const selectedStandaloneUnitIdsForSpeakerActions = useMemo(
    () =>
      resolveSpeakerActionUnitIds(
        selectedUnitIdsForSpeakerActions.filter((id) => !segmentByIdForSpeakerActions.has(id)),
      ),
    [resolveSpeakerActionUnitIds, segmentByIdForSpeakerActions, selectedUnitIdsForSpeakerActions],
  );

  const recordMixedSpeakerSelectionApply = useCallback(
    (action: 'assign' | 'clear' | 'create'): void => {
      try {
        recordMetric({
          id: 'business.transcription.speaker_mixed_selection_apply_count',
          value: 1,
          tags: createMetricTags('useSpeakerActionRoutingController', {
            action,
            segmentCount: selectedBatchSegmentsForSpeakerActions.length,
            unitCount: selectedStandaloneUnitIdsForSpeakerActions.length,
          }),
        });
      } catch {
        // 忽略指标上报异常，避免影响主流程 | Ignore metric reporting errors to avoid affecting the main flow
      }
    },
    [
      selectedBatchSegmentsForSpeakerActions.length,
      selectedStandaloneUnitIdsForSpeakerActions.length,
    ],
  );

  const getSpeakerNameForDisplay = useCallback(
    (speakerKey: string) => getSpeakerDisplayNameByKey(speakerKey, speakerByIdMap),
    [speakerByIdMap],
  );

  const selectedSpeakerActionCount =
    selectedBatchSegmentsForSpeakerActions.length +
    selectedStandaloneUnitIdsForSpeakerActions.length;

  const selectedSpeakerSummaryForActions = useMemo(() => {
    if (
      selectedBatchSegmentsForSpeakerActions.length === 0 &&
      selectedStandaloneUnitIdsForSpeakerActions.length === 0
    ) {
      return selectedSpeakerSummary;
    }
    const totalSelectedCount =
      selectedBatchSegmentsForSpeakerActions.length +
      selectedStandaloneUnitIdsForSpeakerActions.length;
    const assignedKeys = [
      ...selectedBatchSegmentsForSpeakerActions
        .map(resolveSpeakerKeyForSegment)
        .filter((key) => key !== 'unknown-speaker'),
      ...selectedStandaloneUnitIdsForSpeakerActions
        .map((unitId) => unitsOnCurrentMedia.find((unit) => unit.id === unitId))
        .filter((unit): unit is LayerUnitDocType => Boolean(unit))
        .map((unit) => getUnitSpeakerKey(unit))
        .filter((key) => key.length > 0),
    ];
    return buildMixedSelectionSpeakerSummary({
      assignedKeys,
      totalSelectedCount,
      getSpeakerName: getSpeakerNameForDisplay,
      t,
      tf,
    });
  }, [
    getSpeakerNameForDisplay,
    getUnitSpeakerKey,
    resolveSpeakerKeyForSegment,
    selectedBatchSegmentsForSpeakerActions,
    selectedSpeakerSummary,
    selectedStandaloneUnitIdsForSpeakerActions,
    t,
    tf,
    unitsOnCurrentMedia,
  ]);

  useEffect(() => {
    if (selectedBatchSegmentsForSpeakerActions.length > 0) {
      const explicitKeys = selectedBatchSegmentsForSpeakerActions
        .map((segment) => segment.speakerId?.trim() ?? '')
        .filter((key) => key.length > 0);
      if (explicitKeys.length !== selectedBatchSegmentsForSpeakerActions.length) {
        setBatchSpeakerId('');
        return;
      }
      const [firstKey] = explicitKeys;
      if (!firstKey) {
        setBatchSpeakerId('');
        return;
      }
      const allSame = explicitKeys.every((key) => key === firstKey);
      setBatchSpeakerId(allSame ? firstKey : '');
      return;
    }

    if (selectedBatchUnits.length === 0) {
      setBatchSpeakerId('');
      return;
    }
    const firstSpeakerId = selectedBatchUnits[0]?.speakerId?.trim() ?? '';
    if (!firstSpeakerId) {
      setBatchSpeakerId('');
      return;
    }
    const allSame = selectedBatchUnits.every(
      (unit) => (unit.speakerId?.trim() ?? '') === firstSpeakerId,
    );
    setBatchSpeakerId(allSame ? firstSpeakerId : '');
  }, [selectedBatchSegmentsForSpeakerActions, selectedBatchUnits, setBatchSpeakerId]);

  const { handleAssignSpeakerToSegments, createSpeakerAndAssignToSegments } =
    useSpeakerActionSegmentMutationCluster({
      speakerSavingRouted,
      speakerOptions,
      pushUndo,
      undo,
      reloadSegments,
      refreshSegmentUndoSnapshot,
      refreshSpeakerReferenceStats,
      refreshSpeakers,
      updateSegmentsLocally,
      setBatchSpeakerId,
      setSpeakerDraftName,
      setSaveState,
      t,
      tf,
    });

  const { applySpeakerToMixedSelection, createSpeakerAndAssignToMixedSelection } =
    useSpeakerActionMixedSelectionMutationCluster({
      speakerSavingRouted,
      selectedBatchSegmentsForSpeakerActions,
      selectedStandaloneUnitIdsForSpeakerActions,
      speakerOptions,
      speakerByIdMap,
      recordMixedSpeakerSelectionApply,
      pushUndo,
      undo,
      reloadSegments,
      refreshSegmentUndoSnapshot,
      refreshSpeakerReferenceStats,
      refreshSpeakers,
      updateSegmentsLocally,
      setBatchSpeakerId,
      setSpeakerDraftName,
      setSaveState,
      setUnits,
      setSpeakers,
      t,
      tf,
    });

  const handlers = useSpeakerActionRoutingHandlers({
    activeSpeakerManagementLayer,
    segmentsByLayer,
    segmentContentByLayer,
    resolveExplicitSpeakerKeyForSegment,
    selectedBatchSegmentsForSpeakerActions,
    selectedStandaloneUnitIdsForSpeakerActions,
    speakerFilterOptionsForActions,
    speakerOptions,
    speakerDraftName,
    batchSpeakerId,
    segmentSpeakerDialogState,
    setSegmentSpeakerDialogState,
    segmentSpeakerDialogBusy,
    setSegmentSpeakerDialogBusy,
    speakerDialogStateBase,
    closeSpeakerDialogBase,
    updateSpeakerDialogDraftNameBase,
    updateSpeakerDialogTargetKeyBase,
    confirmSpeakerDialogBase,
    handleSelectSpeakerUnits,
    handleClearSpeakerAssignments,
    handleExportSpeakerSegments,
    handleAssignSpeakerToUnits,
    handleAssignSpeakerToSelected,
    handleCreateSpeakerAndAssign,
    selectedTimelineUnit,
    selectTimelineUnit,
    setSelectedUnitIds,
    setActiveSpeakerFilterKey,
    formatTime,
    selectedSpeakerActionCount,
    pushUndo,
    undo,
    reloadSegments,
    refreshSegmentUndoSnapshot,
    refreshSpeakerReferenceStats,
    updateSegmentsLocally,
    setSaveState,
    openSpeakerManagementPanel,
    t,
    tf,
    handleAssignSpeakerToSegments,
    createSpeakerAndAssignToSegments,
    applySpeakerToMixedSelection,
    createSpeakerAndAssignToMixedSelection,
  });

  const selectedSpeakerIdsForTrackLock = useMemo(() => {
    if (selectedBatchSegmentsForSpeakerActions.length > 0) {
      const unique = new Set<string>();
      for (const segment of selectedBatchSegmentsForSpeakerActions) {
        const speakerKey = resolveSpeakerKeyForSegment(segment);
        if (speakerKey === 'unknown-speaker') continue;
        unique.add(speakerKey);
      }
      return Array.from(unique);
    }
    const unitMap = new Map(unitsOnCurrentMedia.map((unit) => [unit.id, unit] as const));
    const unique = new Set<string>();
    for (const unitId of selectedStandaloneUnitIdsForSpeakerActions) {
      const unit = unitMap.get(unitId);
      if (!unit) continue;
      const speakerKey = getUnitSpeakerKey(unit);
      if (!speakerKey) continue;
      unique.add(speakerKey);
    }
    return Array.from(unique);
  }, [
    getUnitSpeakerKey,
    resolveSpeakerKeyForSegment,
    selectedBatchSegmentsForSpeakerActions,
    selectedStandaloneUnitIdsForSpeakerActions,
    unitsOnCurrentMedia,
  ]);

  const selectedSpeakerNamesForTrackLock = useMemo(
    () =>
      selectedSpeakerIdsForTrackLock.map((id) => getSpeakerDisplayNameByKey(id, speakerByIdMap)),
    [selectedSpeakerIdsForTrackLock, speakerByIdMap],
  );

  return {
    speakerSavingRouted,
    selectedSpeakerSummaryForActions,
    handleAssignSpeakerToSegments,
    selectedSpeakerIdsForTrackLock,
    selectedSpeakerNamesForTrackLock,
    ...handlers,
  };
}
