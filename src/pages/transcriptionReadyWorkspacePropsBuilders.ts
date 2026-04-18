import type { CSSProperties, ReactNode } from 'react';
import type { PushTimelineEditInput } from '../hooks/useEditEventBuffer';
import type { TimelineUnit } from '../hooks/transcriptionTypes';
import { fireAndForget } from '../utils/fireAndForget';
import type { AnnotationImportBridgeStrategy } from '../hooks/useImportExport.annotationImport';
import type { TranscriptionPageTimelineMediaLanesProps } from './TranscriptionPage.TimelineContent';
import type { OrchestratorWaveformContentProps } from './OrchestratorWaveformContent';
import type { TranscriptionPageSidePaneProps } from './TranscriptionPage.SidePane';
import type { TranscriptionOverlaysProps } from '../components/TranscriptionOverlays';
import type { TranscriptionPageReadyWorkspaceLayoutProps } from './TranscriptionPage.ReadyWorkspaceLayout';

type MediaLanesProps = TranscriptionPageTimelineMediaLanesProps;
type ReadyWorkspaceStageProps = TranscriptionPageReadyWorkspaceLayoutProps['readyStageProps'];
type ReadyWorkspaceWorkspaceAreaProps = ReadyWorkspaceStageProps['workspaceAreaProps'];
type ReadyWorkspaceLayerPopoverProps = NonNullable<TranscriptionPageReadyWorkspaceLayoutProps['layerPopoverProps']>;

type SharedLaneFields = Pick<
  MediaLanesProps,
  | 'transcriptionLayers'
  | 'translationLayers'
  | 'activeTextTimelineMode'
  | 'timelineUnitViewIndex'
  | 'segmentsByLayer'
  | 'segmentContentByLayer'
  | 'saveSegmentContentForLayer'
  | 'selectedTimelineUnit'
  | 'flashLayerRowId'
  | 'focusedLayerRowId'
  | 'deletableLayers'
  | 'layerLinks'
  | 'speakerLayerLayout'
  | 'activeSpeakerFilterKey'
  | 'speakerQuickActions'
  | 'translationAudioByLayer'
  | 'mediaItems'
  | 'recording'
  | 'recordingUnitId'
  | 'recordingLayerId'
  | 'startRecordingForUnit'
  | 'stopRecording'
  | 'deleteVoiceTranslation'
  | 'displayStyleControl'
>;

/**
 * ReadyWorkspace 侧字段名与 TranscriptionTimelineMediaLanes props 的对应关系
 * （避免 any，并保持与 buildSharedLaneProps 映射一致）。
 * 新建层弹窗的语言/正字法默认留空，不再从项目主语言注入。
 */
export type BuildSharedLanePropsInput = SharedLaneFields & {
  activeTimelineUnitId: string;
  orderedLayers: MediaLanesProps['allLayersOrdered'];
  reorderLayers: MediaLanesProps['onReorderLayers'];
  handleFocusLayerRow: MediaLanesProps['onFocusLayer'];
  showAllLayerConnectors: boolean;
  handleToggleAllLayerConnectors: MediaLanesProps['onToggleConnectors'];
  timelineLaneHeights: MediaLanesProps['laneHeights'];
  handleTimelineLaneHeightChange: MediaLanesProps['onLaneHeightChange'];
  transcriptionTrackMode: MediaLanesProps['trackDisplayMode'];
  handleToggleTrackDisplayMode: MediaLanesProps['onToggleTrackDisplayMode'];
  setTrackDisplayMode: MediaLanesProps['onSetTrackDisplayMode'];
  effectiveLaneLockMap: MediaLanesProps['laneLockMap'];
  handleLockSelectedSpeakersToLane: MediaLanesProps['onLockSelectedSpeakersToLane'];
  handleUnlockSelectedSpeakers: MediaLanesProps['onUnlockSelectedSpeakers'];
  handleResetTrackAutoLayout: MediaLanesProps['onResetTrackAutoLayout'];
  selectedSpeakerNamesForTrackLock: MediaLanesProps['selectedSpeakerNamesForLock'];
  handleLaneLabelWidthResizeStart: MediaLanesProps['onLaneLabelWidthResize'];
};

export type BuiltSharedLaneProps = Omit<
  MediaLanesProps,
  | 'playerDuration'
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
    translationAudioByLayer: input.translationAudioByLayer,
    mediaItems: input.mediaItems,
    recording: input.recording,
    recordingUnitId: input.recordingUnitId,
    recordingLayerId: input.recordingLayerId,
    startRecordingForUnit: input.startRecordingForUnit,
    stopRecording: input.stopRecording,
    deleteVoiceTranslation: input.deleteVoiceTranslation,
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
  presenceMembers?: ReadyWorkspaceSidePaneSidebarProps['presenceMembers'];
  presenceCurrentUserId?: ReadyWorkspaceSidePaneSidebarProps['presenceCurrentUserId'];
  collaborationCloudPanelProps?: ReadyWorkspaceSidePaneSidebarProps['collaborationCloudPanelProps'];
  getUnitTextForLayer?: ReadyWorkspaceSidePaneSidebarProps['getUnitTextForLayer'];
  onSelectTimelineUnit: ReadyWorkspaceSidePaneSidebarProps['onSelectTimelineUnit'];
  onReorderLayers: ReadyWorkspaceSidePaneSidebarProps['onReorderLayers'];
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
      ...(input.presenceMembers !== undefined ? { presenceMembers: input.presenceMembers } : {}),
      ...(input.presenceCurrentUserId !== undefined ? { presenceCurrentUserId: input.presenceCurrentUserId } : {}),
      ...(input.collaborationCloudPanelProps !== undefined ? { collaborationCloudPanelProps: input.collaborationCloudPanelProps } : {}),
      ...(input.getUnitTextForLayer !== undefined ? { getUnitTextForLayer: input.getUnitTextForLayer } : {}),
      onSelectTimelineUnit: input.onSelectTimelineUnit,
      onReorderLayers: input.onReorderLayers,
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
    onCloseCtxMenu: input.onCloseCtxMenu,
    uttOpsMenu: input.uttOpsMenu,
    onCloseUttOpsMenu: input.onCloseUttOpsMenu,
    selectedTimelineUnit: input.selectedTimelineUnit ?? null,
    selectedUnitIds: input.selectedUnitIds,
    runDeleteSelection: input.runDeleteSelection,
    runMergeSelection: input.runMergeSelection,
    runSelectBefore: input.runSelectBefore,
    runSelectAfter: input.runSelectAfter,
    runDeleteOne: input.runDeleteOne,
    runMergePrev: input.runMergePrev,
    runMergeNext: input.runMergeNext,
    runSplitAtTime: input.runSplitAtTime,
    getCurrentTime: input.getCurrentTime,
    onOpenNoteFromMenu: (
      x: number,
      y: number,
      uttId: string,
      layerId?: string,
      scope?: 'timeline' | 'waveform',
    ) => {
      if (layerId) {
        input.setNotePopover({ x, y, uttId, layerId, scope: scope ?? 'timeline' });
        return;
      }
      input.setNotePopover({ x, y, uttId });
    },
    deleteConfirmState: input.deleteConfirmState,
    muteDeleteConfirmInSession: input.muteDeleteConfirmInSession,
    setMuteDeleteConfirmInSession: input.setMuteDeleteConfirmInSession,
    closeDeleteConfirmDialog: input.closeDeleteConfirmDialog,
    confirmDeleteFromDialog: input.confirmDeleteFromDialog,
    notePopover: input.notePopover,
    currentNotes: input.currentNotes,
    onCloseNotePopover: input.onCloseNotePopover,
    addNote: input.addNote,
    updateNote: input.updateNote,
    deleteNote: input.deleteNote,
    units: input.units,
    getUnitTextForLayer: input.getUnitTextForLayer,
    transcriptionLayers: input.transcriptionLayers,
    translationLayers: input.translationLayers,
    ...(input.resolveSelfCertaintyUnitIds ? { resolveSelfCertaintyUnitIds: input.resolveSelfCertaintyUnitIds } : {}),
    ...(input.speakerOptions ? { speakerOptions: input.speakerOptions } : {}),
    ...(input.speakerFilterOptions ? { speakerFilterOptions: input.speakerFilterOptions } : {}),
    ...(input.onAssignSpeakerFromMenu ? { onAssignSpeakerFromMenu: input.onAssignSpeakerFromMenu } : {}),
    ...(input.onSetUnitSelfCertaintyFromMenu ? { onSetUnitSelfCertaintyFromMenu: input.onSetUnitSelfCertaintyFromMenu } : {}),
    ...(input.onOpenLayerMetadataPanelFromMenu ? { onOpenLayerMetadataPanelFromMenu: input.onOpenLayerMetadataPanelFromMenu } : {}),
    ...(input.onOpenSpeakerManagementPanelFromMenu ? { onOpenSpeakerManagementPanelFromMenu: input.onOpenSpeakerManagementPanelFromMenu } : {}),
    ...(input.displayStyleControl ? { displayStyleControl: input.displayStyleControl } : {}),
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

export type BuildReadyWorkspaceLayerPopoverPropsInput = {
  overlayMetadataLayer: { id: string; layerType: 'transcription' | 'translation' } | null;
  deletableLayers: ReadyWorkspaceLayerPopoverProps['deletableLayers'];
  createLayer: ReadyWorkspaceLayerPopoverProps['createLayer'];
  updateLayerMetadata: ReadyWorkspaceLayerPopoverProps['updateLayerMetadata'];
  deleteLayer: ReadyWorkspaceLayerPopoverProps['deleteLayer'];
  deleteLayerWithoutConfirm: ReadyWorkspaceLayerPopoverProps['deleteLayerWithoutConfirm'];
  checkLayerHasContent: ReadyWorkspaceLayerPopoverProps['checkLayerHasContent'];
  onClose: ReadyWorkspaceLayerPopoverProps['onClose'];
};

export function buildReadyWorkspaceLayerPopoverProps(
  input: BuildReadyWorkspaceLayerPopoverPropsInput,
): TranscriptionPageReadyWorkspaceLayoutProps['layerPopoverProps'] {
  if (!input.overlayMetadataLayer) return null;
  return dropUndefinedKeys({
    action: input.overlayMetadataLayer.layerType === 'translation' ? 'edit-translation-metadata' : 'edit-transcription-metadata',
    layerId: input.overlayMetadataLayer.id,
    deletableLayers: input.deletableLayers,
    createLayer: input.createLayer,
    ...(input.updateLayerMetadata ? { updateLayerMetadata: input.updateLayerMetadata } : {}),
    ...(input.deleteLayer ? { deleteLayer: input.deleteLayer } : {}),
    ...(input.deleteLayerWithoutConfirm ? { deleteLayerWithoutConfirm: input.deleteLayerWithoutConfirm } : {}),
    checkLayerHasContent: input.checkLayerHasContent,
    onClose: input.onClose,
  }) as ReadyWorkspaceLayerPopoverProps;
}

export type BuildReadyWorkspaceStagePropsInput = {
  assistantFrame: Pick<ReadyWorkspaceStageProps['toastProps'], 'saveState' | 'recording' | 'recordingUnitId' | 'recordingError' | 'tf'> &
    Partial<Pick<ReadyWorkspaceStageProps['toastProps'], 'overlapCycleToast' | 'lockConflictToast'>>;
  shouldRenderRecoveryBanner: boolean;
  recoveryAvailable: ReadyWorkspaceStageProps['recoveryBannerProps']['recoveryAvailable'];
  recoveryDiffSummary: ReadyWorkspaceStageProps['recoveryBannerProps']['recoveryDiffSummary'];
  onApplyRecoveryBanner: ReadyWorkspaceStageProps['recoveryBannerProps']['onApply'];
  onDismissRecoveryBanner: ReadyWorkspaceStageProps['recoveryBannerProps']['onDismiss'];
  collaborationCloudStatusSlot?: ReactNode;
  toolbarProps: ReadyWorkspaceStageProps['toolbarProps'];
  observerStage: ReadyWorkspaceStageProps['observerProps']['observerStage'];
  recommendations: ReadyWorkspaceStageProps['observerProps']['recommendations'];
  onExecuteRecommendation: ReadyWorkspaceStageProps['observerProps']['onExecuteRecommendation'];
  acousticRuntimeStatus: ReadyWorkspaceStageProps['acousticRuntimeStatus'];
  vadCacheStatus: ReadyWorkspaceStageProps['vadCacheStatus'];
  currentProjectLabel: ReadyWorkspaceStageProps['projectHubProps']['currentProjectLabel'];
  activeTextTimelineMode: ReadyWorkspaceStageProps['projectHubProps']['activeTextTimelineMode'];
  activeTextTimeMapping: ReadyWorkspaceStageProps['projectHubProps']['activeTextTimeMapping'];
  canDeleteProject: ReadyWorkspaceStageProps['projectHubProps']['canDeleteProject'];
  canDeleteAudio: ReadyWorkspaceStageProps['projectHubProps']['canDeleteAudio'];
  onOpenProjectSetup: ReadyWorkspaceStageProps['projectHubProps']['onOpenProjectSetup'];
  onOpenAudioImport: ReadyWorkspaceStageProps['projectHubProps']['onOpenAudioImport'];
  onOpenSpeakerManagementPanel: ReadyWorkspaceStageProps['projectHubProps']['onOpenSpeakerManagementPanel'];
  onDeleteCurrentProject: ReadyWorkspaceStageProps['projectHubProps']['onDeleteCurrentProject'];
  onDeleteCurrentAudio: ReadyWorkspaceStageProps['projectHubProps']['onDeleteCurrentAudio'];
  handleImportFile: (file: File, strategy: AnnotationImportBridgeStrategy) => Promise<void>;
  onPreviewProjectArchiveImport: ReadyWorkspaceStageProps['projectHubProps']['onPreviewProjectArchiveImport'];
  onImportProjectArchive: ReadyWorkspaceStageProps['projectHubProps']['onImportProjectArchive'];
  onApplyTextTimeMapping: ReadyWorkspaceStageProps['projectHubProps']['onApplyTextTimeMapping'];
  onExportEaf: ReadyWorkspaceStageProps['projectHubProps']['onExportEaf'];
  onExportTextGrid: ReadyWorkspaceStageProps['projectHubProps']['onExportTextGrid'];
  onExportTrs: ReadyWorkspaceStageProps['projectHubProps']['onExportTrs'];
  onExportFlextext: ReadyWorkspaceStageProps['projectHubProps']['onExportFlextext'];
  onExportToolbox: ReadyWorkspaceStageProps['projectHubProps']['onExportToolbox'];
  onExportJyt: ReadyWorkspaceStageProps['projectHubProps']['onExportJyt'];
  onExportJym: ReadyWorkspaceStageProps['projectHubProps']['onExportJym'];
  mediaFileInputRef: ReadyWorkspaceStageProps['mediaInputProps']['ref'];
  onDirectMediaImport: ReadyWorkspaceStageProps['mediaInputProps']['onChange'];
  waveformSectionRef: ReadyWorkspaceWorkspaceAreaProps['waveformSectionRef'];
  workspaceRef: ReadyWorkspaceWorkspaceAreaProps['workspaceRef'];
  listMainRef: ReadyWorkspaceWorkspaceAreaProps['listMainRef'];
  tierContainerRef: ReadyWorkspaceWorkspaceAreaProps['tierContainerRef'];
  isAiPanelCollapsed: ReadyWorkspaceWorkspaceAreaProps['isAiPanelCollapsed'];
  isTimelineLaneHeaderCollapsed: ReadyWorkspaceWorkspaceAreaProps['isTimelineLaneHeaderCollapsed'];
  readyWorkspaceWaveformContentProps: ReadyWorkspaceWorkspaceAreaProps['readyWorkspaceWaveformContentProps'];
  timelineTopProps: ReadyWorkspaceWorkspaceAreaProps['timelineTopProps'];
  readyWorkspaceSidePaneProps: ReadyWorkspaceWorkspaceAreaProps['readyWorkspaceSidePaneProps'];
  timelineContentProps: ReadyWorkspaceWorkspaceAreaProps['timelineContentProps'];
  editorContextValue: ReadyWorkspaceWorkspaceAreaProps['editorContextValue'];
  aiPanelContextValue: ReadyWorkspaceWorkspaceAreaProps['aiPanelContextValue'];
  onLassoPointerDown: ReadyWorkspaceWorkspaceAreaProps['lassoHandlers']['onPointerDown'];
  onLassoPointerMove: ReadyWorkspaceWorkspaceAreaProps['lassoHandlers']['onPointerMove'];
  onLassoPointerUp: ReadyWorkspaceWorkspaceAreaProps['lassoHandlers']['onPointerUp'];
  onTimelineScroll: ReadyWorkspaceWorkspaceAreaProps['lassoHandlers']['onScroll'];
  timelineResizeTooltip: ReadyWorkspaceWorkspaceAreaProps['timelineResizeTooltip'];
  formatTime: ReadyWorkspaceWorkspaceAreaProps['formatTime'];
  zoomPercent: number;
  snapEnabled: boolean;
  autoScrollEnabled: boolean;
  activeWaveformUnitId: string | null;
  waveformTimelineItems: ReadyWorkspaceWorkspaceAreaProps['zoomControlsProps']['unitsOnCurrentMedia'];
  fitPxPerSec: number;
  maxZoomPercent: number;
  onZoomToPercent: ReadyWorkspaceWorkspaceAreaProps['zoomControlsProps']['onZoomToPercent'];
  onZoomToUnit: ReadyWorkspaceWorkspaceAreaProps['zoomControlsProps']['onZoomToUnit'];
  onSnapEnabledChange: ReadyWorkspaceWorkspaceAreaProps['zoomControlsProps']['onSnapEnabledChange'];
  onAutoScrollEnabledChange: ReadyWorkspaceWorkspaceAreaProps['zoomControlsProps']['onAutoScrollEnabledChange'];
  canUndo: ReadyWorkspaceWorkspaceAreaProps['historyControlsProps']['canUndo'];
  canRedo: ReadyWorkspaceWorkspaceAreaProps['historyControlsProps']['canRedo'];
  undoLabel: ReadyWorkspaceWorkspaceAreaProps['historyControlsProps']['undoLabel'];
  undoHistory: ReadyWorkspaceWorkspaceAreaProps['historyControlsProps']['undoHistory'];
  isHistoryVisible: ReadyWorkspaceWorkspaceAreaProps['historyControlsProps']['isHistoryVisible'];
  onToggleHistoryVisible: ReadyWorkspaceWorkspaceAreaProps['historyControlsProps']['onToggleHistoryVisible'];
  selectedTimelineUnit: TimelineUnit | null;
  activeTimelineUnitId: string;
  recordTimelineEdit: (input: PushTimelineEditInput) => void;
  undoToHistoryIndex: (idx: number) => Promise<void>;
  redo: () => Promise<void>;
  locale: ReadyWorkspaceWorkspaceAreaProps['aiPanelHandleProps']['locale'];
  setIsAiPanelCollapsed: ReadyWorkspaceWorkspaceAreaProps['aiPanelHandleProps']['setIsAiPanelCollapsed'];
  handleAiPanelResizeStart: ReadyWorkspaceWorkspaceAreaProps['aiPanelHandleProps']['handleAiPanelResizeStart'];
  handleAiPanelToggle: ReadyWorkspaceWorkspaceAreaProps['aiPanelHandleProps']['handleAiPanelToggle'];
  assistantBridgeControllerInput: ReadyWorkspaceWorkspaceAreaProps['assistantBridge']['controllerInput'];
  onRuntimeStateChange: ReadyWorkspaceWorkspaceAreaProps['assistantBridge']['onRuntimeStateChange'];
  aiSidebarProps: ReadyWorkspaceWorkspaceAreaProps['aiSidebarProps'];
  shouldRenderAiSidebar: boolean;
  dialogsProps: ReadyWorkspaceWorkspaceAreaProps['dialogsProps'];
  shouldRenderDialogs: boolean;
  pdfRuntimeProps: ReadyWorkspaceWorkspaceAreaProps['pdfRuntimeProps'];
  shouldRenderPdfRuntime: boolean;
  shouldRenderBatchOps: boolean;
  showBatchOperationPanel: ReadyWorkspaceStageProps['batchOpsSection']['props']['showBatchOperationPanel'];
  selectedUnitIds: ReadyWorkspaceStageProps['batchOpsSection']['props']['selectedUnitIds'];
  selectedBatchUnits: ReadyWorkspaceStageProps['batchOpsSection']['props']['selectedBatchUnits'];
  unitsOnCurrentMedia: ReadyWorkspaceStageProps['batchOpsSection']['props']['unitsOnCurrentMedia'];
  selectedBatchUnitTextById: ReadyWorkspaceStageProps['batchOpsSection']['props']['selectedBatchUnitTextById'];
  batchPreviewLayerOptions: ReadyWorkspaceStageProps['batchOpsSection']['props']['batchPreviewLayerOptions'];
  batchPreviewTextByLayerId: ReadyWorkspaceStageProps['batchOpsSection']['props']['batchPreviewTextByLayerId'];
  batchPreviewTextPropsByLayerId: ReadyWorkspaceStageProps['batchOpsSection']['props']['batchPreviewTextPropsByLayerId'];
  defaultBatchPreviewLayerId: ReadyWorkspaceStageProps['batchOpsSection']['props']['defaultBatchPreviewLayerId'];
  onCloseBatchOps: ReadyWorkspaceStageProps['batchOpsSection']['props']['onBatchClose'];
  onBatchOffset: ReadyWorkspaceStageProps['batchOpsSection']['props']['onBatchOffset'];
  onBatchScale: ReadyWorkspaceStageProps['batchOpsSection']['props']['onBatchScale'];
  onBatchSplitByRegex: ReadyWorkspaceStageProps['batchOpsSection']['props']['onBatchSplitByRegex'];
  onBatchMerge: ReadyWorkspaceStageProps['batchOpsSection']['props']['onBatchMerge'];
  onBatchJumpToUnit: ReadyWorkspaceStageProps['batchOpsSection']['props']['onBatchJumpToUnit'];
};

/** 第二轮瘦身：把 ReadyWorkspace 的 layout/stage props 拼装集中到 builder。 */
export function buildReadyWorkspaceStageProps(
  input: BuildReadyWorkspaceStagePropsInput,
): ReadyWorkspaceStageProps {
  return {
    toastProps: {
      mode: 'core-only',
      voiceAgent: {
        agentState: 'idle',
        mode: 'command',
        listening: false,
        isRecording: false,
      },
      saveState: input.assistantFrame.saveState,
      recording: input.assistantFrame.recording,
      recordingUnitId: input.assistantFrame.recordingUnitId,
      recordingError: input.assistantFrame.recordingError,
      ...(input.assistantFrame.overlapCycleToast !== undefined ? { overlapCycleToast: input.assistantFrame.overlapCycleToast } : {}),
      ...(input.assistantFrame.lockConflictToast !== undefined ? { lockConflictToast: input.assistantFrame.lockConflictToast } : {}),
      tf: input.assistantFrame.tf,
    },
    recoveryBannerProps: {
      shouldRender: input.shouldRenderRecoveryBanner,
      recoveryAvailable: input.recoveryAvailable,
      recoveryDiffSummary: input.recoveryDiffSummary,
      onApply: input.onApplyRecoveryBanner,
      onDismiss: input.onDismissRecoveryBanner,
    },
    ...(input.collaborationCloudStatusSlot !== undefined
      ? { collaborationCloudStatusSlot: input.collaborationCloudStatusSlot }
      : {}),
    toolbarProps: input.toolbarProps,
    observerProps: {
      observerStage: input.observerStage,
      recommendations: input.recommendations,
      onExecuteRecommendation: input.onExecuteRecommendation,
    },
    acousticRuntimeStatus: input.acousticRuntimeStatus,
    vadCacheStatus: input.vadCacheStatus,
    projectHubProps: {
      currentProjectLabel: input.currentProjectLabel,
      activeTextTimelineMode: input.activeTextTimelineMode ?? null,
      activeTextTimeMapping: input.activeTextTimeMapping ?? null,
      canDeleteProject: input.canDeleteProject,
      canDeleteAudio: input.canDeleteAudio,
      onOpenProjectSetup: input.onOpenProjectSetup,
      onOpenAudioImport: input.onOpenAudioImport,
      onOpenSpeakerManagementPanel: input.onOpenSpeakerManagementPanel,
      onDeleteCurrentProject: input.onDeleteCurrentProject,
      onDeleteCurrentAudio: input.onDeleteCurrentAudio,
      onImportAnnotationFile: async (file: File, strategy: AnnotationImportBridgeStrategy) => {
        await input.handleImportFile(file, strategy);
      },
      onPreviewProjectArchiveImport: input.onPreviewProjectArchiveImport,
      onImportProjectArchive: input.onImportProjectArchive,
      onApplyTextTimeMapping: input.onApplyTextTimeMapping,
      onExportEaf: input.onExportEaf,
      onExportTextGrid: input.onExportTextGrid,
      onExportTrs: input.onExportTrs,
      onExportFlextext: input.onExportFlextext,
      onExportToolbox: input.onExportToolbox,
      onExportJyt: input.onExportJyt,
      onExportJym: input.onExportJym,
    },
    mediaInputProps: {
      ref: input.mediaFileInputRef,
      onChange: input.onDirectMediaImport,
    },
    workspaceAreaProps: {
      waveformSectionRef: input.waveformSectionRef,
      workspaceRef: input.workspaceRef,
      listMainRef: input.listMainRef,
      tierContainerRef: input.tierContainerRef,
      isAiPanelCollapsed: input.isAiPanelCollapsed,
      isTimelineLaneHeaderCollapsed: input.isTimelineLaneHeaderCollapsed,
      readyWorkspaceWaveformContentProps: input.readyWorkspaceWaveformContentProps,
      timelineTopProps: input.timelineTopProps,
      readyWorkspaceSidePaneProps: input.readyWorkspaceSidePaneProps,
      timelineContentProps: input.timelineContentProps,
      editorContextValue: input.editorContextValue,
      aiPanelContextValue: input.aiPanelContextValue,
      lassoHandlers: {
        onPointerDown: input.onLassoPointerDown,
        onPointerMove: input.onLassoPointerMove,
        onPointerUp: input.onLassoPointerUp,
        onScroll: input.onTimelineScroll,
      },
      timelineResizeTooltip: input.timelineResizeTooltip,
      formatTime: input.formatTime,
      zoomControlsProps: {
        zoomPercent: input.zoomPercent,
        snapEnabled: input.snapEnabled,
        autoScrollEnabled: input.autoScrollEnabled,
        activeUnitId: input.activeWaveformUnitId,
        unitsOnCurrentMedia: input.waveformTimelineItems,
        fitPxPerSec: input.fitPxPerSec,
        maxZoomPercent: input.maxZoomPercent,
        onZoomToPercent: input.onZoomToPercent,
        onZoomToUnit: input.onZoomToUnit,
        onSnapEnabledChange: input.onSnapEnabledChange,
        onAutoScrollEnabledChange: input.onAutoScrollEnabledChange,
      },
      historyControlsProps: {
        canUndo: input.canUndo,
        canRedo: input.canRedo,
        undoLabel: input.undoLabel,
        undoHistory: input.undoHistory,
        isHistoryVisible: input.isHistoryVisible,
        onToggleHistoryVisible: input.onToggleHistoryVisible,
        onJumpToHistoryIndex: (idx) => fireAndForget((async () => {
          const tu = input.selectedTimelineUnit;
          input.recordTimelineEdit({
            action: 'undo',
            unitId: (tu?.unitId ?? input.activeTimelineUnitId) || 'history',
            unitKind: tu?.kind ?? 'unit',
            detail: `historyIndex=${idx}`,
          });
          await input.undoToHistoryIndex(idx);
        })()),
        onRedo: () => fireAndForget((async () => {
          const tu = input.selectedTimelineUnit;
          input.recordTimelineEdit({
            action: 'redo',
            unitId: (tu?.unitId ?? input.activeTimelineUnitId) || 'history',
            unitKind: tu?.kind ?? 'unit',
          });
          await input.redo();
        })()),
      },
      aiPanelHandleProps: {
        locale: input.locale,
        isAiPanelCollapsed: input.isAiPanelCollapsed,
        setIsAiPanelCollapsed: input.setIsAiPanelCollapsed,
        handleAiPanelResizeStart: input.handleAiPanelResizeStart,
        handleAiPanelToggle: input.handleAiPanelToggle,
      },
      assistantBridge: {
        controllerInput: input.assistantBridgeControllerInput,
        onRuntimeStateChange: input.onRuntimeStateChange,
      },
      aiSidebarProps: input.aiSidebarProps,
      shouldRenderAiSidebar: input.shouldRenderAiSidebar,
      dialogsProps: input.dialogsProps,
      shouldRenderDialogs: input.shouldRenderDialogs,
      pdfRuntimeProps: input.pdfRuntimeProps,
      shouldRenderPdfRuntime: input.shouldRenderPdfRuntime,
    },
    batchOpsSection: {
      shouldRender: input.shouldRenderBatchOps,
      props: {
        showBatchOperationPanel: input.showBatchOperationPanel,
        selectedUnitIds: input.selectedUnitIds,
        selectedBatchUnits: input.selectedBatchUnits,
        unitsOnCurrentMedia: input.unitsOnCurrentMedia,
        selectedBatchUnitTextById: input.selectedBatchUnitTextById,
        batchPreviewLayerOptions: input.batchPreviewLayerOptions,
        batchPreviewTextByLayerId: input.batchPreviewTextByLayerId,
        batchPreviewTextPropsByLayerId: input.batchPreviewTextPropsByLayerId ?? {},
        defaultBatchPreviewLayerId: input.defaultBatchPreviewLayerId,
        onBatchClose: input.onCloseBatchOps,
        onBatchOffset: input.onBatchOffset,
        onBatchScale: input.onBatchScale,
        onBatchSplitByRegex: input.onBatchSplitByRegex,
        onBatchMerge: input.onBatchMerge,
        onBatchJumpToUnit: input.onBatchJumpToUnit,
      },
    },
  };
}
