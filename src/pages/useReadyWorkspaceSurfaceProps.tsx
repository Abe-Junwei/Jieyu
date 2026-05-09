/**
 * useReadyWorkspaceSurfaceProps
 *
 * Encapsulates all surface props builders for TranscriptionPageReadyWorkspace.
 * Extracted from TranscriptionPage.ReadyWorkspace.tsx to reduce component size.
 */

import type { CSSProperties } from 'react';
import { hasSupabaseBrowserClientConfig } from '../integrations/supabase/client';
import { CollaborationCloudReadOnlyBanner } from '../components/transcription/CollaborationCloudReadOnlyBanner';
import {
  buildReadyWorkspaceSidePaneProps,
  buildReadyWorkspaceWaveformContentProps,
  buildReadyWorkspaceOverlaysProps,
  buildReadyWorkspaceLayoutStyle,
  buildReadyWorkspaceStageProps,
} from './transcriptionReadyWorkspacePropsBuilders';
import {
  buildReadyWorkspaceSidePanePropsInput,
  buildReadyWorkspaceWaveformContentPropsInput,
  buildReadyWorkspaceOverlaysPropsInput,
  buildReadyWorkspaceLayoutStyleInput,
  buildReadyWorkspaceStagePropsInput,
} from './transcriptionReadyWorkspaceSurfaceInputBuilder';
import type { TranscriptionPageSidePaneProps } from './TranscriptionPage.SidePane';
import type { OrchestratorWaveformContentProps } from './OrchestratorWaveformContent';
import type { TranscriptionOverlaysProps } from '../components/TranscriptionOverlays';
import type { TranscriptionPageReadyWorkspaceLayoutProps } from './TranscriptionPage.ReadyWorkspaceLayout';

export interface UseReadyWorkspaceSurfacePropsInput {
  locale: string;
  activeTextId: unknown;
  selectedTimelineMedia: unknown | undefined;
  selectedMediaUrl: unknown;
  segmentScopeMediaId: unknown;
  verticalViewActive: boolean;
  activeTextTimelineMode: unknown;
  activeTextTimeMapping: unknown;
  canUndo: boolean;
  canRedo: boolean;
  undoLabel: string;
  undoHistory: unknown;
  showUndoHistory: boolean;
  setShowUndoHistory: (v: boolean) => void;
  redo: unknown;
  selectedTimelineUnit: unknown;
  activeTimelineUnitId: string;
  recordTimelineEdit: unknown;
  undoToHistoryIndex: unknown;
  setShowProjectSetup: (v: boolean) => void;
  setShowAudioImport: (v: boolean) => void;
  applyTextTimeMapping: unknown;
  selectedUnitIds: Set<string>;
  batchPreviewTextPropsByLayerId: unknown;
  showBatchOperationPanel: boolean;
  setShowBatchOperationPanel: (v: boolean) => void;
  selectedWaveformRegionId: string | null;
  waveformTimelineItems: unknown;
  zoomToPercent: unknown;
  zoomToUnit: unknown;
  snapEnabled: boolean;
  autoScrollEnabled: boolean;
  setSnapEnabled: (v: boolean) => void;
  setAutoScrollEnabled: (v: boolean) => void;
  setIsAiPanelCollapsed: (v: boolean) => void;
  handleAiPanelToggle: () => void;
  handleAiPanelResizeStart: unknown;
  handleLassoPointerDown: unknown;
  handleLassoPointerMove: unknown;
  handleLassoPointerUp: unknown;
  handleTimelineScroll: unknown;
  recoveryAvailable: boolean;
  recoveryDiffSummary: unknown;
  applyRecoveryBanner: () => void;
  dismissRecoveryBanner: () => void;
  toolbarPropsWithCollaboration: unknown;
  observerResult: { stage: unknown };
  actionableObserverRecommendations: unknown | null;
  handleExecuteObserverRecommendation: (item: { id: string }) => void;
  deferredAiRuntime: { acousticRuntimeStatus: unknown };
  vadCacheStatus: unknown;
  collaborationProtocolGuard: unknown;
  assistantBridgeControllerInput: unknown;
  handleDeferredAiRuntimeChange: unknown;
  selectUnit: (id: string) => void;
  formatTime: unknown;
  defaultTranscriptionLayerId: unknown;
  translationLayers: unknown[];
  orderedLayers: unknown[];
  handleFocusLayerRow: unknown;
  layerLinks: unknown;
  toggleLayerLink: unknown;
  deletableLayers: unknown;
  updateLayerMetadata: unknown;
  layerCreateMessage: unknown;
  layerAction: unknown;
  segmentsByLayer: unknown;
  segmentContentByLayer: unknown;
  unitsOnCurrentMedia: unknown;
  speakers: unknown;
  listProjectAssets: unknown;
  removeProjectAsset: unknown;
  getProjectAssetSignedUrl: unknown;
  listProjectSnapshots: unknown;
  restoreProjectSnapshotToLocalById: unknown;
  queryProjectChangeTimeline: unknown;
  listAccessibleCloudProjects: unknown;
  listCloudProjectMembers: unknown;
  getUnitTextForLayer: unknown;
  selectTimelineUnit: unknown;
  reorderLayers: unknown;
  onSelectWorkspaceHorizontalLayout: () => void;
  onSelectWorkspaceVerticalLayout: () => void;
  units: unknown;
  notePopover: unknown;
  setNotePopover: unknown;
  currentNotes: unknown;
  addNote: unknown;
  updateNote: unknown;
  deleteNote: unknown;
  ctxMenu: unknown;
  setCtxMenu: unknown;
  uttOpsMenu: unknown;
  setUttOpsMenu: unknown;
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
  displayStyleControl: unknown;
  toggleSkipProcessingRouted: unknown;
  player: unknown;
  timelineViewportProjection: unknown;
  waveformAcousticRuntimeStatus: unknown;
  waveformVadCacheStatus: unknown;
  assistantSidebarController: unknown;
  assistantController: { aiPanelContextValue: unknown };
  readyWorkspaceViewModels: unknown;
  readyWorkspaceRenderController: {
    shouldRenderRecoveryBanner: boolean;
    shouldRenderAiSidebar: boolean;
    shouldRenderDialogs: boolean;
    shouldRenderPdfRuntime: boolean;
    shouldRenderBatchOps: boolean;
  };
  readyWorkspaceAxisStatusController: unknown;
  workspacePanelEffectsController: { handleAiPanelResizeStart: unknown };
  timelineResizeController: unknown;
  controllers: Record<string, unknown>;
  layout: {
    uiFontScale: number;
    adaptiveDialogWidth: number;
    adaptiveDialogCompactWidth: number;
    adaptiveDialogWideWidth: number;
    aiPanelWidth: number;
    isAiPanelCollapsed: boolean;
    laneLabelWidth: number;
    isTimelineLaneHeaderCollapsed: boolean;
    selectedMediaUrl: unknown;
    selectedMediaIsVideo: boolean;
    videoLayoutMode: string;
    videoRightPanelWidth: number;
  };
  waveform: Record<string, unknown>;
  overlays: Record<string, unknown>;
}

export interface UseReadyWorkspaceSurfacePropsResult {
  readyWorkspaceSidePaneProps: TranscriptionPageSidePaneProps;
  readyWorkspaceWaveformContentProps: OrchestratorWaveformContentProps;
  readyWorkspaceOverlaysProps: TranscriptionOverlaysProps;
  readyWorkspaceLayoutStyle: CSSProperties;
  readyWorkspaceStageProps: NonNullable<
    TranscriptionPageReadyWorkspaceLayoutProps['readyStageProps']
  >;
}

export function useReadyWorkspaceSurfaceProps(
  input: UseReadyWorkspaceSurfacePropsInput,
): UseReadyWorkspaceSurfacePropsResult {
  const i = input as any;
  const c = i.controllers as any;
  const w = i.waveform as any;
  const o = i.overlays as any;
  const l = i.layout;

  const readyWorkspaceSidePaneProps = buildReadyWorkspaceSidePaneProps(
    buildReadyWorkspaceSidePanePropsInput({
      speakerActionScopeController: c.speakerActionScope,
      speakerController: c.speaker,
      sidePaneRows: i.orderedLayers,
      focusedLayerRowId: i.focusedLayerRowId,
      flashLayerRowId: i.flashLayerRowId,
      onFocusLayer: i.handleFocusLayerRow,
      transcriptionLayers: i.translationLayers,
      layerLinks: i.layerLinks,
      toggleLayerLink: i.toggleLayerLink,
      deletableLayers: i.deletableLayers,
      updateLayerMetadata: i.updateLayerMetadata,
      layerCreateMessage: i.layerCreateMessage,
      layerAction: i.layerAction,
      ...(i.defaultTranscriptionLayerId !== undefined
        ? { defaultTranscriptionLayerId: i.defaultTranscriptionLayerId }
        : {}),
      segmentsByLayer: i.segmentsByLayer,
      segmentContentByLayer: i.segmentContentByLayer,
      unitsOnCurrentMedia: i.unitsOnCurrentMedia,
      speakers: i.speakers,
      listProjectAssets: i.listProjectAssets,
      removeProjectAsset: i.removeProjectAsset,
      getProjectAssetSignedUrl: i.getProjectAssetSignedUrl,
      listProjectSnapshots: i.listProjectSnapshots,
      restoreProjectSnapshotToLocalById: i.restoreProjectSnapshotToLocalById,
      queryProjectChangeTimeline: i.queryProjectChangeTimeline,
      supabaseConfigured: hasSupabaseBrowserClientConfig(),
      activeTextId: i.activeTextId,
      listAccessibleCloudProjects: i.listAccessibleCloudProjects,
      listCloudProjectMembers: i.listCloudProjectMembers,
      getUnitTextForLayer: i.getUnitTextForLayer,
      onSelectTimelineUnit: i.selectTimelineUnit,
      onReorderLayers: i.reorderLayers,
      locale: i.locale,
      verticalViewActive: i.verticalViewActive,
      translationLayerCount: i.translationLayers.length,
      onSelectWorkspaceHorizontalLayout: i.onSelectWorkspaceHorizontalLayout,
      onSelectWorkspaceVerticalLayout: i.onSelectWorkspaceVerticalLayout,
    } as any),
  );

  const readyWorkspaceWaveformContentProps = buildReadyWorkspaceWaveformContentProps(
    buildReadyWorkspaceWaveformContentPropsInput({
      locale: i.locale,
      waveformAreaRef: w.waveformAreaRef,
      snapGuideNearSide: w.snapGuide?.nearSide,
      segMarkStart: w.segMarkStart,
      isResizingWaveform: w.isResizingWaveform,
      waveformHeight: w.waveformHeight,
      handleWaveformKeyDown: w.handleWaveformKeyDown,
      handleWaveformAreaFocus: w.handleWaveformAreaFocus,
      handleWaveformAreaBlur: w.handleWaveformAreaBlur,
      handleWaveformAreaMouseMove: w.handleWaveformAreaMouseMove,
      handleWaveformAreaMouseLeave: w.handleWaveformAreaMouseLeave,
      handleWaveformAreaWheel: w.handleWaveformAreaWheel,
      hoverTime: w.hoverTime,
      unitsOnCurrentMedia: i.unitsOnCurrentMedia,
      getUnitTextForLayer: i.getUnitTextForLayer,
      waveformHoverPreviewProps: w.waveformHoverPreviewProps,
      selectedMediaUrl: i.selectedMediaUrl,
      zoomPercent: w.zoomPercent,
      snapEnabled: w.snapEnabled,
      toggleSnapEnabled: w.toggleSnapEnabled,
      playerPlaybackRate: w.playerPlaybackRate,
      amplitudeScale: w.amplitudeScale,
      setAmplitudeScale: w.setAmplitudeScale,
      selectedMediaIsVideo: w.selectedMediaIsVideo,
      videoLayoutMode: w.videoLayoutMode,
      setVideoLayoutMode: w.setVideoLayoutMode,
      handleLaneLabelWidthResizeStart: w.handleLaneLabelWidthResizeStart,
      videoPreviewHeight: w.videoPreviewHeight,
      videoRightPanelWidth: w.videoRightPanelWidth,
      waveformRegions: w.waveformRegions,
      selectedUnitIds: w.selectedUnitIds,
      activeTimelineUnitId: w.activeTimelineUnitId,
      segmentLoopPlayback: w.segmentLoopPlayback,
      subSelectionRange: w.subSelectionRange,
      isResizingVideoPreview: w.isResizingVideoPreview,
      isResizingVideoRightPanel: w.isResizingVideoRightPanel,
      handleVideoPreviewResizeStart: w.handleVideoPreviewResizeStart,
      handleVideoRightPanelResizeStart: w.handleVideoRightPanelResizeStart,
      waveformDisplayMode: w.waveformDisplayMode,
      waveCanvasRef: w.waveCanvasRef,
      waveformStripWheelShellRef: w.waveformStripWheelShellRef,
      segmentRangeGesturePreviewReadModel: w.segmentRangeGesturePreviewReadModel,
      waveformNoteIndicators: w.waveformNoteIndicators,
      waveformLowConfidenceOverlays: w.waveformLowConfidenceOverlays,
      waveformOverlapOverlays: w.waveformOverlapOverlays,
      acousticOverlayMode: w.acousticOverlayMode,
      acousticOverlayViewportWidth: w.acousticOverlayViewportWidth,
      acousticOverlayF0Path: w.acousticOverlayF0Path,
      acousticOverlayIntensityPath: w.acousticOverlayIntensityPath,
      acousticOverlayVisibleSummary: w.acousticOverlayVisibleSummary,
      acousticOverlayLoading: w.acousticOverlayLoading,
      waveformHoverReadout: w.waveformHoverReadout,
      spectrogramHoverReadout: w.spectrogramHoverReadout,
      selectedHotspotTimeSec: w.selectedHotspotTimeSec,
      handleSpectrogramMouseMove: w.handleSpectrogramMouseMove,
      handleSpectrogramMouseLeave: w.handleSpectrogramMouseLeave,
      handleSpectrogramClick: w.handleSpectrogramClick,
      setNotePopover: i.setNotePopover,
      selectedWaveformTimelineItem: w.selectedWaveformTimelineItem,
      playerInstanceGetWidth: w.playerInstanceGetWidth,
      waveformScrollLeft: w.waveformScrollLeft,
      segmentPlaybackRate: w.segmentPlaybackRate,
      handleSegmentPlaybackRateChange: w.handleSegmentPlaybackRateChange,
      handleToggleSelectedWaveformLoop: w.handleToggleSelectedWaveformLoop,
      handleToggleSelectedWaveformPlay: w.handleToggleSelectedWaveformPlay,
      selectedTimelineUnitForTime: w.selectedTimelineUnitForTime,
      runtimeStatus: w.runtimeStatus,
      snapGuide: {
        visible: w.snapGuide?.visible,
        left: w.snapGuide?.left,
        right: w.snapGuide?.right,
        nearSide: w.snapGuide?.nearSide,
      },
      playerBridge: {
        spectrogramRef: i.player?.spectrogramRef,
        waveformRef: i.player?.waveformRef,
        seekTo: i.player?.seekTo,
        playRegion: i.player?.playRegion,
        duration: i.player?.duration,
        isReady: i.player?.isReady,
        isPlaying: i.player?.isPlaying,
      },
      timelineViewportProjection: {
        rulerView: w.timelineViewportProjection?.rulerView,
        zoomPxPerSec: w.timelineViewportProjection?.zoomPxPerSec,
      },
      mediaFileInputRef: w.mediaFileInputRef,
      acousticStrip: w.acousticStrip,
    } as any),
  );

  const readyWorkspaceOverlaysProps = buildReadyWorkspaceOverlaysProps(
    buildReadyWorkspaceOverlaysPropsInput({
      ctxMenu: o.ctxMenu,
      setCtxMenu: o.setCtxMenu,
      uttOpsMenu: o.uttOpsMenu,
      setUttOpsMenu: o.setUttOpsMenu,
      selectedTimelineUnit: o.selectedTimelineUnit,
      selectedUnitIds: o.selectedUnitIds,
      runDeleteSelection: o.runDeleteSelection,
      runMergeSelection: o.runMergeSelection,
      runSelectBefore: o.runSelectBefore,
      runSelectAfter: o.runSelectAfter,
      runDeleteOne: o.runDeleteOne,
      runMergePrev: o.runMergePrev,
      runMergeNext: o.runMergeNext,
      runSplitAtTime: o.runSplitAtTime,
      getCurrentTime: o.getCurrentTime,
      setNotePopover: o.setNotePopover,
      deleteConfirmState: o.deleteConfirmState,
      muteDeleteConfirmInSession: o.muteDeleteConfirmInSession,
      setMuteDeleteConfirmInSession: o.setMuteDeleteConfirmInSession,
      closeDeleteConfirmDialog: o.closeDeleteConfirmDialog,
      confirmDeleteFromDialog: o.confirmDeleteFromDialog,
      notePopover: o.notePopover,
      currentNotes: o.currentNotes,
      addNote: o.addNote,
      updateNote: o.updateNote,
      deleteNote: o.deleteNote,
      units: o.units,
      resolveSelfCertaintyUnitIds: c.selfCertainty?.resolveSelfCertaintyUnitIds,
      getUnitTextForLayer: o.getUnitTextForLayer,
      transcriptionLayers: o.transcriptionLayers,
      translationLayers: o.translationLayers,
      speakerOptions: o.speakerOptions,
      speakerFilterOptions: o.speakerFilterOptions,
      onAssignSpeakerFromMenu: o.onAssignSpeakerFromMenu,
      onSetUnitSelfCertaintyFromMenu: o.onSetUnitSelfCertaintyFromMenu,
      timelineUnitsOnCurrentMedia: o.timelineUnitsOnCurrentMedia,
      toggleSkipProcessingRouted: o.toggleSkipProcessingRouted,
      onOpenSpeakerManagementPanelFromMenu: o.onOpenSpeakerManagementPanelFromMenu,
      displayStyleControl: o.displayStyleControl,
    } as any),
  );

  const readyWorkspaceLayoutStyle = buildReadyWorkspaceLayoutStyle(
    buildReadyWorkspaceLayoutStyleInput({
      uiFontScale: l.uiFontScale,
      adaptiveDialogWidth: l.adaptiveDialogWidth,
      adaptiveDialogCompactWidth: l.adaptiveDialogCompactWidth,
      adaptiveDialogWideWidth: l.adaptiveDialogWideWidth,
      aiPanelWidth: l.aiPanelWidth,
      isAiPanelCollapsed: l.isAiPanelCollapsed,
      laneLabelWidth: l.laneLabelWidth,
      isTimelineLaneHeaderCollapsed: l.isTimelineLaneHeaderCollapsed,
      selectedMediaUrl: l.selectedMediaUrl,
      selectedMediaIsVideo: l.selectedMediaIsVideo,
      videoLayoutMode: l.videoLayoutMode,
      videoRightPanelWidth: l.videoRightPanelWidth,
    }),
  );

  const readyWorkspaceStageProps = buildReadyWorkspaceStageProps(
    buildReadyWorkspaceStagePropsInput({
      assistantFrame: i.assistantSidebarController?.assistantRuntimeProps?.frame,
      shouldRenderRecoveryBanner: i.readyWorkspaceRenderController?.shouldRenderRecoveryBanner,
      recoveryAvailable: i.recoveryAvailable,
      recoveryDiffSummary: i.recoveryDiffSummary,
      onApplyRecoveryBanner: i.applyRecoveryBanner,
      onDismissRecoveryBanner: i.dismissRecoveryBanner,
      collaborationCloudStatusSlot: (
        <CollaborationCloudReadOnlyBanner
          locale={i.locale as any}
          guard={i.collaborationProtocolGuard as any}
        />
      ),
      toolbarProps: i.toolbarPropsWithCollaboration,
      observerStage: i.observerResult?.stage,
      recommendations: i.actionableObserverRecommendations || [],
      onExecuteRecommendation: i.handleExecuteObserverRecommendation,
      acousticRuntimeStatus: i.deferredAiRuntime?.acousticRuntimeStatus,
      vadCacheStatus: i.vadCacheStatus,
      currentProjectLabel: i.readyWorkspaceViewModels?.toolbarProps?.filename,
      ...(i.selectedTimelineMedia !== undefined
        ? { selectedTimelineMedia: i.selectedTimelineMedia }
        : {}),
      activeTextTimelineMode: i.activeTextTimelineMode,
      activeTextTimeMapping: i.activeTextTimeMapping,
      canDeleteProject: Boolean(i.activeTextId),
      ...(i.selectedMediaUrl !== undefined ? { selectedMediaUrl: i.selectedMediaUrl } : {}),
      setShowProjectSetup: i.setShowProjectSetup,
      setShowAudioImport: i.setShowAudioImport,
      speakerController: c.speaker,
      projectMediaController: c.projectMedia,
      importExportController: c.importExport,
      applyTextTimeMapping: i.applyTextTimeMapping,
      ...(i.segmentScopeMediaId ? { segmentScopeMediaId: i.segmentScopeMediaId } : {}),
      waveformSectionRef: w.waveformSectionRef,
      workspaceRef: w.workspaceRef,
      listMainRef: w.listMainRef,
      tierContainerRef: w.acousticStrip?.tierContainerRef,
      isAiPanelCollapsed: l.isAiPanelCollapsed,
      isTimelineLaneHeaderCollapsed: l.isTimelineLaneHeaderCollapsed,
      readyWorkspaceWaveformContentProps,
      timelineTopProps: i.readyWorkspaceAxisStatusController?.timelineTopPropsWithAxisStatus,
      readyWorkspaceSidePaneProps,
      timelineContentProps: i.readyWorkspaceViewModels?.timelineContentProps,
      editorContextValue: c.timeline?.editorContextValue,
      aiPanelContextValue: i.assistantController?.aiPanelContextValue,
      onLassoPointerDown: i.handleLassoPointerDown,
      onLassoPointerMove: i.handleLassoPointerMove,
      onLassoPointerUp: i.handleLassoPointerUp,
      onTimelineScroll: i.handleTimelineScroll,
      timelineResizeTooltip: i.timelineResizeController?.timelineResizeTooltip,
      formatTime: i.formatTime,
      timelineViewportProjection: i.timelineViewportProjection,
      snapEnabled: i.snapEnabled,
      autoScrollEnabled: i.autoScrollEnabled,
      activeWaveformRegionId: i.selectedWaveformRegionId,
      waveformTimelineItems: i.waveformTimelineItems,
      onZoomToPercent: (percent: number, mode: 'fit-all' | 'fit-selection' | 'custom') =>
        i.zoomToPercent(percent, undefined, mode),
      onZoomToUnit: i.zoomToUnit,
      onSnapEnabledChange: i.setSnapEnabled,
      onAutoScrollEnabledChange: i.setAutoScrollEnabled,
      canUndo: i.canUndo,
      canRedo: i.canRedo,
      undoLabel: i.undoLabel,
      undoHistory: i.undoHistory,
      isHistoryVisible: i.showUndoHistory,
      onToggleHistoryVisible: i.setShowUndoHistory,
      selectedTimelineUnit: i.selectedTimelineUnit,
      activeTimelineUnitId: i.activeTimelineUnitId,
      recordTimelineEdit: i.recordTimelineEdit,
      undoToHistoryIndex: i.undoToHistoryIndex,
      redo: i.redo,
      locale: i.locale,
      setIsAiPanelCollapsed: i.setIsAiPanelCollapsed,
      handleAiPanelResizeStart: i.workspacePanelEffectsController?.handleAiPanelResizeStart,
      handleAiPanelToggle: i.handleAiPanelToggle,
      assistantBridgeControllerInput: i.assistantBridgeControllerInput,
      onRuntimeStateChange: i.handleDeferredAiRuntimeChange,
      aiSidebarProps: i.readyWorkspaceViewModels?.aiSidebarProps,
      shouldRenderAiSidebar: i.readyWorkspaceRenderController?.shouldRenderAiSidebar,
      dialogsProps: i.readyWorkspaceViewModels?.dialogsProps,
      shouldRenderDialogs: i.readyWorkspaceRenderController?.shouldRenderDialogs,
      pdfRuntimeProps: i.assistantSidebarController?.pdfRuntimeProps,
      shouldRenderPdfRuntime: i.readyWorkspaceRenderController?.shouldRenderPdfRuntime,
      shouldRenderBatchOps: i.readyWorkspaceRenderController?.shouldRenderBatchOps,
      showBatchOperationPanel: i.showBatchOperationPanel,
      selectedUnitIds: i.selectedUnitIds,
      selectedBatchUnits: c.batch?.selectedBatchUnits,
      unitsOnCurrentMedia: i.unitsOnCurrentMedia,
      selectedBatchUnitTextById: c.timeline?.selectedBatchUnitTextById,
      batchPreviewLayerOptions: c.timeline?.batchPreviewLayerOptions,
      batchPreviewTextByLayerId: c.timeline?.batchPreviewTextByLayerId,
      batchPreviewTextPropsByLayerId: i.batchPreviewTextPropsByLayerId,
      defaultBatchPreviewLayerId: c.timeline?.defaultBatchPreviewLayerId,
      onCloseBatchOps: () => i.setShowBatchOperationPanel(false),
      onBatchOffset: c.batch?.handleBatchOffset,
      onBatchScale: c.batch?.handleBatchScale,
      onBatchSplitByRegex: c.batch?.handleBatchSplitByRegex,
      onBatchMerge: c.batch?.handleBatchMerge,
      onBatchJumpToUnit: i.selectUnit,
    } as any),
  );

  return {
    readyWorkspaceSidePaneProps,
    readyWorkspaceWaveformContentProps,
    readyWorkspaceOverlaysProps,
    readyWorkspaceLayoutStyle,
    readyWorkspaceStageProps,
  };
}
