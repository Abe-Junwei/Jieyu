import type { ChangeEvent, RefObject } from 'react';
import type { LayerDocType, MediaItemDocType, UtteranceDocType } from '../db';
import type { NotePopoverState } from '../hooks/useNoteHandlers';
import type { LayerActionPanelHandle } from '../hooks/useLayerActionPanel';
import type { Locale } from '../i18n';
import type {
  TranscriptionPageTimelineMediaLanesProps,
  TranscriptionPageTimelineTextOnlyProps,
} from './TranscriptionPage.TimelineContent';
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
  timelineRenderUtterances: TranscriptionPageTimelineMediaLanesProps['timelineRenderUtterances'];
  defaultTranscriptionLayerId: TranscriptionPageTimelineMediaLanesProps['defaultTranscriptionLayerId'];
  renderAnnotationItem: TranscriptionPageTimelineMediaLanesProps['renderAnnotationItem'];
  speakerSortKeyById: TranscriptionPageTimelineMediaLanesProps['speakerSortKeyById'];
  filteredUtterancesOnCurrentMedia: TranscriptionPageTimelineTextOnlyProps['utterancesOnCurrentMedia'];
  tierContainerRef: TranscriptionPageTimelineTextOnlyProps['scrollContainerRef'];
  handleAnnotationClick: TranscriptionPageTimelineTextOnlyProps['handleAnnotationClick'];
  handleAnnotationContextMenu: TranscriptionPageTimelineTextOnlyProps['handleAnnotationContextMenu'];
  navigateUnitFromInput: TranscriptionPageTimelineTextOnlyProps['navigateUnitFromInput'];
  speakerVisualByTimelineUnitId: TranscriptionPageTimelineTextOnlyProps['speakerVisualByUtteranceId'];
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
  utterancesOnCurrentMedia: UtteranceDocType[];
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
  handleAudioImport: (file: File, duration: number) => Promise<void>;
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
    timelineRenderUtterances,
    defaultTranscriptionLayerId,
    renderAnnotationItem,
    speakerSortKeyById,
    filteredUtterancesOnCurrentMedia,
    tierContainerRef,
    handleAnnotationClick,
    handleAnnotationContextMenu,
    navigateUnitFromInput,
    speakerVisualByTimelineUnitId,
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
    utterancesOnCurrentMedia,
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
      timelineRenderUtterances,
      defaultTranscriptionLayerId,
      renderAnnotationItem,
      speakerSortKeyById,
    }) as UseOrchestratorViewModelsInput['mediaLanesPropsInput'],
    textOnlyPropsInput: dropUndefinedKeys({
      ...sharedLaneProps,
      utterancesOnCurrentMedia: filteredUtterancesOnCurrentMedia,
      defaultTranscriptionLayerId: defaultTranscriptionLayerId ?? '',
      scrollContainerRef: tierContainerRef,
      handleAnnotationClick,
      handleAnnotationContextMenu,
      navigateUnitFromInput,
      speakerVisualByUtteranceId: speakerVisualByTimelineUnitId,
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
    utterancesOnCurrentMedia,
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
