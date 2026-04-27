import type { CSSProperties } from 'react';
import type { TranscriptionPageTimelineHorizontalMediaLanesProps } from './TranscriptionPage.TimelineContent';
import type { TimelineHostSharedLaneProps } from './timelineHostProjectionTypes';
import type { OrchestratorWaveformContentProps } from './OrchestratorWaveformContent';
import type { TranscriptionPageSidePaneProps } from './TranscriptionPage.SidePane';
import type { TranscriptionOverlaysProps } from '../components/TranscriptionOverlays';
import type { TranscriptionPageReadyWorkspaceLayoutProps } from './TranscriptionPage.ReadyWorkspaceLayout';
import type { Locale } from '../i18n';
import { recordTranscriptionKeyboardAction } from '../utils/transcriptionKeyboardActionTelemetry';
export { buildReadyWorkspaceStageProps, type BuildReadyWorkspaceStagePropsInput } from './transcriptionReadyWorkspaceStagePropsBuilder';

type HorizontalMediaLanesProps = TranscriptionPageTimelineHorizontalMediaLanesProps;
type ReadyWorkspaceConflictReviewDrawerProps = NonNullable<TranscriptionPageReadyWorkspaceLayoutProps['conflictReviewDrawerProps']>;

/**
 * ReadyWorkspace 侧字段名与 TranscriptionTimelineHorizontalMediaLanes props 的对应关系
 * （避免 any，并保持与 buildSharedLaneProps 映射一致）。
 * 新建层弹窗的语言/正字法默认留空，不再从项目主语言注入。
 */
export type BuildSharedLanePropsInput = TimelineHostSharedLaneProps & {
  activeTimelineUnitId: string;
  orderedLayers: HorizontalMediaLanesProps['allLayersOrdered'];
  reorderLayers: HorizontalMediaLanesProps['onReorderLayers'];
  handleFocusLayerRow: HorizontalMediaLanesProps['onFocusLayer'];
  showAllLayerConnectors: boolean;
  handleToggleAllLayerConnectors: HorizontalMediaLanesProps['onToggleConnectors'];
  timelineLaneHeights: HorizontalMediaLanesProps['laneHeights'];
  handleTimelineLaneHeightChange: HorizontalMediaLanesProps['onLaneHeightChange'];
  transcriptionTrackMode: HorizontalMediaLanesProps['trackDisplayMode'];
  handleToggleTrackDisplayMode: HorizontalMediaLanesProps['onToggleTrackDisplayMode'];
  setTrackDisplayMode: HorizontalMediaLanesProps['onSetTrackDisplayMode'];
  effectiveLaneLockMap: HorizontalMediaLanesProps['laneLockMap'];
  handleLockSelectedSpeakersToLane: HorizontalMediaLanesProps['onLockSelectedSpeakersToLane'];
  handleUnlockSelectedSpeakers: HorizontalMediaLanesProps['onUnlockSelectedSpeakers'];
  handleResetTrackAutoLayout: HorizontalMediaLanesProps['onResetTrackAutoLayout'];
  selectedSpeakerNamesForTrackLock: HorizontalMediaLanesProps['selectedSpeakerNamesForLock'];
  handleLaneLabelWidthResizeStart: HorizontalMediaLanesProps['onLaneLabelWidthResize'];
  /** 与 `buildReadyWorkspaceLayoutStyle` 中 `--timeline-content-offset` 等价的像素和 | Matches layout gutter */
  timelineContentGutterPx: HorizontalMediaLanesProps['timelineContentGutterPx'];
};

export type BuiltSharedLaneProps = Omit<
  HorizontalMediaLanesProps,
  | 'playerDuration'
  | 'timelineExtentSec'
  | 'zoomPxPerSec'
  | 'lassoRect'
  | 'timelineRenderUnits'
  | 'defaultTranscriptionLayerId'
  | 'renderAnnotationItem'
  | 'speakerSortKeyById'
>;

/** exactOptionalPropertyTypes：去掉显式 undefined，避免把可选键写成 undefined。 */
export function dropUndefinedKeys<T extends Record<string, unknown>>(obj: T): T {
  const next = { ...obj } as Record<string, unknown>;
  for (const key of Object.keys(next)) {
    if (next[key] === undefined) delete next[key];
  }
  return next as T;
}

export function buildSharedLaneProps(input: BuildSharedLanePropsInput): BuiltSharedLaneProps {
  return dropUndefinedKeys({
    transcriptionLayers: input.transcriptionLayers,
    translationLayers: input.translationLayers,
    activeTextTimelineMode: input.activeTextTimelineMode ?? null,
    timelineUnitViewIndex: input.timelineUnitViewIndex,
    ...(input.segmentParentUnitLookup !== undefined ? { segmentParentUnitLookup: input.segmentParentUnitLookup } : {}),
    segmentsByLayer: input.segmentsByLayer,
    segmentContentByLayer: input.segmentContentByLayer,
    saveSegmentContentForLayer: input.saveSegmentContentForLayer,
    selectedTimelineUnit: input.selectedTimelineUnit,
    flashLayerRowId: input.flashLayerRowId,
    focusedLayerRowId: input.focusedLayerRowId,
    activeUnitId: input.activeTimelineUnitId,
    allLayersOrdered: input.orderedLayers,
    onReorderLayers: input.reorderLayers,
    deletableLayers: input.deletableLayers,
    onFocusLayer: input.handleFocusLayerRow,
    layerLinks: input.layerLinks,
    showConnectors: input.showAllLayerConnectors,
    onToggleConnectors: input.handleToggleAllLayerConnectors,
    laneHeights: input.timelineLaneHeights,
    onLaneHeightChange: input.handleTimelineLaneHeightChange,
    trackDisplayMode: input.transcriptionTrackMode,
    onToggleTrackDisplayMode: input.handleToggleTrackDisplayMode,
    onSetTrackDisplayMode: input.setTrackDisplayMode,
    laneLockMap: input.effectiveLaneLockMap,
    onLockSelectedSpeakersToLane: input.handleLockSelectedSpeakersToLane,
    onUnlockSelectedSpeakers: input.handleUnlockSelectedSpeakers,
    onResetTrackAutoLayout: input.handleResetTrackAutoLayout,
    selectedSpeakerNamesForLock: input.selectedSpeakerNamesForTrackLock,
    speakerLayerLayout: input.speakerLayerLayout,
    activeSpeakerFilterKey: input.activeSpeakerFilterKey,
    speakerQuickActions: input.speakerQuickActions,
    onLaneLabelWidthResize: input.handleLaneLabelWidthResizeStart,
    timelineContentGutterPx: input.timelineContentGutterPx,
    translationAudioByLayer: input.translationAudioByLayer,
    mediaItems: input.mediaItems,
    recording: input.recording,
    recordingUnitId: input.recordingUnitId,
    recordingLayerId: input.recordingLayerId,
    startRecordingForUnit: input.startRecordingForUnit,
    stopRecording: input.stopRecording,
    deleteVoiceTranslation: input.deleteVoiceTranslation,
    transcribeVoiceTranslation: input.transcribeVoiceTranslation,
    displayStyleControl: input.displayStyleControl,
  }) as BuiltSharedLaneProps;
}

type ReadyWorkspaceSidePaneSpeakerManagement = TranscriptionPageSidePaneProps['speakerManagement'];
type ReadyWorkspaceSidePaneSidebarProps = TranscriptionPageSidePaneProps['sidebarProps'];

export type BuildReadyWorkspaceSidePanePropsInput = {
  selectedUnitIds: TranscriptionPageSidePaneProps['selectedUnitIds'];
  handleAssignSpeakerToSelectedRouted: TranscriptionPageSidePaneProps['handleAssignSpeakerToSelectedRouted'];
  handleClearSpeakerOnSelectedRouted: TranscriptionPageSidePaneProps['handleClearSpeakerOnSelectedRouted'];
  speakerOptions: ReadyWorkspaceSidePaneSpeakerManagement['speakerOptions'];
  speakerDraftName: ReadyWorkspaceSidePaneSpeakerManagement['speakerDraftName'];
  setSpeakerDraftName: ReadyWorkspaceSidePaneSpeakerManagement['setSpeakerDraftName'];
  batchSpeakerId: ReadyWorkspaceSidePaneSpeakerManagement['batchSpeakerId'];
  setBatchSpeakerId: ReadyWorkspaceSidePaneSpeakerManagement['setBatchSpeakerId'];
  speakerSaving: ReadyWorkspaceSidePaneSpeakerManagement['speakerSaving'];
  activeSpeakerFilterKey: ReadyWorkspaceSidePaneSpeakerManagement['activeSpeakerFilterKey'];
  setActiveSpeakerFilterKey: ReadyWorkspaceSidePaneSpeakerManagement['setActiveSpeakerFilterKey'];
  speakerDialogState: ReadyWorkspaceSidePaneSpeakerManagement['speakerDialogState'];
  speakerVisualByUnitId: ReadyWorkspaceSidePaneSpeakerManagement['speakerVisualByUnitId'];
  speakerFilterOptions: ReadyWorkspaceSidePaneSpeakerManagement['speakerFilterOptions'];
  speakerReferenceStats: ReadyWorkspaceSidePaneSpeakerManagement['speakerReferenceStats'];
  speakerReferenceUnassignedStats: ReadyWorkspaceSidePaneSpeakerManagement['speakerReferenceUnassignedStats'];
  speakerReferenceStatsMediaScoped: ReadyWorkspaceSidePaneSpeakerManagement['speakerReferenceStatsMediaScoped'];
  speakerReferenceStatsReady: ReadyWorkspaceSidePaneSpeakerManagement['speakerReferenceStatsReady'];
  selectedSpeakerSummary: ReadyWorkspaceSidePaneSpeakerManagement['selectedSpeakerSummary'];
  handleSelectSpeakerUnits: ReadyWorkspaceSidePaneSpeakerManagement['handleSelectSpeakerUnits'];
  handleClearSpeakerAssignments: ReadyWorkspaceSidePaneSpeakerManagement['handleClearSpeakerAssignments'];
  handleExportSpeakerSegments: ReadyWorkspaceSidePaneSpeakerManagement['handleExportSpeakerSegments'];
  handleRenameSpeaker: ReadyWorkspaceSidePaneSpeakerManagement['handleRenameSpeaker'];
  handleMergeSpeaker: ReadyWorkspaceSidePaneSpeakerManagement['handleMergeSpeaker'];
  handleDeleteSpeaker: ReadyWorkspaceSidePaneSpeakerManagement['handleDeleteSpeaker'];
  handleDeleteUnusedSpeakers: ReadyWorkspaceSidePaneSpeakerManagement['handleDeleteUnusedSpeakers'];
  handleAssignSpeakerToSelected: ReadyWorkspaceSidePaneSpeakerManagement['handleAssignSpeakerToSelected'];
  handleCreateSpeakerAndAssign: ReadyWorkspaceSidePaneSpeakerManagement['handleCreateSpeakerAndAssign'];
  handleCreateSpeakerOnly: ReadyWorkspaceSidePaneSpeakerManagement['handleCreateSpeakerOnly'];
  closeSpeakerDialog: ReadyWorkspaceSidePaneSpeakerManagement['closeSpeakerDialog'];
  updateSpeakerDialogDraftName: ReadyWorkspaceSidePaneSpeakerManagement['updateSpeakerDialogDraftName'];
  updateSpeakerDialogTargetKey: ReadyWorkspaceSidePaneSpeakerManagement['updateSpeakerDialogTargetKey'];
  confirmSpeakerDialog: ReadyWorkspaceSidePaneSpeakerManagement['confirmSpeakerDialog'];
  sidePaneRows: ReadyWorkspaceSidePaneSidebarProps['sidePaneRows'];
  focusedLayerRowId: ReadyWorkspaceSidePaneSidebarProps['focusedLayerRowId'];
  flashLayerRowId: ReadyWorkspaceSidePaneSidebarProps['flashLayerRowId'];
  onFocusLayer: ReadyWorkspaceSidePaneSidebarProps['onFocusLayer'];
  transcriptionLayers: ReadyWorkspaceSidePaneSidebarProps['transcriptionLayers'];
  layerLinks?: ReadyWorkspaceSidePaneSidebarProps['layerLinks'];
  toggleLayerLink: ReadyWorkspaceSidePaneSidebarProps['toggleLayerLink'];
  deletableLayers: ReadyWorkspaceSidePaneSidebarProps['deletableLayers'];
  updateLayerMetadata: ReadyWorkspaceSidePaneSidebarProps['updateLayerMetadata'];
  layerCreateMessage: ReadyWorkspaceSidePaneSidebarProps['layerCreateMessage'];
  layerAction: ReadyWorkspaceSidePaneSidebarProps['layerAction'];
  defaultTranscriptionLayerId?: ReadyWorkspaceSidePaneSidebarProps['defaultTranscriptionLayerId'];
  segmentsByLayer: ReadyWorkspaceSidePaneSidebarProps['segmentsByLayer'];
  segmentContentByLayer: ReadyWorkspaceSidePaneSidebarProps['segmentContentByLayer'];
  unitsOnCurrentMedia: ReadyWorkspaceSidePaneSidebarProps['unitsOnCurrentMedia'];
  speakers: ReadyWorkspaceSidePaneSidebarProps['speakers'];
  collaborationCloudPanelProps?: ReadyWorkspaceSidePaneSidebarProps['collaborationCloudPanelProps'];
  getUnitTextForLayer?: ReadyWorkspaceSidePaneSidebarProps['getUnitTextForLayer'];
  onSelectTimelineUnit: ReadyWorkspaceSidePaneSidebarProps['onSelectTimelineUnit'];
  onReorderLayers: ReadyWorkspaceSidePaneSidebarProps['onReorderLayers'];
  locale: Locale;
  verticalViewActive: boolean;
  translationLayerCount: number;
  onSelectWorkspaceHorizontalLayout: () => void;
  onSelectWorkspaceVerticalLayout: () => void;
};

export function buildReadyWorkspaceSidePaneProps(
  input: BuildReadyWorkspaceSidePanePropsInput,
): TranscriptionPageSidePaneProps {
  return {
    speakerManagement: {
      speakerOptions: input.speakerOptions,
      speakerDraftName: input.speakerDraftName,
      setSpeakerDraftName: input.setSpeakerDraftName,
      batchSpeakerId: input.batchSpeakerId,
      setBatchSpeakerId: input.setBatchSpeakerId,
      speakerSaving: input.speakerSaving,
      activeSpeakerFilterKey: input.activeSpeakerFilterKey,
      setActiveSpeakerFilterKey: input.setActiveSpeakerFilterKey,
      speakerDialogState: input.speakerDialogState,
      speakerVisualByUnitId: input.speakerVisualByUnitId,
      speakerFilterOptions: input.speakerFilterOptions,
      speakerReferenceStats: input.speakerReferenceStats,
      speakerReferenceUnassignedStats: input.speakerReferenceUnassignedStats,
      speakerReferenceStatsMediaScoped: input.speakerReferenceStatsMediaScoped,
      speakerReferenceStatsReady: input.speakerReferenceStatsReady,
      selectedSpeakerSummary: input.selectedSpeakerSummary,
      handleSelectSpeakerUnits: input.handleSelectSpeakerUnits,
      handleClearSpeakerAssignments: input.handleClearSpeakerAssignments,
      handleExportSpeakerSegments: input.handleExportSpeakerSegments,
      handleRenameSpeaker: input.handleRenameSpeaker,
      handleMergeSpeaker: input.handleMergeSpeaker,
      handleDeleteSpeaker: input.handleDeleteSpeaker,
      handleDeleteUnusedSpeakers: input.handleDeleteUnusedSpeakers,
      handleAssignSpeakerToSelected: input.handleAssignSpeakerToSelected,
      handleCreateSpeakerAndAssign: input.handleCreateSpeakerAndAssign,
      handleCreateSpeakerOnly: input.handleCreateSpeakerOnly,
      closeSpeakerDialog: input.closeSpeakerDialog,
      updateSpeakerDialogDraftName: input.updateSpeakerDialogDraftName,
      updateSpeakerDialogTargetKey: input.updateSpeakerDialogTargetKey,
      confirmSpeakerDialog: input.confirmSpeakerDialog,
    },
    selectedUnitIds: input.selectedUnitIds,
    handleAssignSpeakerToSelectedRouted: input.handleAssignSpeakerToSelectedRouted,
    handleClearSpeakerOnSelectedRouted: input.handleClearSpeakerOnSelectedRouted,
    sidebarProps: dropUndefinedKeys({
      sidePaneRows: input.sidePaneRows,
      focusedLayerRowId: input.focusedLayerRowId,
      flashLayerRowId: input.flashLayerRowId,
      onFocusLayer: input.onFocusLayer,
      transcriptionLayers: input.transcriptionLayers,
      ...(input.layerLinks !== undefined ? { layerLinks: input.layerLinks } : {}),
      toggleLayerLink: input.toggleLayerLink,
      deletableLayers: input.deletableLayers,
      updateLayerMetadata: input.updateLayerMetadata,
      layerCreateMessage: input.layerCreateMessage,
      layerAction: input.layerAction,
      ...(input.defaultTranscriptionLayerId !== undefined ? { defaultTranscriptionLayerId: input.defaultTranscriptionLayerId } : {}),
      segmentsByLayer: input.segmentsByLayer,
      segmentContentByLayer: input.segmentContentByLayer,
      unitsOnCurrentMedia: input.unitsOnCurrentMedia,
      speakers: input.speakers,
      ...(input.collaborationCloudPanelProps !== undefined ? { collaborationCloudPanelProps: input.collaborationCloudPanelProps } : {}),
      ...(input.getUnitTextForLayer !== undefined ? { getUnitTextForLayer: input.getUnitTextForLayer } : {}),
      onSelectTimelineUnit: input.onSelectTimelineUnit,
      onReorderLayers: input.onReorderLayers,
      workspaceTimelineLayout: {
        locale: input.locale,
        verticalViewActive: input.verticalViewActive,
        translationLayerCount: input.translationLayerCount,
        onSelectHorizontalMode: () => {
          recordTranscriptionKeyboardAction('timelineWorkspaceLayoutHorizontal');
          input.onSelectWorkspaceHorizontalLayout();
        },
        onSelectVerticalMode: () => {
          recordTranscriptionKeyboardAction('timelineWorkspaceLayoutVertical');
          input.onSelectWorkspaceVerticalLayout();
        },
      },
    }) as ReadyWorkspaceSidePaneSidebarProps,
  };
}

export type BuildReadyWorkspaceOverlaysPropsInput = Omit<TranscriptionOverlaysProps, 'onOpenNoteFromMenu'> & {
  setNotePopover: (next: TranscriptionOverlaysProps['notePopover']) => void;
};

export type BuildReadyWorkspaceWaveformContentPropsInput = Omit<
  OrchestratorWaveformContentProps,
  'acousticRuntimeStatus' | 'vadCacheStatus' | 'selectedHotspotTimeSec'
> & {
  acousticRuntimeStatus?: OrchestratorWaveformContentProps['acousticRuntimeStatus'] | undefined;
  vadCacheStatus?: OrchestratorWaveformContentProps['vadCacheStatus'] | undefined;
  selectedHotspotTimeSec?: OrchestratorWaveformContentProps['selectedHotspotTimeSec'] | undefined;
};

export function buildReadyWorkspaceWaveformContentProps(
  input: BuildReadyWorkspaceWaveformContentPropsInput,
): OrchestratorWaveformContentProps {
  return dropUndefinedKeys({ ...input }) as OrchestratorWaveformContentProps;
}

export function buildReadyWorkspaceOverlaysProps(
  input: BuildReadyWorkspaceOverlaysPropsInput,
): TranscriptionOverlaysProps {
  return {
    ctxMenu: input.ctxMenu,
    onCloseCtxMenu: () => {
      recordTranscriptionKeyboardAction('overlayCloseContextMenu');
      input.onCloseCtxMenu();
    },
    uttOpsMenu: input.uttOpsMenu,
    onCloseUttOpsMenu: () => {
      recordTranscriptionKeyboardAction('overlayCloseUttOpsMenu');
      input.onCloseUttOpsMenu();
    },
    selectedTimelineUnit: input.selectedTimelineUnit ?? null,
    selectedUnitIds: input.selectedUnitIds,
    runDeleteSelection: (anchorId, selectedIds, unitKind, layerId) => {
      recordTranscriptionKeyboardAction('deleteSegment');
      input.runDeleteSelection(anchorId, selectedIds, unitKind, layerId);
    },
    runMergeSelection: (selectedIds, unitKind, layerId) => {
      recordTranscriptionKeyboardAction('overlayMergeSelection');
      input.runMergeSelection(selectedIds, unitKind, layerId);
    },
    runSelectBefore: (id) => {
      recordTranscriptionKeyboardAction('selectBefore');
      input.runSelectBefore(id);
    },
    runSelectAfter: (id) => {
      recordTranscriptionKeyboardAction('selectAfter');
      input.runSelectAfter(id);
    },
    runDeleteOne: (id, unitKind, layerId) => {
      recordTranscriptionKeyboardAction('deleteSegment');
      input.runDeleteOne(id, unitKind, layerId);
    },
    runMergePrev: (id, unitKind, layerId) => {
      recordTranscriptionKeyboardAction('mergePrev');
      input.runMergePrev(id, unitKind, layerId);
    },
    runMergeNext: (id, unitKind, layerId) => {
      recordTranscriptionKeyboardAction('mergeNext');
      input.runMergeNext(id, unitKind, layerId);
    },
    runSplitAtTime: (id, splitTime, unitKind, layerId) => {
      recordTranscriptionKeyboardAction('splitSegment');
      input.runSplitAtTime(id, splitTime, unitKind, layerId);
    },
    getCurrentTime: input.getCurrentTime,
    onOpenNoteFromMenu: (
      x: number,
      y: number,
      uttId: string,
      layerId?: string,
      scope?: 'timeline' | 'waveform',
    ) => {
      recordTranscriptionKeyboardAction('overlayOpenNoteFromMenu');
      if (layerId) {
        input.setNotePopover({ x, y, uttId, layerId, scope: scope ?? 'timeline' });
        return;
      }
      input.setNotePopover({ x, y, uttId });
    },
    deleteConfirmState: input.deleteConfirmState,
    muteDeleteConfirmInSession: input.muteDeleteConfirmInSession,
    setMuteDeleteConfirmInSession: input.setMuteDeleteConfirmInSession,
    closeDeleteConfirmDialog: () => {
      recordTranscriptionKeyboardAction('overlayDeleteDialogDismiss');
      input.closeDeleteConfirmDialog();
    },
    confirmDeleteFromDialog: () => {
      recordTranscriptionKeyboardAction('overlayDeleteDialogConfirm');
      input.confirmDeleteFromDialog();
    },
    notePopover: input.notePopover,
    currentNotes: input.currentNotes,
    onCloseNotePopover: () => {
      recordTranscriptionKeyboardAction('overlayCloseNotePopover');
      input.onCloseNotePopover();
    },
    addNote: async (content, category) => {
      recordTranscriptionKeyboardAction('overlayNoteAdd');
      await input.addNote(content, category);
    },
    updateNote: async (id, updates) => {
      recordTranscriptionKeyboardAction('overlayNoteUpdate');
      await input.updateNote(id, updates);
    },
    deleteNote: async (id) => {
      recordTranscriptionKeyboardAction('overlayNoteDelete');
      await input.deleteNote(id);
    },
    units: input.units,
    getUnitTextForLayer: input.getUnitTextForLayer,
    transcriptionLayers: input.transcriptionLayers,
    translationLayers: input.translationLayers,
    ...(input.resolveSelfCertaintyUnitIds ? { resolveSelfCertaintyUnitIds: input.resolveSelfCertaintyUnitIds } : {}),
    ...(input.speakerOptions ? { speakerOptions: input.speakerOptions } : {}),
    ...(input.speakerFilterOptions ? { speakerFilterOptions: input.speakerFilterOptions } : {}),
    ...(input.onAssignSpeakerFromMenu
      ? {
        onAssignSpeakerFromMenu: (unitIds, kind, speakerId) => {
          recordTranscriptionKeyboardAction('overlayAssignSpeaker');
          input.onAssignSpeakerFromMenu!(unitIds, kind, speakerId);
        },
      }
      : {}),
    ...(input.onSetUnitSelfCertaintyFromMenu
      ? {
        onSetUnitSelfCertaintyFromMenu: (unitIds, kind, value, layerId) => {
          recordTranscriptionKeyboardAction('overlaySetSelfCertainty');
          input.onSetUnitSelfCertaintyFromMenu!(unitIds, kind, value, layerId);
        },
      }
      : {}),
    ...(input.onToggleSkipProcessingFromMenu
      ? {
        onToggleSkipProcessingFromMenu: (unitId, kind, layerId) => {
          recordTranscriptionKeyboardAction('overlayToggleSkipProcessing');
          input.onToggleSkipProcessingFromMenu!(unitId, kind, layerId);
        },
      }
      : {}),
    ...(input.resolveSkipProcessingState ? { resolveSkipProcessingState: input.resolveSkipProcessingState } : {}),
    ...(input.onOpenSpeakerManagementPanelFromMenu
      ? {
        onOpenSpeakerManagementPanelFromMenu: () => {
          recordTranscriptionKeyboardAction('toolbarOpenSpeakerManagementPanel');
          input.onOpenSpeakerManagementPanelFromMenu!();
        },
      }
      : {}),
    ...(input.displayStyleControl
      ? {
        displayStyleControl: {
          ...input.displayStyleControl,
          onUpdate: (layerId, patch) => {
            recordTranscriptionKeyboardAction('overlayLayerDisplayUpdate');
            input.displayStyleControl!.onUpdate(layerId, patch);
          },
          onReset: (layerId) => {
            recordTranscriptionKeyboardAction('overlayLayerDisplayReset');
            input.displayStyleControl!.onReset(layerId);
          },
        },
      }
      : {}),
  };
}

export type BuildReadyWorkspaceLayoutStyleInput = {
  uiFontScale: number;
  adaptiveDialogWidth: number;
  adaptiveDialogCompactWidth: number;
  adaptiveDialogWideWidth: number;
  aiPanelWidth: number;
  isAiPanelCollapsed: boolean;
  laneLabelWidth: number;
  isTimelineLaneHeaderCollapsed: boolean;
  selectedMediaUrl?: string | null | undefined;
  selectedMediaIsVideo: boolean;
  videoLayoutMode: string;
  videoRightPanelWidth: number;
};

export function buildReadyWorkspaceLayoutStyle(
  input: BuildReadyWorkspaceLayoutStyleInput,
): CSSProperties {
  return {
    '--ui-font-scale': String(input.uiFontScale),
    '--dialog-auto-width': `${input.adaptiveDialogWidth}px`,
    '--dialog-compact-auto-width': `${input.adaptiveDialogCompactWidth}px`,
    '--dialog-wide-auto-width': `${input.adaptiveDialogWideWidth}px`,
    '--transcription-ai-width': `${input.aiPanelWidth}px`,
    '--transcription-ai-visible-width': `${input.isAiPanelCollapsed ? 0 : input.aiPanelWidth}px`,
    '--lane-label-width': input.isTimelineLaneHeaderCollapsed ? '0px' : `${input.laneLabelWidth}px`,
    '--video-left-panel-width': input.selectedMediaUrl && input.selectedMediaIsVideo && input.videoLayoutMode === 'left'
      ? `${input.videoRightPanelWidth + 8}px`
      : '0px',
  } as CSSProperties;
}

export type BuildReadyWorkspaceConflictReviewDrawerPropsInput = {
  tickets: ReadyWorkspaceConflictReviewDrawerProps['tickets'];
  onApplyRemoteConflictTicket: (ticketId: string) => void | Promise<void | boolean>;
  onKeepLocalConflictTicket: (ticketId: string) => void;
  onPostponeConflictTicket: (ticketId: string) => void;
};

export function buildReadyWorkspaceConflictReviewDrawerProps(
  input: BuildReadyWorkspaceConflictReviewDrawerPropsInput,
): ReadyWorkspaceConflictReviewDrawerProps {
  return {
    tickets: input.tickets,
    onApplyRemote: async (ticketId) => {
      recordTranscriptionKeyboardAction('workspaceConflictApplyRemote');
      await input.onApplyRemoteConflictTicket(ticketId);
    },
    onKeepLocal: (ticketId) => {
      recordTranscriptionKeyboardAction('workspaceConflictKeepLocal');
      input.onKeepLocalConflictTicket(ticketId);
    },
    onPostpone: (ticketId) => {
      recordTranscriptionKeyboardAction('workspaceConflictPostpone');
      input.onPostponeConflictTicket(ticketId);
    },
  };
}
