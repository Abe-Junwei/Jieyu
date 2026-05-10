import { getUnitSpeakerKey } from '../hooks/useSpeakerActions';
import type { Locale } from '../i18n';
import { formatSidePaneLayerLabel, formatTime } from '../utils/transcriptionFormatters';

import type { UseReadyWorkspaceSidebarAndTrackPhaseParams } from './useReadyWorkspaceSidebarAndTrackPhase';

type TranscriptionDataReturn = ReturnType<
  typeof import('../hooks/useTranscriptionData').useTranscriptionData
>;
type DomainShellReturn = ReturnType<
  typeof import('./useReadyWorkspaceDomainShellPhase').useReadyWorkspaceDomainShellPhase
>;
type PreBootstrapReturn = ReturnType<
  typeof import('./useReadyWorkspacePreBootstrapChromePhase').useReadyWorkspacePreBootstrapChromePhase
>;
type BootstrapReturn = ReturnType<
  typeof import('./useReadyWorkspaceReadyPhaseBootstrap').useReadyWorkspaceReadyPhaseBootstrap
>;
type SelectionAiReturn = ReturnType<
  typeof import('./useReadyWorkspaceSelectionAndAiPrepPhase').useReadyWorkspaceSelectionAndAiPrepPhase
>;
type TimelineAssistantReturn = ReturnType<
  typeof import('./useReadyWorkspaceTimelineAssistantPlaybackPhase').useReadyWorkspaceTimelineAssistantPlaybackPhase
>;
type WaveformBridgeReturn = ReturnType<
  typeof import('./useReadyWorkspaceWaveformBridgePhase').useReadyWorkspaceWaveformBridgePhase
>;

export interface BuildReadyWorkspaceSidebarAndTrackPhaseDeps {
  data: TranscriptionDataReturn;
  domainShell: DomainShellReturn;
  locale: Locale;
  tfB: (key: string, opts?: Record<string, unknown>) => string;
  pre: PreBootstrapReturn;
  bootstrap: BootstrapReturn;
  selectionAi: SelectionAiReturn;
  timeline: TimelineAssistantReturn;
  waveform: WaveformBridgeReturn;
}

export function buildReadyWorkspaceSidebarAndTrackPhaseParams(
  deps: BuildReadyWorkspaceSidebarAndTrackPhaseDeps,
): UseReadyWorkspaceSidebarAndTrackPhaseParams {
  const { data, domainShell, locale, tfB, pre, bootstrap, selectionAi, timeline, waveform } = deps;
  const {
    saveState,
    selectedTimelineUnit,
    selectedUnitIds,
    selectedUnit,
    defaultTranscriptionLayerId,
    selectedLayerId,
    transcriptionTrackMode,
    selectUnitRange,
    toggleUnitSelection,
    selectUnit,
    selectSegment,
    setSelectedLayerId,
    translationLayers,
    layers,
    layerLinks,
    unitsOnCurrentMedia,
    getUnitTextForLayer,
  } = data;

  const {
    analysisTab,
    setAnalysisTab,
    activeTextId,
    segmentTimelineLayerIds,
    layerAction,
    reloadSegments,
    refreshSegmentUndoSnapshot,
    updateSegmentsLocally: updateSegmentsLocallyFromDomain,
    createLayerWithActiveContext,
    handleFocusLayerRow,
    selectedTimelineMedia,
    selectedTimelineRowMeta,
    segmentsByLayer,
    segmentContentByLayer,
    focusedLayerRowId,
    activeTimelineUnitId,
    activeLayerIdForEdits,
    activeTextPrimaryLanguageId,
    getActiveTextPrimaryLanguageId,
    pdfPreviewRequest,
    setPdfPreviewRequest,
    isAiPanelCollapsed,
    setIsAiPanelCollapsed,
    aiPanelWidth,
    setAiPanelWidth,
    isHubCollapsed,
    hubHeight,
    setHubHeight,
  } = domainShell;

  const {
    selectionSnapshot,
    deferredAiRuntime,
    deferredAiRuntimeForSidebar,
    embeddingProviderConfig,
    setEmbeddingProviderConfig,
    aiSidebarError,
    lexemeMatches,
    observerResult,
    actionableObserverRecommendations,
    aiChatForSidebar,
  } = selectionAi;

  const {
    timelineSyncController,
    assistantController,
    playbackKeyboardController,
    timelineReadModel,
    recording,
    recordingUnitId,
    recordingError,
  } = timeline;

  const { getUnitDocById, recordTimelineEdit } = bootstrap;

  const {
    overlapCycleToast,
    lockConflictToast,
    setLockConflictToast,
    workspaceRef,
    screenRef,
    dragCleanupRef,
    setShowBatchOperationPanel,
    voiceAiAssistantMessageBridgeRef,
    displayStyleControl,
    manualSelectTsRef,
    handleNoteClick,
    resolveNoteIndicatorTarget,
    setOverlapCycleToast,
    setCtxMenu,
    tierContainerRef,
    voiceDictationPreviewTextProps,
  } = pre;

  const {
    player,
    waveformAreaRef,
    segmentRangeGesturePreviewReadModel,
    timelineViewportProjection,
    zoomToUnit,
  } = waveform;

  return {
    assistantSidebarHeaderInput: {
      locale,
      analysisTab,
      setAnalysisTab,
      timelineReadModelEpoch: timelineReadModel.epoch,
      currentPage: 'transcription',
      selectionSnapshot,
      selectedTimelineRowMeta,
      lexemeMatches,
      aiChatForSidebar,
      aiToolDecisionLogs: deferredAiRuntimeForSidebar.aiToolDecisionLogs,
      aiVerticalWorkflowAuditEntries: deferredAiRuntimeForSidebar.aiVerticalWorkflowAuditEntries,
      observerStage: observerResult.stage,
      actionableObserverRecommendations,
      onJumpToCitation: timelineSyncController.handleJumpToCitation,
      adoptionItemsPushSinkRef: pre.adoptionItemsPushSinkRef,
    },
    assistantSidebarRuntimeInput: {
      saveState,
      recording,
      recordingUnitId,
      recordingError,
      overlapCycleToast,
      lockConflictToast,
      tfB,
      activeTextPrimaryLanguageId,
      getActiveTextPrimaryLanguageId,
      executeAction: playbackKeyboardController.executeAction,
      handleResolveVoiceIntentWithLlm: assistantController.handleResolveVoiceIntentWithLlm,
      executeVoiceToolCall: deferredAiRuntime.executeVoiceToolCall,
      handleVoiceDictation: (text: string) => {
        void assistantController.handleVoiceDictation(text);
      },
      voiceAnalysisResultHandler: (unitId: string | null, analysisText: string) => {
        void assistantController.handleVoiceAnalysisResult(unitId, analysisText);
      },
      selectionSnapshot,
      ...(defaultTranscriptionLayerId !== undefined ? { defaultTranscriptionLayerId } : {}),
      translationLayers,
      layers,
      layerLinks,
      ...(voiceDictationPreviewTextProps !== undefined
        ? { dictationPreviewTextProps: voiceDictationPreviewTextProps }
        : {}),
      ...(assistantController.voiceDictationPipeline !== undefined
        ? { dictationPipeline: assistantController.voiceDictationPipeline }
        : {}),
      formatSidePaneLayerLabel,
      formatTime,
      toggleVoiceRef: playbackKeyboardController.toggleVoiceRef,
      unitsOnCurrentMedia,
      getUnitDocById,
      getUnitTextForLayer,
      handleJumpToCitation: timelineSyncController.handleJumpToCitation,
      handleJumpToEmbeddingMatch: timelineSyncController.handleJumpToEmbeddingMatch,
      onAgentLoopTaskCancelledFromTaskList: (taskId: string) => {
        deferredAiRuntimeForSidebar.aiChat.clearPendingAgentLoopCheckpointIfTaskIdMatches?.(taskId);
      },
      onAgentLoopTaskRetriedFromTaskList: (taskId: string) => {
        deferredAiRuntimeForSidebar.aiChat.clearPendingAgentLoopCheckpointIfTaskIdMatches?.(taskId);
      },
      embeddingProviderConfig,
      setEmbeddingProviderConfig,
      aiSidebarError,
      locale,
      pdfPreviewRequest,
      setPdfPreviewRequest,
      onAiAssistantMessageBridgeRef: voiceAiAssistantMessageBridgeRef,
    },
    workspacePanelEffects: {
      isAiPanelCollapsed,
      setIsAiPanelCollapsed,
      workspaceRef,
      aiPanelWidth,
      setAiPanelWidth,
      dragCleanupRef,
      isHubCollapsed,
      hubHeight,
      setHubHeight,
      screenRef,
      setShowBatchOperationPanel,
    },
    trackEditControllers: {
      data,
      reloadSegments,
      refreshSegmentUndoSnapshot,
      updateSegmentsLocally: updateSegmentsLocallyFromDomain,
      layerAction,
      recordTimelineEdit,
      timelineUnitViewIndex: pre.timelineUnitViewIndex,
      getUnitDocById,
      activeTimelineUnitId,
      selectedUnitIds,
      selectedTimelineUnit,
      selectedTimelineMedia,
      selectedUnit,
      defaultTranscriptionLayerId,
      selectedLayerId,
      segmentsByLayer,
      segmentContentByLayer,
      transcriptionTrackMode,
      activeTextId,
      segmentTimelineLayerIds,
      displayStyleControl,
      manualSelectTsRef,
      player,
      navigateUnitFromInput: playbackKeyboardController.navigateUnitFromInput,
      waveformAreaRef,
      segmentRangeGesturePreviewReadModel,
      timelineViewportProjection,
      focusedLayerRowId,
      zoomToUnit,
      startTimelineResizeDrag:
        timelineSyncController.timelineResizeController.startTimelineResizeDrag,
      handleNoteClick,
      resolveNoteIndicatorTarget,
      setOverlapCycleToast,
      overlapCycleTelemetryRef: pre.overlapCycleTelemetryRef,
      activeLayerIdForEdits,
      setLockConflictToast,
      createLayerWithActiveContext,
      handleFocusLayerRow,
      tierContainerRef,
      zoomPxPerSec: timelineViewportProjection.zoomPxPerSec,
      setCtxMenu,
      selectUnitRange,
      toggleUnitSelection,
      selectUnit,
      selectSegment,
      setSelectedLayerId,
      formatTime,
      getUnitSpeakerKey,
    },
  };
}
