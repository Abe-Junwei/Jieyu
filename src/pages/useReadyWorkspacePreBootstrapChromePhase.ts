import { useMemo, useRef, useState } from 'react';

import { useTranscriptionData } from '../hooks/useTranscriptionData';
import { useBackupReminder } from '../hooks/useBackupReminder';
import { useTimelineUnitViewIndex } from '../hooks/useTimelineUnitViewIndex';
import { useRecoveryBanner } from '../hooks/useRecoveryBanner';
import { useNoteHandlers } from '../hooks/useNoteHandlers';
import { useTranscriptionUIState } from './TranscriptionPage.UIState';
import { useTranscriptionDisplayStyleControl } from './useTranscriptionDisplayStyleControl';
import { useTranscriptionRuntimeRefs } from './useTranscriptionRuntimeRefs';
import { useTranscriptionWorkspaceLayoutController } from './useTranscriptionWorkspaceLayoutController';
import { useWaveformRuntimeController } from './useWaveformRuntimeController';
import { useReadyWorkspaceDomainShellPhase } from './useReadyWorkspaceDomainShellPhase';
import { useReadyWorkspaceVerticalPaneFocusEffect } from './useReadyWorkspaceVerticalPaneFocusEffect';
import { useReadyWorkspaceVoiceAssistantBridgeRefs } from './useReadyWorkspaceVoiceAssistantBridgeRefs';
import { computeLogicalTimelineDurationForZoom } from './readyWorkspaceLogicalTimelineDuration';
import {
  computeTimelineContentGutterPx,
  computeVerticalComparisonEnabled,
  resolveActiveTextLogicalDurationSecForBridge,
} from './readyWorkspaceDerivedValues';

export interface UseReadyWorkspacePreBootstrapChromePhaseParams {
  data: ReturnType<typeof useTranscriptionData>;
  domainShell: ReturnType<typeof useReadyWorkspaceDomainShellPhase>;
}

/** L3–L5：recovery / refs / voice bridge / workspace chrome / lane read prep（不含 bootstrap） */
export function useReadyWorkspacePreBootstrapChromePhase(
  params: UseReadyWorkspacePreBootstrapChromePhaseParams,
) {
  const { data, domainShell } = params;
  const {
    state,
    units,
    translations,
    layers,
    layerLinks,
    transcriptionLayers,
    translationLayers,
    defaultTranscriptionLayerId,
    selectedLayerId,
    selectedTimelineUnit,
    selectedMediaUrl,
    selectedMediaIsVideo,
    unitsOnCurrentMedia,
    checkRecovery,
    applyRecovery,
    dismissRecovery,
    updateTokenPos,
    batchUpdateTokenPosByForm,
    selectUnit,
    setSaveState,
  } = data;

  const {
    activeTimelineUnitId,
    segmentScopeMediaId,
    segmentsByLayer,
    segmentsLoadComplete,
    segmentContentByLayer,
    focusedLayerRowId,
    noteTimelineUnitIds,
    activeTextTimeMapping,
    selectedTimelineOwnerUnit,
    layerById,
  } = domainShell;

  const { recoveryAvailable, recoveryDiffSummary, applyRecoveryBanner, dismissRecoveryBanner } =
    useRecoveryBanner({
      phase: data.state.phase,
      unitsLength: units.length,
      translationsLength: translations.length,
      layersLength: layers.length,
      checkRecovery,
      applyRecovery,
      dismissRecovery,
    });

  useBackupReminder(data.state.phase === 'ready');

  const {
    executeActionRef,
    openSearchRef,
    seekToTimeRef,
    splitAtTimeRef,
    zoomToSegmentRef,
    unitRowRef,
    overlapCycleTelemetryRef,
    manualSelectTsRef,
    tierContainerRef,
    listMainRef,
    workspaceRef,
    screenRef,
    waveformSectionRef,
    dragCleanupRef,
  } = useTranscriptionRuntimeRefs({
    cssVarEnabled: state.phase === 'ready',
  });

  const {
    voiceAiAssistantMessageBridgeRef,
    adoptionItemsPushSinkRef,
    flushVoiceAiAssistantMessage,
  } = useReadyWorkspaceVoiceAssistantBridgeRefs();

  const {
    waveformHeight,
    amplitudeScale,
    setAmplitudeScale,
    waveformDisplayMode,
    setWaveformDisplayMode,
    waveformVisualStyle,
    setWaveformVisualStyle,
    acousticOverlayMode,
    setAcousticOverlayMode,
    isResizingWaveform,
    handleWaveformResizeStart,
  } = useWaveformRuntimeController();

  const {
    zoomMode,
    setZoomMode,
    isTimelineLaneHeaderCollapsed,
    toggleTimelineLaneHeader,
    laneLabelWidth,
    timelineLaneHeights,
    handleLaneLabelWidthResizeStart,
    handleTimelineLaneHeightChange,
    videoPreviewHeight,
    videoRightPanelWidth,
    videoLayoutMode,
    setVideoLayoutMode,
    isResizingVideoPreview,
    isResizingVideoRightPanel,
    handleVideoPreviewResizeStart,
    handleVideoRightPanelResizeStart,
    autoScrollEnabled,
    setAutoScrollEnabled,
    isFocusMode,
    exitFocusMode,
    showShortcuts,
    closeShortcuts,
    snapEnabled,
    setSnapEnabled,
    toggleSnapEnabled,
    verticalViewEnabled,
    setVerticalViewEnabled,
  } = useTranscriptionWorkspaceLayoutController({
    layers,
    selectedTimelineOwnerUnitId: selectedTimelineOwnerUnit?.id,
    unitRowRef,
  });

  const verticalViewActive = verticalViewEnabled;

  const verticalComparisonEnabled = computeVerticalComparisonEnabled({
    verticalViewActive,
    layersCount: layers.length,
    transcriptionLayerCount: transcriptionLayers.length,
    translationLayerCount: translationLayers.length,
  });

  const timelineContentGutterPx = computeTimelineContentGutterPx({
    isTimelineLaneHeaderCollapsed,
    laneLabelWidth,
    selectedMediaUrl,
    selectedMediaIsVideo,
    videoLayoutMode,
    videoRightPanelWidth,
  });

  const onSelectWorkspaceHorizontalLayout = () => {
    setVerticalViewEnabled(false);
  };

  const onSelectWorkspaceVerticalLayout = () => {
    setVerticalViewEnabled(true);
  };

  const {
    displayStyleControl,
    waveformHoverPreviewProps,
    batchPreviewTextPropsByLayerId,
    voiceDictationPreviewTextProps,
  } = useTranscriptionDisplayStyleControl({
    layers,
    transcriptionLayers,
    translationLayers,
    layerLinks,
    layerById,
    ...(defaultTranscriptionLayerId ? { defaultTranscriptionLayerId } : {}),
    ...(selectedLayerId ? { selectedLayerId } : {}),
    ...(selectedTimelineUnit?.layerId
      ? { selectedTimelineUnitLayerId: selectedTimelineUnit.layerId }
      : {}),
    setLayers: data.setLayers,
    handleTimelineLaneHeightChange,
  });

  const [overlapCycleToast, setOverlapCycleToast] = useState<{
    index: number;
    total: number;
    nonce: number;
  } | null>(null);
  const [lockConflictToast, setLockConflictToast] = useState<{
    count: number;
    speakers: string[];
    nonce: number;
  } | null>(null);

  const {
    ctxMenu,
    setCtxMenu,
    uttOpsMenu,
    setUttOpsMenu,
    showBatchOperationPanel,
    setShowBatchOperationPanel,
    verticalPaneFocus,
    updateVerticalPaneFocus,
    resetVerticalPaneFocus,
  } = useTranscriptionUIState();

  useReadyWorkspaceVerticalPaneFocusEffect({
    verticalViewActive,
    resetVerticalPaneFocus,
  });

  const {
    notePopover,
    setNotePopover,
    currentNotes,
    addNote,
    updateNote,
    deleteNote,
    toggleNotes,
    handleNoteClick,
    resolveNoteIndicatorTarget,
    handleOpenWordNote,
    handleOpenMorphemeNote,
    handleUpdateTokenPos,
    handleBatchUpdateTokenPosByForm,
    handleExecuteRecommendation,
  } = useNoteHandlers({
    activeUnitId: activeTimelineUnitId,
    focusedLayerRowId,
    units,
    timelineUnitIds: noteTimelineUnitIds,
    transcriptionLayers,
    translationLayers,
    updateTokenPos,
    batchUpdateTokenPosByForm,
    selectUnit,
    setSaveState,
  });

  const transcriptionLaneReadScope = useMemo(
    () =>
      transcriptionLayers.length > 0 && layers.length > 0
        ? { transcriptionLayers, allLayersOrdered: layers, layerLinks }
        : undefined,
    [layerLinks, layers, transcriptionLayers],
  );

  const timelineUnitViewIndex = useTimelineUnitViewIndex({
    units,
    unitsOnCurrentMedia,
    segmentsByLayer,
    segmentContentByLayer,
    currentMediaId: segmentScopeMediaId,
    activeLayerIdForEdits: domainShell.activeLayerIdForEdits,
    defaultTranscriptionLayerId,
    segmentsLoadComplete,
    ...(transcriptionLaneReadScope ? { transcriptionLaneReadScope } : {}),
  });

  const activeTextLogicalDurationSecForBridge = resolveActiveTextLogicalDurationSecForBridge({
    activeTextTimeMapping,
    state,
  });

  const documentSpanSecFromBridgeRef = useRef(
    computeLogicalTimelineDurationForZoom(
      activeTextLogicalDurationSecForBridge,
      unitsOnCurrentMedia,
    ),
  );

  return {
    recoveryAvailable,
    recoveryDiffSummary,
    applyRecoveryBanner,
    dismissRecoveryBanner,
    executeActionRef,
    openSearchRef,
    seekToTimeRef,
    splitAtTimeRef,
    zoomToSegmentRef,
    unitRowRef,
    overlapCycleTelemetryRef,
    manualSelectTsRef,
    tierContainerRef,
    listMainRef,
    workspaceRef,
    screenRef,
    waveformSectionRef,
    dragCleanupRef,
    voiceAiAssistantMessageBridgeRef,
    adoptionItemsPushSinkRef,
    flushVoiceAiAssistantMessage,
    waveformHeight,
    amplitudeScale,
    setAmplitudeScale,
    waveformDisplayMode,
    setWaveformDisplayMode,
    waveformVisualStyle,
    setWaveformVisualStyle,
    acousticOverlayMode,
    setAcousticOverlayMode,
    isResizingWaveform,
    handleWaveformResizeStart,
    zoomMode,
    setZoomMode,
    isTimelineLaneHeaderCollapsed,
    toggleTimelineLaneHeader,
    laneLabelWidth,
    timelineLaneHeights,
    handleLaneLabelWidthResizeStart,
    handleTimelineLaneHeightChange,
    videoPreviewHeight,
    videoRightPanelWidth,
    videoLayoutMode,
    setVideoLayoutMode,
    isResizingVideoPreview,
    isResizingVideoRightPanel,
    handleVideoPreviewResizeStart,
    handleVideoRightPanelResizeStart,
    autoScrollEnabled,
    setAutoScrollEnabled,
    isFocusMode,
    exitFocusMode,
    showShortcuts,
    closeShortcuts,
    snapEnabled,
    setSnapEnabled,
    toggleSnapEnabled,
    verticalViewEnabled,
    setVerticalViewEnabled,
    verticalViewActive,
    verticalComparisonEnabled,
    timelineContentGutterPx,
    onSelectWorkspaceHorizontalLayout,
    onSelectWorkspaceVerticalLayout,
    displayStyleControl,
    waveformHoverPreviewProps,
    batchPreviewTextPropsByLayerId,
    voiceDictationPreviewTextProps,
    overlapCycleToast,
    setOverlapCycleToast,
    lockConflictToast,
    setLockConflictToast,
    ctxMenu,
    setCtxMenu,
    uttOpsMenu,
    setUttOpsMenu,
    showBatchOperationPanel,
    setShowBatchOperationPanel,
    verticalPaneFocus,
    updateVerticalPaneFocus,
    resetVerticalPaneFocus,
    notePopover,
    setNotePopover,
    currentNotes,
    addNote,
    updateNote,
    deleteNote,
    toggleNotes,
    handleNoteClick,
    resolveNoteIndicatorTarget,
    handleOpenWordNote,
    handleOpenMorphemeNote,
    handleUpdateTokenPos,
    handleBatchUpdateTokenPosByForm,
    handleExecuteRecommendation,
    transcriptionLaneReadScope,
    timelineUnitViewIndex,
    activeTextLogicalDurationSecForBridge,
    documentSpanSecFromBridgeRef,
  };
}
