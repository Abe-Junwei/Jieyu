import type { Locale } from '../i18n';
import { buildReadyWorkspaceViewModelsAnnotationSlice } from './readyWorkspaceViewModelsAnnotationSlice';
import { buildReadyWorkspaceViewModelsHeadSlice } from './readyWorkspaceViewModelsHeadSlice';
import { buildReadyWorkspaceViewModelsLaneSlice } from './readyWorkspaceViewModelsLaneSlice';
import { buildReadyWorkspaceViewModelsTailSlice } from './readyWorkspaceViewModelsTailSlice';
import type { UseReadyWorkspaceViewModelsAndSurfacePhaseParams } from './useReadyWorkspaceViewModelsAndSurfacePhase';
import { formatTime } from '../utils/transcriptionFormatters';

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
type WaveformBridgeReturn = ReturnType<
  typeof import('./useReadyWorkspaceWaveformBridgePhase').useReadyWorkspaceWaveformBridgePhase
>;
type SelectionAiReturn = ReturnType<
  typeof import('./useReadyWorkspaceSelectionAndAiPrepPhase').useReadyWorkspaceSelectionAndAiPrepPhase
>;
type TimelineAssistantReturn = ReturnType<
  typeof import('./useReadyWorkspaceTimelineAssistantPlaybackPhase').useReadyWorkspaceTimelineAssistantPlaybackPhase
>;
type SidebarTrackReturn = ReturnType<
  typeof import('./useReadyWorkspaceSidebarAndTrackPhase').useReadyWorkspaceSidebarAndTrackPhase
>;

export interface BuildReadyWorkspaceViewModelsSurfacePhaseDeps {
  data: TranscriptionDataReturn;
  domainShell: DomainShellReturn;
  locale: Locale;
  pre: PreBootstrapReturn;
  bootstrap: BootstrapReturn;
  waveform: WaveformBridgeReturn;
  selectionAi: SelectionAiReturn;
  timeline: TimelineAssistantReturn;
  sidebar: SidebarTrackReturn;
}

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
  const units = d.units;
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
  const collaborationProtocolGuard = d.collaborationProtocolGuard;
  const listProjectAssets = d.listProjectAssets;
  const removeProjectAsset = d.removeProjectAsset;
  const getProjectAssetSignedUrl = d.getProjectAssetSignedUrl;
  const listProjectSnapshots = d.listProjectSnapshots;
  const restoreProjectSnapshotToLocalById = d.restoreProjectSnapshotToLocalById;
  const queryProjectChangeTimeline = d.queryProjectChangeTimeline;
  const listAccessibleCloudProjects = d.listAccessibleCloudProjects;
  const listCloudProjectMembers = d.listCloudProjectMembers;
  const getUnitTextForLayer = d.getUnitTextForLayer;
  const selectTimelineUnit = d.selectTimelineUnit;
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
  const applyTextTimeMapping = d.applyTextTimeMapping;
  const undoHistory = d.undoHistory;
  const _mediaItems = d.mediaItems;
  const deleteVoiceTranslation = d.deleteVoiceTranslation;
  const transcribeVoiceTranslation = d.transcribeVoiceTranslation;
  const _createAdjacentUnit = d.createAdjacentUnit;
  const deleteLayer = d.deleteLayer;
  const toggleLayerLink = d.toggleLayerLink;
  const rebindTranslationLayerHost = d.rebindTranslationLayerHost;
  const layerCreateMessage = d.layerCreateMessage;
  const snapGuide = d.snapGuide;
  const transcriptionTrackMode = d.transcriptionTrackMode;
  const selectedTimelineUnit = d.selectedTimelineUnit;
  const selectedLayerId = d.selectedLayerId;
  const translationTextByLayer = d.translationTextByLayer;
  const selectedMediaIsVideo = d.selectedMediaIsVideo;
  const unitsOnCurrentMedia = d.unitsOnCurrentMedia;
  const canUndo = d.canUndo;
  const canRedo = d.canRedo;
  const undoLabel = d.undoLabel;
  const redo = d.redo;
  const undo = d.undo;
  const undoToHistoryIndex = d.undoToHistoryIndex;
  const aiConfidenceAvg = d.aiConfidenceAvg;

  const uiFontScale = s.uiFontScale;
  const adaptiveDialogWidth = s.adaptiveDialogWidth;
  const adaptiveDialogCompactWidth = s.adaptiveDialogCompactWidth;
  const adaptiveDialogWideWidth = s.adaptiveDialogWideWidth;
  const showUndoHistory = s.showUndoHistory;
  const setShowUndoHistory = s.setShowUndoHistory;
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
  const segmentScopeMediaId = s.segmentScopeMediaId;
  const handleAiPanelToggle = s.handleAiPanelToggle;
  const searchOverlayRequest = s.searchOverlayRequest;
  const showProjectSetup = s.showProjectSetup;
  const setShowProjectSetup = s.setShowProjectSetup;
  const showAudioImport = s.showAudioImport;
  const setShowAudioImport = s.setShowAudioImport;
  const hubSidebarTab = s.hubSidebarTab;
  const setHubSidebarTab = s.setHubSidebarTab;
  const isAiPanelCollapsed = s.isAiPanelCollapsed;
  const setIsAiPanelCollapsed = s.setIsAiPanelCollapsed;
  const aiPanelWidth = s.aiPanelWidth;
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
  const selectedTimelineUnitForTime = s.selectedTimelineUnitForTime;

  const trackDisplayController = sb.trackDisplayController;
  const speakerController = sb.speakerController;
  const timelineController = sb.timelineController;
  const timelineSyncController = t.timelineSyncController;
  const playbackKeyboardController = t.playbackKeyboardController;
  const importExportController = t.importExportController;
  const projectMediaController = t.projectMediaController;
  const assistantSidebarController = sb.assistantSidebarController;
  const workspacePanelEffectsController = sb.workspacePanelEffectsController;
  const assistantController = t.assistantController;
  const speakerActionScopeController = sb.speakerActionScopeController;
  const selfCertaintyController = sb.selfCertaintyController;
  const annotationController = sb.annotationController;
  const batchOperationController = sb.batchOperationController;
  const updateLayerMetadata = sb.updateLayerMetadata;

  const selectionSnapshot = ai.selectionSnapshot;
  const deferredAiRuntime = ai.deferredAiRuntime;
  const handleDeferredAiRuntimeChange = ai.handleDeferredAiRuntimeChange;
  const vadCacheStatus = ai.vadCacheStatus;
  const observerResult = ai.observerResult;
  const actionableObserverRecommendations = ai.actionableObserverRecommendations;
  const handleExecuteObserverRecommendation = ai.handleExecuteObserverRecommendation;
  const hiddenByMediaFilterCount = ai.hiddenByMediaFilterCount;
  const embeddingProviderConfig = ai.embeddingProviderConfig;
  const setEmbeddingProviderConfig = ai.setEmbeddingProviderConfig;
  const aiSidebarError = ai.aiSidebarError;
  const setAiSidebarError = ai.setAiSidebarError;
  const flushDeferredAiRuntime = ai.flushDeferredAiRuntime;
  const waveformAcousticRuntimeStatus = ai.waveformAcousticRuntimeStatus;
  const waveformVadCacheStatus = ai.waveformVadCacheStatus;
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
  const recoveryDiffSummary = p.recoveryDiffSummary;
  const applyRecoveryBanner = p.applyRecoveryBanner;
  const dismissRecoveryBanner = p.dismissRecoveryBanner;
  const batchPreviewTextPropsByLayerId = p.batchPreviewTextPropsByLayerId;
  const showBatchOperationPanel = p.showBatchOperationPanel;
  const setShowBatchOperationPanel = p.setShowBatchOperationPanel;
  const handleNoteClick = p.handleNoteClick;
  const resolveNoteIndicatorTarget = p.resolveNoteIndicatorTarget;
  const tierContainerRef = p.tierContainerRef;
  const verticalPaneFocus = p.verticalPaneFocus;
  const updateVerticalPaneFocus = p.updateVerticalPaneFocus;
  const notePopover = p.notePopover;
  const setNotePopover = p.setNotePopover;
  const currentNotes = p.currentNotes;
  const addNote = p.addNote;
  const updateNote = p.updateNote;
  const deleteNote = p.deleteNote;
  const toggleNotes = p.toggleNotes;
  const setUttOpsMenu = p.setUttOpsMenu;
  const isTimelineLaneHeaderCollapsed = p.isTimelineLaneHeaderCollapsed;
  const toggleTimelineLaneHeader = p.toggleTimelineLaneHeader;
  const waveCanvasRef = w.waveCanvasRef;
  const manualSelectTsRef = p.manualSelectTsRef;
  const selectUnit = d.selectUnit;
  const ctxMenu = p.ctxMenu;
  const setCtxMenu = p.setCtxMenu;
  const uttOpsMenu = p.uttOpsMenu;
  const executeActionRef = p.executeActionRef;
  const openSearchRef = p.openSearchRef;
  const seekToTimeRef = p.seekToTimeRef;
  const splitAtTimeRef = p.splitAtTimeRef;
  const zoomToSegmentRef = p.zoomToSegmentRef;
  const handleExecuteRecommendation = p.handleExecuteRecommendation;
  const flushVoiceAiAssistantMessage = p.flushVoiceAiAssistantMessage;
  const adoptionItemsPushSinkRef = p.adoptionItemsPushSinkRef;
  const onSelectWorkspaceHorizontalLayout = p.onSelectWorkspaceHorizontalLayout;
  const onSelectWorkspaceVerticalLayout = p.onSelectWorkspaceVerticalLayout;
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
  const toggleSkipProcessingRouted = b.toggleSkipProcessingRouted;
  const recentTimelineEditEvents = b.recentTimelineEditEvents;
  const runOverlayDeleteSelection = b.runOverlayDeleteSelection;
  const runOverlayMergeSelection = b.runOverlayMergeSelection;
  const runSelectBefore = b.runSelectBefore;
  const runSelectAfter = b.runSelectAfter;
  const runOverlayDeleteOne = b.runOverlayDeleteOne;
  const runOverlayMergePrev = b.runOverlayMergePrev;
  const runOverlayMergeNext = b.runOverlayMergeNext;
  const runOverlaySplitAtTime = b.runOverlaySplitAtTime;
  const deleteConfirmState = b.deleteConfirmState;
  const muteDeleteConfirmInSession = b.muteDeleteConfirmInSession;
  const setMuteDeleteConfirmInSession = b.setMuteDeleteConfirmInSession;
  const closeDeleteConfirmDialog = b.closeDeleteConfirmDialog;
  const confirmDeleteFromDialog = b.confirmDeleteFromDialog;
  const timelineUnitViewIndex = p.timelineUnitViewIndex;
  const selectedWaveformRegionId = w.selectedWaveformRegionId;
  const waveformTimelineItems = w.waveformTimelineItems;
  const zoomToPercent = w.zoomToPercent;
  const zoomToUnit = w.zoomToUnit;
  const snapEnabled = p.snapEnabled;
  const setSnapEnabled = p.setSnapEnabled;
  const autoScrollEnabled = p.autoScrollEnabled;
  const setAutoScrollEnabled = p.setAutoScrollEnabled;
  const handleLassoPointerDown = w.handleLassoPointerDown;
  const handleLassoPointerMove = w.handleLassoPointerMove;
  const handleLassoPointerUp = w.handleLassoPointerUp;
  const handleTimelineScroll = w.handleTimelineScroll;
  const laneLabelWidth = p.laneLabelWidth;
  const waveformDisplayMode = p.waveformDisplayMode;
  const setWaveformDisplayMode = p.setWaveformDisplayMode;
  const waveformVisualStyle = p.waveformVisualStyle;
  const setWaveformVisualStyle = p.setWaveformVisualStyle;
  const acousticOverlayMode = p.acousticOverlayMode;
  const setAcousticOverlayMode = p.setAcousticOverlayMode;
  const globalLoopPlayback = w.globalLoopPlayback;
  const setGlobalLoopPlayback = w.setGlobalLoopPlayback;
  const waveformAreaRef = w.waveformAreaRef;
  const waveformStripWheelShellRef = w.waveformStripWheelShellRef;
  const waveformRegions = w.waveformRegions;
  const segmentLoopPlayback = w.segmentLoopPlayback;
  const subSelectionRange = w.subSelectionRange;
  const isResizingVideoPreview = p.isResizingVideoPreview;
  const isResizingVideoRightPanel = p.isResizingVideoRightPanel;
  const handleVideoPreviewResizeStart = p.handleVideoPreviewResizeStart;
  const handleVideoRightPanelResizeStart = p.handleVideoRightPanelResizeStart;
  const videoPreviewHeight = p.videoPreviewHeight;
  const videoLayoutMode = p.videoLayoutMode;
  const setVideoLayoutMode = p.setVideoLayoutMode;
  const videoRightPanelWidth = p.videoRightPanelWidth;
  const amplitudeScale = p.amplitudeScale;
  const setAmplitudeScale = p.setAmplitudeScale;
  const waveformHeight = p.waveformHeight;
  const handleWaveformAreaFocus = w.handleWaveformAreaFocus;
  const handleWaveformAreaBlur = w.handleWaveformAreaBlur;
  const handleWaveformAreaMouseMove = w.handleWaveformAreaMouseMove;
  const handleWaveformAreaMouseLeave = w.handleWaveformAreaMouseLeave;
  const handleWaveformAreaWheel = w.handleWaveformAreaWheel;
  const hoverTime = w.hoverTime;
  const waveformHoverPreviewProps = p.waveformHoverPreviewProps;
  const toggleSnapEnabled = p.toggleSnapEnabled;
  const waveformNoteIndicators = w.waveformNoteIndicators;
  const waveformLowConfidenceOverlays = w.waveformLowConfidenceOverlays;
  const waveformOverlapOverlays = w.waveformOverlapOverlays;
  const acousticOverlayViewportWidth = w.acousticOverlayViewportWidth;
  const acousticOverlayF0Path = w.acousticOverlayF0Path;
  const acousticOverlayIntensityPath = w.acousticOverlayIntensityPath;
  const acousticOverlayVisibleSummary = w.acousticOverlayVisibleSummary;
  const acousticOverlayLoading = w.acousticOverlayLoading;
  const waveformHoverReadout = w.waveformHoverReadout;
  const spectrogramHoverReadout = w.spectrogramHoverReadout;
  const selectedHotspotTimeSec = ai.selectedHotspotTimeSec;
  const handleSpectrogramMouseMove = w.handleSpectrogramMouseMove;
  const handleSpectrogramMouseLeave = w.handleSpectrogramMouseLeave;
  const handleSpectrogramClick = w.handleSpectrogramClick;
  const selectedWaveformTimelineItem = w.selectedWaveformTimelineItem;
  const playerInstanceGetWidth = ai.playerInstanceGetWidth;
  const waveformScrollLeft = w.waveformScrollLeft;
  const segmentPlaybackRate = w.segmentPlaybackRate;
  const handleSegmentPlaybackRateChange = w.handleSegmentPlaybackRateChange;
  const handleToggleSelectedWaveformLoop = w.handleToggleSelectedWaveformLoop;
  const handleToggleSelectedWaveformPlay = w.handleToggleSelectedWaveformPlay;
  const segMarkStart = w.segMarkStart;
  const workspaceRef = p.workspaceRef;
  const listMainRef = p.listMainRef;
  const waveformSectionRef = p.waveformSectionRef;
  const recordTimelineEdit = b.recordTimelineEdit;

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
    layeredFlatAssemblyWithoutAssembled: {
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
      observerResult,
      actionableObserverRecommendations,
      handleExecuteObserverRecommendation,
      deferredAiRuntime,
      vadCacheStatus,
      collaborationProtocolGuard,
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
      workspacePanelEffectsController,
      timelineResizeController: timelineSyncController.timelineResizeController,
      focusedLayerRowId,
      flashLayerRowId,
    },
    nestedOrchestratorSlices: {
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
      waveformAreaRef,
      snapGuide,
      segMarkStart,
      isResizingWaveform,
      waveformHeight,
      handleWaveformAreaFocus,
      handleWaveformAreaBlur,
      handleWaveformAreaMouseMove,
      handleWaveformAreaMouseLeave,
      handleWaveformAreaWheel,
      hoverTime,
      unitsOnCurrentMedia,
      waveformHoverPreviewProps,
      snapEnabled,
      toggleSnapEnabled,
      amplitudeScale,
      setAmplitudeScale,
      setVideoLayoutMode,
      handleLaneLabelWidthResizeStart,
      videoPreviewHeight,
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
      timelineReadModel,
      playbackKeyboardController,
      player,
      projectMediaController,
      waveformAcousticRuntimeStatus,
      waveformVadCacheStatus,
      tierContainerRef,
      getUnitTextForLayer,
      waveformSectionRef,
      workspaceRef,
      listMainRef,
      ctxMenu,
      setCtxMenu,
      uttOpsMenu,
      setUttOpsMenu,
      selectedTimelineUnit,
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
      notePopover,
      currentNotes,
      addNote,
      updateNote,
      deleteNote,
      units,
      selfCertaintyController,
      transcriptionLayers,
      translationLayers,
      speakerController,
      speakerActionScopeController,
      timelineUnitViewIndex,
      toggleSkipProcessingRouted,
      displayStyleControl,
      trackDisplayController,
      timelineController,
      batchOperationController,
      importExportController,
      annotationController,
    },
  };
}
