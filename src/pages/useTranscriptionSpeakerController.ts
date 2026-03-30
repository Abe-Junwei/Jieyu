import { useCallback, useMemo, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
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
import { fireAndForget } from '../utils/fireAndForget';
import { useSpeakerActionRoutingController } from './useSpeakerActionRoutingController';
import { useSpeakerFocusController } from './useSpeakerFocusController';

type SpeakerFocusMode = 'all' | 'focus-soft' | 'focus-hard';
type SegmentUpdater = (segment: LayerSegmentDocType) => LayerSegmentDocType;

interface UseTranscriptionSpeakerControllerInput {
  utterances: UtteranceDocType[];
  setUtterances: Dispatch<SetStateAction<UtteranceDocType[]>>;
  speakers: SpeakerDocType[];
  setSpeakers: Dispatch<SetStateAction<SpeakerDocType[]>>;
  utterancesOnCurrentMedia: UtteranceDocType[];
  selectedTimelineUtteranceId: string;
  selectedUtteranceIds: Set<string>;
  selectedBatchUtterances: UtteranceDocType[];
  selectedUtteranceIdsForSpeakerActionsSet: Set<string>;
  selectedTimelineUnit: TimelineUnit | null;
  selectedTimelineMediaId: string | null;
  selectedUtterance: UtteranceDocType | null;
  statePhase: string;
  setUtteranceSelection: (primaryId: string, ids: string[]) => void;
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
  selectedBatchSegmentsForSpeakerActions: LayerSegmentDocType[];
  selectedUnitIdsForSpeakerActions: string[];
  segmentByIdForSpeakerActions: ReadonlyMap<string, LayerSegmentDocType>;
  resolveSpeakerActionUtteranceIds: (ids: Iterable<string>) => string[];
  speakerFilterOptionsForActions: SpeakerFilterOption[];
  segmentSpeakerAssignmentsOnCurrentMedia: Array<{ speakerKey: string }>;
  speakerFocusMode: SpeakerFocusMode;
  setSpeakerFocusMode: Dispatch<SetStateAction<SpeakerFocusMode>>;
  speakerFocusTargetKey: string | null;
  setSpeakerFocusTargetKey: Dispatch<SetStateAction<string | null>>;
  speakerFocusTargetMemoryByMediaRef: MutableRefObject<Record<string, string | null>>;
  selectTimelineUnit: (unit: TimelineUnit | null) => void;
  setSelectedUtteranceIds: Dispatch<SetStateAction<Set<string>>>;
  reloadSegments: () => Promise<void>;
  refreshSegmentUndoSnapshot: () => Promise<void>;
  updateSegmentsLocally: (segmentIds: Iterable<string>, updater: SegmentUpdater) => void;
  setLayerRailTab: Dispatch<SetStateAction<'layers' | 'links'>>;
  setIsLayerRailCollapsed: Dispatch<SetStateAction<boolean>>;
  layerAction: {
    setLayerActionPanel: (panel: LayerActionPanelKind) => void;
  };
}

export function useTranscriptionSpeakerController(input: UseTranscriptionSpeakerControllerInput) {
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
    utterancesOnCurrentMedia: input.utterancesOnCurrentMedia,
    activeUtteranceUnitId: input.selectedTimelineUtteranceId,
    selectedUtteranceIds: input.selectedUtteranceIds,
    selectedBatchUtterances: input.selectedBatchUtterances,
    isReady: input.statePhase === 'ready',
    setUtteranceSelection: input.setUtteranceSelection,
    data: input.data,
    setSaveState: input.setSaveState,
    getUtteranceTextForLayer: input.getUtteranceTextForLayer,
    formatTime: input.formatTime,
    syncBatchSpeakerId: false,
    speakerScopeOverride: {
      speakerFilterOptions: input.speakerFilterOptionsForActions,
    },
    speakerFilterOptionsOverride: input.speakerFilterOptionsForActions,
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

  const handleOpenSpeakerManagementPanel = useCallback((draftName = '') => {
    input.setLayerRailTab('layers');
    input.setIsLayerRailCollapsed(false);
    setSpeakerDraftName(draftName);
    input.layerAction.setLayerActionPanel('speaker-management');
  }, [input, setSpeakerDraftName]);

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
    selectedUtteranceIdsForSpeakerActionsSet: input.selectedUtteranceIdsForSpeakerActionsSet,
    resolveSpeakerActionUtteranceIds: input.resolveSpeakerActionUtteranceIds,
    selectedBatchUtterances: input.selectedBatchUtterances,
    selectedSpeakerSummary,
    utterancesOnCurrentMedia: input.utterancesOnCurrentMedia,
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
    setSelectedUtteranceIds: input.setSelectedUtteranceIds,
    formatTime: input.formatTime,
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

  const {
    speakerFocusOptions,
    resolvedSpeakerFocusTargetKey,
    resolvedSpeakerFocusTargetName,
    cycleSpeakerFocusMode,
    handleSpeakerFocusTargetChange,
  } = useSpeakerFocusController({
    speakerFocusMode: input.speakerFocusMode,
    setSpeakerFocusMode: input.setSpeakerFocusMode,
    speakerFocusTargetKey: input.speakerFocusTargetKey,
    setSpeakerFocusTargetKey: input.setSpeakerFocusTargetKey,
    speakerFocusTargetMemoryByMediaRef: input.speakerFocusTargetMemoryByMediaRef,
    utterancesOnCurrentMedia: input.utterancesOnCurrentMedia,
    segmentSpeakerAssignmentsOnCurrentMedia: input.segmentSpeakerAssignmentsOnCurrentMedia,
    speakerOptions,
    selectedTimelineMediaId: input.selectedTimelineMediaId,
    selectedTimelineUnit: input.selectedTimelineUnit,
    selectedUtterance: input.selectedUtterance,
    segmentByIdForSpeakerActions: input.segmentByIdForSpeakerActions,
    resolveSpeakerKeyForSegment: input.resolveSpeakerKeyForSegment,
    getUtteranceSpeakerKey: input.getUtteranceSpeakerKey,
    speakerByIdMap: new Map(speakerByIdMap),
  });

  const handleAssignSpeakerFromMenu = useCallback((unitIds: Iterable<string>, kind: TimelineUnitKind, speakerId?: string) => {
    if (kind === 'segment') {
      fireAndForget(handleAssignSpeakerToSegments(Array.from(unitIds), speakerId));
      return;
    }
    fireAndForget(handleAssignSpeakerToUtterances(input.resolveSpeakerActionUtteranceIds(unitIds), speakerId));
  }, [handleAssignSpeakerToSegments, handleAssignSpeakerToUtterances, input]);

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
    speakerFocusOptions,
    resolvedSpeakerFocusTargetKey,
    resolvedSpeakerFocusTargetName,
    cycleSpeakerFocusMode,
    handleSpeakerFocusTargetChange,
    handleOpenSpeakerManagementPanel,
    handleAssignSpeakerFromMenu,
  };
}