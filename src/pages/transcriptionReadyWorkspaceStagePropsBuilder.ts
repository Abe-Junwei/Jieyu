import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react';
import type { TimelineViewportProjection } from '../hooks/timelineViewportTypes';
import type { TranscriptionPageReadyWorkspaceLayoutProps } from './TranscriptionPage.ReadyWorkspaceLayout';
import { recordTranscriptionKeyboardAction } from '../utils/transcriptionKeyboardActionTelemetry';
import {
  buildReadyWorkspaceBatchOpsSection,
  type BuildReadyWorkspaceBatchOpsSectionInput,
} from './transcriptionReadyWorkspaceBatchOpsSectionBuilder';
import {
  buildReadyWorkspaceHistoryControlsProps,
  type BuildReadyWorkspaceHistoryControlsInput,
} from './transcriptionReadyWorkspaceHistoryControlsBuilder';
import {
  buildReadyWorkspaceProjectHubProps,
  type BuildReadyWorkspaceProjectHubPropsInput,
} from './transcriptionReadyWorkspaceProjectHubPropsBuilder';
import {
  buildReadyWorkspaceRecoveryBannerProps,
  type BuildReadyWorkspaceRecoveryBannerPropsInput,
} from './transcriptionReadyWorkspaceRecoveryBannerPropsBuilder';
import {
  buildReadyWorkspaceObserverProps,
  type BuildReadyWorkspaceObserverPropsInput,
} from './transcriptionReadyWorkspaceObserverPropsBuilder';
import {
  buildReadyWorkspaceMediaInputProps,
  type BuildReadyWorkspaceMediaInputPropsInput,
} from './transcriptionReadyWorkspaceMediaInputPropsBuilder';
import {
  buildReadyWorkspaceToastProps,
  type BuildReadyWorkspaceToastPropsInput,
} from './transcriptionReadyWorkspaceToastPropsBuilder';

type ReadyWorkspaceStageProps = TranscriptionPageReadyWorkspaceLayoutProps['readyStageProps'];
type ReadyWorkspaceWorkspaceAreaProps = ReadyWorkspaceStageProps['workspaceAreaProps'];

export type BuildReadyWorkspaceStagePropsInput = {
  assistantFrame: BuildReadyWorkspaceToastPropsInput['assistantFrame'];
  shouldRenderRecoveryBanner: BuildReadyWorkspaceRecoveryBannerPropsInput['shouldRender'];
  recoveryAvailable: BuildReadyWorkspaceRecoveryBannerPropsInput['recoveryAvailable'];
  recoveryDiffSummary: BuildReadyWorkspaceRecoveryBannerPropsInput['recoveryDiffSummary'];
  onApplyRecoveryBanner: BuildReadyWorkspaceRecoveryBannerPropsInput['onApply'];
  onDismissRecoveryBanner: BuildReadyWorkspaceRecoveryBannerPropsInput['onDismiss'];
  collaborationCloudStatusSlot?: ReactNode;
  toolbarProps: ReadyWorkspaceStageProps['toolbarProps'];
  observerStage: BuildReadyWorkspaceObserverPropsInput['observerStage'];
  recommendations: BuildReadyWorkspaceObserverPropsInput['recommendations'];
  onExecuteRecommendation: BuildReadyWorkspaceObserverPropsInput['onExecuteRecommendation'];
  acousticRuntimeStatus: ReadyWorkspaceStageProps['acousticRuntimeStatus'];
  vadCacheStatus: ReadyWorkspaceStageProps['vadCacheStatus'];
  currentProjectLabel: BuildReadyWorkspaceProjectHubPropsInput['currentProjectLabel'];
  selectedMediaId?: BuildReadyWorkspaceProjectHubPropsInput['selectedMediaId'];
  activeTextTimelineMode: BuildReadyWorkspaceProjectHubPropsInput['activeTextTimelineMode'];
  activeTextTimeMapping: BuildReadyWorkspaceProjectHubPropsInput['activeTextTimeMapping'];
  canDeleteProject: BuildReadyWorkspaceProjectHubPropsInput['canDeleteProject'];
  canDeleteAudio: BuildReadyWorkspaceProjectHubPropsInput['canDeleteAudio'];
  onOpenProjectSetup: BuildReadyWorkspaceProjectHubPropsInput['onOpenProjectSetup'];
  onOpenAudioImport: BuildReadyWorkspaceProjectHubPropsInput['onOpenAudioImport'];
  onOpenSpeakerManagementPanel: BuildReadyWorkspaceProjectHubPropsInput['onOpenSpeakerManagementPanel'];
  onDeleteCurrentProject: BuildReadyWorkspaceProjectHubPropsInput['onDeleteCurrentProject'];
  onDeleteCurrentAudio: BuildReadyWorkspaceProjectHubPropsInput['onDeleteCurrentAudio'];
  handleImportFile: BuildReadyWorkspaceProjectHubPropsInput['handleImportFile'];
  onPreviewProjectArchiveImport: BuildReadyWorkspaceProjectHubPropsInput['onPreviewProjectArchiveImport'];
  onImportProjectArchive: BuildReadyWorkspaceProjectHubPropsInput['onImportProjectArchive'];
  onApplyTextTimeMapping: BuildReadyWorkspaceProjectHubPropsInput['onApplyTextTimeMapping'];
  onExportEaf: BuildReadyWorkspaceProjectHubPropsInput['onExportEaf'];
  onExportTextGrid: BuildReadyWorkspaceProjectHubPropsInput['onExportTextGrid'];
  onExportTrs: BuildReadyWorkspaceProjectHubPropsInput['onExportTrs'];
  onExportFlextext: BuildReadyWorkspaceProjectHubPropsInput['onExportFlextext'];
  onExportToolbox: BuildReadyWorkspaceProjectHubPropsInput['onExportToolbox'];
  onExportJyt: BuildReadyWorkspaceProjectHubPropsInput['onExportJyt'];
  onExportJym: BuildReadyWorkspaceProjectHubPropsInput['onExportJym'];
  mediaFileInputRef: BuildReadyWorkspaceMediaInputPropsInput['mediaFileInputRef'];
  onDirectMediaImport: BuildReadyWorkspaceMediaInputPropsInput['onDirectMediaImport'];
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
  shouldRenderBatchOps: BuildReadyWorkspaceBatchOpsSectionInput['shouldRenderBatchOps'];
  showBatchOperationPanel: BuildReadyWorkspaceBatchOpsSectionInput['showBatchOperationPanel'];
  selectedUnitIds: BuildReadyWorkspaceBatchOpsSectionInput['selectedUnitIds'];
  selectedBatchUnits: BuildReadyWorkspaceBatchOpsSectionInput['selectedBatchUnits'];
  unitsOnCurrentMedia: BuildReadyWorkspaceBatchOpsSectionInput['unitsOnCurrentMedia'];
  selectedBatchUnitTextById: BuildReadyWorkspaceBatchOpsSectionInput['selectedBatchUnitTextById'];
  batchPreviewLayerOptions: BuildReadyWorkspaceBatchOpsSectionInput['batchPreviewLayerOptions'];
  batchPreviewTextByLayerId: BuildReadyWorkspaceBatchOpsSectionInput['batchPreviewTextByLayerId'];
  batchPreviewTextPropsByLayerId: BuildReadyWorkspaceBatchOpsSectionInput['batchPreviewTextPropsByLayerId'];
  defaultBatchPreviewLayerId: BuildReadyWorkspaceBatchOpsSectionInput['defaultBatchPreviewLayerId'];
  onCloseBatchOps: BuildReadyWorkspaceBatchOpsSectionInput['onCloseBatchOps'];
  onBatchOffset: BuildReadyWorkspaceBatchOpsSectionInput['onBatchOffset'];
  onBatchScale: BuildReadyWorkspaceBatchOpsSectionInput['onBatchScale'];
  onBatchSplitByRegex: BuildReadyWorkspaceBatchOpsSectionInput['onBatchSplitByRegex'];
  onBatchMerge: BuildReadyWorkspaceBatchOpsSectionInput['onBatchMerge'];
  onBatchJumpToUnit: BuildReadyWorkspaceBatchOpsSectionInput['onBatchJumpToUnit'];
};

/** ARCH-7 收口：stage props 组装独立模块化，降低通用 builder 文件认知负担 | ARCH-7 closure: isolate stage props assembly to reduce cognitive load in the shared builders module. */
export function buildReadyWorkspaceStageProps(
  input: BuildReadyWorkspaceStagePropsInput,
): ReadyWorkspaceStageProps {
  // 缩放控制程序集 | Zoom controls assembly
  const buildZoomControlsProps = () => ({
    zoomPercent: input.timelineViewportProjection.zoomPercent,
    snapEnabled: input.snapEnabled,
    autoScrollEnabled: input.autoScrollEnabled,
    activeUnitId: input.activeWaveformUnitId,
    unitsOnCurrentMedia: input.waveformTimelineItems,
    fitPxPerSec: input.timelineViewportProjection.fitPxPerSec,
    maxZoomPercent: input.timelineViewportProjection.maxZoomPercent,
    onZoomToPercent: (percent: number, mode: 'fit-all' | 'fit-selection' | 'custom') => {
      if (mode === 'fit-all') recordTranscriptionKeyboardAction('timelineZoomFitAll');
      else if (mode === 'fit-selection') recordTranscriptionKeyboardAction('timelineZoomFitSelection');
      input.onZoomToPercent(percent, mode);
    },
    onZoomToUnit: (startTime: number, endTime: number) => {
      recordTranscriptionKeyboardAction('timelineZoomFitSelection');
      input.onZoomToUnit(startTime, endTime);
    },
    onSnapEnabledChange: (enabled: boolean) => {
      recordTranscriptionKeyboardAction('timelineZoomSnapToggle');
      input.onSnapEnabledChange(enabled);
    },
    onAutoScrollEnabledChange: (enabled: boolean) => {
      recordTranscriptionKeyboardAction('timelineZoomAutoScrollToggle');
      input.onAutoScrollEnabledChange(enabled);
    },
  });

  // 套索处理器程序集 | Lasso handlers assembly
  const buildLassoHandlers = () => ({
    onPointerDownCapture: (event: ReactPointerEvent<HTMLDivElement>) => {
      recordTranscriptionKeyboardAction('workspaceTimelineLassoPointerDown');
      input.onLassoPointerDown(event);
    },
    onPointerMove: input.onLassoPointerMove,
    onPointerUp: (event: ReactPointerEvent<HTMLDivElement>) => {
      recordTranscriptionKeyboardAction('workspaceTimelineLassoPointerUp');
      input.onLassoPointerUp(event);
    },
    onScroll: input.onTimelineScroll,
  });

  // AI 面板句柄程序集 | AI panel handle props assembly
  const buildAiPanelHandleProps = () => ({
    locale: input.locale,
    isAiPanelCollapsed: input.isAiPanelCollapsed,
    setIsAiPanelCollapsed: input.setIsAiPanelCollapsed,
    handleAiPanelResizeStart: (event: ReactPointerEvent<HTMLDivElement>) => {
      recordTranscriptionKeyboardAction('workspaceAiPanelResizeStart');
      input.handleAiPanelResizeStart(event);
    },
    handleAiPanelToggle: () => {
      recordTranscriptionKeyboardAction('workspaceAiPanelToggle');
      input.handleAiPanelToggle();
    },
  });

  // 助手桥接程序集 | Assistant bridge assembly
  const buildAssistantBridge = () => ({
    controllerInput: input.assistantBridgeControllerInput,
    onRuntimeStateChange: input.onRuntimeStateChange,
  });

  return {
    toastProps: buildReadyWorkspaceToastProps({
      assistantFrame: input.assistantFrame,
    }),
    recoveryBannerProps: buildReadyWorkspaceRecoveryBannerProps({
      shouldRender: input.shouldRenderRecoveryBanner,
      recoveryAvailable: input.recoveryAvailable,
      recoveryDiffSummary: input.recoveryDiffSummary,
      onApply: input.onApplyRecoveryBanner,
      onDismiss: input.onDismissRecoveryBanner,
    }),
    ...(input.collaborationCloudStatusSlot !== undefined
      ? { collaborationCloudStatusSlot: input.collaborationCloudStatusSlot }
      : {}),
    toolbarProps: input.toolbarProps,
    observerProps: buildReadyWorkspaceObserverProps({
      observerStage: input.observerStage,
      recommendations: input.recommendations,
      onExecuteRecommendation: input.onExecuteRecommendation,
    }),
    acousticRuntimeStatus: input.acousticRuntimeStatus,
    vadCacheStatus: input.vadCacheStatus,
    projectHubProps: buildReadyWorkspaceProjectHubProps({
      currentProjectLabel: input.currentProjectLabel,
      selectedMediaId: input.selectedMediaId,
      activeTextTimelineMode: input.activeTextTimelineMode,
      activeTextTimeMapping: input.activeTextTimeMapping,
      canDeleteProject: input.canDeleteProject,
      canDeleteAudio: input.canDeleteAudio,
      onOpenProjectSetup: input.onOpenProjectSetup,
      onOpenAudioImport: input.onOpenAudioImport,
      onOpenSpeakerManagementPanel: input.onOpenSpeakerManagementPanel,
      onDeleteCurrentProject: input.onDeleteCurrentProject,
      onDeleteCurrentAudio: input.onDeleteCurrentAudio,
      handleImportFile: input.handleImportFile,
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
    }),
    mediaInputProps: buildReadyWorkspaceMediaInputProps({
      mediaFileInputRef: input.mediaFileInputRef,
      onDirectMediaImport: input.onDirectMediaImport,
    }),
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
      lassoHandlers: buildLassoHandlers(),
      timelineResizeTooltip: input.timelineResizeTooltip,
      formatTime: input.formatTime,
      zoomControlsProps: buildZoomControlsProps(),
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
      aiPanelHandleProps: buildAiPanelHandleProps(),
      assistantBridge: buildAssistantBridge(),
      aiSidebarProps: input.aiSidebarProps,
      shouldRenderAiSidebar: input.shouldRenderAiSidebar,
      dialogsProps: input.dialogsProps,
      shouldRenderDialogs: input.shouldRenderDialogs,
      pdfRuntimeProps: input.pdfRuntimeProps,
      shouldRenderPdfRuntime: input.shouldRenderPdfRuntime,
    },
    batchOpsSection: buildReadyWorkspaceBatchOpsSection({
      shouldRenderBatchOps: input.shouldRenderBatchOps,
      showBatchOperationPanel: input.showBatchOperationPanel,
      selectedUnitIds: input.selectedUnitIds,
      selectedBatchUnits: input.selectedBatchUnits,
      unitsOnCurrentMedia: input.unitsOnCurrentMedia,
      selectedBatchUnitTextById: input.selectedBatchUnitTextById,
      batchPreviewLayerOptions: input.batchPreviewLayerOptions,
      batchPreviewTextByLayerId: input.batchPreviewTextByLayerId,
      batchPreviewTextPropsByLayerId: input.batchPreviewTextPropsByLayerId,
      defaultBatchPreviewLayerId: input.defaultBatchPreviewLayerId,
      onCloseBatchOps: input.onCloseBatchOps,
      onBatchOffset: input.onBatchOffset,
      onBatchScale: input.onBatchScale,
      onBatchSplitByRegex: input.onBatchSplitByRegex,
      onBatchMerge: input.onBatchMerge,
      onBatchJumpToUnit: input.onBatchJumpToUnit,
    }),
  };
}