import { useCallback, type Dispatch, type SetStateAction } from 'react';
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
import type { SpeakerFormat, SpeakerTranslate } from '../hooks/speakerManagement/speakerI18n';
import { executeSegmentSpeakerClearDialog } from './speakerActionRoutingHandlers.helpers';
import { useSpeakerActionFilterRoutingHandlers } from './useSpeakerActionFilterRoutingHandlers';
import { useSpeakerActionSelectionRoutingHandlers } from './useSpeakerActionSelectionRoutingHandlers';

type SegmentUpdater = (segment: LayerUnitDocType) => LayerUnitDocType;

export interface UseSpeakerActionRoutingHandlersInput {
  activeSpeakerManagementLayer: LayerDocType | null;
  segmentsByLayer: ReadonlyMap<string, LayerUnitDocType[]>;
  segmentContentByLayer: ReadonlyMap<string, ReadonlyMap<string, LayerUnitContentDocType>>;
  resolveExplicitSpeakerKeyForSegment: (segment: LayerUnitDocType) => string;
  selectedBatchSegmentsForSpeakerActions: LayerUnitDocType[];
  selectedStandaloneUnitIdsForSpeakerActions: string[];
  speakerFilterOptionsForActions: SpeakerFilterOption[];
  speakerOptions: SpeakerDocType[];
  speakerDraftName: string;
  batchSpeakerId: string;
  segmentSpeakerDialogState: SpeakerActionDialogState | null;
  setSegmentSpeakerDialogState: Dispatch<SetStateAction<SpeakerActionDialogState | null>>;
  segmentSpeakerDialogBusy: boolean;
  setSegmentSpeakerDialogBusy: Dispatch<SetStateAction<boolean>>;
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
  selectedTimelineUnit: TimelineUnit | null;
  selectTimelineUnit: (unit: TimelineUnit | null) => void;
  setSelectedUnitIds: Dispatch<SetStateAction<Set<string>>>;
  setActiveSpeakerFilterKey: Dispatch<SetStateAction<string>>;
  formatTime: (seconds: number) => string;
  selectedSpeakerActionCount: number;
  pushUndo: (label: string) => void;
  undo: () => Promise<void>;
  reloadSegments: () => Promise<void>;
  refreshSegmentUndoSnapshot: () => Promise<void>;
  refreshSpeakerReferenceStats: () => Promise<void>;
  updateSegmentsLocally: (segmentIds: Iterable<string>, updater: SegmentUpdater) => void;
  setSaveState: (state: SaveState) => void;
  openSpeakerManagementPanel: (draftName?: string) => void;
  t: SpeakerTranslate;
  tf: SpeakerFormat;
  handleAssignSpeakerToSegments: (
    segmentIds: Iterable<string>,
    speakerId?: string,
  ) => Promise<void>;
  createSpeakerAndAssignToSegments: (name: string, segmentIds: Iterable<string>) => Promise<void>;
  applySpeakerToMixedSelection: (speakerId?: string) => Promise<void>;
  createSpeakerAndAssignToMixedSelection: (name: string) => Promise<void>;
}

export function useSpeakerActionRoutingHandlers({
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
}: UseSpeakerActionRoutingHandlersInput) {
  const filterHandlers = useSpeakerActionFilterRoutingHandlers({
    activeSpeakerManagementLayer,
    segmentsByLayer,
    segmentContentByLayer,
    resolveExplicitSpeakerKeyForSegment,
    speakerFilterOptionsForActions,
    handleSelectSpeakerUnits,
    handleClearSpeakerAssignments,
    handleExportSpeakerSegments,
    selectedTimelineUnit,
    selectTimelineUnit,
    setSelectedUnitIds,
    setActiveSpeakerFilterKey,
    setSegmentSpeakerDialogState,
    formatTime,
    setSaveState,
    t,
    tf,
  });

  const speakerDialogStateRouted = segmentSpeakerDialogState ?? speakerDialogStateBase;

  const closeSpeakerDialogRouted = useCallback(() => {
    if (segmentSpeakerDialogState) {
      if (segmentSpeakerDialogBusy) return;
      setSegmentSpeakerDialogState(null);
      return;
    }
    closeSpeakerDialogBase();
  }, [
    closeSpeakerDialogBase,
    segmentSpeakerDialogBusy,
    segmentSpeakerDialogState,
    setSegmentSpeakerDialogState,
  ]);

  const updateSpeakerDialogDraftNameRouted = useCallback(
    (value: string) => {
      if (segmentSpeakerDialogState) return;
      updateSpeakerDialogDraftNameBase(value);
    },
    [segmentSpeakerDialogState, updateSpeakerDialogDraftNameBase],
  );

  const updateSpeakerDialogTargetKeyRouted = useCallback(
    (speakerKey: string) => {
      if (segmentSpeakerDialogState) return;
      updateSpeakerDialogTargetKeyBase(speakerKey);
    },
    [segmentSpeakerDialogState, updateSpeakerDialogTargetKeyBase],
  );

  const confirmSpeakerDialogRouted = useCallback(async () => {
    if (segmentSpeakerDialogState?.mode === 'clear') {
      setSegmentSpeakerDialogBusy(true);
      try {
        await executeSegmentSpeakerClearDialog({
          segmentSpeakerDialogState,
          getSegmentIdsForSpeakerKey: filterHandlers.getSegmentIdsForSpeakerKey,
          pushUndo,
          undo,
          updateSegmentsLocally,
          reloadSegments,
          refreshSegmentUndoSnapshot,
          refreshSpeakerReferenceStats,
          setActiveSpeakerFilterKey,
          setSaveState,
          setSegmentSpeakerDialogState,
          t,
          tf,
        });
      } finally {
        setSegmentSpeakerDialogBusy(false);
      }
      return;
    }

    await confirmSpeakerDialogBase();
    await reloadSegments();
    await refreshSegmentUndoSnapshot();
    await refreshSpeakerReferenceStats();
  }, [
    confirmSpeakerDialogBase,
    filterHandlers.getSegmentIdsForSpeakerKey,
    pushUndo,
    refreshSegmentUndoSnapshot,
    refreshSpeakerReferenceStats,
    reloadSegments,
    segmentSpeakerDialogState,
    setActiveSpeakerFilterKey,
    setSaveState,
    setSegmentSpeakerDialogBusy,
    setSegmentSpeakerDialogState,
    t,
    tf,
    undo,
    updateSegmentsLocally,
  ]);

  const selectionHandlers = useSpeakerActionSelectionRoutingHandlers({
    selectedBatchSegmentsForSpeakerActions,
    selectedStandaloneUnitIdsForSpeakerActions,
    speakerOptions,
    speakerDraftName,
    batchSpeakerId,
    selectedSpeakerActionCount,
    handleAssignSpeakerToUnits,
    handleAssignSpeakerToSelected,
    handleCreateSpeakerAndAssign,
    openSpeakerManagementPanel,
    handleAssignSpeakerToSegments,
    createSpeakerAndAssignToSegments,
    applySpeakerToMixedSelection,
    createSpeakerAndAssignToMixedSelection,
  });

  return {
    closeSpeakerDialogRouted,
    confirmSpeakerDialogRouted,
    handleAssignSpeakerToSelectedRouted: selectionHandlers.handleAssignSpeakerToSelectedRouted,
    handleClearSpeakerAssignmentsRouted: filterHandlers.handleClearSpeakerAssignmentsRouted,
    handleClearSpeakerOnSelectedRouted: selectionHandlers.handleClearSpeakerOnSelectedRouted,
    handleCreateSpeakerAndAssignRouted: selectionHandlers.handleCreateSpeakerAndAssignRouted,
    handleExportSpeakerSegmentsRouted: filterHandlers.handleExportSpeakerSegmentsRouted,
    handleSelectSpeakerUnitsRouted: filterHandlers.handleSelectSpeakerUnitsRouted,
    speakerDialogStateRouted,
    speakerQuickActions: selectionHandlers.speakerQuickActions,
    updateSpeakerDialogDraftNameRouted,
    updateSpeakerDialogTargetKeyRouted,
  };
}
