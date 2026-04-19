import type { ChangeEvent, RefObject } from 'react';
import type { TranscriptionComparisonViewFocusState } from './TranscriptionPage.UIState';
import type { LayerDocType, MediaItemDocType, LayerUnitDocType } from '../db';
import type { TextTimeMapping } from '../types/textTimeMapping';
import type { NotePopoverState } from '../hooks/useNoteHandlers';
import type { LayerActionPanelHandle } from '../hooks/useLayerActionPanel';
import type { Locale } from '../i18n';
import type { TranscriptionPageTimelineMediaLanesProps, TranscriptionPageTimelineTextOnlyProps } from './TranscriptionPage.TimelineContent';
import type { TranscriptionPageAssistantRuntimeProps, TranscriptionPageAnalysisRuntimeProps } from './TranscriptionPage.runtimeContracts';
import type { TranscriptionPageDialogsProps } from './TranscriptionPage.Dialogs';
import type { UseTranscriptionSectionViewModelsInput } from './transcriptionSectionViewModelTypes';
import { dropUndefinedKeys, type BuiltSharedLaneProps } from './transcriptionReadyWorkspacePropsBuilders';
import type { UseOrchestratorViewModelsInput } from './useOrchestratorViewModels';

/**
 * TranscriptionPage.ReadyWorkspace 传入 buildOrchestratorViewModelsInput 的原始依赖包。
 */
export interface TranscriptionReadyWorkspaceOrchestratorRawInput {
  selectedMediaUrl: string | null | undefined;
  player: UseTranscriptionSectionViewModelsInput['player'];
  layers: LayerDocType[];
  locale: Locale;
  importFileRef: RefObject<HTMLInputElement | null>;
  layerAction: LayerActionPanelHandle;
  sharedLaneProps: BuiltSharedLaneProps;
  zoomPxPerSec: TranscriptionPageTimelineMediaLanesProps['zoomPxPerSec'];
  lassoRect: TranscriptionPageTimelineMediaLanesProps['lassoRect'];
  timelineRenderUnits: TranscriptionPageTimelineMediaLanesProps['timelineRenderUnits'];
  defaultTranscriptionLayerId: TranscriptionPageTimelineMediaLanesProps['defaultTranscriptionLayerId'];
  textOnlyLogicalDurationSec?: number;
  /** 纯文本轨拖建/改时：像素→文献秒 与 `previewTextTimeMapping` 视口一致 */
  textOnlyTimeMapping?: Pick<TextTimeMapping, 'offsetSec' | 'scale'>;
  createUnitFromSelectionRouted?: (start: number, end: number) => Promise<void>;
  renderAnnotationItem: TranscriptionPageTimelineMediaLanesProps['renderAnnotationItem'];
  speakerSortKeyById: TranscriptionPageTimelineMediaLanesProps['speakerSortKeyById'];
  filteredUnitsOnCurrentMedia: TranscriptionPageTimelineTextOnlyProps['unitsOnCurrentMedia'];
  tierContainerRef: TranscriptionPageTimelineTextOnlyProps['scrollContainerRef'];
  handleAnnotationClick: TranscriptionPageTimelineTextOnlyProps['handleAnnotationClick'];
  handleAnnotationContextMenu: TranscriptionPageTimelineTextOnlyProps['handleAnnotationContextMenu'];
  handleNoteClick?: TranscriptionPageTimelineTextOnlyProps['handleNoteClick'];
  resolveNoteIndicatorTarget?: TranscriptionPageTimelineTextOnlyProps['resolveNoteIndicatorTarget'];
  startTimelineResizeDrag?: TranscriptionPageTimelineTextOnlyProps['startTimelineResizeDrag'];
  /** 纯文本轨拖边调时与 `useTimelineResize` 的 dragPreview 对齐 | Edge-resize live layout */
  timingDragPreview?: TranscriptionPageTimelineTextOnlyProps['timingDragPreview'];
  navigateUnitFromInput: TranscriptionPageTimelineTextOnlyProps['navigateUnitFromInput'];
  speakerVisualByTimelineUnitId: TranscriptionPageTimelineTextOnlyProps['speakerVisualByUnitId'];
  resolveSelfCertaintyForUnit: TranscriptionPageTimelineTextOnlyProps['resolveSelfCertaintyForUnit'];
  resolveSelfCertaintyAmbiguityForUnit: TranscriptionPageTimelineTextOnlyProps['resolveSelfCertaintyAmbiguityForUnit'];
  comparisonViewEnabled?: boolean;
  comparisonFocus?: TranscriptionComparisonViewFocusState;
  updateComparisonFocus?: (patch: Partial<TranscriptionComparisonViewFocusState>) => void;
  selectedTimelineMedia: MediaItemDocType | undefined;
  waveformDisplayMode: UseTranscriptionSectionViewModelsInput['waveformDisplayMode'];
  setWaveformDisplayMode: UseTranscriptionSectionViewModelsInput['setWaveformDisplayMode'];
  waveformVisualStyle: UseTranscriptionSectionViewModelsInput['waveformVisualStyle'];
  setWaveformVisualStyle: UseTranscriptionSectionViewModelsInput['setWaveformVisualStyle'];
  acousticOverlayMode: UseTranscriptionSectionViewModelsInput['acousticOverlayMode'];
  setAcousticOverlayMode: UseTranscriptionSectionViewModelsInput['setAcousticOverlayMode'];
  globalLoopPlayback: UseTranscriptionSectionViewModelsInput['globalLoopPlayback'];
  setGlobalLoopPlayback: UseTranscriptionSectionViewModelsInput['setGlobalLoopPlayback'];
  handleGlobalPlayPauseAction: UseTranscriptionSectionViewModelsInput['handleGlobalPlayPauseAction'];
  canUndo: UseTranscriptionSectionViewModelsInput['canUndo'];
  canRedo: UseTranscriptionSectionViewModelsInput['canRedo'];
  undoLabel: UseTranscriptionSectionViewModelsInput['undoLabel'];
  activeTextId: string | null | undefined;
  selectedTimelineUnit: UseTranscriptionSectionViewModelsInput['selectedTimelineUnit'];
  notePopover: NotePopoverState | null;
  showExportMenu: UseTranscriptionSectionViewModelsInput['showExportMenu'];
  exportMenuRef: UseTranscriptionSectionViewModelsInput['exportMenuRef'];
  loadSnapshot: UseTranscriptionSectionViewModelsInput['loadSnapshot'];
  undo: UseTranscriptionSectionViewModelsInput['undo'];
  redo: UseTranscriptionSectionViewModelsInput['redo'];
  setShowProjectSetup: UseTranscriptionSectionViewModelsInput['setShowProjectSetup'];
  setShowAudioImport: UseTranscriptionSectionViewModelsInput['setShowAudioImport'];
  handleDeleteCurrentAudio: UseTranscriptionSectionViewModelsInput['handleDeleteCurrentAudio'];
  handleDeleteCurrentProject: UseTranscriptionSectionViewModelsInput['handleDeleteCurrentProject'];
  toggleNotes: UseTranscriptionSectionViewModelsInput['toggleNotes'];
  setUttOpsMenu: UseTranscriptionSectionViewModelsInput['setUttOpsMenu'];
  handleAutoSegment: UseTranscriptionSectionViewModelsInput['handleAutoSegment'];
  autoSegmentBusy: UseTranscriptionSectionViewModelsInput['autoSegmentBusy'];
  setShowExportMenu: UseTranscriptionSectionViewModelsInput['setShowExportMenu'];
  handleExportEaf: UseTranscriptionSectionViewModelsInput['handleExportEaf'];
  handleExportTextGrid: UseTranscriptionSectionViewModelsInput['handleExportTextGrid'];
  handleExportTrs: UseTranscriptionSectionViewModelsInput['handleExportTrs'];
  handleExportFlextext: UseTranscriptionSectionViewModelsInput['handleExportFlextext'];
  handleExportToolbox: UseTranscriptionSectionViewModelsInput['handleExportToolbox'];
  handleExportJyt: UseTranscriptionSectionViewModelsInput['handleExportJyt'];
  handleExportJym: UseTranscriptionSectionViewModelsInput['handleExportJym'];
  handleImportFile: UseTranscriptionSectionViewModelsInput['handleImportFile'];
  unitsOnCurrentMedia: LayerUnitDocType[];
  rulerView: UseTranscriptionSectionViewModelsInput['rulerView'];
  isTimelineLaneHeaderCollapsed: UseTranscriptionSectionViewModelsInput['isTimelineLaneHeaderCollapsed'];
  toggleTimelineLaneHeader: UseTranscriptionSectionViewModelsInput['toggleTimelineLaneHeader'];
  waveCanvasRef: UseTranscriptionSectionViewModelsInput['waveCanvasRef'];
  showSearch: UseTranscriptionSectionViewModelsInput['showSearch'];
  searchableItems: UseTranscriptionSectionViewModelsInput['searchableItems'];
  displayStyleControl: NonNullable<TranscriptionPageTimelineMediaLanesProps['displayStyleControl']>;
  activeLayerIdForEdits: UseTranscriptionSectionViewModelsInput['activeLayerIdForEdits'];
  activeTimelineUnitId: UseTranscriptionSectionViewModelsInput['activeTimelineUnitId'];
  searchOverlayRequest: UseTranscriptionSectionViewModelsInput['searchOverlayRequest'];
  manualSelectTsRef: UseTranscriptionSectionViewModelsInput['manualSelectTsRef'];
  selectUnit: UseTranscriptionSectionViewModelsInput['selectUnit'];
  handleSearchReplace: UseTranscriptionSectionViewModelsInput['handleSearchReplace'];
  setShowSearch: UseTranscriptionSectionViewModelsInput['setShowSearch'];
  setSearchOverlayRequest: UseTranscriptionSectionViewModelsInput['setSearchOverlayRequest'];
  isAiPanelCollapsed: boolean;
  hubSidebarTab: 'assistant' | 'analysis';
  setHubSidebarTab: (tab: 'assistant' | 'analysis') => void;
  assistantRuntimeProps: TranscriptionPageAssistantRuntimeProps;
  analysisRuntimeProps: TranscriptionPageAnalysisRuntimeProps;
  selectedAiWarning: boolean;
  selectedTranslationGapCount: number;
  aiSidebarError: string | null;
  speakerDialogStateRouted: TranscriptionPageDialogsProps['speakerDialogState'];
  speakerSavingRouted: boolean;
  closeSpeakerDialogRouted: () => void;
  confirmSpeakerDialogRouted: () => Promise<void>;
  updateSpeakerDialogDraftNameRouted: (name: string) => void;
  updateSpeakerDialogTargetKeyRouted: (key: string) => void;
  showProjectSetup: boolean;
  handleProjectSetupSubmit: (input: { primaryTitle: string; englishFallbackTitle: string; primaryLanguageId: string; primaryOrthographyId?: string }) => Promise<void>;
  showAudioImport: boolean;
  handleAudioImport: TranscriptionPageDialogsProps['onImportAudio'];
  audioImportDisposition: TranscriptionPageDialogsProps['audioImportDisposition'];
  mediaFileInputRef: RefObject<HTMLInputElement | null>;
  handleDirectMediaImport: (e: ChangeEvent<HTMLInputElement>) => void;
  audioDeleteConfirm: { filename: string } | null;
  setAudioDeleteConfirm: (value: { filename: string } | null) => void;
  handleConfirmAudioDelete: () => void;
  projectDeleteConfirm: boolean;
  setProjectDeleteConfirm: (value: boolean) => void;
  handleConfirmProjectDelete: () => void;
  showShortcuts: boolean;
  closeShortcuts: () => void;
  isFocusMode: boolean;
  exitFocusMode: () => void;
}

export function buildOrchestratorViewModelsInput(
  input: TranscriptionReadyWorkspaceOrchestratorRawInput,
): UseOrchestratorViewModelsInput {
  const {
    selectedMediaUrl,
    player,
    layers,
    locale,
    importFileRef,
    layerAction,
    sharedLaneProps,
    zoomPxPerSec,
    lassoRect,
    timelineRenderUnits,
    defaultTranscriptionLayerId,
    textOnlyLogicalDurationSec,
    textOnlyTimeMapping,
    createUnitFromSelectionRouted,
    renderAnnotationItem,
    speakerSortKeyById,
    filteredUnitsOnCurrentMedia,
    tierContainerRef,
    handleAnnotationClick,
    handleAnnotationContextMenu,
    handleNoteClick,
    resolveNoteIndicatorTarget,
    navigateUnitFromInput,
    speakerVisualByTimelineUnitId,
    resolveSelfCertaintyForUnit,
    resolveSelfCertaintyAmbiguityForUnit,
    comparisonViewEnabled,
    comparisonFocus,
    updateComparisonFocus,
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
    rulerView,
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
  } = input;

  return {
    selectedMediaUrl: selectedMediaUrl ?? null,
    playerIsReady: player.isReady,
    playerDuration: player.duration,
    layersCount: layers.length,
    locale,
    importFileRef,
    layerActionSetCreateTranscription: () => layerAction.setLayerActionPanel('create-transcription'),
    mediaLanesPropsInput: dropUndefinedKeys({
      ...sharedLaneProps,
      zoomPxPerSec,
      lassoRect,
      timelineRenderUnits,
      defaultTranscriptionLayerId,
      renderAnnotationItem,
      speakerSortKeyById,
    }) as UseOrchestratorViewModelsInput['mediaLanesPropsInput'],
    textOnlyPropsInput: dropUndefinedKeys({
      ...sharedLaneProps,
      unitsOnCurrentMedia: filteredUnitsOnCurrentMedia,
      segmentParentUnitLookup: unitsOnCurrentMedia,
      defaultTranscriptionLayerId: defaultTranscriptionLayerId ?? '',
      ...(textOnlyLogicalDurationSec !== undefined ? { logicalDurationSec: textOnlyLogicalDurationSec } : {}),
      ...(textOnlyTimeMapping ? { textOnlyTimeMapping } : {}),
      ...(createUnitFromSelectionRouted ? { createUnitFromSelection: createUnitFromSelectionRouted } : {}),
      ...(comparisonViewEnabled ? { comparisonViewEnabled: true } : {}),
      ...(comparisonFocus ? { comparisonFocus } : {}),
      ...(updateComparisonFocus ? { updateComparisonFocus } : {}),
      scrollContainerRef: tierContainerRef,
      handleAnnotationClick,
      handleAnnotationContextMenu,
      ...(handleNoteClick ? { handleNoteClick } : {}),
      ...(resolveNoteIndicatorTarget ? { resolveNoteIndicatorTarget } : {}),
      ...(input.startTimelineResizeDrag ? { startTimelineResizeDrag: input.startTimelineResizeDrag } : {}),
      ...(input.timingDragPreview != null ? { timingDragPreview: input.timingDragPreview } : {}),
      ...(typeof zoomPxPerSec === 'number' && Number.isFinite(zoomPxPerSec) && zoomPxPerSec > 0
        && !comparisonViewEnabled
        ? { textTimelineZoomPxPerSec: zoomPxPerSec }
        : {}),
      navigateUnitFromInput,
      speakerVisualByUnitId: speakerVisualByTimelineUnitId,
      resolveSelfCertaintyForUnit,
      resolveSelfCertaintyAmbiguityForUnit,
    }) as UseOrchestratorViewModelsInput['textOnlyPropsInput'],
    selectedTimelineMediaFilename: selectedTimelineMedia?.filename ?? null,
    player,
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
    hasSelectedTimelineMedia: Boolean(selectedTimelineMedia),
    hasActiveTextId: Boolean(activeTextId),
    selectedTimelineUnit: selectedTimelineUnit ?? null,
    notePopoverOpen: Boolean(notePopover),
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
    rulerView: rulerView ?? null,
    zoomPxPerSec,
    isTimelineLaneHeaderCollapsed,
    toggleTimelineLaneHeader,
    waveCanvasRef,
    tierContainerRef,
    showSearch,
    searchableItems,
    orthographies: displayStyleControl.orthographies,
    activeLayerIdForEdits,
    activeTimelineUnitId,
    searchOverlayRequest,
    manualSelectTsRef,
    selectUnit,
    handleSearchReplace,
    setShowSearch,
    setSearchOverlayRequest,
    sidebarSectionsInput: {
      locale,
      isAiPanelCollapsed,
      hubSidebarTab,
      setHubSidebarTab,
      assistantRuntimeProps,
      analysisRuntimeProps,
      selectedAiWarning,
      selectedTranslationGapCount,
      aiSidebarError,
      speakerDialogState: speakerDialogStateRouted,
      speakerSaving: speakerSavingRouted,
      closeSpeakerDialog: closeSpeakerDialogRouted,
      confirmSpeakerDialog: confirmSpeakerDialogRouted,
      updateSpeakerDialogDraftName: updateSpeakerDialogDraftNameRouted,
      updateSpeakerDialogTargetKey: updateSpeakerDialogTargetKeyRouted,
      showProjectSetup,
      setShowProjectSetup,
      handleProjectSetupSubmit,
      showAudioImport,
      setShowAudioImport,
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
  };
}
