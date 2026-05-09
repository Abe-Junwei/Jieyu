/**
 * TranscriptionPage - Ready Workspace
 *
 * Heavy ready-state runtime extracted from the thin orchestrator shell.
 * 从轻量壳组件中拆出的 ready 态重运行时 | Heavy ready-state runtime extracted from the lightweight shell.
 *
 * Styles load with this async chunk (see TranscriptionPage.Orchestrator lazy import) to split CSS away from the route shell.
 */

import '../styles/transcription-entry.css';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useToast } from '../contexts/ToastContext';
import { useAiPanelContextUpdater } from '../contexts/AiPanelContext';
import { useTranscriptionData } from '../hooks/useTranscriptionData';
import { useUnitOps } from '../hooks/useUnitOps';

import { useAiPanelLogic } from '../hooks/useAiPanelLogic';
import { useNoteHandlers } from '../hooks/useNoteHandlers';
import { useTranscriptionUIState } from './TranscriptionPage.UIState';
import { type AppShellOpenSearchDetail } from '../utils/appShellEvents';
import { useTimelineUnitViewIndex } from '../hooks/useTimelineUnitViewIndex';
import { useRecoveryBanner } from '../hooks/useRecoveryBanner';
import { useBackupReminder } from '../hooks/useBackupReminder';
import { getUnitSpeakerKey } from '../hooks/useSpeakerActions';
import { t, tf, useLocale } from '../i18n';
import { fireAndForget } from '../utils/fireAndForget';
import { reportValidationError } from '../utils/validationErrorReporter';
import { formatSidePaneLayerLabel, formatTime } from '../utils/transcriptionFormatters';
import { useTranscriptionAssistantSidebarController } from './useTranscriptionAssistantSidebarController';
import { useWaveformRuntimeController } from './useWaveformRuntimeController';

import { useTranscriptionAssistantController } from './useTranscriptionAssistantController';
import { useTranscriptionSelectionContextController } from './useTranscriptionSelectionContextController';
import { useTranscriptionOverlayActionRoutingController } from './useTranscriptionOverlayActionRoutingController';
import { useTranscriptionSegmentCreationController } from './useTranscriptionSegmentCreationController';
import { useTranscriptionSegmentBridgeController } from './useTranscriptionSegmentBridgeController';
import { useTranscriptionSegmentMutationController } from './useTranscriptionSegmentMutationController';
import { useTranscriptionShellController } from './useTranscriptionShellController';

import { useReadyWorkspaceRenderController } from './useReadyWorkspaceRenderController';
import { useTranscriptionWorkspaceLayoutController } from './useTranscriptionWorkspaceLayoutController';

import { useReadyWorkspaceWaveformBridgeController } from './useReadyWorkspaceWaveformBridgeController';

import { useTranscriptionSelectionSnapshot } from './useTranscriptionSelectionSnapshot';
import { useReadyWorkspaceLayoutDerivations } from './useReadyWorkspaceLayoutDerivations';
import { useTranscriptionDisplayStyleControl } from './useTranscriptionDisplayStyleControl';
import { useTranscriptionRuntimeRefs } from './useTranscriptionRuntimeRefs';
import { useTranscriptionWorkspacePanelEffects } from './useTranscriptionWorkspacePanelEffects';

import { useTranscriptionAcousticPanelState } from './useTranscriptionAcousticPanelState';
import { useTranscriptionAssistantSidebarControllerInput } from './useTranscriptionAssistantSidebarControllerInput';
import { useReadyWorkspaceVerticalPaneFocusEffect } from './useReadyWorkspaceVerticalPaneFocusEffect';
import { useReadyWorkspaceDeepLinkEffects } from './useReadyWorkspaceDeepLinkEffects';
import { useDeferredAiRuntimeBridge } from './useDeferredAiRuntimeBridge';
import { useReadyWorkspaceViewModels } from './useReadyWorkspaceViewModels';
import { useReadyWorkspaceAudioCaptureController } from './useReadyWorkspaceAudioCaptureController';

import { useReadyWorkspaceTimelineSyncSetup } from './useReadyWorkspaceTimelineSyncSetup';
import { useReadyWorkspacePlaybackReadModelSetup } from './useReadyWorkspacePlaybackReadModelSetup';
import { useReadyWorkspaceTrackEditControllers } from './useReadyWorkspaceTrackEditControllers';
import { loadEmbeddingProviderConfig } from './TranscriptionPage.helpers';
import { useReadyWorkspaceAxisStatus } from './useReadyWorkspaceAxisStatus';
import { useReadyWorkspaceInteractionHelpers } from './useReadyWorkspaceInteractionHelpers';
import { buildReadyWorkspaceAudioCaptureControllerInput } from './transcriptionReadyWorkspaceDomainInputBuilder';
import { buildReadyWorkspaceAssistantBridgeInput } from './transcriptionReadyWorkspaceAssistantBridgeInput';
import { buildReadyWorkspaceConflictReviewDrawerProps } from './transcriptionReadyWorkspacePropsBuilders';
import { buildReadyWorkspaceConflictReviewDrawerPropsInput } from './transcriptionReadyWorkspaceSurfaceInputBuilder';
import { useReadyWorkspaceSurfaceProps } from './useReadyWorkspaceSurfaceProps';

import { TranscriptionPageReadyWorkspaceLayout } from './TranscriptionPage.ReadyWorkspaceLayout';
import { CollaborationSyncBadge } from '../components/transcription/CollaborationSyncBadge';
import { preserveReadyWorkspaceStructureMarkers } from './TranscriptionPage.ReadyWorkspace.structureMarkers';
import { buildReadyWorkspaceViewModelsInput } from './readyWorkspaceViewModelsInputBuilder';
import { useReadyWorkspaceSegmentScope } from './useReadyWorkspaceSegmentScope';
import { useReadyWorkspaceSegmentRangeClamp } from './useReadyWorkspaceSegmentRangeClamp';
import { computeLogicalTimelineDurationForZoom } from './readyWorkspaceLogicalTimelineDuration';
import {
  computeTimelineContentGutterPx,
  computeVerticalComparisonEnabled,
  resolveActiveTextLogicalDurationSecForBridge,
} from './readyWorkspaceDerivedValues';
import type { AdoptionItem } from '../ai/vertical/adoptionQueue';

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
  const [searchParams, setSearchParams] = useSearchParams();
  /** Pre-bound tf for components that need (key, params) without locale（须稳定引用，否则 ToastController 等会重复触发 effect） */
  const tfB = useCallback(
    (key: string, opts?: Record<string, unknown>) =>
      tf(locale, key as Parameters<typeof tf>[1], opts as Parameters<typeof tf>[2]),
    [locale],
  );
  const { showToast } = useToast();
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
    setSpeakers: _setSpeakers,
    layerCreateMessage,
    setLayerCreateMessage,
    unitDrafts,
    setUnitDrafts: _setUnitDrafts,
    translationDrafts,
    setTranslationDrafts: _setTranslationDrafts,
    focusedTranslationDraftKeyRef,
    snapGuide,
    setSnapGuide: _setSnapGuide,
    orderedLayers,
    translationLayers,
    transcriptionLayers,
    defaultTranscriptionLayerId,
    sidePaneRows: _sidePaneRows,
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
    saveUnitSelfCertainty: _saveUnitSelfCertainty,
    saveUnitTiming: _saveUnitTiming,
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
    selectAllUnits: _selectAllUnits,
    clearUnitSelection,
    toggleSegmentSelection: _toggleSegmentSelection,
    selectSegmentRange: _selectSegmentRange,
    setSelectedUnitIds: _setSelectedUnitIds,
    transcriptionTrackMode,
    setTranscriptionTrackMode: _setTranscriptionTrackMode,
    deleteSelectedUnits,
    offsetSelectedTimes: _offsetSelectedTimes,
    scaleSelectedTimes: _scaleSelectedTimes,
    splitByRegex: _splitByRegex,
    mergeSelectedUnits,
    createLayer,
    deleteLayer,
    deleteLayerWithoutConfirm,
    checkLayerHasContent,
    toggleLayerLink,
    rebindTranslationLayerHost,
    reorderLayers,
    getNeighborBounds: _getNeighborBounds,
    makeSnapGuide: _makeSnapGuide,
    clearAutoSaveTimer: _clearAutoSaveTimer,
    scheduleAutoSave: _scheduleAutoSave,
    pushUndo,
    beginTimingGesture: _beginTimingGesture,
    endTimingGesture: _endTimingGesture,
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
  const {
    activeTimelineUnitId,
    segmentScopeMediaId,
    segmentsByLayer,
    segmentsLoadComplete,
    reloadSegments,
    updateSegmentsLocally: _updateSegmentsLocally,
    segmentContentByLayer,
    reloadSegmentContents,
  } = useReadyWorkspaceSegmentScope({
    selectedUnitMedia,
    selectedTimelineUnit,
    units,
    mediaItems: _mediaItems,
    layers,
    defaultTranscriptionLayerId,
    layerLinks,
  });

  const segmentScopeMediaItem = useMemo(
    () => (segmentScopeMediaId ? _mediaItems.find((m) => m.id === segmentScopeMediaId) : undefined),
    [_mediaItems, segmentScopeMediaId],
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

  useReadyWorkspaceDeepLinkEffects({
    searchParams,
    setSearchParams,
    setActiveTextId,
    loadSnapshot,
    showToast,
    tfB,
    phase: data.state.phase,
    units: units.map((u) => ({
      id: u.id,
      textId: u.textId,
      ...(u.mediaId !== undefined ? { mediaId: u.mediaId } : {}),
      ...(u.layerId !== undefined ? { layerId: u.layerId } : {}),
    })),
    layers,
    mediaItems: _mediaItems,
    ...(selectedUnitMedia !== undefined ? { selectedUnitMedia } : {}),
    segmentsByLayer:
      segmentsByLayer instanceof Map
        ? (Object.fromEntries(segmentsByLayer) as Record<string, Array<{ id: string }> | undefined>)
        : segmentsByLayer,
    segmentsLoadComplete,
    selectTimelineUnit,
    setSelectedLayerId,
    setFocusedLayerRowId,
    setSelectedMediaId: _setSelectedMediaId,
    ...(defaultTranscriptionLayerId !== undefined ? { defaultTranscriptionLayerId } : {}),
    ...(selectedLayerId !== undefined ? { selectedLayerId } : {}),
    transcriptionLayers,
    activeTextId,
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
    layerLinks,
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
    layerLinks,
    independentLayerIds,
    segmentsByLayer,
    segmentContentByLayer,
    reloadSegments,
    reloadSegmentContents,
    selectTimelineUnit,
    segmentUndoRef,
  });

  // ---- Recovery banner ----
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

  // 定期检查备份提醒 | Periodic backup reminder
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

  const voiceAiAssistantMessageBridgeRef = useRef<
    ((assistantMessageId: string, content: string) => void) | null
  >(null);
  const adoptionItemsPushSinkRef = useRef<((items: AdoptionItem[]) => void) | null>(null);
  const flushVoiceAiAssistantMessage = useCallback(
    (assistantMessageId: string, content: string) => {
      voiceAiAssistantMessageBridgeRef.current?.(assistantMessageId, content);
    },
    [],
  );

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

  /** 与 `buildReadyWorkspaceLayoutStyle` 中 `--timeline-content-offset` 一致，供轨面 `width` 纯像素写入（Safari） | Matches CSS gutter */
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
  const [lockConflictToast, _setLockConflictToast] = useState<{
    count: number;
    speakers: string[];
    nonce: number;
  } | null>(null);

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

  useReadyWorkspaceVerticalPaneFocusEffect({
    verticalViewActive,
    resetVerticalPaneFocus,
  });

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
    activeLayerIdForEdits,
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

  const tierIndependentSegmentCreateRangeClamp = useReadyWorkspaceSegmentRangeClamp({
    activeLayerIdForEdits,
    resolveSegmentRoutingForLayer,
    currentMediaUnits: timelineUnitViewIndex.currentMediaUnits,
    segmentScopeMediaItem,
    selectedTimelineMedia,
    getDocumentSpanSec: () => documentSpanSecFromBridgeRef.current,
  });

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
    mergeAdjacentSegmentsForAiRollback,
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

  const splitRoutedVoidResult = useCallback(
    async (id: string, splitTime: number, layerIdOverride?: string) => {
      await splitRouted(id, splitTime, layerIdOverride);
    },
    [splitRouted],
  );

  /** ADR-0026: Dexie rollback refreshes segment-layer read model + undo snapshot. Canonical `layer_units` hosts rely on the same reload pipeline as other segment mutations; if UI ever diverges after-only-DB restore, extend this hook (do not bypass silent AI rollback). */
  const silentSegmentGraphSyncForAi = useCallback(async () => {
    await reloadSegments();
    await refreshSegmentUndoSnapshot();
    await reloadSegmentContents();
  }, [reloadSegments, refreshSegmentUndoSnapshot, reloadSegmentContents]);

  const { createNextSegmentRouted, createUnitFromSelectionRouted } =
    useTranscriptionSegmentCreationController({
      activeLayerIdForEdits,
      resolveSegmentRoutingForLayer,
      selectedTimelineMedia: selectedTimelineMedia ?? null,
      getDocumentSpanSec: () => documentSpanSecFromBridgeRef.current,
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
        setErrorState: ({ message, meta }) =>
          setSaveState({ kind: 'error', message, errorMeta: meta }),
      });
    },
    splitUnit: splitRoutedVoidResult,
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
    mergeSelectedSegmentsRouted,
    mergeWithPreviousRouted,
    mergeWithNextRouted,
    splitRouted: splitRoutedVoidResult,
    runDeleteSelection,
    runMergeSelection,
    runDeleteOne,
    runMergePrev,
    runMergeNext,
    runSplitAtTime,
  });

  const {
    waveformAreaRef,
    waveformStripWheelShellRef,
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
    setDragPreview: _setDragPreview,
    skipSeekForIdRef,
    creatingSegmentRef,
    markingModeRef,
    subSelectionRange,
    setSubSelectionRange,
    subSelectDragRef,
    segmentRangeGesturePreviewReadModel,
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
    documentSpanSec: documentSpanSecFromBridge,
  } = useReadyWorkspaceWaveformBridgeController({
    activeLayerIdForEdits,
    layers,
    layerById,
    layerLinks,
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
    createUnitFromSelectionRouted,
    setUnitSelection,
    resolveNoteIndicatorTarget,
    tierContainerRef,
    ...(typeof activeTextLogicalDurationSecForBridge === 'number' &&
    Number.isFinite(activeTextLogicalDurationSecForBridge)
      ? { activeTextTimeLogicalDurationSec: activeTextLogicalDurationSecForBridge }
      : {}),
    unitsOnCurrentMedia,
    selectedTimelineMediaId: selectedTimelineMedia?.id,
    selectedMediaBlobSize,
    verticalComparisonEnabled,
    tierIndependentSegmentCreateRangeClamp,
  });

  useLayoutEffect(() => {
    documentSpanSecFromBridgeRef.current = documentSpanSecFromBridge;
  }, [documentSpanSecFromBridge]);

  const selectionSnapshot = useTranscriptionSelectionSnapshot({
    selectedTimelineUnit,
    selectedTimelineSegment,
    selectedTimelineOwnerUnit: selectedTimelineOwnerUnit ?? null,
    primaryUnitView: selectedTimelineUnit
      ? (timelineUnitViewIndex.resolveBySemanticId(selectedTimelineUnit.unitId) ?? null)
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
  const [embeddingProviderConfig, setEmbeddingProviderConfig] = useState(() =>
    loadEmbeddingProviderConfig(),
  );
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

  const handleExecuteObserverRecommendation = useCallback(
    (item: { id: string }) => {
      const match = actionableObserverRecommendations.find((candidate) => candidate.id === item.id);
      if (match) {
        fireAndForget(Promise.resolve(handleExecuteRecommendation(match)), {
          context: 'src/pages/TranscriptionPage.ReadyWorkspace.tsx:L933',
          policy: 'user-visible',
        });
      }
    },
    [actionableObserverRecommendations, handleExecuteRecommendation],
  );

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
    ...(selectedTimelineMedia?.id !== undefined
      ? { selectedTimelineMediaId: selectedTimelineMedia.id }
      : {}),
    ...(selectedMediaUrl !== undefined ? { selectedMediaUrl } : {}),
    waveformHoverReadout,
    spectrogramHoverReadout,
    acousticProviderPreference,
    vadCacheStatus,
  });

  const timelineSyncController = useReadyWorkspaceTimelineSyncSetup({
    data,
    locale,
    manualSelectTsRef,
    player,
    activeTimelineUnitId,
    waveformTimelineItems,
    activeLayerIdForEdits,
    useSegmentWaveformRegions,
    selectedTimelineUnit,
    subSelectDragRef,
    waveCanvasRef,
    resolveSegmentRoutingForLayer,
    segmentsByLayer,
    unitsOnCurrentMedia,
    selectedUnitIds,
    selectedWaveformRegionId,
    snapEnabled,
    creatingSegmentRef,
    markingModeRef,
    setNotePopover,
    setAiSidebarError,
    openPdfPreviewRequest,
    runSplitAtTime,
    createUnitFromSelectionRouted,
    setSelectedLayerId,
    setFocusedLayerRowId,
    setFlashLayerRowId,
    selectSegment,
    timelineViewportProjection,
  });

  const assistantController = useTranscriptionAssistantController({
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

  const { playbackKeyboardController, timelineReadModel } = useReadyWorkspacePlaybackReadModelSetup(
    {
      data,
      player,
      waveformBridge: {
        subSelectionRange,
        setSubSelectionRange,
        segMarkStart,
        setSegMarkStart,
        segmentLoopPlayback,
        setSegmentLoopPlayback,
        markingModeRef,
        skipSeekForIdRef,
        creatingSegmentRef,
        manualSelectTsRef,
        waveformAreaRef,
        waveformInteractionHandlerRefs,
        openSearchFromRequest,
      },
      selectedTimelineOwnerUnit,
      selectedTimelineUnitForTime,
      selectedTimelineUnit,
      selectedUnitIds,
      selectedMediaUrl,
      createUnitFromSelectionRouted,
      runDeleteSelection,
      runMergePrev,
      runMergeNext,
      runSplitAtTime,
      runSelectBefore,
      runSelectAfter,
      timelineUnitViewIndex,
      activeTextTimelineMode,
      documentSpanSec: documentSpanSecFromBridgeRef.current,
      zoomPxPerSec: timelineViewportProjection.zoomPxPerSec,
      fitPxPerSec: timelineViewportProjection.fitPxPerSec,
      verticalViewActive,
      executeActionRef,
      openSearchRef,
      seekToTimeRef,
      splitAtTimeRef,
      zoomToSegmentRef,
      timelineSyncController,
      activeLayerIdForEdits,
    },
  );

  const {
    recording,
    recordingUnitId,
    recordingLayerId: _recordingLayerId,
    recordingError,
    startRecordingForUnit: _startRecordingForUnit,
    stopRecording: _stopRecording,
    importExportController,
    projectMediaController,
  } = useReadyWorkspaceAudioCaptureController(
    buildReadyWorkspaceAudioCaptureControllerInput({
      recordingInput: {
        saveVoiceTranslation,
        setSaveState,
        selectUnit,
        manualSelectTsRef,
      },
      importExportInput: {
        activeTextId,
        getActiveTextId,
        segmentScopeMediaId,
        unitsOnCurrentMedia,
        anchors,
        layers,
        translations,
        defaultTranscriptionLayerId,
        loadSnapshot,
        setSaveState,
      },
      selectedTimelineMedia,
      segmentScopeMediaItem,
      projectMediaInput: {
        activeTextId,
        mediaItems: _mediaItems,
        getActiveTextId,
        setActiveTextId,
        setShowAudioImport,
        addMediaItem,
        setSaveState,
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
      },
      selectedMediaUrl,
    }),
  );

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
    aiVerticalWorkflowAuditEntries: deferredAiRuntimeForSidebar.aiVerticalWorkflowAuditEntries,
    observerStage: observerResult.stage,
    observerRecommendations: actionableObserverRecommendations,
    onJumpToCitation: timelineSyncController.handleJumpToCitation,
    adoptionItemsPushSinkRef,
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
      executeAction: playbackKeyboardController.executeAction,
      handleResolveVoiceIntentWithLlm: assistantController.handleResolveVoiceIntentWithLlm,
      executeVoiceToolCall: deferredAiRuntime.executeVoiceToolCall,
      handleVoiceDictation: assistantController.handleVoiceDictation,
      handleVoiceAnalysisResult: (unitId, analysisText) => {
        fireAndForget(assistantController.handleVoiceAnalysisResult(unitId, analysisText), {
          context: 'src/pages/TranscriptionPage.ReadyWorkspace.tsx:L1293',
          policy: 'user-visible',
        });
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
  });

  const assistantSidebarController = useTranscriptionAssistantSidebarController({
    ...assistantSidebarControllerInput,
  });

  const workspacePanelEffectsController = useTranscriptionWorkspacePanelEffects({
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

  const {
    speakerActionScopeController,
    batchOperationController,
    speakerController,
    selfCertaintyController,
    updateLayerMetadata,
    trackEntityStateController: _trackEntityStateController,
    annotationController,
    timelineController,
    trackDisplayController,
  } = useReadyWorkspaceTrackEditControllers({
    data,
    timelineUnitViewIndex,
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
    overlapCycleTelemetryRef,
    activeLayerIdForEdits,
    setLockConflictToast: _setLockConflictToast,
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
  });

  const readyWorkspaceViewModels = useReadyWorkspaceViewModels(
    buildReadyWorkspaceViewModelsInput({
      lane: {
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
        handleToggleTrackDisplayMode: trackDisplayController.handleToggleTrackDisplayMode,
        setTrackDisplayMode: trackDisplayController.setTrackDisplayMode,
        effectiveLaneLockMap: trackDisplayController.effectiveLaneLockMap,
        handleLockSelectedSpeakersToLane: trackDisplayController.handleLockSelectedSpeakersToLane,
        handleUnlockSelectedSpeakers: trackDisplayController.handleUnlockSelectedSpeakers,
        handleResetTrackAutoLayout: trackDisplayController.handleResetTrackAutoLayout,
        selectedSpeakerNamesForTrackLock: speakerController.selectedSpeakerNamesForTrackLock,
        speakerLayerLayout: trackDisplayController.speakerLayerLayout,
        activeSpeakerFilterKey: speakerController.activeSpeakerFilterKey,
        speakerQuickActions: speakerController.speakerQuickActions,
        handleLaneLabelWidthResizeStart,
        activeTextTimelineMode,
        translationAudioByLayer: timelineController.translationAudioByLayer,
        mediaItems: _mediaItems,
        recording,
        recordingUnitId,
        recordingLayerId: _recordingLayerId,
        startRecordingForUnit: _startRecordingForUnit,
        stopRecording: _stopRecording,
        deleteVoiceTranslation,
        transcribeVoiceTranslation,
        displayStyleControl,
        timelineContentGutterPx,
      },
      head: {
        selectedMediaUrl,
        player,
        layers,
        locale,
        importFileRef: importExportController.importFileRef,
        layerAction,
        timelineViewportProjection,
      },
      timelineReadModel,
      segmentRangeGesturePreviewReadModel,
      annotation: {
        activeTextTimeMapping: activeTextTimeMapping ?? null,
        timelineRenderUnits: timelineController.timelineRenderUnits,
        defaultTranscriptionLayerId,
        createUnitFromSelectionRouted,
        renderAnnotationItem: annotationController.renderAnnotationItem,
        speakerSortKeyById: trackDisplayController.speakerSortKeyById,
        filteredUnitsOnCurrentMedia: timelineController.filteredUnitsOnCurrentMedia,
        tierContainerRef,
        handleAnnotationClick: annotationController.handleAnnotationClick,
        handleAnnotationContextMenu: annotationController.handleAnnotationContextMenu,
        handleNoteClick,
        resolveNoteIndicatorTarget,
        startTimelineResizeDrag:
          timelineSyncController.timelineResizeController.startTimelineResizeDrag,
        navigateUnitFromInput: playbackKeyboardController.navigateUnitFromInput,
        speakerVisualByTimelineUnitId: speakerActionScopeController.speakerVisualByTimelineUnitId,
        resolveSelfCertaintyForUnit: selfCertaintyController.resolveSelfCertaintyForUnit,
        resolveSelfCertaintyAmbiguityForUnit:
          selfCertaintyController.resolveSelfCertaintyAmbiguityForUnit,
        verticalViewEnabled: verticalViewActive,
        verticalPaneFocus,
        updateVerticalPaneFocus,
      },
      tail: {
        selectedTimelineMedia,
        waveformDisplayMode,
        setWaveformDisplayMode,
        waveformVisualStyle,
        setWaveformVisualStyle,
        acousticOverlayMode,
        setAcousticOverlayMode,
        globalLoopPlayback,
        setGlobalLoopPlayback,
        handleGlobalPlayPauseAction: playbackKeyboardController.handleGlobalPlayPauseAction,
        canUndo,
        canRedo,
        undoLabel,
        activeTextId,
        selectedTimelineUnit,
        notePopover,
        showExportMenu: importExportController.showExportMenu,
        exportMenuRef: importExportController.exportMenuRef,
        loadSnapshot,
        undo,
        redo,
        setShowProjectSetup,
        setShowAudioImport,
        handleDeleteCurrentAudio: projectMediaController.handleDeleteCurrentAudio,
        handleDeleteCurrentProject: projectMediaController.handleDeleteCurrentProject,
        toggleNotes,
        setUttOpsMenu,
        handleAutoSegment: projectMediaController.handleAutoSegment,
        autoSegmentBusy: projectMediaController.autoSegmentBusy,
        setShowExportMenu: importExportController.setShowExportMenu,
        handleExportEaf: () => {
          fireAndForget(importExportController.handleExportEaf(), {
            context: 'src/pages/TranscriptionPage.ReadyWorkspace.tsx:L1645',
            policy: 'user-visible',
          });
        },
        handleExportTextGrid: () => {
          fireAndForget(importExportController.handleExportTextGrid(), {
            context: 'src/pages/TranscriptionPage.ReadyWorkspace.tsx:L1651',
            policy: 'user-visible',
          });
        },
        handleExportTrs: () => {
          fireAndForget(importExportController.handleExportTrs(), {
            context: 'src/pages/TranscriptionPage.ReadyWorkspace.tsx:L1657',
            policy: 'user-visible',
          });
        },
        handleExportFlextext: () => {
          fireAndForget(importExportController.handleExportFlextext(), {
            context: 'src/pages/TranscriptionPage.ReadyWorkspace.tsx:L1663',
            policy: 'user-visible',
          });
        },
        handleExportToolbox: () => {
          fireAndForget(importExportController.handleExportToolbox(), {
            context: 'src/pages/TranscriptionPage.ReadyWorkspace.tsx:L1669',
            policy: 'user-visible',
          });
        },
        handleExportJyt: importExportController.handleExportJyt,
        handleExportJym: importExportController.handleExportJym,
        handleImportFile: importExportController.handleImportFile,
        unitsOnCurrentMedia,
        isTimelineLaneHeaderCollapsed,
        toggleTimelineLaneHeader,
        waveCanvasRef,
        showSearch,
        searchableItems: projectMediaController.searchableItems,
        displayStyleControl,
        activeLayerIdForEdits,
        activeTimelineUnitId,
        searchOverlayRequest,
        manualSelectTsRef,
        selectUnit,
        handleSearchReplace: timelineSyncController.handleSearchReplace,
        setShowSearch,
        setSearchOverlayRequest,
        isAiPanelCollapsed,
        hubSidebarTab,
        setHubSidebarTab,
        assistantRuntimeProps: assistantSidebarController.assistantRuntimeProps,
        analysisRuntimeProps: assistantSidebarController.analysisRuntimeProps,
        selectedAiWarning,
        selectedTranslationGapCount,
        aiSidebarError,
        speakerDialogStateRouted: speakerController.speakerDialogStateRouted,
        speakerSavingRouted: speakerController.speakerSavingRouted,
        closeSpeakerDialogRouted: speakerController.closeSpeakerDialogRouted,
        confirmSpeakerDialogRouted: speakerController.confirmSpeakerDialogRouted,
        updateSpeakerDialogDraftNameRouted: speakerController.updateSpeakerDialogDraftNameRouted,
        updateSpeakerDialogTargetKeyRouted: speakerController.updateSpeakerDialogTargetKeyRouted,
        showProjectSetup,
        handleProjectSetupSubmit: projectMediaController.handleProjectSetupSubmit,
        showAudioImport,
        handleAudioImport: projectMediaController.handleAudioImport,
        audioImportDisposition: projectMediaController.audioImportDisposition,
        mediaFileInputRef: projectMediaController.mediaFileInputRef,
        handleDirectMediaImport: (event) => {
          fireAndForget(projectMediaController.handleDirectMediaImport(event), {
            context: 'src/pages/TranscriptionPage.ReadyWorkspace.tsx:L1713',
            policy: 'user-visible',
          });
        },
        audioDeleteConfirm: projectMediaController.audioDeleteConfirm,
        setAudioDeleteConfirm: projectMediaController.setAudioDeleteConfirm,
        handleConfirmAudioDelete: projectMediaController.handleConfirmAudioDelete,
        projectDeleteConfirm: projectMediaController.projectDeleteConfirm,
        setProjectDeleteConfirm: projectMediaController.setProjectDeleteConfirm,
        handleConfirmProjectDelete: projectMediaController.handleConfirmProjectDelete,
        showShortcuts,
        closeShortcuts,
        isFocusMode,
        exitFocusMode,
      },
    }),
  );

  const toolbarPropsWithCollaboration = {
    ...readyWorkspaceViewModels.toolbarProps,
    leftToolbarExtras: (
      <CollaborationSyncBadge
        locale={locale}
        badge={collaborationSyncBadge}
        presenceMembers={collaborationPresenceMembers}
        currentUserId={collaborationPresenceCurrentUserId}
      />
    ),
  };

  const readyWorkspaceAxisStatusController = useReadyWorkspaceAxisStatus({
    timelineTopProps: readyWorkspaceViewModels.timelineTopProps,
    selectedMediaUrl,
    isResizingWaveform,
    handleWaveformResizeStart,
    layersCount: layers.length,
    playerIsReady: player.isReady,
    playerDuration: player.duration,
    acousticState: timelineReadModel.acoustic.globalState,
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

  const readyWorkspaceRenderController = useReadyWorkspaceRenderController({
    isAiPanelCollapsed,
    flushDeferredAiRuntime,
    aiPendingToolCall:
      assistantSidebarController.assistantRuntimeProps.aiChatContextValue.aiPendingToolCall,
    setHubSidebarTab,
    setIsAiPanelCollapsed,
    showProjectSetup,
    showAudioImport,
    audioDeleteConfirm: projectMediaController.audioDeleteConfirm,
    projectDeleteConfirm: projectMediaController.projectDeleteConfirm,
    showShortcuts,
    isFocusMode,
    pdfPreviewRequest: assistantSidebarController.pdfRuntimeProps.previewRequest.request,
    showBatchOperationPanel,
    recoveryAvailable,
  });

  const aiScopeMediaItem = segmentScopeMediaItem ?? selectedTimelineMedia;
  const noteCategorySummary = currentNotes.reduce<Record<string, number>>((acc, note) => {
    const category = (note.category ?? 'comment').trim();
    acc[category] = (acc[category] ?? 0) + 1;
    return acc;
  }, {});
  const laneLockEntriesForAi = Object.entries(trackDisplayController.effectiveLaneLockMap)
    .filter(([, laneIndex]) => typeof laneIndex === 'number' && Number.isFinite(laneIndex))
    .slice(0, 16)
    .map(([speakerId, laneIndex]) => ({ speakerId, laneIndex: Math.floor(laneIndex) }));
  const assistantBridgeControllerInput = buildReadyWorkspaceAssistantBridgeInput({
    selectedUnitIds,
    selectedUnit: selectedUnit ?? null,
    getUnitDocById,
    selectedTimelineSegment: selectedTimelineSegment ?? null,
    ...(selectedTimelineMedia ? { selectedTimelineMedia } : {}),
    ...(aiScopeMediaItem ? { scopeMediaItemForAi: aiScopeMediaItem } : {}),
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
    createAdjacentUnit: _createAdjacentUnit,
    splitTranscriptionSegment: splitRouted,
    mergeAdjacentSegmentsForAiRollback,
    silentSegmentGraphSyncForAi,
    mergeWithPrevious: mergeWithPreviousRouted,
    mergeWithNext: mergeWithNextRouted,
    mergeSelectedUnits: mergeSelectedUnits,
    mergeSelectedSegments: mergeSelectedSegmentsRouted,
    deleteUnit: deleteUnitRouted,
    deleteSelectedUnits: deleteSelectedUnitsRouted,
    deleteLayer,
    toggleLayerLink,
    rebindTranslationLayerHost,
    saveUnitText: saveUnitText,
    saveUnitLayerText: saveUnitLayerText,
    saveSegmentContentForLayer,
    updateTokenPos,
    batchUpdateTokenPosByForm,
    updateTokenGloss,
    selectUnit,
    setSaveState,
    unitDrafts,
    translationDrafts,
    focusedTranslationDraftKeyRef,
    speakers,
    noteSummary: {
      count: currentNotes.length,
      byCategory: noteCategorySummary,
      ...(focusedLayerRowId ? { focusedLayerId: focusedLayerRowId } : {}),
      ...(notePopover?.uttId ? { currentTargetUnitId: notePopover.uttId } : {}),
    },
    visibleTimelineState: {
      ...(selectedTimelineMedia?.id ? { currentMediaId: selectedTimelineMedia.id } : {}),
      ...(selectedTimelineMedia?.filename
        ? { currentMediaFilename: selectedTimelineMedia.filename }
        : {}),
      ...(focusedLayerRowId ? { focusedLayerId: focusedLayerRowId } : {}),
      ...(selectedLayerId ? { selectedLayerId } : {}),
      selectedUnitCount: selectedUnitIds.size,
      verticalViewActive,
      transcriptionTrackMode,
      ...(timelineViewportProjection.documentSpanSec > 0
        ? { documentSpanSec: timelineViewportProjection.documentSpanSec }
        : {}),
      ...(typeof timelineViewportProjection.zoomPercent === 'number' &&
      Number.isFinite(timelineViewportProjection.zoomPercent)
        ? { zoomPercent: timelineViewportProjection.zoomPercent }
        : {}),
      ...(typeof timelineViewportProjection.maxZoomPercent === 'number' &&
      Number.isFinite(timelineViewportProjection.maxZoomPercent)
        ? { maxZoomPercent: timelineViewportProjection.maxZoomPercent }
        : {}),
      ...(typeof timelineViewportProjection.zoomPxPerSec === 'number' &&
      Number.isFinite(timelineViewportProjection.zoomPxPerSec)
        ? { zoomPxPerSec: timelineViewportProjection.zoomPxPerSec }
        : {}),
      ...(typeof timelineViewportProjection.fitPxPerSec === 'number' &&
      Number.isFinite(timelineViewportProjection.fitPxPerSec)
        ? { fitPxPerSec: timelineViewportProjection.fitPxPerSec }
        : {}),
      ...(timelineViewportProjection.rulerView
        ? {
            rulerVisibleStartSec: timelineViewportProjection.rulerView.start,
            rulerVisibleEndSec: timelineViewportProjection.rulerView.end,
          }
        : {}),
      ...(typeof timelineViewportProjection.waveformScrollLeft === 'number' &&
      Number.isFinite(timelineViewportProjection.waveformScrollLeft)
        ? { waveformScrollLeftPx: timelineViewportProjection.waveformScrollLeft }
        : {}),
      ...(laneLockEntriesForAi.length > 0
        ? {
            laneLockSpeakerCount: Object.keys(trackDisplayController.effectiveLaneLockMap).length,
            laneLocks: laneLockEntriesForAi,
          }
        : {}),
      ...(speakerController.selectedSpeakerIdsForTrackLock.length > 0
        ? { trackLockSpeakerIds: [...speakerController.selectedSpeakerIdsForTrackLock] }
        : {}),
      activeSpeakerFilterKey: speakerController.activeSpeakerFilterKey,
    },
    ...(typeof activeTextId === 'string' && activeTextId.trim().length > 0
      ? { activeTextId: activeTextId.trim() }
      : {}),
    translationTextByLayer,
    locale,
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
    onAiAssistantMessageComplete: flushVoiceAiAssistantMessage,
    onPushAdoptionItemsSinkRef: adoptionItemsPushSinkRef,
    ...(defaultTranscriptionLayerId !== undefined ? { defaultTranscriptionLayerId } : {}),
    state,
  });

  const { readyWorkspaceOverlaysProps, readyWorkspaceLayoutStyle, readyWorkspaceStageProps } =
    useReadyWorkspaceSurfaceProps({
      locale,
      activeTextId,
      selectedTimelineMedia,
      selectedMediaUrl,
      segmentScopeMediaId,
      verticalViewActive,
      activeTextTimelineMode,
      activeTextTimeMapping,
      canUndo,
      canRedo,
      undoLabel,
      undoHistory,
      showUndoHistory,
      setShowUndoHistory,
      redo,
      selectedTimelineUnit,
      activeTimelineUnitId,
      recordTimelineEdit,
      undoToHistoryIndex,
      setShowProjectSetup,
      setShowAudioImport,
      applyTextTimeMapping,
      selectedUnitIds,
      batchPreviewTextPropsByLayerId,
      showBatchOperationPanel,
      setShowBatchOperationPanel,
      selectedWaveformRegionId,
      waveformTimelineItems,
      zoomToPercent,
      zoomToUnit,
      snapEnabled,
      autoScrollEnabled,
      setSnapEnabled,
      setAutoScrollEnabled,
      setIsAiPanelCollapsed,
      handleAiPanelToggle,
      handleAiPanelResizeStart: workspacePanelEffectsController.handleAiPanelResizeStart,
      handleLassoPointerDown,
      handleLassoPointerMove,
      handleLassoPointerUp,
      handleTimelineScroll,
      recoveryAvailable,
      recoveryDiffSummary,
      applyRecoveryBanner,
      dismissRecoveryBanner,
      toolbarPropsWithCollaboration,
      observerResult,
      actionableObserverRecommendations,
      handleExecuteObserverRecommendation,
      deferredAiRuntime,
      vadCacheStatus,
      collaborationProtocolGuard,
      assistantBridgeControllerInput,
      handleDeferredAiRuntimeChange,
      selectUnit,
      formatTime,
      defaultTranscriptionLayerId,
      translationLayers,
      orderedLayers,
      handleFocusLayerRow,
      layerLinks,
      toggleLayerLink,
      deletableLayers,
      updateLayerMetadata,
      layerCreateMessage,
      layerAction,
      segmentsByLayer,
      segmentContentByLayer,
      unitsOnCurrentMedia,
      speakers,
      listProjectAssets,
      removeProjectAsset,
      getProjectAssetSignedUrl,
      listProjectSnapshots,
      restoreProjectSnapshotToLocalById,
      queryProjectChangeTimeline,
      listAccessibleCloudProjects,
      listCloudProjectMembers,
      getUnitTextForLayer,
      selectTimelineUnit,
      reorderLayers,
      onSelectWorkspaceHorizontalLayout,
      onSelectWorkspaceVerticalLayout,
      units,
      notePopover,
      setNotePopover,
      currentNotes,
      addNote,
      updateNote,
      deleteNote,
      ctxMenu,
      setCtxMenu,
      uttOpsMenu,
      setUttOpsMenu,
      runOverlayDeleteSelection,
      runOverlayMergeSelection,
      runSelectBefore,
      runSelectAfter,
      runOverlayDeleteOne,
      runOverlayMergePrev,
      runOverlayMergeNext,
      runOverlaySplitAtTime,
      deleteConfirmState,
      muteDeleteConfirmInSession,
      setMuteDeleteConfirmInSession,
      closeDeleteConfirmDialog,
      confirmDeleteFromDialog,
      displayStyleControl,
      toggleSkipProcessingRouted,
      player,
      timelineViewportProjection,
      waveformAcousticRuntimeStatus,
      waveformVadCacheStatus,
      assistantSidebarController,
      assistantController,
      readyWorkspaceViewModels,
      readyWorkspaceRenderController,
      readyWorkspaceAxisStatusController,
      workspacePanelEffectsController,
      timelineResizeController: timelineSyncController.timelineResizeController,
      controllers: {
        speaker: speakerController,
        trackDisplay: trackDisplayController,
        timeline: timelineController,
        batch: batchOperationController,
        projectMedia: projectMediaController,
        importExport: importExportController,
        playbackKeyboard: { playbackKeyboardController, timelineReadModel },
        annotation: annotationController,
        selfCertainty: selfCertaintyController,
        speakerActionScope: speakerActionScopeController,
      },
      layout: {
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
      },
      waveform: {
        waveformAreaRef,
        snapGuide,
        segMarkStart,
        isResizingWaveform,
        waveformHeight,
        handleWaveformKeyDown: playbackKeyboardController.handleWaveformKeyDown,
        handleWaveformAreaFocus,
        handleWaveformAreaBlur,
        handleWaveformAreaMouseMove,
        handleWaveformAreaMouseLeave,
        handleWaveformAreaWheel,
        hoverTime,
        unitsOnCurrentMedia,
        waveformHoverPreviewProps,
        zoomPercent: timelineViewportProjection.zoomPercent,
        snapEnabled,
        toggleSnapEnabled,
        playerPlaybackRate: player.playbackRate,
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
        waveformStripWheelShellRef,
        segmentRangeGesturePreviewReadModel,
        waveformNoteIndicators,
        waveformLowConfidenceOverlays,
        waveformOverlapOverlays,
        acousticOverlayMode,
        acousticOverlayViewportWidth,
        acousticOverlayF0Path,
        acousticOverlayIntensityPath,
        acousticOverlayVisibleSummary,
        acousticOverlayLoading,
        waveformHoverReadout,
        spectrogramHoverReadout,
        selectedHotspotTimeSec,
        handleSpectrogramMouseMove,
        handleSpectrogramMouseLeave,
        handleSpectrogramClick,
        setNotePopover,
        selectedWaveformTimelineItem,
        playerInstanceGetWidth,
        waveformScrollLeft,
        segmentPlaybackRate,
        handleSegmentPlaybackRateChange,
        handleToggleSelectedWaveformLoop,
        handleToggleSelectedWaveformPlay,
        selectedTimelineUnitForTime,
        timelineViewportProjection,
        mediaFileInputRef: projectMediaController.mediaFileInputRef,
        acousticStrip: { acoustic: timelineReadModel.acoustic, waveCanvasRef, tierContainerRef },
        runtimeStatus: {
          acousticRuntimeStatus: waveformAcousticRuntimeStatus,
          vadCacheStatus: waveformVadCacheStatus,
        },
        getUnitTextForLayer,
        waveformSectionRef,
        workspaceRef,
        listMainRef,
      },
      overlays: {
        ctxMenu,
        setCtxMenu,
        uttOpsMenu,
        setUttOpsMenu,
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
        addNote,
        updateNote,
        deleteNote,
        units,
        resolveSelfCertaintyUnitIds: selfCertaintyController.resolveSelfCertaintyUnitIds,
        getUnitTextForLayer,
        transcriptionLayers,
        translationLayers,
        speakerOptions: speakerController.speakerOptions,
        speakerFilterOptions: speakerActionScopeController.speakerFilterOptionsForActions,
        onAssignSpeakerFromMenu: speakerController.handleAssignSpeakerFromMenu,
        onSetUnitSelfCertaintyFromMenu: selfCertaintyController.handleSetUnitSelfCertaintyFromMenu,
        timelineUnitsOnCurrentMedia: timelineUnitViewIndex.currentMediaUnits,
        toggleSkipProcessingRouted,
        onOpenSpeakerManagementPanelFromMenu: speakerController.handleOpenSpeakerManagementPanel,
        displayStyleControl,
      },
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
      conflictReviewDrawerProps={buildReadyWorkspaceConflictReviewDrawerProps(
        buildReadyWorkspaceConflictReviewDrawerPropsInput({
          tickets: collaborationConflictTickets,
          applyRemoteConflictTicket,
          keepLocalConflictTicket,
          postponeConflictTicket,
        }),
      )}
      {...(state.phase === 'error' ? { errorMessage: state.message } : {})}
    />
  );
}

export { TranscriptionPageReadyWorkspace };
