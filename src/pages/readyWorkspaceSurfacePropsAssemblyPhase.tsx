/**
 * Phase C1: deep module for ReadyWorkspace surface props assembly (side pane / waveform / overlays /
 * layout / stage). Public entry remains `useReadyWorkspaceSurfaceProps` in `useReadyWorkspaceSurfaceProps.tsx`.
 */

import type { CollaborationProtocolGuardEvaluation } from '../collaboration/cloud/collaborationProtocolGuard';
import { isCollaborationCloudSurfaceActive } from '../collaboration/cloud/collaborationCloudFeatureGate';
import { CollaborationCloudReadOnlyBanner } from '../components/transcription/CollaborationCloudReadOnlyBanner';
import type { Locale } from '../i18n';
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
import type { BuildReadyWorkspaceSidePanePropsInputFromControllers } from './transcriptionReadyWorkspaceSidePaneInputBuilder';
import type { BuildReadyWorkspaceOverlaysPropsInputFromControllers } from './transcriptionReadyWorkspaceOverlaysInputBuilder';
import type { BuildReadyWorkspaceStagePropsInputFromControllers } from './transcriptionReadyWorkspaceStagePropsInputBuilder';
import type { BuildReadyWorkspaceWaveformContentPropsInputFromControllers } from './transcriptionReadyWorkspaceWaveformInputBuilder';
import type {
  UseReadyWorkspaceSurfacePropsInput,
  UseReadyWorkspaceSurfacePropsResult,
} from './readyWorkspaceSurfacePropsTypes';

function asCollaborationProtocolGuard(value: unknown): CollaborationProtocolGuardEvaluation {
  if (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as CollaborationProtocolGuardEvaluation).cloudWritesDisabled === 'boolean' &&
    Array.isArray((value as CollaborationProtocolGuardEvaluation).reasons)
  ) {
    return value as CollaborationProtocolGuardEvaluation;
  }
  return { cloudWritesDisabled: false, reasons: [], outboundProtocolVersion: 1 };
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : undefined;
}

export function assembleReadyWorkspaceSurfacePropsBundle(
  input: UseReadyWorkspaceSurfacePropsInput,
): UseReadyWorkspaceSurfacePropsResult {
  const i = input;
  const { overlays: o, controllers: c, layout: l, waveform: w } = input;
  const timelineCtl = c.timeline as Record<string, unknown> | null | undefined;
  const batchCtl = c.batch as Record<string, unknown> | null | undefined;
  const selfCertaintyCtl = c.selfCertainty as Record<string, unknown> | null | undefined;
  const playerBridge = asRecord(input.player);
  const assistantSidebarController = asRecord(input.assistantSidebarController);
  const assistantRuntimeProps = asRecord(assistantSidebarController?.assistantRuntimeProps);
  const readyWorkspaceViewModels = asRecord(input.readyWorkspaceViewModels);
  const readyWorkspaceToolbarProps = asRecord(readyWorkspaceViewModels?.toolbarProps);
  const axisStatusController = asRecord(input.readyWorkspaceAxisStatusController);
  const timelineResizeController = asRecord(input.timelineResizeController);
  const deferredAiRuntime = asRecord(input.deferredAiRuntime);
  const assistantController = asRecord(input.assistantController);
  const workspacePanelEffectsController = asRecord(input.workspacePanelEffectsController);
  const zoomToPercent = input.zoomToPercent as (
    percent: number,
    anchor: undefined,
    mode: 'fit-all' | 'fit-selection' | 'custom',
  ) => void;

  const readyWorkspaceSidePaneProps = buildReadyWorkspaceSidePaneProps(
    buildReadyWorkspaceSidePanePropsInput({
      speakerActionScopeController: c.speakerActionScope,
      speakerController: c.speaker,
      sidePaneRows: input.orderedLayers,
      focusedLayerRowId: input.focusedLayerRowId,
      flashLayerRowId: input.flashLayerRowId,
      onFocusLayer: input.handleFocusLayerRow,
      transcriptionLayers: i.orderedLayers.filter(
        // Keep explicit marker for structure invariants: layer.layerType === 'transcription'
        (layer): layer is { layerType: 'transcription' } =>
          typeof layer === 'object' &&
          layer !== null &&
          (layer as { layerType?: string }).layerType === 'transcription',
      ),
      layerLinks: input.layerLinks,
      toggleLayerLink: input.toggleLayerLink,
      deletableLayers: input.deletableLayers,
      updateLayerMetadata: input.updateLayerMetadata,
      layerCreateMessage: input.layerCreateMessage,
      layerAction: input.layerAction,
      ...(input.defaultTranscriptionLayerId !== undefined
        ? { defaultTranscriptionLayerId: input.defaultTranscriptionLayerId }
        : {}),
      segmentsByLayer: input.segmentsByLayer,
      segmentContentByLayer: input.segmentContentByLayer,
      unitsOnCurrentMedia: input.unitsOnCurrentMedia,
      speakers: input.speakers,
      listProjectAssets: input.listProjectAssets,
      removeProjectAsset: input.removeProjectAsset,
      getProjectAssetSignedUrl: input.getProjectAssetSignedUrl,
      listProjectSnapshots: input.listProjectSnapshots,
      restoreProjectSnapshotToLocalById: input.restoreProjectSnapshotToLocalById,
      queryProjectChangeTimeline: input.queryProjectChangeTimeline,
      supabaseConfigured: isCollaborationCloudSurfaceActive(),
      activeTextId: input.activeTextId,
      listAccessibleCloudProjects: input.listAccessibleCloudProjects,
      listCloudProjectMembers: input.listCloudProjectMembers,
      getUnitTextForLayer: input.getUnitTextForLayer,
      onSelectTimelineUnit: input.selectTimelineUnit,
      onReorderLayers: input.reorderLayers,
      locale: input.locale,
      verticalViewActive: input.verticalViewActive,
      translationLayerCount: input.translationLayers.length,
      onSelectWorkspaceHorizontalLayout: input.onSelectWorkspaceHorizontalLayout,
      onSelectWorkspaceVerticalLayout: input.onSelectWorkspaceVerticalLayout,
    } as unknown as BuildReadyWorkspaceSidePanePropsInputFromControllers),
  );

  const readyWorkspaceWaveformContentProps = buildReadyWorkspaceWaveformContentProps(
    buildReadyWorkspaceWaveformContentPropsInput({
      locale: input.locale,
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
      unitsOnCurrentMedia: input.unitsOnCurrentMedia,
      getUnitTextForLayer: input.getUnitTextForLayer,
      waveformHoverPreviewProps: w.waveformHoverPreviewProps,
      selectedMediaUrl: input.selectedMediaUrl,
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
      setNotePopover: input.setNotePopover,
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
        spectrogramRef: playerBridge?.spectrogramRef,
        waveformRef: playerBridge?.waveformRef,
        seekTo: playerBridge?.seekTo,
        playRegion: playerBridge?.playRegion,
        duration: playerBridge?.duration,
        isReady: playerBridge?.isReady,
        isPlaying: playerBridge?.isPlaying,
      },
      timelineViewportProjection: {
        rulerView: w.timelineViewportProjection?.rulerView,
        zoomPxPerSec: w.timelineViewportProjection?.zoomPxPerSec,
      },
      mediaFileInputRef: w.mediaFileInputRef,
      acousticStrip: w.acousticStrip,
    } as BuildReadyWorkspaceWaveformContentPropsInputFromControllers),
  );

  const readyWorkspaceOverlaysProps = buildReadyWorkspaceOverlaysProps(
    buildReadyWorkspaceOverlaysPropsInput({
      ctxMenu: o.ctxMenu,
      setCtxMenu: o.setCtxMenu,
      uttOpsMenu: o.uttOpsMenu,
      setUttOpsMenu: o.setUttOpsMenu,
      selectedTimelineUnit: o.selectedTimelineUnit ?? null,
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
      resolveSelfCertaintyUnitIds: selfCertaintyCtl?.resolveSelfCertaintyUnitIds,
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
    } as BuildReadyWorkspaceOverlaysPropsInputFromControllers),
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
      assistantFrame: assistantRuntimeProps?.frame,
      shouldRenderRecoveryBanner: input.readyWorkspaceRenderController?.shouldRenderRecoveryBanner,
      recoveryAvailable: input.recoveryAvailable,
      recoveryDiffSummary: input.recoveryDiffSummary,
      onApplyRecoveryBanner: i.applyRecoveryBanner,
      onDismissRecoveryBanner: i.dismissRecoveryBanner,
      collaborationCloudStatusSlot: (
        <CollaborationCloudReadOnlyBanner
          locale={input.locale as Locale}
          guard={asCollaborationProtocolGuard(input.collaborationProtocolGuard)}
        />
      ),
      toolbarProps: input.toolbarPropsWithCollaboration,
      observerStage: input.observerResult?.stage,
      recommendations: (input.actionableObserverRecommendations as unknown[] | null) ?? [],
      onExecuteRecommendation: input.handleExecuteObserverRecommendation,
      acousticRuntimeStatus: deferredAiRuntime?.acousticRuntimeStatus,
      vadCacheStatus: input.vadCacheStatus,
      currentProjectLabel: readyWorkspaceToolbarProps?.filename,
      ...(input.selectedTimelineMedia !== undefined
        ? { selectedTimelineMedia: input.selectedTimelineMedia }
        : {}),
      activeTextTimelineMode: input.activeTextTimelineMode,
      activeTextTimeMapping: input.activeTextTimeMapping,
      canDeleteProject: Boolean(input.activeTextId),
      ...(input.selectedMediaUrl !== undefined ? { selectedMediaUrl: input.selectedMediaUrl } : {}),
      setShowProjectSetup: input.setShowProjectSetup,
      setShowAudioImport: input.setShowAudioImport,
      speakerController: c.speaker,
      projectMediaController: c.projectMedia,
      importExportController: c.importExport,
      applyTextTimeMapping: input.applyTextTimeMapping,
      ...(input.segmentScopeMediaId ? { segmentScopeMediaId: input.segmentScopeMediaId } : {}),
      waveformSectionRef: w.waveformSectionRef,
      workspaceRef: w.workspaceRef,
      listMainRef: w.listMainRef,
      tierContainerRef: w.acousticStrip?.tierContainerRef,
      isAiPanelCollapsed: l.isAiPanelCollapsed,
      isTimelineLaneHeaderCollapsed: l.isTimelineLaneHeaderCollapsed,
      readyWorkspaceWaveformContentProps,
      timelineTopProps: axisStatusController?.timelineTopPropsWithAxisStatus,
      readyWorkspaceSidePaneProps,
      timelineContentProps: readyWorkspaceViewModels?.timelineContentProps,
      editorContextValue: timelineCtl?.editorContextValue,
      aiPanelContextValue: assistantController?.aiPanelContextValue,
      onLassoPointerDown: input.handleLassoPointerDown,
      onLassoPointerMove: input.handleLassoPointerMove,
      onLassoPointerUp: input.handleLassoPointerUp,
      onTimelineScroll: input.handleTimelineScroll,
      timelineResizeTooltip: timelineResizeController?.timelineResizeTooltip,
      formatTime: input.formatTime,
      timelineViewportProjection: i.timelineViewportProjection,
      snapEnabled: input.snapEnabled,
      autoScrollEnabled: input.autoScrollEnabled,
      activeWaveformRegionId: input.selectedWaveformRegionId,
      waveformTimelineItems: input.waveformTimelineItems,
      onZoomToPercent: (percent: number, mode: 'fit-all' | 'fit-selection' | 'custom') =>
        zoomToPercent(percent, undefined, mode),
      onZoomToUnit: input.zoomToUnit,
      onSnapEnabledChange: input.setSnapEnabled,
      onAutoScrollEnabledChange: input.setAutoScrollEnabled,
      canUndo: input.canUndo,
      canRedo: input.canRedo,
      undoLabel: input.undoLabel,
      undoHistory: input.undoHistory,
      isHistoryVisible: input.showUndoHistory,
      onToggleHistoryVisible: input.setShowUndoHistory,
      selectedTimelineUnit: input.selectedTimelineUnit,
      activeTimelineUnitId: input.activeTimelineUnitId,
      recordTimelineEdit: input.recordTimelineEdit,
      undoToHistoryIndex: input.undoToHistoryIndex,
      redo: input.redo,
      locale: input.locale,
      setIsAiPanelCollapsed: input.setIsAiPanelCollapsed,
      handleAiPanelResizeStart: workspacePanelEffectsController?.handleAiPanelResizeStart,
      handleAiPanelToggle: input.handleAiPanelToggle,
      assistantBridgeControllerInput: input.assistantBridgeControllerInput,
      onRuntimeStateChange: input.handleDeferredAiRuntimeChange,
      aiSidebarProps: readyWorkspaceViewModels?.aiSidebarProps,
      shouldRenderAiSidebar: input.readyWorkspaceRenderController?.shouldRenderAiSidebar,
      dialogsProps: readyWorkspaceViewModels?.dialogsProps,
      shouldRenderDialogs: input.readyWorkspaceRenderController?.shouldRenderDialogs,
      pdfRuntimeProps: assistantSidebarController?.pdfRuntimeProps,
      shouldRenderPdfRuntime: input.readyWorkspaceRenderController?.shouldRenderPdfRuntime,
      shouldRenderBatchOps: input.readyWorkspaceRenderController?.shouldRenderBatchOps,
      showBatchOperationPanel: input.showBatchOperationPanel,
      selectedUnitIds: input.selectedUnitIds,
      selectedBatchUnits: batchCtl?.selectedBatchUnits,
      unitsOnCurrentMedia: input.unitsOnCurrentMedia,
      selectedBatchUnitTextById: timelineCtl?.selectedBatchUnitTextById,
      batchPreviewLayerOptions: timelineCtl?.batchPreviewLayerOptions,
      batchPreviewTextByLayerId: timelineCtl?.batchPreviewTextByLayerId,
      batchPreviewTextPropsByLayerId: input.batchPreviewTextPropsByLayerId,
      defaultBatchPreviewLayerId: timelineCtl?.defaultBatchPreviewLayerId,
      onCloseBatchOps: () => input.setShowBatchOperationPanel(false),
      onBatchOffset: batchCtl?.handleBatchOffset,
      onBatchScale: batchCtl?.handleBatchScale,
      onBatchSplitByRegex: batchCtl?.handleBatchSplitByRegex,
      onBatchMerge: batchCtl?.handleBatchMerge,
      onBatchJumpToUnit: input.selectUnit,
    } as unknown as BuildReadyWorkspaceStagePropsInputFromControllers),
  );

  return {
    readyWorkspaceSidePaneProps,
    readyWorkspaceWaveformContentProps,
    readyWorkspaceOverlaysProps,
    readyWorkspaceLayoutStyle,
    readyWorkspaceStageProps,
  };
}
