import type { ReactNode } from 'react';
import type { AnnotationImportBridgeStrategy } from '../hooks/useImportExport.annotationImport';
import type { TimelineViewportProjection } from '../hooks/timelineViewportTypes';
import type { TranscriptionPageReadyWorkspaceLayoutProps } from './TranscriptionPage.ReadyWorkspaceLayout';
import {
  buildReadyWorkspaceHistoryControlsProps,
  type BuildReadyWorkspaceHistoryControlsInput,
} from './transcriptionReadyWorkspaceHistoryControlsBuilder';

type ReadyWorkspaceStageProps = TranscriptionPageReadyWorkspaceLayoutProps['readyStageProps'];
type ReadyWorkspaceWorkspaceAreaProps = ReadyWorkspaceStageProps['workspaceAreaProps'];

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
  selectedMediaId?: ReadyWorkspaceStageProps['projectHubProps']['selectedMediaId'];
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
  onLassoPointerDown: ReadyWorkspaceWorkspaceAreaProps['lassoHandlers']['onPointerDownCapture'];
  onLassoPointerMove: ReadyWorkspaceWorkspaceAreaProps['lassoHandlers']['onPointerMove'];
  onLassoPointerUp: ReadyWorkspaceWorkspaceAreaProps['lassoHandlers']['onPointerUp'];
  onTimelineScroll: ReadyWorkspaceWorkspaceAreaProps['lassoHandlers']['onScroll'];
  timelineResizeTooltip: ReadyWorkspaceWorkspaceAreaProps['timelineResizeTooltip'];
  formatTime: ReadyWorkspaceWorkspaceAreaProps['formatTime'];
  timelineViewportProjection: TimelineViewportProjection;
  snapEnabled: boolean;
  autoScrollEnabled: boolean;
  activeWaveformUnitId: string | null;
  waveformTimelineItems: ReadyWorkspaceWorkspaceAreaProps['zoomControlsProps']['unitsOnCurrentMedia'];
  onZoomToPercent: ReadyWorkspaceWorkspaceAreaProps['zoomControlsProps']['onZoomToPercent'];
  onZoomToUnit: ReadyWorkspaceWorkspaceAreaProps['zoomControlsProps']['onZoomToUnit'];
  onSnapEnabledChange: ReadyWorkspaceWorkspaceAreaProps['zoomControlsProps']['onSnapEnabledChange'];
  onAutoScrollEnabledChange: ReadyWorkspaceWorkspaceAreaProps['zoomControlsProps']['onAutoScrollEnabledChange'];
  canUndo: BuildReadyWorkspaceHistoryControlsInput['canUndo'];
  canRedo: BuildReadyWorkspaceHistoryControlsInput['canRedo'];
  undoLabel: BuildReadyWorkspaceHistoryControlsInput['undoLabel'];
  undoHistory: BuildReadyWorkspaceHistoryControlsInput['undoHistory'];
  isHistoryVisible: BuildReadyWorkspaceHistoryControlsInput['isHistoryVisible'];
  onToggleHistoryVisible: BuildReadyWorkspaceHistoryControlsInput['onToggleHistoryVisible'];
  selectedTimelineUnit: BuildReadyWorkspaceHistoryControlsInput['selectedTimelineUnit'];
  activeTimelineUnitId: string;
  recordTimelineEdit: BuildReadyWorkspaceHistoryControlsInput['recordTimelineEdit'];
  undoToHistoryIndex: BuildReadyWorkspaceHistoryControlsInput['undoToHistoryIndex'];
  redo: BuildReadyWorkspaceHistoryControlsInput['redo'];
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

/** ARCH-7 收口：stage props 组装独立模块化，降低通用 builder 文件认知负担 | ARCH-7 closure: isolate stage props assembly to reduce cognitive load in the shared builders module. */
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
      selectedMediaId: input.selectedMediaId ?? null,
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
      ...(input.onApplyTextTimeMapping ? { onApplyTextTimeMapping: input.onApplyTextTimeMapping } : {}),
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
        onPointerDownCapture: input.onLassoPointerDown,
        onPointerMove: input.onLassoPointerMove,
        onPointerUp: input.onLassoPointerUp,
        onScroll: input.onTimelineScroll,
      },
      timelineResizeTooltip: input.timelineResizeTooltip,
      formatTime: input.formatTime,
      zoomControlsProps: {
        zoomPercent: input.timelineViewportProjection.zoomPercent,
        snapEnabled: input.snapEnabled,
        autoScrollEnabled: input.autoScrollEnabled,
        activeUnitId: input.activeWaveformUnitId,
        unitsOnCurrentMedia: input.waveformTimelineItems,
        fitPxPerSec: input.timelineViewportProjection.fitPxPerSec,
        maxZoomPercent: input.timelineViewportProjection.maxZoomPercent,
        onZoomToPercent: input.onZoomToPercent,
        onZoomToUnit: input.onZoomToUnit,
        onSnapEnabledChange: input.onSnapEnabledChange,
        onAutoScrollEnabledChange: input.onAutoScrollEnabledChange,
      },
      historyControlsProps: buildReadyWorkspaceHistoryControlsProps({
        canUndo: input.canUndo,
        canRedo: input.canRedo,
        undoLabel: input.undoLabel,
        undoHistory: input.undoHistory,
        isHistoryVisible: input.isHistoryVisible,
        onToggleHistoryVisible: input.onToggleHistoryVisible,
        selectedTimelineUnit: input.selectedTimelineUnit,
        activeTimelineUnitId: input.activeTimelineUnitId,
        recordTimelineEdit: input.recordTimelineEdit,
        undoToHistoryIndex: input.undoToHistoryIndex,
        redo: input.redo,
      }),
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