import { useCallback, useMemo, type Dispatch, type SetStateAction } from 'react';
import type { LayerDocType, LayerUnitContentDocType, LayerUnitDocType, SpeakerDocType } from '../types/jieyuDbDocTypes';
import { useSpeakerActions } from '../hooks/useSpeakerActions';
import type { LayerActionPanelKind } from '../hooks/useLayerActionPanel';
import type { SpeakerFilterOption } from '../hooks/speakerManagement/types';
import type { SaveState, TimelineUnit, TimelineUnitKind } from '../hooks/transcriptionTypes';
import type { TimelineUnitView } from '../hooks/timelineUnitView';
import type { PushTimelineEditInput } from '../hooks/useEditEventBuffer';
import { isDictKey, t as translate, tf as formatMessage, useLocale } from '../i18n';
import { fireAndForget } from '../utils/fireAndForget';
import { useSpeakerActionRoutingController } from './useSpeakerActionRoutingController';
type SegmentUpdater = (segment: LayerUnitDocType) => LayerUnitDocType;

interface UseTranscriptionSpeakerControllerInput {
  units: LayerUnitDocType[];
  setUnits: Dispatch<SetStateAction<LayerUnitDocType[]>>;
  speakers: SpeakerDocType[];
  setSpeakers: Dispatch<SetStateAction<SpeakerDocType[]>>;
  /** Current-media unified rows (same source as timeline / waveform digest). */
  unitsOnCurrentMedia: ReadonlyArray<TimelineUnitView>;
  /** Resolve DB row for unit ids (aligned with unified timeline view). */
  getUnitDocById: (id: string) => LayerUnitDocType | undefined;
  activeTimelineUnitId: string;
  selectedUnitIds: Set<string>;
  selectedBatchSegmentsForSpeakerActions: LayerUnitDocType[];
  selectedBatchUnits: TimelineUnitView[];
  selectedTimelineUnit: TimelineUnit | null;
  selectedTimelineMediaId: string | null;
  selectedUnit: LayerUnitDocType | null;
  statePhase: string;
  setUnitSelection: (primaryId: string, ids: string[]) => void;
  data: {
    pushUndo: (label: string) => void;
    undo: () => Promise<void>;
  };
  setSaveState: (state: SaveState) => void;
  getUnitTextForLayer: (unit: LayerUnitDocType) => string | null | undefined;
  formatTime: (seconds: number) => string;
  getUnitSpeakerKey: (unit: LayerUnitDocType) => string;
  activeSpeakerManagementLayer: LayerDocType | null;
  segmentsByLayer: ReadonlyMap<string, LayerUnitDocType[]>;
  segmentContentByLayer: ReadonlyMap<string, ReadonlyMap<string, LayerUnitContentDocType>>;
  resolveExplicitSpeakerKeyForSegment: (segment: LayerUnitDocType) => string;
  resolveSpeakerKeyForSegment: (segment: LayerUnitDocType) => string;
  selectedUnitIdsForSpeakerActions: string[];
  segmentByIdForSpeakerActions: ReadonlyMap<string, LayerUnitDocType>;
  resolveSpeakerActionUnitIds: (ids: Iterable<string>) => string[];
  speakerFilterOptionsForActions: SpeakerFilterOption[];
  segmentSpeakerAssignmentsOnCurrentMedia: Array<{ speakerKey: string }>;
  selectTimelineUnit: (unit: TimelineUnit | null) => void;
  setSelectedUnitIds: Dispatch<SetStateAction<Set<string>>>;
  reloadSegments: () => Promise<void>;
  refreshSegmentUndoSnapshot: () => Promise<void>;
  updateSegmentsLocally: (segmentIds: Iterable<string>, updater: SegmentUpdater) => void;
  layerAction: {
    setLayerActionPanel: (panel: LayerActionPanelKind) => void;
  };
  recordTimelineEdit?: (event: PushTimelineEditInput) => void;
}

export function useTranscriptionSpeakerController(input: UseTranscriptionSpeakerControllerInput) {
  const { resolveSpeakerActionUnitIds, layerAction } = input;
  const unitsOnCurrentMedia = useMemo(() => {
    const docs: LayerUnitDocType[] = [];
    for (const unit of input.unitsOnCurrentMedia) {
      if (unit.kind !== 'unit') continue;
      const doc = input.getUnitDocById(unit.id);
      if (doc) docs.push(doc);
    }
    return docs;
  }, [input.getUnitDocById, input.unitsOnCurrentMedia]);
  const locale = useLocale();
  const t = useCallback((key: string) => (isDictKey(key) ? translate(locale, key) : key), [locale]);
  const tf = useCallback(
    (key: string, params?: Record<string, string | number>) => (
      isDictKey(key)
        ? formatMessage(locale, key, params ?? {})
        : key
    ),
    [locale],
  );
  const selectedBatchUnits = useMemo(
    () => input.selectedBatchUnits
      .filter((unit) => unit.kind === 'unit')
      .map((unit) => input.getUnitDocById(unit.id))
      .filter((unit): unit is LayerUnitDocType => Boolean(unit)),
    [input.getUnitDocById, input.selectedBatchUnits],
  );
  const {
    speakerOptions,
    speakerDraftName,
    setSpeakerDraftName,
    batchSpeakerId,
    setBatchSpeakerId,
    speakerSaving,
    activeSpeakerFilterKey,
    setActiveSpeakerFilterKey,
    speakerDialogState: baseSpeakerDialogState,
    speakerReferenceStats,
    speakerReferenceUnassignedStats,
    speakerReferenceStatsMediaScoped,
    speakerReferenceStatsReady,
    selectedSpeakerSummary,
    handleSelectSpeakerUnits,
    handleClearSpeakerAssignments,
    handleExportSpeakerSegments,
    handleRenameSpeaker,
    handleMergeSpeaker,
    handleDeleteSpeaker,
    handleDeleteUnusedSpeakers,
    handleAssignSpeakerToUnits,
    handleAssignSpeakerToSelected,
    handleCreateSpeakerAndAssign,
    handleCreateSpeakerOnly,
    closeSpeakerDialog: closeSpeakerDialogBase,
    updateSpeakerDialogDraftName: updateSpeakerDialogDraftNameBase,
    updateSpeakerDialogTargetKey: updateSpeakerDialogTargetKeyBase,
    confirmSpeakerDialog: confirmSpeakerDialogBase,
    refreshSpeakers,
    refreshSpeakerReferenceStats,
  } = useSpeakerActions({
    units: input.units,
    setUnits: input.setUnits,
    speakers: input.speakers,
    setSpeakers: input.setSpeakers,
    unitsOnCurrentMedia,
    activeUnitId: input.activeTimelineUnitId,
    selectedUnitIds: input.selectedUnitIds,
    selectedBatchUnits,
    isReady: input.statePhase === 'ready',
    setUnitSelection: input.setUnitSelection,
    data: input.data,
    setSaveState: input.setSaveState,
    getUnitTextForLayer: input.getUnitTextForLayer,
    formatTime: input.formatTime,
    t,
    tf,
    syncBatchSpeakerId: false,
    speakerScopeOverride: {
      speakerFilterOptions: input.speakerFilterOptionsForActions,
    },
    speakerFilterOptionsOverride: input.speakerFilterOptionsForActions,
    speakerReferenceStatsMediaId: input.selectedTimelineMediaId,
  });

  const speakerByIdMap = useMemo(
    () => new Map(speakerOptions.map((speaker) => [speaker.id, speaker] as const)),
    [speakerOptions],
  );
  const speakerNameById = useMemo(() => {
    const next: Record<string, string> = {};
    for (const speaker of speakerOptions) {
      next[speaker.id] = speaker.name;
    }
    return next;
  }, [speakerOptions]);

  const handleOpenSpeakerManagementPanel = (draftName = '') => {
    setSpeakerDraftName(draftName);
    layerAction.setLayerActionPanel('speaker-management');
  };

  const {
    speakerSavingRouted,
    selectedSpeakerSummaryForActions,
    speakerDialogStateRouted,
    closeSpeakerDialogRouted,
    updateSpeakerDialogDraftNameRouted,
    updateSpeakerDialogTargetKeyRouted,
    confirmSpeakerDialogRouted,
    handleAssignSpeakerToSegments,
    handleSelectSpeakerUnitsRouted,
    handleClearSpeakerAssignmentsRouted,
    handleExportSpeakerSegmentsRouted,
    handleAssignSpeakerToSelectedRouted,
    handleClearSpeakerOnSelectedRouted,
    handleCreateSpeakerAndAssignRouted,
    speakerQuickActions,
    selectedSpeakerIdsForTrackLock,
    selectedSpeakerNamesForTrackLock,
  } = useSpeakerActionRoutingController({
    activeSpeakerManagementLayer: input.activeSpeakerManagementLayer,
    segmentsByLayer: input.segmentsByLayer,
    segmentContentByLayer: input.segmentContentByLayer,
    resolveExplicitSpeakerKeyForSegment: input.resolveExplicitSpeakerKeyForSegment,
    resolveSpeakerKeyForSegment: input.resolveSpeakerKeyForSegment,
    selectedBatchSegmentsForSpeakerActions: input.selectedBatchSegmentsForSpeakerActions,
    selectedUnitIdsForSpeakerActions: input.selectedUnitIdsForSpeakerActions,
    segmentByIdForSpeakerActions: input.segmentByIdForSpeakerActions,
    resolveSpeakerActionUnitIds: input.resolveSpeakerActionUnitIds,
    selectedBatchUnits,
    selectedSpeakerSummary,
    unitsOnCurrentMedia,
    getUnitSpeakerKey: input.getUnitSpeakerKey,
    speakerFilterOptionsForActions: input.speakerFilterOptionsForActions,
    speakerOptions,
    speakerByIdMap,
    speakerDraftName,
    setSpeakerDraftName,
    batchSpeakerId,
    setBatchSpeakerId,
    speakerSaving,
    setActiveSpeakerFilterKey,
    speakerDialogStateBase: baseSpeakerDialogState,
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
    selectedTimelineUnit: input.selectedTimelineUnit,
    selectTimelineUnit: input.selectTimelineUnit,
    setSelectedUnitIds: input.setSelectedUnitIds,
    formatTime: input.formatTime,
    t,
    tf,
    pushUndo: input.data.pushUndo,
    undo: input.data.undo,
    reloadSegments: input.reloadSegments,
    refreshSegmentUndoSnapshot: input.refreshSegmentUndoSnapshot,
    updateSegmentsLocally: input.updateSegmentsLocally,
    setSaveState: input.setSaveState,
    setUnits: input.setUnits,
    setSpeakers: input.setSpeakers,
    openSpeakerManagementPanel: handleOpenSpeakerManagementPanel,
  });

  const handleAssignSpeakerFromMenu = useCallback((unitIds: Iterable<string>, kind: TimelineUnitKind, speakerId?: string) => {
    const ids = Array.from(unitIds);
    const head = ids[0];
    const pushEdit = input.recordTimelineEdit;
    if (head && pushEdit) {
      const detailParts: string[] = [];
      if (speakerId) detailParts.push(`speakerId=${speakerId}`);
      if (ids.length > 1) detailParts.push(`count=${ids.length}`);
      pushEdit({
        action: 'assign_speaker',
        unitId: head,
        unitKind: kind,
        ...(detailParts.length > 0 ? { detail: detailParts.join(';') } : {}),
      });
    }
    if (kind === 'segment') {
      fireAndForget(handleAssignSpeakerToSegments(ids, speakerId), { context: 'src/pages/useTranscriptionSpeakerController.ts:L250', policy: 'user-visible' });
      return;
    }
    fireAndForget(handleAssignSpeakerToUnits(resolveSpeakerActionUnitIds(ids), speakerId), { context: 'src/pages/useTranscriptionSpeakerController.ts:L253', policy: 'user-visible' });
  }, [handleAssignSpeakerToSegments, handleAssignSpeakerToUnits, input.recordTimelineEdit, resolveSpeakerActionUnitIds]);

  return {
    speakerOptions,
    speakerDraftName,
    setSpeakerDraftName,
    batchSpeakerId,
    setBatchSpeakerId,
    speakerSavingRouted,
    activeSpeakerFilterKey,
    setActiveSpeakerFilterKey,
    speakerReferenceStats,
    speakerReferenceUnassignedStats,
    speakerReferenceStatsMediaScoped,
    speakerReferenceStatsReady,
    speakerDialogStateRouted,
    selectedSpeakerSummaryForActions,
    handleSelectSpeakerUnitsRouted,
    handleClearSpeakerAssignmentsRouted,
    handleExportSpeakerSegmentsRouted,
    handleRenameSpeaker,
    handleMergeSpeaker,
    handleDeleteSpeaker,
    handleDeleteUnusedSpeakers,
    handleAssignSpeakerToSelectedRouted,
    handleCreateSpeakerAndAssignRouted,
    handleCreateSpeakerOnly,
    closeSpeakerDialogRouted,
    updateSpeakerDialogDraftNameRouted,
    updateSpeakerDialogTargetKeyRouted,
    confirmSpeakerDialogRouted,
    handleAssignSpeakerToSegments,
    handleAssignSpeakerToUnits,
    handleClearSpeakerOnSelectedRouted,
    speakerQuickActions,
    selectedSpeakerIdsForTrackLock,
    selectedSpeakerNamesForTrackLock,
    speakerByIdMap,
    speakerNameById,
    handleOpenSpeakerManagementPanel,
    handleAssignSpeakerFromMenu,
  };
}
