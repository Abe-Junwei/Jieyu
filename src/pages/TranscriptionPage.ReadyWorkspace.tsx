/**
 * TranscriptionPage - Ready Workspace
 *
 * Heavy ready-state runtime extracted from the thin orchestrator shell.
 * 从轻量壳组件中拆出的 ready 态重运行时 | Heavy ready-state runtime extracted from the lightweight shell.
 *
 * Styles load with this async chunk (see TranscriptionPage.Orchestrator lazy import) to split CSS away from the route shell.
 */

import '../styles/transcription-entry.css';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAiPanelContextUpdater } from '../contexts/AiPanelContext';
import { useTranscriptionData } from '../hooks/useTranscriptionData';
import { useRecording } from '../hooks/useRecording';
import { useUnitOps } from '../hooks/useUnitOps';
import { useJKLShuttle } from '../hooks/useJKLShuttle';
import { useImportExport } from '../hooks/useImportExport';
import { useAiPanelLogic } from '../hooks/useAiPanelLogic';
import { useNoteHandlers } from '../hooks/useNoteHandlers';
import { useTranscriptionUIState } from './TranscriptionPage.UIState';
import { type AppShellOpenSearchDetail } from '../utils/appShellEvents';
import { useTimelineResize } from '../hooks/useTimelineResize';
import { useLayerSegments } from '../hooks/useLayerSegments';
import { useLayerSegmentContents } from '../hooks/useLayerSegmentContents';
import { useTimelineUnitViewIndex } from '../hooks/useTimelineUnitViewIndex';
import { useRecoveryBanner } from '../hooks/useRecoveryBanner';
import { getUnitSpeakerKey } from '../hooks/useSpeakerActions';
import { isSegmentTimelineUnit, isUnitTimelineUnit } from '../hooks/transcriptionTypes';
import { t, tf, useLocale } from '../i18n';
import { fireAndForget } from '../utils/fireAndForget';
import { reportValidationError } from '../utils/validationErrorReporter';
import { formatSidePaneLayerLabel, formatTime } from '../utils/transcriptionFormatters';
import { useTranscriptionAssistantSidebarController } from './useTranscriptionAssistantSidebarController';
import { useWaveformRuntimeController } from './useWaveformRuntimeController';
import { useBatchOperationController } from './useBatchOperationController';
import { useSpeakerActionScopeController } from './useSpeakerActionScopeController';
import { useTranscriptionAssistantController } from './useTranscriptionAssistantController';
import { useTranscriptionSelectionContextController } from './useTranscriptionSelectionContextController';
import { useTranscriptionProjectMediaController } from './useTranscriptionProjectMediaController';
import { useTranscriptionOverlayActionRoutingController } from './useTranscriptionOverlayActionRoutingController';
import { useTranscriptionSegmentCreationController } from './useTranscriptionSegmentCreationController';
import { useTranscriptionSegmentBridgeController } from './useTranscriptionSegmentBridgeController';
import { useTranscriptionSegmentMutationController } from './useTranscriptionSegmentMutationController';
import { useTranscriptionShellController } from './useTranscriptionShellController';
import { useTrackEntityPersistenceController } from './useTrackEntityPersistenceController';
import { useTrackEntityStateController } from './useTrackEntityStateController';
import { useTranscriptionTimelineController } from './useTranscriptionTimelineController';
import { useTranscriptionTimelineInteractionController } from './useTranscriptionTimelineInteractionController';
import { useTrackDisplayController } from './useTrackDisplayController';
import { useTranscriptionLayerMetadataController } from './useTranscriptionLayerMetadataController';
import { useTranscriptionSelfCertaintyController } from './useTranscriptionSelfCertaintyController';
import { useReadyWorkspaceRenderController } from './useReadyWorkspaceRenderController';
import { useTranscriptionWorkspaceLayoutController } from './useTranscriptionWorkspaceLayoutController';
import { useTranscriptionActionRefBindings } from './useTranscriptionActionRefBindings';
import { useTranscriptionWaveformBridgeController } from './useTranscriptionWaveformBridgeController';
import { useTranscriptionSpeakerController } from './useTranscriptionSpeakerController';
import { useTranscriptionSelectionSnapshot } from './useTranscriptionSelectionSnapshot';
import { useReadyWorkspaceLayoutDerivations } from './useReadyWorkspaceLayoutDerivations';
import { useTranscriptionDisplayStyleControl } from './useTranscriptionDisplayStyleControl';
import { useTranscriptionAnnotationController } from './useTranscriptionAnnotationController';
import { useTranscriptionRuntimeRefs } from './useTranscriptionRuntimeRefs';
import { useTranscriptionWorkspacePanelEffects } from './useTranscriptionWorkspacePanelEffects';
import { useTranscriptionPlaybackKeyboardController } from './useTranscriptionPlaybackKeyboardController';
import { useTranscriptionAcousticPanelState } from './useTranscriptionAcousticPanelState';
import { useTranscriptionAssistantSidebarControllerInput } from './useTranscriptionAssistantSidebarControllerInput';
import { useTranscriptionImportExportInput } from './useTranscriptionImportExportInput';
import { useTranscriptionProjectMediaControllerInput } from './useTranscriptionProjectMediaControllerInput';
import { useDeferredAiRuntimeBridge } from './useDeferredAiRuntimeBridge';
import { useReadyWorkspaceViewModels } from './useReadyWorkspaceViewModels';
import { loadEmbeddingProviderConfig } from './TranscriptionPage.helpers';
import { useReadyWorkspaceAxisStatus } from './useReadyWorkspaceAxisStatus';
import { useReadyWorkspaceInteractionHelpers } from './useReadyWorkspaceInteractionHelpers';
import { buildReadyWorkspaceAssistantBridgeInput } from './transcriptionReadyWorkspaceAssistantBridgeInput';
import { buildReadyWorkspaceLayoutStyle, buildReadyWorkspaceOverlaysProps, buildReadyWorkspaceSidePaneProps, buildReadyWorkspaceStageProps, buildReadyWorkspaceWaveformContentProps } from './transcriptionReadyWorkspacePropsBuilders';
import { useTimelineReadModel } from './timelineReadModel';
import { TranscriptionPageReadyWorkspaceLayout } from './TranscriptionPage.ReadyWorkspaceLayout';
import { CollaborationCloudReadOnlyBanner } from '../components/transcription/CollaborationCloudReadOnlyBanner';
import { CollaborationSyncBadge } from '../components/transcription/CollaborationSyncBadge';
import { hasSupabaseBrowserClientConfig } from '../integrations/supabase/client';
import { computeLogicalTimelineDurationForZoom } from './readyWorkspaceLogicalTimelineDuration';
import { preserveReadyWorkspaceStructureMarkers } from './TranscriptionPage.ReadyWorkspace.structureMarkers';

void preserveReadyWorkspaceStructureMarkers;
interface TranscriptionPageReadyWorkspaceProps {
  data: ReturnType<typeof useTranscriptionData>;
  appSearchRequest?: AppShellOpenSearchDetail | null;
  onConsumeAppSearchRequest?: () => void;
}

function TranscriptionPageReadyWorkspace({
  data,
  appSearchRequest,
  onConsumeAppSearchRequest,
}: TranscriptionPageReadyWorkspaceProps) {
  const locale = useLocale();
  /** Pre-bound tf for components that need (key, params) without locale */
  const tfB = (key: string, opts?: Record<string, unknown>) => tf(locale, key as Parameters<typeof tf>[1], opts as Parameters<typeof tf>[2]);
  const {
    state,
    setState,
    units,
    speakers,
    anchors,
    layers,
    translations,
    layerLinks,
    mediaItems: _mediaItems,
    selectedTimelineUnit,
    selectedUnitIds,

    setUnitSelection,
    setSelectedMediaId: _setSelectedMediaId,
    selectedLayerId,
    setSelectedLayerId,
    saveState,
    setSaveState,
    setUnits,
    setSpeakers,
    layerCreateMessage,
    setLayerCreateMessage,
    unitDrafts,
    setUnitDrafts,
    translationDrafts,
    setTranslationDrafts,
    focusedTranslationDraftKeyRef,
    snapGuide,
    setSnapGuide,
    orderedLayers,
    translationLayers,
    transcriptionLayers,
    defaultTranscriptionLayerId,
    sidePaneRows,
    deletableLayers,
    selectedUnit,
    selectedUnitMedia,
    selectedMediaUrl,
    selectedMediaBlobSize,
    selectedMediaIsVideo,
    unitsOnCurrentMedia,
    aiConfidenceAvg,
    translationTextByLayer,
    getUnitTextForLayer,
    collaborationPresenceMembers,
    collaborationPresenceCurrentUserId,
    collaborationProtocolGuard,
    collaborationSyncBadge,
    listAccessibleCloudProjects,
    listCloudProjectMembers,
    collaborationConflictTickets,
    applyRemoteConflictTicket,
    keepLocalConflictTicket,
    postponeConflictTicket,
    listProjectAssets,
    removeProjectAsset,
    getProjectAssetSignedUrl,
    listProjectSnapshots,
    restoreProjectSnapshotToLocalById,
    queryProjectChangeTimeline,
    loadSnapshot,
    applyTextTimeMapping,
    addMediaItem,
    saveVoiceTranslation,
    deleteVoiceTranslation,
    transcribeVoiceTranslation,
    saveUnitText,
    saveUnitSelfCertainty,
    saveUnitTiming,
    saveUnitLayerText,
    createAdjacentUnit: _createAdjacentUnit,
    createUnitFromSelection,
    ensureTimelineMediaRowResolved,
    deleteUnit,
    mergeWithPrevious,
    mergeWithNext,
    splitUnit,
    selectTimelineUnit,
    selectUnit,
    selectSegment,
    toggleUnitSelection,
    selectUnitRange,
    selectAllBefore,
    selectAllAfter,
    selectAllUnits,
    clearUnitSelection,
    toggleSegmentSelection,
    selectSegmentRange,
    setSelectedUnitIds: _setSelectedUnitIds,
    transcriptionTrackMode,
    setTranscriptionTrackMode,
    deleteSelectedUnits,
    offsetSelectedTimes,
    scaleSelectedTimes,
    splitByRegex,
    mergeSelectedUnits,
    createLayer,
    deleteLayer,
    deleteLayerWithoutConfirm,
    checkLayerHasContent,
    toggleLayerLink,
    reorderLayers,
    getNeighborBounds,
    makeSnapGuide,
    clearAutoSaveTimer,
    scheduleAutoSave,
    pushUndo,
    beginTimingGesture,
    endTimingGesture,
    undo,
    undoToHistoryIndex,
    redo,
    canUndo,
    canRedo,
    undoLabel,
    undoHistory,
    checkRecovery,
    applyRecovery,
    dismissRecovery,
    updateTokenPos,
    batchUpdateTokenPosByForm,
    updateTokenGloss,
    segmentUndoRef,
  } = data;
  /** 波形/时间轴当前行 id：含 segment 行（子分轨），否则纵向对照收不到 activeUnitId、无法滚到对应对照组 */
  const activeTimelineUnitId = selectedTimelineUnit != null
    && (isUnitTimelineUnit(selectedTimelineUnit) || isSegmentTimelineUnit(selectedTimelineUnit))
    ? selectedTimelineUnit.unitId
    : '';

  // 独立边界层 segments 加载 | Load segments for independent-boundary layers
  const {
    segmentsByLayer,
    segmentsLoadComplete,
    reloadSegments,
    updateSegmentsLocally,
  } = useLayerSegments(layers, selectedUnitMedia?.id, defaultTranscriptionLayerId, layerLinks);
  const { segmentContentByLayer, reloadSegmentContents } = useLayerSegmentContents(
    layers,
    selectedUnitMedia?.id,
    segmentsByLayer,
    defaultTranscriptionLayerId,
  );
  const {
    focusedLayerRowId,
    flashLayerRowId,
    setFocusedLayerRowId,
    setFlashLayerRowId,
    showAllLayerConnectors,
    handleToggleAllLayerConnectors,
    pdfPreviewRequest,
    setPdfPreviewRequest,
    openPdfPreviewRequest,
    isAiPanelCollapsed,
    setIsAiPanelCollapsed,
    aiPanelWidth,
    setAiPanelWidth,
    uiFontScale,
    uiTextDirection,
    adaptiveDialogWidth,
    adaptiveDialogCompactWidth,
    adaptiveDialogWideWidth,
    handleAiPanelToggle,
    isHubCollapsed,
    hubHeight,
    setHubHeight,
    analysisTab,
    setAnalysisTab,
    hubSidebarTab,
    setHubSidebarTab,
    showProjectSetup,
    setShowProjectSetup,
    showAudioImport,
    setShowAudioImport,
    showSearch,
    setShowSearch,
    showUndoHistory,
    setShowUndoHistory,
    activeTextId,
    setActiveTextId,
    activeTextPrimaryLanguageId,
    activeTextTimelineMode,
    activeTextTimeMapping,
    getActiveTextId,
    getActiveTextPrimaryLanguageId,
    searchOverlayRequest,
    setSearchOverlayRequest,
    openSearchFromRequest,
    createLayerWithActiveContext,
    layerAction,
    handleFocusLayerRow,
  } = useTranscriptionShellController({
    units,
    ...(appSearchRequest !== undefined ? { appSearchRequest } : {}),
    ...(onConsumeAppSearchRequest ? { onConsumeAppSearchRequest } : {}),
    selectedLayerId,
    setSelectedLayerId,
    orderedLayers,
    layerLinks,
    deletableLayers,
    layerCreateMessage,
    setLayerCreateMessage,
    createLayer,
    deleteLayer,
    deleteLayerWithoutConfirm,
    checkLayerHasContent,
  });

  const {
    layerById,
    selectedTimelineSegment,
    selectedTimelineOwnerUnit,
    selectedTimelineMedia,
    selectedTimelineUnitForTime,
    selectedTimelineRowMeta,
    nextUnitIdForVoiceDictation,
    independentLayerIds,
    noteTimelineUnitIds,
    segmentTimelineLayerIds,
  } = useTranscriptionSelectionContextController({
    layers,
    ...(defaultTranscriptionLayerId !== undefined ? { defaultTranscriptionLayerId } : {}),
    mediaItems: _mediaItems,
    units,
    unitsOnCurrentMedia,
    selectedUnit: selectedUnit ?? null,
    ...(selectedUnitMedia ? { selectedUnitMedia } : {}),
    selectedTimelineUnit,
    segmentsByLayer,
  });

  const {
    activeLayerIdForEdits,
    resolveSegmentRoutingForLayer,
    refreshSegmentUndoSnapshot,
    saveSegmentContentForLayer,
  } = useTranscriptionSegmentBridgeController({
    selectedLayerId,
    focusedLayerId: focusedLayerRowId,
    selectedTimelineUnit,
    ...(defaultTranscriptionLayerId !== undefined ? { defaultTranscriptionLayerId } : {}),
    ...(transcriptionLayers[0]?.id ? { firstTranscriptionLayerId: transcriptionLayers[0].id } : {}),
    layerById,
    independentLayerIds,
    segmentsByLayer,
    segmentContentByLayer,
    reloadSegments,
    reloadSegmentContents,
    selectTimelineUnit,
    segmentUndoRef,
  });

  // ---- Recovery banner ----
  const {
    recoveryAvailable,
    recoveryDiffSummary,
    applyRecoveryBanner,
    dismissRecoveryBanner,
  } = useRecoveryBanner({
    phase: data.state.phase,
    unitsLength: units.length,
    translationsLength: translations.length,
    layersLength: layers.length,
    checkRecovery,
    applyRecovery,
    dismissRecovery,
  });

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

  const onSelectWorkspaceHorizontalLayout = useCallback(() => {
    setVerticalViewEnabled(false);
  }, [setVerticalViewEnabled]);

  const onSelectWorkspaceVerticalLayout = useCallback(() => {
    setVerticalViewEnabled(true);
  }, [setVerticalViewEnabled]);

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
    ...(selectedTimelineUnit?.layerId ? { selectedTimelineUnitLayerId: selectedTimelineUnit.layerId } : {}),
    setLayers: data.setLayers,
    handleTimelineLaneHeightChange,
  });

  const [overlapCycleToast, setOverlapCycleToast] = useState<{ index: number; total: number; nonce: number } | null>(null);
  const [lockConflictToast, setLockConflictToast] = useState<{ count: number; speakers: string[]; nonce: number } | null>(null);

  const {
    recording,
    recordingUnitId,
    recordingLayerId: _recordingLayerId,
    recordingError,
    startRecordingForUnit: _startRecordingForUnit,
    stopRecording: _stopRecording,
  } = useRecording({
    saveVoiceTranslation,
    setSaveState,
    selectUnit,
    manualSelectTsRef,
  });

  // UI state (context menu, batch operations)
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

  useEffect(() => {
    if (!verticalViewActive) {
      resetVerticalPaneFocus();
    }
  }, [verticalViewActive, resetVerticalPaneFocus]);

  // ---- Notes (extracted hook) ----
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

  const timelineUnitViewIndex = useTimelineUnitViewIndex({
    units,
    unitsOnCurrentMedia,
    segmentsByLayer,
    segmentContentByLayer,
    currentMediaId: selectedTimelineMedia?.id,
    activeLayerIdForEdits,
    defaultTranscriptionLayerId,
    segmentsLoadComplete,
  });

  useEffect(() => {
    if (state.phase !== 'ready') return;
    const nextUnifiedUnitCount = timelineUnitViewIndex.totalCount;
    setState((prev) => {
      if (prev.phase !== 'ready') return prev;
      if (prev.unifiedUnitCount === nextUnifiedUnitCount) return prev;
      return {
        ...prev,
        unifiedUnitCount: nextUnifiedUnitCount,
      };
    });
  }, [setState, state.phase, timelineUnitViewIndex.totalCount]);

  const {
    recentTimelineEditEvents,
    recordTimelineEdit,
    getUnitDocById,
    findUnitDocContainingRange,
    findOverlappingUnitDoc,
  } = useReadyWorkspaceInteractionHelpers({
    unitsOnCurrentMedia,
  });

  const {
    splitRouted,
    mergeWithPreviousRouted,
    mergeWithNextRouted,
    mergeSelectedSegmentsRouted,
    deleteUnitRouted: deleteUnitRouted,
    deleteSelectedUnitsRouted: deleteSelectedUnitsRouted,
    toggleSkipProcessingRouted,
  } = useTranscriptionSegmentMutationController({
    activeLayerIdForEdits,
    resolveSegmentRoutingForLayer,
    pushUndo,
    reloadSegments,
    refreshSegmentUndoSnapshot,
    selectTimelineUnit,
    unitsOnCurrentMedia: timelineUnitViewIndex.currentMediaUnits,
    getUnitDocById,
    findUnitDocContainingRange,
    setSaveState,
    splitUnit: splitUnit,
    mergeSelectedUnits: mergeSelectedUnits,
    mergeWithPrevious,
    mergeWithNext,
    deleteUnit: deleteUnit,
    deleteSelectedUnits: deleteSelectedUnits,
    recordTimelineEdit,
  });

  const { createNextSegmentRouted, createUnitFromSelectionRouted } = useTranscriptionSegmentCreationController({
    activeLayerIdForEdits,
    resolveSegmentRoutingForLayer,
    selectedTimelineMedia: selectedTimelineMedia ?? null,
    ensureTimelineMediaRowResolved,
    unitsOnCurrentMedia: timelineUnitViewIndex.currentMediaUnits,
    getUnitDocById,
    findUnitDocContainingRange,
    findOverlappingUnitDoc,
    pushUndo,
    reloadSegments,
    refreshSegmentUndoSnapshot,
    reloadSegmentContents,
    selectTimelineUnit,
    setSaveState,
    createAdjacentUnit: _createAdjacentUnit,
    createUnitFromSelection,
    recordTimelineEdit,
  });

  const {
    unitHasText: _unitHasText,
    runDeleteSelection,
    runDeleteOne,
    runMergeSelection,
    runMergePrev,
    runMergeNext,
    runSplitAtTime,
    runSelectBefore,
    runSelectAfter,
    deleteConfirmState,
    muteDeleteConfirmInSession,
    setMuteDeleteConfirmInSession,
    closeDeleteConfirmDialog,
    confirmDeleteFromDialog,
  } = useUnitOps({
    units,
    translationTextByLayer,
    deleteUnit: deleteUnitRouted,
    deleteSelectedUnits: deleteSelectedUnitsRouted,
    mergeSelectedUnits,
    mergeWithPrevious: mergeWithPreviousRouted,
    mergeWithNext: mergeWithNextRouted,
    onMergeTargetMissing: () => {
      reportValidationError({
        message: t(locale, 'transcription.error.validation.mergeTargetSelectionRequired'),
        i18nKey: 'transcription.error.validation.mergeTargetSelectionRequired',
        setErrorState: ({ message, meta }) => setSaveState({ kind: 'error', message, errorMeta: meta }),
      });
    },
    splitUnit: splitRouted,
    selectAllBefore,
    selectAllAfter,
  });

  const {
    runOverlayDeleteSelection,
    runOverlayMergeSelection,
    runOverlayDeleteOne,
    runOverlayMergePrev,
    runOverlayMergeNext,
    runOverlaySplitAtTime,
  } = useTranscriptionOverlayActionRoutingController({
    deleteSelectedUnitsRouted,
    deleteUnitRouted,
    mergeWithPreviousRouted,
    mergeWithNextRouted,
    splitRouted,
    runDeleteSelection,
    runMergeSelection,
    runDeleteOne,
    runMergePrev,
    runMergeNext,
    runSplitAtTime,
  });

  const logicalTimelineDurationForZoom = useMemo(
    () => computeLogicalTimelineDurationForZoom(activeTextTimeMapping?.logicalDurationSec, unitsOnCurrentMedia),
    [activeTextTimeMapping?.logicalDurationSec, unitsOnCurrentMedia],
  );

  const {
    waveformAreaRef,
    waveCanvasRef,
    player,
    useSegmentWaveformRegions,
    waveformTimelineItems,
    waveformRegions,
    selectedWaveformRegionId,
    selectedWaveformTimelineItem,
    segmentLoopPlayback,
    setSegmentLoopPlayback,
    globalLoopPlayback,
    setGlobalLoopPlayback,
    segmentPlaybackRate,
    segMarkStart,
    setSegMarkStart,
    dragPreview,
    setDragPreview,
    skipSeekForIdRef,
    creatingSegmentRef,
    markingModeRef,
    subSelectionRange,
    setSubSelectionRange,
    subSelectDragRef,
    waveLassoRect,
    waveLassoHintCount,
    lassoRect,
    handleLassoPointerDown,
    handleLassoPointerMove,
    handleLassoPointerUp,
    timelineViewportProjection,
    zoomToPercent,
    zoomToUnit,
    hoverTime,
    handleWaveformAreaFocus,
    handleWaveformAreaBlur,
    handleWaveformAreaMouseMove,
    handleWaveformAreaMouseLeave,
    handleWaveformAreaWheel,
    waveformScrollLeft,
    handleTimelineScroll,
    waveformNoteIndicators,
    waveformLowConfidenceOverlays,
    waveformOverlapOverlays,
    acousticOverlayViewportWidth,
    acousticOverlayF0Path,
    acousticOverlayIntensityPath,
    acousticOverlayVisibleSummary,
    acousticOverlayLoading,
    waveformHoverReadout,
    spectrogramHoverReadout,
    handleSpectrogramMouseMove,
    handleSpectrogramMouseLeave,
    handleSpectrogramClick,
    handleSegmentPlaybackRateChange,
    handleToggleSelectedWaveformLoop,
    handleToggleSelectedWaveformPlay,
    waveformInteractionHandlerRefs,
  } = useTranscriptionWaveformBridgeController({
    activeLayerIdForEdits,
    layers,
    layerById,
    ...(defaultTranscriptionLayerId !== undefined ? { defaultTranscriptionLayerId } : {}),
    timelineUnitViewIndex,
    selectedTimelineUnit,
    selectedTimelineUnitForTime,
    selectedUnitIds,
    selectedMediaUrl,
    waveformHeight,
    amplitudeScale,
    setAmplitudeScale,
    waveformDisplayMode,
    waveformVisualStyle,
    acousticOverlayMode,
    zoomMode,
    setZoomMode,
    clearUnitSelection,
    createUnitFromSelection: createUnitFromSelectionRouted,
    setUnitSelection,
    resolveNoteIndicatorTarget,
    tierContainerRef,
    ...(typeof logicalTimelineDurationForZoom === 'number'
      && Number.isFinite(logicalTimelineDurationForZoom)
      && logicalTimelineDurationForZoom > 0
      ? { logicalTimelineDurationSec: logicalTimelineDurationForZoom }
      : {}),
    ...(selectedTimelineMedia?.id !== undefined ? { mediaId: selectedTimelineMedia.id } : {}),
    ...(selectedMediaBlobSize !== undefined && { mediaBlobSize: selectedMediaBlobSize }),
  });

  const selectionSnapshot = useTranscriptionSelectionSnapshot({
    selectedTimelineUnit,
    selectedTimelineSegment,
    selectedTimelineOwnerUnit: selectedTimelineOwnerUnit ?? null,
    primaryUnitView: selectedTimelineUnit
      ? timelineUnitViewIndex.resolveBySemanticId(selectedTimelineUnit.unitId) ?? null
      : null,
    selectedTimelineRowMeta,
    selectedLayerId,
    layers,
    layerLinks,
    segmentContentByLayer,
    getUnitTextForLayer,
    formatTime,
  });

  const setAiPanelContext = useAiPanelContextUpdater();
  const [aiPanelMode, setAiPanelMode] = useState<'auto' | 'all'>('auto');
  const [aiSidebarError, setAiSidebarError] = useState<string | null>(null);
  const [embeddingProviderConfig, setEmbeddingProviderConfig] = useState(() => loadEmbeddingProviderConfig());
  const [acousticProviderPreference, setAcousticProviderPreference] = useState<string | null>(null);
  const {
    deferredAiRuntime,
    deferredAiRuntimeForSidebar,
    setDeferredAiRuntime,
    handleDeferredAiRuntimeChange,
    flushDeferredAiRuntime,
  } = useDeferredAiRuntimeBridge();

  const {
    hiddenByMediaFilterCount,
    selectedUnitForAiPanelLogic,
    aiChatForSidebar,
    playerInstanceGetWidth,
  } = useReadyWorkspaceLayoutDerivations({
    unitsOnCurrentMedia,
    selectedTimelineMediaId: selectedTimelineMedia?.id,
    unitsCount: units.length,
    selectionSnapshotSelectedUnit: selectionSnapshot.selectedUnit,
    getUnitDocById,
    deferredAiRuntime,
    deferredAiRuntimeForSidebar,
    playerInstanceRef: player.instanceRef,
  });

  const {
    lexemeMatches,
    observerResult,
    actionableObserverRecommendations,
    selectedAiWarning,
    selectedTranslationGapCount,
    aiCurrentTask,
    aiVisibleCards,
    vadCacheStatus,
    handleJumpToTranslationGap,
  } = useAiPanelLogic({
    locale,
    units,
    selectedUnit: selectedUnitForAiPanelLogic ?? undefined,
    selectedUnitText: selectionSnapshot.selectedText,
    translationLayers,
    translationDrafts,
    translationTextByLayer,
    aiChatConnectionTestStatus: deferredAiRuntime.aiChat.connectionTestStatus,
    aiPanelMode,
    selectUnit,
    setSaveState,
    ...(selectedTimelineMedia?.id !== undefined ? { mediaId: selectedTimelineMedia.id } : {}),
  });

  const handleExecuteObserverRecommendation = useCallback((item: { id: string }) => {
    const match = actionableObserverRecommendations.find((candidate) => candidate.id === item.id);
    if (match) {
      fireAndForget(Promise.resolve(handleExecuteRecommendation(match)));
    }
  }, [actionableObserverRecommendations, handleExecuteRecommendation]);

  const {
    waveformAcousticRuntimeStatus,
    waveformVadCacheStatus,
    pinnedInspector,
    selectedHotspotTimeSec,
    acousticConfigOverride,
    acousticInspector,
    handlePinInspector,
    handleClearPinnedInspector,
    handleSelectHotspot,
    handleChangeAcousticConfig,
    handleResetAcousticConfig,
    handleChangeAcousticProvider,
    handleRefreshAcousticProviderState,
  } = useTranscriptionAcousticPanelState({
    deferredAiRuntime,
    setDeferredAiRuntime,
    setAcousticProviderPreference,
    ...(selectedTimelineMedia?.id !== undefined ? { selectedTimelineMediaId: selectedTimelineMedia.id } : {}),
    ...(selectedMediaUrl !== undefined ? { selectedMediaUrl } : {}),
    waveformHoverReadout,
    spectrogramHoverReadout,
    acousticProviderPreference,
    vadCacheStatus,
  });

  const {
    handleSearchReplace,
    handleJumpToEmbeddingMatch,
    handleJumpToCitation,
    handleSplitAtTimeRequest,
    handleZoomToSegmentRequest,
    getNeighborBoundsRouted,
    saveTimingRouted,
    handleWaveformRegionContextMenu,
    handleWaveformRegionAltPointerDown,
    handleWaveformRegionClick,
    handleWaveformRegionDoubleClick,
    handleWaveformRegionCreate,
    handleWaveformRegionUpdate,
    handleWaveformRegionUpdateEnd,
    handleWaveformTimeUpdate,
  } = useTranscriptionTimelineInteractionController({
    layers,
    saveUnitText: (unitId, text, layerId) => saveUnitText(unitId, text, layerId),
    saveUnitLayerText,
    units,
    selectUnit,
    manualSelectTsRef,
    player,
    locale,
    sidePaneRows,
    activeTimelineUnitId,
    onSetNotePopover: setNotePopover,
    onSetSidebarError: setAiSidebarError,
    onRevealSchemaLayer: (layerId) => {
      setSelectedLayerId(layerId);
      setFocusedLayerRowId(layerId);
      setFlashLayerRowId(layerId);
    },
    onOpenPdfPreviewRequest: openPdfPreviewRequest,
    waveformTimelineItems,
    runSplitAtTime,
    activeLayerIdForEdits,
    useSegmentWaveformRegions,
    selectTimelineUnit,
    selectedTimelineUnit,
    toggleSegmentSelection,
    selectSegmentRange,
    toggleUnitSelection,
    selectUnitRange,
    setSubSelectionRange,
    subSelectDragRef,
    waveCanvasRef,
    zoomToPercent,
    zoomToUnit,
    resolveSegmentRoutingForLayer,
    segmentsByLayer,
    unitsOnCurrentMedia,
    getNeighborBounds,
    reloadSegments,
    saveUnitTiming: saveUnitTiming,
    setSaveState,
    selectedUnitIds,
    selectedWaveformRegionId,
    beginTimingGesture,
    endTimingGesture,
    makeSnapGuide,
    snapEnabled,
    setSnapGuide,
    setDragPreview,
    creatingSegmentRef,
    markingModeRef,
    setCtxMenu,
    createUnitFromSelection: createUnitFromSelectionRouted,
  });

  const { timelineResizeTooltip, startTimelineResizeDrag } = useTimelineResize({
    zoomPxPerSec: timelineViewportProjection.zoomPxPerSec,
    manualSelectTsRef,
    player,
    selectUnit,
    selectSegment,
    setSelectedLayerId,
    setFocusedLayerRowId,
    beginTimingGesture,
    endTimingGesture,
    getNeighborBounds: getNeighborBoundsRouted,
    makeSnapGuide,
    snapEnabled,
    setSnapGuide,
    setDragPreview,
    saveUnitTiming: saveTimingRouted,
    segmentsByLayer,
  });

  const {
    aiPanelContextValue,
    handleResolveVoiceIntentWithLlm,
    handleVoiceDictation,
    voiceDictationPipeline,
    handleVoiceAnalysisResult,
  } = useTranscriptionAssistantController({
    state,
    unitsLength: units.length,
    translationLayersLength: translationLayers.length,
    aiConfidenceAvg,
    selectedPrimaryUnitView: selectionSnapshot.selectedUnit,
    selectedTimelineOwnerUnit: selectedTimelineOwnerUnit ?? null,
    selectedTimelineRowMeta,
    selectedAiWarning,
    lexemeMatches,
    handleOpenWordNote,
    handleOpenMorphemeNote,
    handleUpdateTokenPos,
    handleBatchUpdateTokenPosByForm,
    aiPanelMode,
    setAiPanelMode,
    aiCurrentTask,
    aiVisibleCards,
    vadCacheStatus,
    acousticRuntimeStatus: deferredAiRuntime.acousticRuntimeStatus,
    acousticSummary: deferredAiRuntime.acousticSummary,
    acousticInspector,
    pinnedInspector,
    selectedHotspotTimeSec,
    acousticDetail: deferredAiRuntime.acousticDetail,
    acousticDetailFullMedia: deferredAiRuntime.acousticDetailFullMedia,
    acousticBatchDetails: deferredAiRuntime.acousticBatchDetails,
    acousticBatchSelectionCount: deferredAiRuntime.acousticBatchSelectionCount,
    acousticBatchDroppedSelectionRanges: deferredAiRuntime.acousticBatchDroppedSelectionRanges,
    acousticCalibrationStatus: deferredAiRuntime.acousticCalibrationStatus,
    acousticConfigOverride,
    acousticProviderPreference,
    acousticProviderState: deferredAiRuntime.acousticProviderState,
    selectedTranslationGapCount,
    handleJumpToTranslationGap,
    handleJumpToAcousticHotspot: deferredAiRuntime.onJumpToAcousticHotspot,
    handlePinInspector,
    handleClearPinnedInspector,
    handleSelectHotspot,
    handleChangeAcousticConfig,
    handleResetAcousticConfig,
    handleChangeAcousticProvider,
    handleRefreshAcousticProviderState,
    setAiPanelContext,
    selectedTimelineUnit,
    saveSegmentContentForLayer,
    selectedLayerId,
    ...(defaultTranscriptionLayerId !== undefined ? { defaultTranscriptionLayerId } : {}),
    translationLayers,
    layers,
    layerLinks,
    unitsOnCurrentMedia,
    getUnitTextForLayer,
    saveUnitText: saveUnitText,
    saveUnitLayerText: saveUnitLayerText,
    setSaveState,
    ...(nextUnitIdForVoiceDictation ? { nextUnitIdForVoiceDictation } : {}),
    selectUnit,
    aiChatEnabled: deferredAiRuntime.aiChat.enabled,
    aiChatSettings: deferredAiRuntime.aiChat.settings,
    pushUndo,
    setUnits,
  });

  const {
    handleGlobalPlayPauseAction,
    handleWaveformKeyDown,
    navigateUnitFromInput,
    executeAction,
    toggleVoiceRef,
  } = useTranscriptionPlaybackKeyboardController({
    player,
    subSelectionRange,
    setSubSelectionRange,
    selectedUnit: selectedTimelineOwnerUnit ?? undefined,
    selectedPlayableRange: selectedTimelineUnitForTime,
    selectedTimelineUnit,
    selectedUnitIds,
    selectedMediaUrl,
    segMarkStart,
    setSegMarkStart,
    segmentLoopPlayback,
    setSegmentLoopPlayback,
    timelineUnitsOnCurrentMedia: timelineUnitViewIndex.currentMediaUnits,
    markingModeRef,
    skipSeekForIdRef,
    creatingSegmentRef,
    manualSelectTsRef,
    waveformAreaRef,
    createUnitFromSelection: createUnitFromSelectionRouted,
    selectTimelineUnit,
    selectUnit,
    selectAllUnits,
    runDeleteSelection,
    runMergePrev,
    runMergeNext,
    runSplitAtTime,
    runSelectBefore,
    runSelectAfter,
    undo,
    redo,
    setShowSearch,
    toggleNotes,
  });

  useJKLShuttle(player);

  useTranscriptionActionRefBindings({
    executeActionRef,
    executeAction,
    openSearchRef,
    openSearchFromRequest,
    seekToTimeRef,
    seekToTime: (timeSeconds) => {
      player.seekTo(timeSeconds);
    },
    splitAtTimeRef,
    handleSplitAtTimeRequest,
    zoomToSegmentRef,
    handleZoomToSegmentRequest,
    waveformInteractionHandlerRefs,
    handleWaveformRegionAltPointerDown,
    handleWaveformRegionClick,
    handleWaveformRegionDoubleClick,
    handleWaveformRegionCreate,
    handleWaveformRegionContextMenu,
    handleWaveformRegionUpdate,
    handleWaveformRegionUpdateEnd,
    handleWaveformTimeUpdate,
  });

  const timelineReadModel = useTimelineReadModel({
    unitIndex: timelineUnitViewIndex,
    transcriptionLayerIds: transcriptionLayers.map((layer) => layer.id),
    translationLayerIds: translationLayers.map((layer) => layer.id),
    selectedTimelineUnit,
    selectedUnitIds: Array.from(selectedUnitIds),
    ...(activeLayerIdForEdits !== undefined ? { activeLayerIdForEdits } : {}),
    ...(activeTextTimelineMode !== undefined ? { activeTextTimelineMode } : {}),
    ...(timelineViewportProjection.logicalTimelineDurationSec > 0
      ? { logicalTimelineDurationSec: timelineViewportProjection.logicalTimelineDurationSec }
      : {}),
    ...(timelineViewportProjection.zoomPxPerSec !== undefined ? { zoomPxPerSec: timelineViewportProjection.zoomPxPerSec } : {}),
    ...(timelineViewportProjection.fitPxPerSec !== undefined ? { fitPxPerSec: timelineViewportProjection.fitPxPerSec } : {}),
    ...(timelineViewportProjection.waveformScrollLeft !== undefined
      ? { waveformScrollLeft: timelineViewportProjection.waveformScrollLeft }
      : {}),
    ...(selectedTimelineMedia?.id !== undefined ? { selectedMediaId: selectedTimelineMedia.id } : {}),
    selectedMediaUrl: selectedMediaUrl ?? null,
    playerIsReady: player.isReady,
    playerDuration: player.duration,
    verticalViewEnabled: verticalViewActive,
  });

  const assistantSidebarControllerInput = useTranscriptionAssistantSidebarControllerInput({
    locale,
    analysisTab,
    onAnalysisTabChange: setAnalysisTab,
    timelineReadModelEpoch: timelineReadModel.epoch,
    currentPage: 'transcription',
    selectedUnit: selectionSnapshot.selectedUnit,
    selectedRowMeta: selectedTimelineRowMeta,
    selectedUnitKind: selectionSnapshot.selectedUnitKind,
    selectedLayerType: selectionSnapshot.selectedLayerType,
    selectedText: selectionSnapshot.selectedText,
    selectedTimeRangeLabel: selectionSnapshot.selectedTimeRangeLabel ?? null,
    lexemeMatches,
    aiChat: aiChatForSidebar,
    aiToolDecisionLogs: deferredAiRuntimeForSidebar.aiToolDecisionLogs,
    observerStage: observerResult.stage,
    observerRecommendations: actionableObserverRecommendations,
    onJumpToCitation: handleJumpToCitation,
    runtimePropsInput: {
      saveState,
      recording,
      recordingUnitId,
      recordingError,
      overlapCycleToast,
      lockConflictToast,
      tfB,
      activeTextPrimaryLanguageId,
      getActiveTextPrimaryLanguageId,
      executeAction,
      handleResolveVoiceIntentWithLlm,
      handleVoiceDictation,
      handleVoiceAnalysisResult,
      selectionSnapshot,
      ...(defaultTranscriptionLayerId !== undefined ? { defaultTranscriptionLayerId } : {}),
      translationLayers,
      layers,
      layerLinks,
      ...(voiceDictationPreviewTextProps !== undefined ? { dictationPreviewTextProps: voiceDictationPreviewTextProps } : {}),
      ...(voiceDictationPipeline !== undefined ? { dictationPipeline: voiceDictationPipeline } : {}),
      formatSidePaneLayerLabel,
      formatTime,
      toggleVoiceRef,
      unitsOnCurrentMedia,
      getUnitDocById,
      getUnitTextForLayer,
      handleJumpToCitation,
      handleJumpToEmbeddingMatch,
      embeddingProviderConfig,
      setEmbeddingProviderConfig,
      aiSidebarError,
      locale,
      pdfPreviewRequest,
      setPdfPreviewRequest,
    },
  });

  const {
    assistantRuntimeProps,
    analysisRuntimeProps,
    pdfRuntimeProps,
  } = useTranscriptionAssistantSidebarController({
    ...assistantSidebarControllerInput,
  });

  const { handleAiPanelResizeStart } = useTranscriptionWorkspacePanelEffects({
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
  });

  // ── Import / Export (extracted hook) ──

  const importExportInput = useTranscriptionImportExportInput({
    activeTextId,
    getActiveTextId,
    selectedUnitMedia: selectedTimelineMedia,
    unitsOnCurrentMedia,
    anchors,
    layers,
    translations,
    defaultTranscriptionLayerId,
    loadSnapshot,
    setSaveState,
  });

  const {
    importFileRef,
    exportMenuRef,
    showExportMenu,
    setShowExportMenu,
    handleExportEaf,
    handleExportTextGrid,
    handleExportTrs,
    handleExportFlextext,
    handleExportToolbox,
    handleExportJyt,
    handleExportJym,
    previewProjectArchiveImport,
    importProjectArchive,
    handleImportFile,
  } = useImportExport(importExportInput);

  const projectMediaControllerInput = useTranscriptionProjectMediaControllerInput({
    activeTextId,
    mediaItems: _mediaItems,
    getActiveTextId,
    setActiveTextId,
    setShowAudioImport,
    addMediaItem,
    setSaveState,
    selectedMediaUrl: selectedMediaUrl ?? null,
    selectedTimelineMedia: selectedTimelineMedia ?? null,
    unitsOnCurrentMedia,
    createUnitFromSelectionRouted,
    loadSnapshot,
    selectTimelineUnit,
    locale,
    tfB,
    transcriptionLayers,
    translationLayers,
    translationTextByLayer,
    getUnitTextForLayer,
  });

  const {
    mediaFileInputRef,
    handleDirectMediaImport,
    audioDeleteConfirm,
    projectDeleteConfirm,
    autoSegmentBusy,
    handleAutoSegment,
    handleDeleteCurrentAudio,
    handleConfirmAudioDelete,
    handleDeleteCurrentProject,
    handleConfirmProjectDelete,
    handleProjectSetupSubmit,
    handleAudioImport,
    audioImportDisposition,
    searchableItems,
    setAudioDeleteConfirm,
    setProjectDeleteConfirm,
  } = useTranscriptionProjectMediaController({
    ...projectMediaControllerInput,
  });

  const {
    segmentByIdForSpeakerActions,
    resolveSpeakerKeyForSegment,
    resolveExplicitSpeakerKeyForSegment,
    segmentSpeakerAssignmentsOnCurrentMedia,
    speakerVisualByTimelineUnitId,
    activeSpeakerManagementLayer,
    speakerFilterOptionsForActions,
    selectedUnitIdsForSpeakerActions,
    selectedBatchSegmentsForSpeakerActions,
    selectedBatchUnits: selectedSpeakerBatchUnits,
    resolveSpeakerActionUnitIds,
    selectedSpeakerUnitIdsForActionsSet,
  } = useSpeakerActionScopeController({
    unitsOnCurrentMedia: timelineUnitViewIndex.currentMediaUnits,
    unitViewById: timelineUnitViewIndex.byId,
    resolveUnitViewById: timelineUnitViewIndex.resolveBySemanticId,
    getUnitDocById,
    segmentsByLayer,
    speakers,
    layers,
    ...(defaultTranscriptionLayerId !== undefined ? { defaultTranscriptionLayerId } : {}),
    ...(selectedLayerId !== undefined ? { selectedLayerId } : {}),
    selectedUnitIds,
    selectedTimelineUnit,
    getUnitSpeakerKey,
  });

  const {
    selectedBatchUnits: selectedBatchUnitDocs,
    handleBatchOffset,
    handleBatchScale,
    handleBatchSplitByRegex,
    handleBatchMerge,
  } = useBatchOperationController({
    selectedUnitIds,
    selectedTimelineUnit,
    unitViewById: timelineUnitViewIndex.byId,
    resolveUnitViewById: timelineUnitViewIndex.resolveBySemanticId,
    unitsOnCurrentMedia: timelineUnitViewIndex.currentMediaUnits,
    getUnitDocById,
    setSaveState,
    offsetSelectedTimes,
    scaleSelectedTimes,
    splitByRegex,
    mergeSelectedUnits,
  });

  const {
    speakerOptions,
    speakerDraftName,
    setSpeakerDraftName,
    batchSpeakerId,
    setBatchSpeakerId,
    speakerSavingRouted,
    activeSpeakerFilterKey,
    setActiveSpeakerFilterKey,
    speakerReferenceStats,
    speakerReferenceUnassignedStats,
    speakerReferenceStatsMediaScoped,
    speakerReferenceStatsReady,
    speakerDialogStateRouted,
    selectedSpeakerSummaryForActions,
    handleSelectSpeakerUnitsRouted,
    handleClearSpeakerAssignmentsRouted,
    handleExportSpeakerSegmentsRouted,
    handleRenameSpeaker,
    handleMergeSpeaker,
    handleDeleteSpeaker,
    handleDeleteUnusedSpeakers,
    handleAssignSpeakerToSelectedRouted,
    handleCreateSpeakerAndAssignRouted,
    handleCreateSpeakerOnly,
    closeSpeakerDialogRouted,
    updateSpeakerDialogDraftNameRouted,
    updateSpeakerDialogTargetKeyRouted,
    confirmSpeakerDialogRouted,
    handleClearSpeakerOnSelectedRouted,
    speakerQuickActions,
    selectedSpeakerIdsForTrackLock,
    selectedSpeakerNamesForTrackLock,
    speakerNameById,
    handleOpenSpeakerManagementPanel,
    handleAssignSpeakerFromMenu,
  } = useTranscriptionSpeakerController({
    units,
    setUnits,
    speakers,
    setSpeakers,
    unitsOnCurrentMedia: timelineUnitViewIndex.currentMediaUnits,
    getUnitDocById,
    activeTimelineUnitId,
    selectedUnitIds,
    selectedBatchSegmentsForSpeakerActions,
    selectedBatchUnits: selectedSpeakerBatchUnits,
    selectedTimelineUnit,
    selectedTimelineMediaId: selectedTimelineMedia?.id ?? null,
    selectedUnit: selectedUnit ?? null,
    statePhase: state.phase,
    setUnitSelection,
    data,
    setSaveState,
    getUnitTextForLayer,
    formatTime,
    getUnitSpeakerKey,
    activeSpeakerManagementLayer,
    segmentsByLayer,
    segmentContentByLayer,
    resolveExplicitSpeakerKeyForSegment,
    resolveSpeakerKeyForSegment,
    selectedUnitIdsForSpeakerActions,
    segmentByIdForSpeakerActions,
    resolveSpeakerActionUnitIds,
    speakerFilterOptionsForActions,
    segmentSpeakerAssignmentsOnCurrentMedia,
    selectTimelineUnit,
    setSelectedUnitIds: _setSelectedUnitIds,
    reloadSegments,
    refreshSegmentUndoSnapshot,
    updateSegmentsLocally,
    layerAction,
    recordTimelineEdit,
  });

  const {
    resolveSelfCertaintyUnitIds,
    resolveSelfCertaintyForUnit,
    resolveSelfCertaintyAmbiguityForUnit,
    handleSetUnitSelfCertaintyFromMenu,
  } = useTranscriptionSelfCertaintyController({
    segmentsByLayer,
    currentMediaUnits: timelineUnitViewIndex.currentMediaUnits,
    units,
    // brand → raw-string adapter：leaf 写入 API 仍接收 string ids，由 controller 打标
    // 保证送入此处的每个 id 都带正确 kind；leaf 内部按 unitType 路由到对应表的写入原语。
    // Brand-to-string adapter: the leaf API still accepts string ids, but the controller
    // has already attached kind brands, so routing intent is preserved across the seam.
    saveUnitSelfCertainty: (targets, value) => saveUnitSelfCertainty(targets.map((t) => t.id), value),
  });

  const { updateLayerMetadata } = useTranscriptionLayerMetadataController({
    layers,
    setLayerCreateMessage,
    setLayers: data.setLayers,
  });

  const {
    laneLockMap,
    setLaneLockMap,
    persistenceContext: trackEntityPersistenceContext,
  } = useTrackEntityStateController({
    activeTextId,
    selectedTimelineMediaId: selectedTimelineMedia?.id ?? null,
    setTranscriptionTrackMode,
  });

  const timelineTextLayersForContextMenu = useMemo(
    () => [...transcriptionLayers, ...translationLayers],
    [transcriptionLayers, translationLayers],
  );

  const { handleAnnotationClick, handleAnnotationContextMenu, renderAnnotationItem, renderLaneLabel } = useTranscriptionAnnotationController({
    manualSelectTsRef,
    player,
    selectedTimelineUnit,
    currentTimelineUnitId: activeTimelineUnitId,
    selectUnitRange,
    toggleUnitSelection,
    selectTimelineUnit,
    selectUnit,
    selectSegment,
    setSelectedLayerId,
    onFocusLayerRow: handleFocusLayerRow,
    tierContainerRef,
    zoomPxPerSec: timelineViewportProjection.zoomPxPerSec,
    setCtxMenu,
    timelineTextLayers: timelineTextLayersForContextMenu,
    navigateUnitFromInput,
    waveformAreaRef,
    dragPreview,
    selectedUnitIds,
    focusedLayerRowId,
    zoomToUnit,
    startTimelineResizeDrag,
    handleNoteClick,
    resolveNoteIndicatorTarget,
    speakerVisualByUnitId: speakerVisualByTimelineUnitId,
    independentLayerIds: segmentTimelineLayerIds,
    orthographies: displayStyleControl.orthographies,
    resolveSelfCertaintyForUnit,
    resolveSelfCertaintyAmbiguityForUnit,
    setOverlapCycleToast,
    overlapCycleTelemetryRef,
  });

  const {
    filteredUnitsOnCurrentMedia,
    timelineRenderUnits,
    translationAudioByLayer,
    selectedBatchUnitTextById,
    batchPreviewLayerOptions,
    batchPreviewTextByLayerId,
    defaultBatchPreviewLayerId,
    editorContextValue,
  } = useTranscriptionTimelineController({
    activeSpeakerFilterKey,
    unitsOnCurrentMedia,
    getUnitSpeakerKey,
    rulerView: timelineViewportProjection.rulerView ?? null,
    playerDuration: player.duration,
    translations,
    selectedBatchUnits: selectedBatchUnitDocs,
    transcriptionLayers,
    selectedLayerId: selectedLayerId ?? null,
    getUnitTextForLayer,
    unitDrafts,
    setUnitDrafts,
    translationDrafts,
    setTranslationDrafts,
    translationTextByLayer,
    focusedTranslationDraftKeyRef,
    scheduleAutoSave,
    clearAutoSaveTimer,
    saveUnitText,
    saveUnitLayerText,
    renderLaneLabel,
    createLayer: createLayerWithActiveContext,
    updateLayerMetadata,
    deleteLayer,
    deleteLayerWithoutConfirm,
    checkLayerHasContent,
  });

  const {
    speakerSortKeyById,
    effectiveLaneLockMap,
    speakerLayerLayout,
    setTrackDisplayMode,
    handleToggleTrackDisplayMode,
    handleLockSelectedSpeakersToLane,
    handleUnlockSelectedSpeakers,
    handleResetTrackAutoLayout,
  } = useTrackDisplayController({
    unitsOnCurrentMedia,
    timelineUnitsOnCurrentMedia: timelineUnitViewIndex.currentMediaUnits,
    timelineRenderUnits,
    activeLayerIdForEdits,
    ...(defaultTranscriptionLayerId !== undefined ? { defaultTranscriptionLayerId } : {}),
    layers,
    segmentsByLayer,
    segmentSpeakerAssignmentsOnCurrentMedia,
    transcriptionTrackMode,
    setTranscriptionTrackMode,
    laneLockMap,
    setLaneLockMap,
    selectedSpeakerIdsForTrackLock,
    speakerNameById,
    setLockConflictToast,
    getUnitSpeakerKey,
  });

  useTrackEntityPersistenceController({
    activeTextId: trackEntityPersistenceContext.activeTextId,
    trackEntityScopedKey: trackEntityPersistenceContext.trackEntityScopedKey,
    trackEntityStateByMediaRef: trackEntityPersistenceContext.trackEntityStateByMediaRef,
    trackEntityHydratedKeyRef: trackEntityPersistenceContext.trackEntityHydratedKeyRef,
    transcriptionTrackMode,
    effectiveLaneLockMap,
  });

  const {
    toolbarProps,
    timelineTopProps,
    timelineContentProps,
    aiSidebarProps,
    dialogsProps,
  } = useReadyWorkspaceViewModels({
    lanePropsInput: {
      transcriptionLayers,
      translationLayers,
      timelineUnitViewIndex,
      segmentParentUnitLookup: unitsOnCurrentMedia,
      segmentsByLayer,
      segmentContentByLayer,
      saveSegmentContentForLayer,
      selectedTimelineUnit,
      flashLayerRowId,
      focusedLayerRowId,
      activeTimelineUnitId,
      orderedLayers,
      reorderLayers,
      deletableLayers,
      handleFocusLayerRow,
      layerLinks,
      showAllLayerConnectors,
      handleToggleAllLayerConnectors,
      timelineLaneHeights,
      handleTimelineLaneHeightChange,
      transcriptionTrackMode,
      handleToggleTrackDisplayMode,
      setTrackDisplayMode,
      effectiveLaneLockMap,
      handleLockSelectedSpeakersToLane,
      handleUnlockSelectedSpeakers,
      handleResetTrackAutoLayout,
      selectedSpeakerNamesForTrackLock,
      speakerLayerLayout,
      activeSpeakerFilterKey,
      speakerQuickActions,
      handleLaneLabelWidthResizeStart,
      activeTextTimelineMode,
      translationAudioByLayer,
      mediaItems: _mediaItems,
      recording,
      recordingUnitId,
      recordingLayerId: _recordingLayerId,
      startRecordingForUnit: _startRecordingForUnit,
      stopRecording: _stopRecording,
      deleteVoiceTranslation,
      transcribeVoiceTranslation,
      displayStyleControl,
    },
    orchestratorRawInput: {
      selectedMediaUrl,
      playableAcoustic: timelineReadModel.acoustic.state === 'playable',
      player,
      layers,
      locale,
      importFileRef,
      layerAction,
      timelineViewportProjection,
      lassoRect,
      timelineRenderUnits,
      defaultTranscriptionLayerId,
      ...(activeTextTimeMapping?.logicalDurationSec !== undefined
        ? { textOnlyLogicalDurationSec: activeTextTimeMapping.logicalDurationSec }
        : {}),
      ...(activeTextTimeMapping
        ? {
          textOnlyTimeMapping: {
            offsetSec: activeTextTimeMapping.offsetSec,
            scale: activeTextTimeMapping.scale,
          },
        }
        : {}),
      createUnitFromSelectionRouted,
      renderAnnotationItem,
      speakerSortKeyById,
      filteredUnitsOnCurrentMedia,
      tierContainerRef,
      handleAnnotationClick,
      handleAnnotationContextMenu,
      handleNoteClick,
      resolveNoteIndicatorTarget,
      startTimelineResizeDrag,
      timingDragPreview: dragPreview,
      navigateUnitFromInput,
      speakerVisualByTimelineUnitId,
      resolveSelfCertaintyForUnit,
      resolveSelfCertaintyAmbiguityForUnit,
      verticalViewEnabled: verticalViewActive,
      verticalPaneFocus,
      updateVerticalPaneFocus,
      selectedTimelineMedia,
      waveformDisplayMode,
      setWaveformDisplayMode,
      waveformVisualStyle,
      setWaveformVisualStyle,
      acousticOverlayMode,
      setAcousticOverlayMode,
      globalLoopPlayback,
      setGlobalLoopPlayback,
      handleGlobalPlayPauseAction,
      canUndo,
      canRedo,
      undoLabel,
      activeTextId,
      selectedTimelineUnit,
      notePopover,
      showExportMenu,
      exportMenuRef,
      loadSnapshot,
      undo,
      redo,
      setShowProjectSetup,
      setShowAudioImport,
      handleDeleteCurrentAudio,
      handleDeleteCurrentProject,
      toggleNotes,
      setUttOpsMenu,
      handleAutoSegment,
      autoSegmentBusy,
      setShowExportMenu,
      handleExportEaf,
      handleExportTextGrid,
      handleExportTrs,
      handleExportFlextext,
      handleExportToolbox,
      handleExportJyt,
      handleExportJym,
      handleImportFile,
      unitsOnCurrentMedia,
      isTimelineLaneHeaderCollapsed,
      toggleTimelineLaneHeader,
      waveCanvasRef,
      showSearch,
      searchableItems,
      displayStyleControl,
      activeLayerIdForEdits,
      activeTimelineUnitId,
      searchOverlayRequest,
      manualSelectTsRef,
      selectUnit,
      handleSearchReplace,
      setShowSearch,
      setSearchOverlayRequest,
      isAiPanelCollapsed,
      hubSidebarTab,
      setHubSidebarTab,
      assistantRuntimeProps,
      analysisRuntimeProps,
      selectedAiWarning,
      selectedTranslationGapCount,
      aiSidebarError,
      speakerDialogStateRouted,
      speakerSavingRouted,
      closeSpeakerDialogRouted,
      confirmSpeakerDialogRouted,
      updateSpeakerDialogDraftNameRouted,
      updateSpeakerDialogTargetKeyRouted,
      showProjectSetup,
      handleProjectSetupSubmit,
      showAudioImport,
      handleAudioImport,
      audioImportDisposition,
      mediaFileInputRef,
      handleDirectMediaImport,
      audioDeleteConfirm,
      setAudioDeleteConfirm,
      handleConfirmAudioDelete,
      projectDeleteConfirm,
      setProjectDeleteConfirm,
      handleConfirmProjectDelete,
      showShortcuts,
      closeShortcuts,
      isFocusMode,
      exitFocusMode,
    },
  });

  const toolbarPropsWithCollaboration = {
    ...toolbarProps,
    leftToolbarExtras: (
      <CollaborationSyncBadge
        locale={locale}
        badge={collaborationSyncBadge}
        presenceMembers={collaborationPresenceMembers}
        currentUserId={collaborationPresenceCurrentUserId}
      />
    ),
  };

  const { timelineTopPropsWithAxisStatus } = useReadyWorkspaceAxisStatus({
    timelineTopProps,
    selectedMediaUrl,
    isResizingWaveform,
    handleWaveformResizeStart,
    layersCount: layers.length,
    playerIsReady: player.isReady,
    playerDuration: player.duration,
    acousticState: timelineReadModel.acoustic.state,
    selectedTimelineMedia: selectedTimelineMedia ?? null,
    unitsOnCurrentMedia,
    hiddenByMediaFilterCount,
    activeTextId,
    activeTextTimeMapping,
    activeTextTimelineMode,
    locale,
    loadSnapshot,
    setSaveState,
  });

  const {
    shouldRenderAiSidebar,
    shouldRenderDialogs,
    shouldRenderPdfRuntime,
    shouldRenderBatchOps,
    shouldRenderRecoveryBanner,
  } = useReadyWorkspaceRenderController({
    isAiPanelCollapsed,
    flushDeferredAiRuntime,
    aiPendingToolCall: assistantRuntimeProps.aiChatContextValue.aiPendingToolCall,
    setHubSidebarTab,
    setIsAiPanelCollapsed,
    showProjectSetup,
    showAudioImport,
    audioDeleteConfirm,
    projectDeleteConfirm,
    showShortcuts,
    isFocusMode,
    pdfPreviewRequest: pdfRuntimeProps.previewRequest.request,
    showBatchOperationPanel,
    recoveryAvailable,
  });

  const assistantBridgeControllerInput = buildReadyWorkspaceAssistantBridgeInput({
    selectedUnitIds,
    selectedUnit: selectedUnit ?? null,
    getUnitDocById,
    selectedTimelineSegment: selectedTimelineSegment ?? null,
    ...(selectedTimelineMedia ? { selectedTimelineMedia } : {}),
    ...(selectedMediaUrl ? { selectedMediaUrl } : {}),
    selectedLayerId,
    activeLayerIdForEdits,
    resolveSegmentRoutingForLayer,
    segmentsByLayer,
    segmentContentByLayer,
    selectionSnapshot,
    layers,
    transcriptionLayers,
    translationLayers,
    layerLinks,
    getUnitTextForLayer,
    formatTime,
    timelineUnitViewIndex,
    segmentsLoadComplete,
    aiConfidenceAvg,
    recentTimelineEditEvents,
    createLayerWithActiveContext,
    createTranscriptionSegment: createNextSegmentRouted,
    splitTranscriptionSegment: splitRouted,
    mergeWithPrevious: mergeWithPreviousRouted,
    mergeWithNext: mergeWithNextRouted,
    mergeSelectedUnits: mergeSelectedUnits,
    mergeSelectedSegments: mergeSelectedSegmentsRouted,
    deleteUnit: deleteUnitRouted,
    deleteSelectedUnits: deleteSelectedUnitsRouted,
    deleteLayer,
    toggleLayerLink,
    saveUnitText: saveUnitText,
    saveUnitLayerText: saveUnitLayerText,
    saveSegmentContentForLayer,
    updateTokenPos,
    batchUpdateTokenPosByForm,
    updateTokenGloss,
    selectUnit,
    setSaveState,
    translationDrafts,
    translationTextByLayer,
    locale,
    playerCurrentTime: player.currentTime,
    executeActionRef,
    openSearchRef,
    seekToTimeRef,
    splitAtTimeRef,
    zoomToSegmentRef,
    handleExecuteRecommendation,
    aiSidebarError,
    setAiSidebarError,
    embeddingProviderConfig,
    setEmbeddingProviderConfig,
    acousticConfigOverride,
    acousticProviderPreference,
    ...(defaultTranscriptionLayerId !== undefined ? { defaultTranscriptionLayerId } : {}),
    state,
  });

  const readyWorkspaceSidePaneProps = buildReadyWorkspaceSidePaneProps({
    selectedUnitIds: selectedSpeakerUnitIdsForActionsSet,
    handleAssignSpeakerToSelectedRouted,
    handleClearSpeakerOnSelectedRouted,
    speakerOptions,
    speakerDraftName,
    setSpeakerDraftName,
    batchSpeakerId,
    setBatchSpeakerId,
    speakerSaving: speakerSavingRouted,
    activeSpeakerFilterKey,
    setActiveSpeakerFilterKey,
    speakerDialogState: speakerDialogStateRouted,
    speakerVisualByUnitId: speakerVisualByTimelineUnitId,
    speakerFilterOptions: speakerFilterOptionsForActions,
    speakerReferenceStats,
    speakerReferenceUnassignedStats,
    speakerReferenceStatsMediaScoped,
    speakerReferenceStatsReady,
    selectedSpeakerSummary: selectedSpeakerSummaryForActions,
    handleSelectSpeakerUnits: handleSelectSpeakerUnitsRouted,
    handleClearSpeakerAssignments: handleClearSpeakerAssignmentsRouted,
    handleExportSpeakerSegments: handleExportSpeakerSegmentsRouted,
    handleRenameSpeaker,
    handleMergeSpeaker,
    handleDeleteSpeaker,
    handleDeleteUnusedSpeakers,
    handleAssignSpeakerToSelected: handleAssignSpeakerToSelectedRouted,
    handleCreateSpeakerAndAssign: handleCreateSpeakerAndAssignRouted,
    handleCreateSpeakerOnly,
    closeSpeakerDialog: closeSpeakerDialogRouted,
    updateSpeakerDialogDraftName: updateSpeakerDialogDraftNameRouted,
    updateSpeakerDialogTargetKey: updateSpeakerDialogTargetKeyRouted,
    confirmSpeakerDialog: confirmSpeakerDialogRouted,
    sidePaneRows: orderedLayers,
    focusedLayerRowId,
    flashLayerRowId,
    onFocusLayer: handleFocusLayerRow,
    transcriptionLayers,
    layerLinks,
    toggleLayerLink,
    deletableLayers,
    updateLayerMetadata,
    layerCreateMessage,
    layerAction,
    ...(defaultTranscriptionLayerId !== undefined ? { defaultTranscriptionLayerId } : {}),
    segmentsByLayer,
    segmentContentByLayer,
    unitsOnCurrentMedia,
    speakers,
    collaborationCloudPanelProps: {
      listProjectAssets,
      removeProjectAsset,
      getProjectAssetSignedUrl,
      listProjectSnapshots,
      restoreProjectSnapshotToLocalById,
      queryProjectChangeTimeline,
      ...(hasSupabaseBrowserClientConfig() && activeTextId
        ? {
          directory: {
            workspaceProjectId: activeTextId,
            listAccessibleProjects: listAccessibleCloudProjects,
            listProjectMembers: listCloudProjectMembers,
          },
        }
        : {}),
    },
    getUnitTextForLayer,
    onSelectTimelineUnit: selectTimelineUnit,
    onReorderLayers: reorderLayers,
    locale,
    verticalViewActive,
    translationLayerCount: translationLayers.length,
    onSelectWorkspaceHorizontalLayout,
    onSelectWorkspaceVerticalLayout,
  });

  const readyWorkspaceWaveformContentProps = buildReadyWorkspaceWaveformContentProps({
    locale,
    waveformAreaRef,
    snapGuideNearSide: snapGuide.nearSide,
    segMarkStart,
    isResizingWaveform,
    waveformHeight,
    handleWaveformKeyDown,
    handleWaveformAreaFocus,
    handleWaveformAreaBlur,
    handleWaveformAreaMouseMove,
    handleWaveformAreaMouseLeave,
    handleWaveformAreaWheel,
    hoverTime,
    unitsOnCurrentMedia,
    getUnitTextForLayer,
    waveformHoverPreviewProps,
    selectedMediaUrl,
    zoomPercent: timelineViewportProjection.zoomPercent,
    snapEnabled,
    toggleSnapEnabled,
    playerPlaybackRate: player.playbackRate,
    playerCurrentTime: player.currentTime,
    selectedUnitDuration: selectedTimelineUnitForTime
      ? selectedTimelineUnitForTime.endTime - selectedTimelineUnitForTime.startTime
      : null,
    amplitudeScale,
    setAmplitudeScale,
    selectedMediaIsVideo,
    videoLayoutMode,
    setVideoLayoutMode,
    handleLaneLabelWidthResizeStart,
    videoPreviewHeight,
    videoRightPanelWidth,
    waveformRegions,
    selectedUnitIds,
    activeTimelineUnitId,
    segmentLoopPlayback,
    subSelectionRange,
    isResizingVideoPreview,
    isResizingVideoRightPanel,
    handleVideoPreviewResizeStart,
    handleVideoRightPanelResizeStart,
    waveformDisplayMode,
    waveCanvasRef,
    playerSpectrogramRef: player.spectrogramRef,
    playerWaveformRef: player.waveformRef,
    playerSeekTo: player.seekTo,
    playerPlayRegion: player.playRegion,
    waveLassoRect,
    waveLassoHintCount,
    waveformNoteIndicators,
    waveformLowConfidenceOverlays,
    waveformOverlapOverlays,
    acousticOverlayMode,
    acousticOverlayViewportWidth,
    acousticOverlayF0Path,
    acousticOverlayIntensityPath,
    acousticOverlayVisibleSummary,
    acousticOverlayLoading,
    acousticRuntimeStatus: waveformAcousticRuntimeStatus,
    vadCacheStatus: waveformVadCacheStatus,
    waveformHoverReadout,
    spectrogramHoverReadout,
    selectedHotspotTimeSec,
    handleSpectrogramMouseMove,
    handleSpectrogramMouseLeave,
    handleSpectrogramClick,
    setNotePopover,
    snapGuideVisible: snapGuide.visible,
    snapGuideLeft: snapGuide.left,
    snapGuideRight: snapGuide.right,
    snapGuideNearSideValue: snapGuide.nearSide,
    playerDuration: player.duration,
    rulerView: timelineViewportProjection.rulerView,
    selectedWaveformTimelineItem,
    playerIsReady: player.isReady,
    playerIsPlaying: player.isPlaying,
    playerInstanceGetWidth,
    zoomPxPerSec: timelineViewportProjection.zoomPxPerSec,
    waveformScrollLeft,
    segmentPlaybackRate,
    handleSegmentPlaybackRateChange,
    handleToggleSelectedWaveformLoop,
    handleToggleSelectedWaveformPlay,
    mediaFileInputRef,
    acousticStrip: { acoustic: timelineReadModel.acoustic, waveCanvasRef, tierContainerRef },
  });

  const readyWorkspaceOverlaysProps = buildReadyWorkspaceOverlaysProps({
    ctxMenu,
    onCloseCtxMenu: () => setCtxMenu(null),
    uttOpsMenu,
    onCloseUttOpsMenu: () => setUttOpsMenu(null),
    selectedTimelineUnit: selectedTimelineUnit ?? null,
    selectedUnitIds,
    runDeleteSelection: runOverlayDeleteSelection,
    runMergeSelection: runOverlayMergeSelection,
    runSelectBefore,
    runSelectAfter,
    runDeleteOne: runOverlayDeleteOne,
    runMergePrev: runOverlayMergePrev,
    runMergeNext: runOverlayMergeNext,
    runSplitAtTime: runOverlaySplitAtTime,
    getCurrentTime: () => player.instanceRef.current?.getCurrentTime() ?? 0,
    setNotePopover,
    deleteConfirmState,
    muteDeleteConfirmInSession,
    setMuteDeleteConfirmInSession,
    closeDeleteConfirmDialog,
    confirmDeleteFromDialog,
    notePopover,
    currentNotes,
    onCloseNotePopover: () => setNotePopover(null),
    addNote,
    updateNote,
    deleteNote,
    units,
    resolveSelfCertaintyUnitIds: resolveSelfCertaintyUnitIds,
    getUnitTextForLayer,
    transcriptionLayers,
    translationLayers,
    speakerOptions,
    speakerFilterOptions: speakerFilterOptionsForActions,
    onAssignSpeakerFromMenu: handleAssignSpeakerFromMenu,
    onSetUnitSelfCertaintyFromMenu: handleSetUnitSelfCertaintyFromMenu,
    onToggleSkipProcessingFromMenu: (unitId, kind, layerId) => {
      if (kind !== 'segment') return;
      void toggleSkipProcessingRouted(unitId, layerId);
    },
    resolveSkipProcessingState: (unitId, layerId, kind) => (
      timelineUnitViewIndex.currentMediaUnits.some((unit) => (
        unit.id === unitId
        && unit.layerId === layerId
        && unit.kind === kind
        && unit.tags?.skipProcessing === true
      ))
    ),
    onOpenSpeakerManagementPanelFromMenu: handleOpenSpeakerManagementPanel,
    displayStyleControl,
  });

  const readyWorkspaceLayoutStyle = buildReadyWorkspaceLayoutStyle({
    uiFontScale,
    adaptiveDialogWidth,
    adaptiveDialogCompactWidth,
    adaptiveDialogWideWidth,
    aiPanelWidth,
    isAiPanelCollapsed,
    laneLabelWidth,
    isTimelineLaneHeaderCollapsed,
    selectedMediaUrl,
    selectedMediaIsVideo,
    videoLayoutMode,
    videoRightPanelWidth,
  });

  const readyWorkspaceStageProps = buildReadyWorkspaceStageProps({
    assistantFrame: assistantRuntimeProps.frame,
    shouldRenderRecoveryBanner,
    recoveryAvailable,
    recoveryDiffSummary,
    onApplyRecoveryBanner: applyRecoveryBanner,
    onDismissRecoveryBanner: dismissRecoveryBanner,
    collaborationCloudStatusSlot: (
      <CollaborationCloudReadOnlyBanner locale={locale} guard={collaborationProtocolGuard} />
    ),
    toolbarProps: toolbarPropsWithCollaboration,
    observerStage: observerResult.stage,
    recommendations: actionableObserverRecommendations || [],
    onExecuteRecommendation: handleExecuteObserverRecommendation,
    acousticRuntimeStatus: deferredAiRuntime.acousticRuntimeStatus,
    vadCacheStatus,
    currentProjectLabel: toolbarProps.filename,
    selectedMediaId: selectedTimelineMedia?.id ?? null,
    activeTextTimelineMode,
    activeTextTimeMapping,
    canDeleteProject: Boolean(activeTextId),
    canDeleteAudio: Boolean(selectedTimelineMedia),
    onOpenProjectSetup: () => setShowProjectSetup(true),
    onOpenAudioImport: () => setShowAudioImport(true),
    onOpenSpeakerManagementPanel: handleOpenSpeakerManagementPanel,
    onDeleteCurrentProject: handleDeleteCurrentProject,
    onDeleteCurrentAudio: handleDeleteCurrentAudio,
    handleImportFile,
    onPreviewProjectArchiveImport: previewProjectArchiveImport,
    onImportProjectArchive: importProjectArchive,
    onApplyTextTimeMapping: async (input) => {
      await applyTextTimeMapping({
        ...input,
        ...(selectedUnitMedia?.id ? { sourceMediaId: selectedUnitMedia.id } : {}),
      });
    },
    onExportEaf: handleExportEaf,
    onExportTextGrid: handleExportTextGrid,
    onExportTrs: handleExportTrs,
    onExportFlextext: handleExportFlextext,
    onExportToolbox: handleExportToolbox,
    onExportJyt: handleExportJyt,
    onExportJym: handleExportJym,
    mediaFileInputRef,
    onDirectMediaImport: handleDirectMediaImport,
    waveformSectionRef,
    workspaceRef,
    listMainRef,
    tierContainerRef,
    isAiPanelCollapsed,
    isTimelineLaneHeaderCollapsed,
    readyWorkspaceWaveformContentProps,
    timelineTopProps: timelineTopPropsWithAxisStatus,
    readyWorkspaceSidePaneProps,
    timelineContentProps,
    editorContextValue,
    aiPanelContextValue,
    onLassoPointerDown: handleLassoPointerDown,
    onLassoPointerMove: handleLassoPointerMove,
    onLassoPointerUp: handleLassoPointerUp,
    onTimelineScroll: handleTimelineScroll,
    timelineResizeTooltip,
    formatTime,
    timelineViewportProjection,
    snapEnabled,
    autoScrollEnabled,
    activeWaveformUnitId: selectedWaveformRegionId || null,
    waveformTimelineItems,
    onZoomToPercent: (percent, mode) => zoomToPercent(percent, undefined, mode),
    onZoomToUnit: zoomToUnit,
    onSnapEnabledChange: setSnapEnabled,
    onAutoScrollEnabledChange: setAutoScrollEnabled,
    canUndo,
    canRedo,
    undoLabel,
    undoHistory,
    isHistoryVisible: showUndoHistory,
    onToggleHistoryVisible: setShowUndoHistory,
    selectedTimelineUnit,
    activeTimelineUnitId,
    recordTimelineEdit,
    undoToHistoryIndex,
    redo,
    locale,
    setIsAiPanelCollapsed,
    handleAiPanelResizeStart,
    handleAiPanelToggle,
    assistantBridgeControllerInput,
    onRuntimeStateChange: handleDeferredAiRuntimeChange,
    aiSidebarProps,
    shouldRenderAiSidebar,
    dialogsProps,
    shouldRenderDialogs,
    pdfRuntimeProps,
    shouldRenderPdfRuntime,
    shouldRenderBatchOps,
    showBatchOperationPanel,
    selectedUnitIds,
    selectedBatchUnits: selectedBatchUnitDocs,
    unitsOnCurrentMedia,
    selectedBatchUnitTextById,
    batchPreviewLayerOptions,
    batchPreviewTextByLayerId,
    batchPreviewTextPropsByLayerId,
    defaultBatchPreviewLayerId,
    onCloseBatchOps: () => setShowBatchOperationPanel(false),
    onBatchOffset: handleBatchOffset,
    onBatchScale: handleBatchScale,
    onBatchSplitByRegex: handleBatchSplitByRegex,
    onBatchMerge: handleBatchMerge,
    onBatchJumpToUnit: selectUnit,
  });

  return (
    <TranscriptionPageReadyWorkspaceLayout
      locale={locale}
      phase={state.phase}
      screenRef={screenRef}
      dir={uiTextDirection}
      layoutStyle={readyWorkspaceLayoutStyle}
      readyStageProps={readyWorkspaceStageProps}
      overlaysProps={readyWorkspaceOverlaysProps}
      layerPopoverProps={null}
      conflictReviewDrawerProps={{
        tickets: collaborationConflictTickets,
        onApplyRemote: async (ticketId) => {
          await applyRemoteConflictTicket(ticketId);
        },
        onKeepLocal: (ticketId) => {
          keepLocalConflictTicket(ticketId);
        },
        onPostpone: postponeConflictTicket,
      }}
      {...(state.phase === 'error' ? { errorMessage: state.message } : {})}
    />
  );
}

export { TranscriptionPageReadyWorkspace };
