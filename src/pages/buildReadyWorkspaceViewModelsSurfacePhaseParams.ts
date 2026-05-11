import type { BuildReadyWorkspaceViewModelsSurfacePhaseDeps } from './buildReadyWorkspaceViewModelsSurfacePhaseDeps';
import { buildReadyWorkspaceViewModelsAnnotationSlice } from './readyWorkspaceViewModelsAnnotationSlice';
import { buildReadyWorkspaceViewModelsHeadSlice } from './readyWorkspaceViewModelsHeadSlice';
import { buildReadyWorkspaceViewModelsLaneSlice } from './readyWorkspaceViewModelsLaneSlice';
import { buildReadyWorkspaceViewModelsTailSlice } from './readyWorkspaceViewModelsTailSlice';
import type { UseReadyWorkspaceViewModelsAndSurfacePhaseParams } from './useReadyWorkspaceViewModelsAndSurfacePhase';
import { formatTime } from '../utils/transcriptionFormatters';
import { buildReadyWorkspaceSurfaceLayeredFlatAssembly } from './readyWorkspaceSurfaceLayeredFlatAssembly';
import { buildReadyWorkspaceSurfaceNestedOrchestratorSlices } from './readyWorkspaceSurfaceNestedOrchestratorSlices';

export function buildReadyWorkspaceViewModelsSurfacePhaseParams(
  deps: BuildReadyWorkspaceViewModelsSurfacePhaseDeps,
): UseReadyWorkspaceViewModelsAndSurfacePhaseParams {
  const {
    data: d,
    domainShell: s,
    locale,
    pre: p,
    bootstrap: b,
    waveform: w,
    selectionAi: ai,
    timeline: t,
    sidebar: sb,
  } = deps;
  const state = d.state;
  const speakers = d.speakers;
  const layers = d.layers;
  const translationLayers = d.translationLayers;
  const transcriptionLayers = d.transcriptionLayers;
  const orderedLayers = d.orderedLayers;
  const layerLinks = d.layerLinks;
  const deletableLayers = d.deletableLayers;
  const selectedUnit = d.selectedUnit;
  const selectedUnitIds = d.selectedUnitIds;
  const selectedMediaUrl = d.selectedMediaUrl;
  const defaultTranscriptionLayerId = d.defaultTranscriptionLayerId;
  const collaborationSyncBadge = d.collaborationSyncBadge;
  const collaborationPresenceMembers = d.collaborationPresenceMembers;
  const collaborationPresenceCurrentUserId = d.collaborationPresenceCurrentUserId;
  const getUnitTextForLayer = d.getUnitTextForLayer;
  const reorderLayers = d.reorderLayers;
  const setSaveState = d.setSaveState;
  const saveUnitText = d.saveUnitText;
  const saveUnitLayerText = d.saveUnitLayerText;
  const updateTokenPos = d.updateTokenPos;
  const batchUpdateTokenPosByForm = d.batchUpdateTokenPosByForm;
  const updateTokenGloss = d.updateTokenGloss;
  const unitDrafts = d.unitDrafts;
  const translationDrafts = d.translationDrafts;
  const focusedTranslationDraftKeyRef = d.focusedTranslationDraftKeyRef;
  const mergeSelectedUnits = d.mergeSelectedUnits;
  const _mediaItems = d.mediaItems;
  const deleteVoiceTranslation = d.deleteVoiceTranslation;
  const transcribeVoiceTranslation = d.transcribeVoiceTranslation;
  const _createAdjacentUnit = d.createAdjacentUnit;
  const deleteLayer = d.deleteLayer;
  const toggleLayerLink = d.toggleLayerLink;
  const rebindTranslationLayerHost = d.rebindTranslationLayerHost;
  const transcriptionTrackMode = d.transcriptionTrackMode;
  const selectedTimelineUnit = d.selectedTimelineUnit;
  const selectedLayerId = d.selectedLayerId;
  const translationTextByLayer = d.translationTextByLayer;
  const unitsOnCurrentMedia = d.unitsOnCurrentMedia;
  const canUndo = d.canUndo;
  const canRedo = d.canRedo;
  const undoLabel = d.undoLabel;
  const redo = d.redo;
  const undo = d.undo;
  const aiConfidenceAvg = d.aiConfidenceAvg;

  const segmentScopeMediaItem = s.segmentScopeMediaItem;
  const segmentsLoadComplete = s.segmentsLoadComplete;
  const selectedTimelineSegment = s.selectedTimelineSegment;
  const selectedTimelineMedia = s.selectedTimelineMedia;
  const activeTextId = s.activeTextId;
  const activeTextTimeMapping = s.activeTextTimeMapping;
  const activeTextTimelineMode = s.activeTextTimelineMode;
  const saveSegmentContentForLayer = s.saveSegmentContentForLayer;
  const layerAction = s.layerAction;
  const handleFocusLayerRow = s.handleFocusLayerRow;
  const flashLayerRowId = s.flashLayerRowId;
  const focusedLayerRowId = s.focusedLayerRowId;
  const searchOverlayRequest = s.searchOverlayRequest;
  const showProjectSetup = s.showProjectSetup;
  const setShowProjectSetup = s.setShowProjectSetup;
  const showAudioImport = s.showAudioImport;
  const setShowAudioImport = s.setShowAudioImport;
  const hubSidebarTab = s.hubSidebarTab;
  const setHubSidebarTab = s.setHubSidebarTab;
  const isAiPanelCollapsed = s.isAiPanelCollapsed;
  const setIsAiPanelCollapsed = s.setIsAiPanelCollapsed;
  const showSearch = s.showSearch;
  const setShowSearch = s.setShowSearch;
  const setSearchOverlayRequest = s.setSearchOverlayRequest;
  const showShortcuts = p.showShortcuts;
  const closeShortcuts = p.closeShortcuts;
  const isFocusMode = p.isFocusMode;
  const exitFocusMode = p.exitFocusMode;
  const loadSnapshot = d.loadSnapshot;
  const createLayerWithActiveContext = s.createLayerWithActiveContext;
  const activeTimelineUnitId = s.activeTimelineUnitId;
  const activeLayerIdForEdits = s.activeLayerIdForEdits;
  const resolveSegmentRoutingForLayer = s.resolveSegmentRoutingForLayer;
  const segmentsByLayer = s.segmentsByLayer;
  const segmentContentByLayer = s.segmentContentByLayer;
  const showAllLayerConnectors = s.showAllLayerConnectors;
  const handleToggleAllLayerConnectors = s.handleToggleAllLayerConnectors;

  const trackDisplayController = sb.trackDisplayController;
  const speakerController = sb.speakerController;
  const timelineController = sb.timelineController;
  const timelineSyncController = t.timelineSyncController;
  const playbackKeyboardController = t.playbackKeyboardController;
  const importExportController = t.importExportController;
  const projectMediaController = t.projectMediaController;
  const assistantSidebarController = sb.assistantSidebarController;
  const speakerActionScopeController = sb.speakerActionScopeController;
  const selfCertaintyController = sb.selfCertaintyController;
  const annotationController = sb.annotationController;

  const selectionSnapshot = ai.selectionSnapshot;
  const hiddenByMediaFilterCount = ai.hiddenByMediaFilterCount;
  const embeddingProviderConfig = ai.embeddingProviderConfig;
  const setEmbeddingProviderConfig = ai.setEmbeddingProviderConfig;
  const aiSidebarError = ai.aiSidebarError;
  const setAiSidebarError = ai.setAiSidebarError;
  const flushDeferredAiRuntime = ai.flushDeferredAiRuntime;
  const selectedAiWarning = ai.selectedAiWarning;
  const selectedTranslationGapCount = ai.selectedTranslationGapCount;
  const acousticConfigOverride = ai.acousticConfigOverride;
  const acousticProviderPreference = ai.acousticProviderPreference;

  const player = w.player;
  const timelineViewportProjection = w.timelineViewportProjection;
  const timelineReadModel = t.timelineReadModel;
  const segmentRangeGesturePreviewReadModel = w.segmentRangeGesturePreviewReadModel;
  const displayStyleControl = p.displayStyleControl;
  const timelineContentGutterPx = p.timelineContentGutterPx;
  const verticalViewActive = p.verticalViewActive;
  const recoveryAvailable = p.recoveryAvailable;
  const showBatchOperationPanel = p.showBatchOperationPanel;
  const handleNoteClick = p.handleNoteClick;
  const resolveNoteIndicatorTarget = p.resolveNoteIndicatorTarget;
  const tierContainerRef = p.tierContainerRef;
  const verticalPaneFocus = p.verticalPaneFocus;
  const updateVerticalPaneFocus = p.updateVerticalPaneFocus;
  const notePopover = p.notePopover;
  const currentNotes = p.currentNotes;
  const toggleNotes = p.toggleNotes;
  const setUttOpsMenu = p.setUttOpsMenu;
  const isTimelineLaneHeaderCollapsed = p.isTimelineLaneHeaderCollapsed;
  const toggleTimelineLaneHeader = p.toggleTimelineLaneHeader;
  const waveCanvasRef = w.waveCanvasRef;
  const manualSelectTsRef = p.manualSelectTsRef;
  const selectUnit = d.selectUnit;
  const executeActionRef = p.executeActionRef;
  const openSearchRef = p.openSearchRef;
  const seekToTimeRef = p.seekToTimeRef;
  const splitAtTimeRef = p.splitAtTimeRef;
  const zoomToSegmentRef = p.zoomToSegmentRef;
  const handleExecuteRecommendation = p.handleExecuteRecommendation;
  const flushVoiceAiAssistantMessage = p.flushVoiceAiAssistantMessage;
  const adoptionItemsPushSinkRef = p.adoptionItemsPushSinkRef;
  const handleLaneLabelWidthResizeStart = p.handleLaneLabelWidthResizeStart;
  const timelineLaneHeights = p.timelineLaneHeights;
  const handleTimelineLaneHeightChange = p.handleTimelineLaneHeightChange;
  const isResizingWaveform = p.isResizingWaveform;
  const handleWaveformResizeStart = p.handleWaveformResizeStart;
  const recording = t.recording;
  const recordingUnitId = t.recordingUnitId;
  const _recordingLayerId = t.recordingLayerId;
  const _startRecordingForUnit = t.startRecordingForUnit;
  const _stopRecording = t.stopRecording;
  const getUnitDocById = b.getUnitDocById;
  const createUnitFromSelectionRouted = b.createUnitFromSelectionRouted;
  const createNextSegmentRouted = b.createNextSegmentRouted;
  const splitRouted = b.splitRouted;
  const mergeAdjacentSegmentsForAiRollback = b.mergeAdjacentSegmentsForAiRollback;
  const silentSegmentGraphSyncForAi = b.silentSegmentGraphSyncForAi;
  const mergeWithPreviousRouted = b.mergeWithPreviousRouted;
  const mergeWithNextRouted = b.mergeWithNextRouted;
  const mergeSelectedSegmentsRouted = b.mergeSelectedSegmentsRouted;
  const deleteUnitRouted = b.deleteUnitRouted;
  const deleteSelectedUnitsRouted = b.deleteSelectedUnitsRouted;
  const recentTimelineEditEvents = b.recentTimelineEditEvents;
  const timelineUnitViewIndex = p.timelineUnitViewIndex;
  const waveformDisplayMode = p.waveformDisplayMode;
  const setWaveformDisplayMode = p.setWaveformDisplayMode;
  const waveformVisualStyle = p.waveformVisualStyle;
  const setWaveformVisualStyle = p.setWaveformVisualStyle;
  const acousticOverlayMode = p.acousticOverlayMode;
  const setAcousticOverlayMode = p.setAcousticOverlayMode;
  const globalLoopPlayback = w.globalLoopPlayback;
  const setGlobalLoopPlayback = w.setGlobalLoopPlayback;

  return {
    viewModels: {
      lane: buildReadyWorkspaceViewModelsLaneSlice({
        trackDisplayController,
        speakerController,
        timelineController,
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
        handleLaneLabelWidthResizeStart,
        activeTextTimelineMode,
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
      }),
      head: buildReadyWorkspaceViewModelsHeadSlice({
        selectedMediaUrl,
        player,
        layers,
        locale,
        importExportController,
        layerAction,
        timelineViewportProjection,
      }),
      timelineReadModel,
      segmentRangeGesturePreviewReadModel,
      annotation: buildReadyWorkspaceViewModelsAnnotationSlice({
        activeTextTimeMapping,
        defaultTranscriptionLayerId,
        createUnitFromSelectionRouted,
        handleNoteClick,
        resolveNoteIndicatorTarget,
        tierContainerRef,
        verticalPaneFocus,
        updateVerticalPaneFocus,
        verticalViewActive,
        startTimelineResizeDrag:
          timelineSyncController.timelineResizeController.startTimelineResizeDrag,
        navigateUnitFromInput: playbackKeyboardController.navigateUnitFromInput,
        annotationController,
        trackDisplayController,
        timelineController,
        speakerActionScopeController,
        selfCertaintyController,
      }),
      tail: buildReadyWorkspaceViewModelsTailSlice({
        importExportController,
        projectMediaController,
        assistantSidebarController,
        speakerController,
        timelineSyncController,
        playbackKeyboardController,
        workspaceRest: {
          selectedTimelineMedia,
          waveformDisplayMode,
          setWaveformDisplayMode,
          waveformVisualStyle,
          setWaveformVisualStyle,
          acousticOverlayMode,
          setAcousticOverlayMode,
          globalLoopPlayback,
          setGlobalLoopPlayback,
          canUndo,
          canRedo,
          undoLabel,
          activeTextId,
          selectedTimelineUnit,
          notePopover,
          loadSnapshot,
          undo,
          redo,
          setShowProjectSetup,
          setShowAudioImport,
          toggleNotes,
          setUttOpsMenu,
          unitsOnCurrentMedia,
          isTimelineLaneHeaderCollapsed,
          toggleTimelineLaneHeader,
          waveCanvasRef,
          showSearch,
          displayStyleControl,
          activeLayerIdForEdits,
          activeTimelineUnitId,
          searchOverlayRequest,
          manualSelectTsRef,
          selectUnit,
          setShowSearch,
          setSearchOverlayRequest,
          isAiPanelCollapsed,
          hubSidebarTab,
          setHubSidebarTab,
          selectedAiWarning,
          selectedTranslationGapCount,
          aiSidebarError,
          showProjectSetup,
          showAudioImport,
          showShortcuts,
          closeShortcuts,
          isFocusMode,
          exitFocusMode,
        },
      }),
    },
    toolbarCollaboration: {
      locale,
      badge: collaborationSyncBadge,
      presenceMembers: collaborationPresenceMembers,
      currentUserId: collaborationPresenceCurrentUserId,
    },
    axisStatusWithoutTimelineTop: {
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
    },
    renderController: {
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
    },
    assistantBridgeJoin: {
      segmentScopeMediaItem,
      bridge: {
        selectedUnitIds,
        selectedUnit: selectedUnit ?? null,
        getUnitDocById,
        selectedTimelineSegment: selectedTimelineSegment ?? null,
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
      },
      tail: {
        currentNotes,
        focusedLayerRowId,
        notePopover,
        selectedTimelineMedia,
        selectedLayerId,
        selectedUnitIds,
        verticalViewActive,
        transcriptionTrackMode,
        timelineViewportProjection,
        effectiveLaneLockMap: trackDisplayController.effectiveLaneLockMap,
        selectedSpeakerIdsForTrackLock: speakerController.selectedSpeakerIdsForTrackLock,
        activeSpeakerFilterKey: speakerController.activeSpeakerFilterKey,
      },
    },
    layeredFlatAssemblyWithoutAssembled: buildReadyWorkspaceSurfaceLayeredFlatAssembly(deps),
    nestedOrchestratorSlices: buildReadyWorkspaceSurfaceNestedOrchestratorSlices(deps),
  };
}
