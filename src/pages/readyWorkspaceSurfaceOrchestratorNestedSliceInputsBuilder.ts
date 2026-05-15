import {
  buildReadyWorkspaceSurfaceControllersSlice,
  buildReadyWorkspaceSurfaceLayoutSlice,
} from './transcriptionReadyWorkspaceSurfaceNestedSlicesBuilder';
import type { ReadyWorkspaceSurfacePropsOrchestratorInputSliceArgs } from './readyWorkspaceSurfacePropsOrchestratorInputSlice';
import type {
  ReadyWorkspaceSurfaceControllersSliceContract,
  ReadyWorkspaceSurfaceOverlaysSliceContract,
  ReadyWorkspaceSurfaceWaveformSliceContract,
} from './readyWorkspaceSurfaceSliceContracts';
import type { ReadyWorkspaceSidePaneSpeakerActionScopeContract } from './transcriptionReadyWorkspaceSidePaneInputBuilder';

type LayoutSliceInput = Parameters<typeof buildReadyWorkspaceSurfaceLayoutSlice>[0];
type ControllersSliceInput = Parameters<typeof buildReadyWorkspaceSurfaceControllersSlice>[0];

export type ReadyWorkspaceSurfaceOrchestratorNestedSliceInputs = Pick<
  ReadyWorkspaceSurfacePropsOrchestratorInputSliceArgs,
  'layoutInput' | 'waveformInput' | 'overlaysInput' | 'controllersInput'
>;

/**
 * Flat dependency bag for assembling nested surface slice inputs in one place
 * (`TranscriptionPage.ReadyWorkspaceOrchestrator.tsx` passes shorthand fields).
 */
export type ReadyWorkspaceSurfaceOrchestratorNestedSliceAssemblyDeps = LayoutSliceInput & {
  waveformAreaRef: unknown;
  snapGuide: unknown;
  segMarkStart: unknown;
  isResizingWaveform: unknown;
  waveformHeight: unknown;
  handleWaveformAreaFocus: unknown;
  handleWaveformAreaBlur: unknown;
  handleWaveformAreaMouseMove: unknown;
  handleWaveformAreaMouseLeave: unknown;
  handleWaveformAreaWheel: unknown;
  hoverTime: unknown;
  unitsOnCurrentMedia: unknown;
  waveformHoverPreviewProps: unknown;
  toggleSnapEnabled: unknown;
  amplitudeScale: unknown;
  setAmplitudeScale: unknown;
  setVideoLayoutMode: unknown;
  handleLaneLabelWidthResizeStart: unknown;
  videoPreviewHeight: unknown;
  waveformRegions: unknown;
  selectedUnitIds: Set<string>;
  activeTimelineUnitId: string;
  segmentLoopPlayback: unknown;
  subSelectionRange: unknown;
  isResizingVideoPreview: unknown;
  isResizingVideoRightPanel: unknown;
  handleVideoPreviewResizeStart: unknown;
  handleVideoRightPanelResizeStart: unknown;
  waveformDisplayMode: unknown;
  waveCanvasRef: unknown;
  waveformStripWheelShellRef: unknown;
  segmentRangeGesturePreviewReadModel: unknown;
  waveformNoteIndicators: unknown;
  waveformLowConfidenceOverlays: unknown;
  waveformOverlapOverlays: unknown;
  acousticOverlayMode: unknown;
  acousticOverlayViewportWidth: unknown;
  acousticOverlayF0Path: unknown;
  acousticOverlayIntensityPath: unknown;
  acousticOverlayVisibleSummary: unknown;
  acousticOverlayLoading: unknown;
  waveformHoverReadout: unknown;
  spectrogramHoverReadout: unknown;
  selectedHotspotTimeSec: unknown;
  handleSpectrogramMouseMove: unknown;
  handleSpectrogramMouseLeave: unknown;
  handleSpectrogramClick: unknown;
  setNotePopover: unknown;
  selectedWaveformTimelineItem: unknown;
  playerInstanceGetWidth: unknown;
  waveformScrollLeft: unknown;
  segmentPlaybackRate: unknown;
  handleSegmentPlaybackRateChange: unknown;
  handleToggleSelectedWaveformLoop: unknown;
  handleToggleSelectedWaveformPlay: unknown;
  selectedTimelineUnitForTime: unknown;
  timelineViewportProjection: unknown;
  timelineReadModel: unknown;
  playbackKeyboardController: { handleWaveformKeyDown: unknown; toggleVoiceRef: unknown };
  player: {
    playbackRate: unknown;
    instanceRef: { current: { getCurrentTime: () => number } | null };
  };
  waveformAcousticRuntimeStatus: unknown;
  waveformVadCacheStatus: unknown;
  tierContainerRef: unknown;
  getUnitTextForLayer: unknown;
  waveformSectionRef: unknown;
  workspaceRef: unknown;
  listMainRef: unknown;
  snapEnabled: boolean;
  ctxMenu: unknown;
  setCtxMenu: unknown;
  uttOpsMenu: unknown;
  setUttOpsMenu: unknown;
  selectedTimelineUnit: unknown;
  runOverlayDeleteSelection: unknown;
  runOverlayMergeSelection: unknown;
  runSelectBefore: unknown;
  runSelectAfter: unknown;
  runOverlayDeleteOne: unknown;
  runOverlayMergePrev: unknown;
  runOverlayMergeNext: unknown;
  runOverlaySplitAtTime: unknown;
  deleteConfirmState: unknown;
  muteDeleteConfirmInSession: unknown;
  setMuteDeleteConfirmInSession: unknown;
  closeDeleteConfirmDialog: unknown;
  confirmDeleteFromDialog: unknown;
  notePopover: unknown;
  currentNotes: unknown;
  addNote: unknown;
  updateNote: unknown;
  deleteNote: unknown;
  units: unknown;
  selfCertaintyController: unknown;
  transcriptionLayers: unknown;
  translationLayers: unknown;
  speakerController: unknown;
  speakerActionScopeController: unknown;
  timelineUnitViewIndex: { currentMediaUnits: unknown };
  toggleSkipProcessingRouted: unknown;
  displayStyleControl: unknown;
  trackDisplayController: ControllersSliceInput['trackDisplay'];
  timelineController: ControllersSliceInput['timeline'];
  batchOperationController: ControllersSliceInput['batch'];
  projectMediaController: unknown;
  importExportController: ControllersSliceInput['importExport'];
  annotationController: ControllersSliceInput['annotation'];
};

/**
 * Assembles `layoutInput` / `waveformInput` / `overlaysInput` / `controllersInput` for surface orchestrator.
 */
export function buildReadyWorkspaceSurfaceOrchestratorNestedSliceInputs(
  d: ReadyWorkspaceSurfaceOrchestratorNestedSliceAssemblyDeps,
): ReadyWorkspaceSurfaceOrchestratorNestedSliceInputs {
  const layoutInput: LayoutSliceInput = {
    uiFontScale: d.uiFontScale,
    adaptiveDialogWidth: d.adaptiveDialogWidth,
    adaptiveDialogCompactWidth: d.adaptiveDialogCompactWidth,
    adaptiveDialogWideWidth: d.adaptiveDialogWideWidth,
    aiPanelWidth: d.aiPanelWidth,
    isAiPanelCollapsed: d.isAiPanelCollapsed,
    laneLabelWidth: d.laneLabelWidth,
    isTimelineLaneHeaderCollapsed: d.isTimelineLaneHeaderCollapsed,
    selectedMediaUrl: d.selectedMediaUrl as string | null | undefined,
    selectedMediaIsVideo: d.selectedMediaIsVideo,
    videoLayoutMode: d.videoLayoutMode,
    videoRightPanelWidth: d.videoRightPanelWidth,
  };

  const pb = d.playbackKeyboardController;
  const player = d.player;

  const waveformInput = {
    waveformAreaRef: d.waveformAreaRef,
    snapGuide: d.snapGuide,
    segMarkStart: d.segMarkStart,
    isResizingWaveform: d.isResizingWaveform,
    waveformHeight: d.waveformHeight,
    handleWaveformKeyDown: pb.handleWaveformKeyDown,
    handleWaveformAreaFocus: d.handleWaveformAreaFocus,
    handleWaveformAreaBlur: d.handleWaveformAreaBlur,
    handleWaveformAreaMouseMove: d.handleWaveformAreaMouseMove,
    handleWaveformAreaMouseLeave: d.handleWaveformAreaMouseLeave,
    handleWaveformAreaWheel: d.handleWaveformAreaWheel,
    hoverTime: d.hoverTime,
    unitsOnCurrentMedia: d.unitsOnCurrentMedia,
    waveformHoverPreviewProps: d.waveformHoverPreviewProps,
    zoomPercent: (d.timelineViewportProjection as { zoomPercent: number }).zoomPercent,
    snapEnabled: d.snapEnabled,
    toggleSnapEnabled: d.toggleSnapEnabled,
    playerPlaybackRate: player.playbackRate,
    amplitudeScale: d.amplitudeScale,
    setAmplitudeScale: d.setAmplitudeScale,
    selectedMediaIsVideo: d.selectedMediaIsVideo,
    videoLayoutMode: d.videoLayoutMode,
    setVideoLayoutMode: d.setVideoLayoutMode,
    handleLaneLabelWidthResizeStart: d.handleLaneLabelWidthResizeStart,
    videoPreviewHeight: d.videoPreviewHeight,
    videoRightPanelWidth: d.videoRightPanelWidth,
    waveformRegions: d.waveformRegions,
    selectedUnitIds: d.selectedUnitIds,
    activeTimelineUnitId: d.activeTimelineUnitId,
    segmentLoopPlayback: d.segmentLoopPlayback,
    subSelectionRange: d.subSelectionRange,
    isResizingVideoPreview: d.isResizingVideoPreview,
    isResizingVideoRightPanel: d.isResizingVideoRightPanel,
    handleVideoPreviewResizeStart: d.handleVideoPreviewResizeStart,
    handleVideoRightPanelResizeStart: d.handleVideoRightPanelResizeStart,
    waveformDisplayMode: d.waveformDisplayMode,
    waveCanvasRef: d.waveCanvasRef,
    waveformStripWheelShellRef: d.waveformStripWheelShellRef,
    segmentRangeGesturePreviewReadModel: d.segmentRangeGesturePreviewReadModel,
    waveformNoteIndicators: d.waveformNoteIndicators,
    waveformLowConfidenceOverlays: d.waveformLowConfidenceOverlays,
    waveformOverlapOverlays: d.waveformOverlapOverlays,
    acousticOverlayMode: d.acousticOverlayMode,
    acousticOverlayViewportWidth: d.acousticOverlayViewportWidth,
    acousticOverlayF0Path: d.acousticOverlayF0Path,
    acousticOverlayIntensityPath: d.acousticOverlayIntensityPath,
    acousticOverlayVisibleSummary: d.acousticOverlayVisibleSummary,
    acousticOverlayLoading: d.acousticOverlayLoading,
    waveformHoverReadout: d.waveformHoverReadout,
    spectrogramHoverReadout: d.spectrogramHoverReadout,
    selectedHotspotTimeSec: d.selectedHotspotTimeSec,
    handleSpectrogramMouseMove: d.handleSpectrogramMouseMove,
    handleSpectrogramMouseLeave: d.handleSpectrogramMouseLeave,
    handleSpectrogramClick: d.handleSpectrogramClick,
    setNotePopover: d.setNotePopover,
    selectedWaveformTimelineItem: d.selectedWaveformTimelineItem,
    playerInstanceGetWidth: d.playerInstanceGetWidth,
    waveformScrollLeft: d.waveformScrollLeft,
    segmentPlaybackRate: d.segmentPlaybackRate,
    handleSegmentPlaybackRateChange: d.handleSegmentPlaybackRateChange,
    handleToggleSelectedWaveformLoop: d.handleToggleSelectedWaveformLoop,
    handleToggleSelectedWaveformPlay: d.handleToggleSelectedWaveformPlay,
    selectedTimelineUnitForTime: d.selectedTimelineUnitForTime,
    timelineViewportProjection: d.timelineViewportProjection,
    mediaFileInputRef: (d.projectMediaController as { mediaFileInputRef: unknown })
      .mediaFileInputRef,
    acousticStrip: {
      acoustic: (d.timelineReadModel as { acoustic: unknown }).acoustic,
      waveCanvasRef: d.waveCanvasRef,
      tierContainerRef: d.tierContainerRef,
    },
    runtimeStatus: {
      acousticRuntimeStatus: d.waveformAcousticRuntimeStatus,
      vadCacheStatus: d.waveformVadCacheStatus,
    },
    getUnitTextForLayer: d.getUnitTextForLayer,
    waveformSectionRef: d.waveformSectionRef,
    workspaceRef: d.workspaceRef,
    listMainRef: d.listMainRef,
  } as unknown as ReadyWorkspaceSurfaceWaveformSliceContract;

  const overlaysInput = {
    ctxMenu: d.ctxMenu,
    setCtxMenu: d.setCtxMenu,
    uttOpsMenu: d.uttOpsMenu,
    setUttOpsMenu: d.setUttOpsMenu,
    selectedTimelineUnit: d.selectedTimelineUnit ?? null,
    selectedUnitIds: d.selectedUnitIds,
    runDeleteSelection: d.runOverlayDeleteSelection,
    runMergeSelection: d.runOverlayMergeSelection,
    runSelectBefore: d.runSelectBefore,
    runSelectAfter: d.runSelectAfter,
    runDeleteOne: d.runOverlayDeleteOne,
    runMergePrev: d.runOverlayMergePrev,
    runMergeNext: d.runOverlayMergeNext,
    runSplitAtTime: d.runOverlaySplitAtTime,
    getCurrentTime: () => player.instanceRef.current?.getCurrentTime() ?? 0,
    setNotePopover: d.setNotePopover,
    deleteConfirmState: d.deleteConfirmState,
    muteDeleteConfirmInSession: d.muteDeleteConfirmInSession,
    setMuteDeleteConfirmInSession: d.setMuteDeleteConfirmInSession,
    closeDeleteConfirmDialog: d.closeDeleteConfirmDialog,
    confirmDeleteFromDialog: d.confirmDeleteFromDialog,
    notePopover: d.notePopover,
    currentNotes: d.currentNotes,
    addNote: d.addNote,
    updateNote: d.updateNote,
    deleteNote: d.deleteNote,
    units: d.units,
    resolveSelfCertaintyUnitIds: (
      d.selfCertaintyController as { resolveSelfCertaintyUnitIds: unknown }
    ).resolveSelfCertaintyUnitIds,
    getUnitTextForLayer: d.getUnitTextForLayer,
    transcriptionLayers: d.transcriptionLayers,
    translationLayers: d.translationLayers,
    speakerOptions: (d.speakerController as { speakerOptions: unknown }).speakerOptions,
    speakerFilterOptions: (
      d.speakerActionScopeController as { speakerFilterOptionsForActions: unknown }
    ).speakerFilterOptionsForActions,
    onAssignSpeakerFromMenu: (d.speakerController as { handleAssignSpeakerFromMenu: unknown })
      .handleAssignSpeakerFromMenu,
    onSetUnitSelfCertaintyFromMenu: (
      d.selfCertaintyController as { handleSetUnitSelfCertaintyFromMenu: unknown }
    ).handleSetUnitSelfCertaintyFromMenu,
    timelineUnitsOnCurrentMedia: d.timelineUnitViewIndex.currentMediaUnits,
    toggleSkipProcessingRouted: d.toggleSkipProcessingRouted,
    onOpenSpeakerManagementPanelFromMenu: (
      d.speakerController as { handleOpenSpeakerManagementPanel: unknown }
    ).handleOpenSpeakerManagementPanel,
    displayStyleControl: d.displayStyleControl,
  } as ReadyWorkspaceSurfaceOverlaysSliceContract;

  const controllersInput: ControllersSliceInput = {
    speaker: d.speakerController as ReadyWorkspaceSurfaceControllersSliceContract['speaker'],
    trackDisplay: d.trackDisplayController,
    timeline: d.timelineController,
    batch: d.batchOperationController,
    projectMedia: d.projectMediaController as ControllersSliceInput['projectMedia'],
    importExport: d.importExportController,
    playbackKeyboard: {
      playbackKeyboardController: d.playbackKeyboardController,
      timelineReadModel: d.timelineReadModel,
    } as ControllersSliceInput['playbackKeyboard'],
    annotation: d.annotationController,
    selfCertainty: d.selfCertaintyController as ControllersSliceInput['selfCertainty'],
    speakerActionScope:
      d.speakerActionScopeController as ReadyWorkspaceSidePaneSpeakerActionScopeContract,
  };

  return {
    layoutInput,
    waveformInput,
    overlaysInput,
    controllersInput,
  };
}
