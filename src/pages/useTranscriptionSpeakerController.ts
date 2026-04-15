import { useCallback, useMemo, type Dispatch, type SetStateAction } from 'react';
import type {
  LayerDocType,
  LayerSegmentContentDocType,
  LayerSegmentDocType,
  SpeakerDocType,
  UtteranceDocType,
} from '../db';
import { useSpeakerActions } from '../hooks/useSpeakerActions';
import type { LayerActionPanelKind } from '../hooks/useLayerActionPanel';
import type { SpeakerFilterOption } from '../hooks/speakerManagement/types';
import type { SaveState, TimelineUnit, TimelineUnitKind } from '../hooks/transcriptionTypes';
import type { TimelineUnitView } from '../hooks/timelineUnitView';
import type { PushTimelineEditInput } from '../hooks/useEditEventBuffer';
import { isDictKey, t as translate, tf as formatMessage, useLocale } from '../i18n';
import { fireAndForget } from '../utils/fireAndForget';
import { useSpeakerActionRoutingController } from './useSpeakerActionRoutingController';
type SegmentUpdater = (segment: LayerSegmentDocType) => LayerSegmentDocType;

interface UseTranscriptionSpeakerControllerInput {
  utterances: UtteranceDocType[];
  setUtterances: Dispatch<SetStateAction<UtteranceDocType[]>>;
  speakers: SpeakerDocType[];
  setSpeakers: Dispatch<SetStateAction<SpeakerDocType[]>>;
  /** Current-media unified rows (same source as timeline / waveform digest). */
  unitsOnCurrentMedia: ReadonlyArray<TimelineUnitView>;
  /** Resolve DB row for utterance ids (aligned with unified timeline view). */
  getUtteranceDocById: (id: string) => UtteranceDocType | undefined;
  activeTimelineUnitId: string;
  selectedUnitIds: Set<string>;
  selectedBatchUnits: TimelineUnitView[];
  selectedUnitIdsForSpeakerActionsSet: Set<string>;
  selectedTimelineUnit: TimelineUnit | null;
  selectedTimelineMediaId: string | null;
  selectedUnit: UtteranceDocType | null;
  statePhase: string;
  setUnitSelection: (primaryId: string, ids: string[]) => void;
  data: {
    pushUndo: (label: string) => void;
    undo: () => Promise<void>;
  };
  setSaveState: (state: SaveState) => void;
  getUtteranceTextForLayer: (utterance: UtteranceDocType) => string | null | undefined;
  formatTime: (seconds: number) => string;
  getUtteranceSpeakerKey: (utterance: UtteranceDocType) => string;
  activeSpeakerManagementLayer: LayerDocType | null;
  segmentsByLayer: ReadonlyMap<string, LayerSegmentDocType[]>;
  segmentContentByLayer: ReadonlyMap<string, ReadonlyMap<string, LayerSegmentContentDocType>>;
  resolveExplicitSpeakerKeyForSegment: (segment: LayerSegmentDocType) => string;
  resolveSpeakerKeyForSegment: (segment: LayerSegmentDocType) => string;
  selectedUnitIdsForSpeakerActions: string[];
  segmentByIdForSpeakerActions: ReadonlyMap<string, LayerSegmentDocType>;
  resolveSpeakerActionUtteranceIds: (ids: Iterable<string>) => string[];
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
  const { resolveSpeakerActionUtteranceIds, layerAction } = input;
  const utterancesOnCurrentMedia = useMemo(() => {
    const docs: UtteranceDocType[] = [];
    for (const unit of input.unitsOnCurrentMedia) {
      if (unit.kind !== 'utterance') continue;
      const doc = input.getUtteranceDocById(unit.id);
      if (doc) docs.push(doc);
    }
    return docs;
  }, [input.getUtteranceDocById, input.unitsOnCurrentMedia]);
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
  const selectedBatchUtterances = useMemo(
    () => input.selectedBatchUnits
      .filter((unit) => unit.kind === 'utterance')
      .map((unit) => input.getUtteranceDocById(unit.id))
      .filter((utterance): utterance is UtteranceDocType => Boolean(utterance)),
    [input.getUtteranceDocById, input.selectedBatchUnits],
  );
  const selectedBatchSegmentsForSpeakerActions = useMemo(
    () => input.selectedBatchUnits
      .filter((unit) => unit.kind === 'segment')
      .map((unit) => input.segmentByIdForSpeakerActions.get(unit.id))
      .filter((segment): segment is LayerSegmentDocType => Boolean(segment)),
    [input.segmentByIdForSpeakerActions, input.selectedBatchUnits],
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
    handleSelectSpeakerUtterances,
    handleClearSpeakerAssignments,
    handleExportSpeakerSegments,
    handleRenameSpeaker,
    handleMergeSpeaker,
    handleDeleteSpeaker,
    handleDeleteUnusedSpeakers,
    handleAssignSpeakerToUtterances,
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
    utterances: input.utterances,
    setUtterances: input.setUtterances,
    speakers: input.speakers,
    setSpeakers: input.setSpeakers,
    utterancesOnCurrentMedia,
    activeUnitId: input.activeTimelineUnitId,
    selectedUnitIds: input.selectedUnitIds,
    selectedBatchUtterances,
    isReady: input.statePhase === 'ready',
    setUnitSelection: input.setUnitSelection,
    data: input.data,
    setSaveState: input.setSaveState,
    getUtteranceTextForLayer: input.getUtteranceTextForLayer,
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
    selectedBatchSegmentsForSpeakerActions,
    selectedUnitIdsForSpeakerActions: input.selectedUnitIdsForSpeakerActions,
    segmentByIdForSpeakerActions: input.segmentByIdForSpeakerActions,
    selectedUnitIdsForSpeakerActionsSet: input.selectedUnitIdsForSpeakerActionsSet,
    resolveSpeakerActionUtteranceIds: input.resolveSpeakerActionUtteranceIds,
    selectedBatchUtterances,
    selectedSpeakerSummary,
    utterancesOnCurrentMedia,
    getUtteranceSpeakerKey: input.getUtteranceSpeakerKey,
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
    handleSelectSpeakerUtterances,
    handleClearSpeakerAssignments,
    handleExportSpeakerSegments,
    handleAssignSpeakerToUtterances,
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
    setUtterances: input.setUtterances,
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
      fireAndForget(handleAssignSpeakerToSegments(ids, speakerId));
      return;
    }
    fireAndForget(handleAssignSpeakerToUtterances(resolveSpeakerActionUtteranceIds(ids), speakerId));
  }, [handleAssignSpeakerToSegments, handleAssignSpeakerToUtterances, input.recordTimelineEdit, resolveSpeakerActionUtteranceIds]);

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
    handleAssignSpeakerToUtterances,
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
