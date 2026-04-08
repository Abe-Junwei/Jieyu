/**
 * useOrchestratorViewModels — Orchestrator 视图模型组装
 * Assembles the final ViewModel props for toolbar, timeline, AI sidebar, and dialogs.
 *
 * 从 TranscriptionPage.Orchestrator.tsx 中提取，减少主文件体积。
 * Extracted from TranscriptionPage.Orchestrator.tsx to reduce main file size.
 */

import type { RefObject } from 'react';
import type { Locale } from '../i18n';
import type { TranscriptionPageTimelineContentProps } from './TranscriptionPage.TimelineContent';
import { useTranscriptionTimelineContentViewModel } from './useTranscriptionTimelineContentViewModel';
import { useTranscriptionSectionViewModelsInput } from './useTranscriptionSectionViewModelsInput';
import { useTranscriptionSectionViewModels } from './useTranscriptionSectionViewModels';

/**
 * 输入参数 — 由 Orchestrator 传入的所有依赖
 * Input — all dependencies passed in from the Orchestrator
 */
export interface UseOrchestratorViewModelsInput {
  // ── TimelineContentViewModel deps ──
  selectedMediaUrl: string | null;
  playerIsReady: boolean;
  playerDuration: number;
  layersCount: number;
  locale: Locale;
  importFileRef: RefObject<HTMLInputElement | null>;
  layerActionSetCreateTranscription: () => void;
  mediaLanesPropsInput: Parameters<typeof useTranscriptionTimelineContentViewModel>[0]['mediaLanesPropsInput'];
  textOnlyPropsInput: Parameters<typeof useTranscriptionTimelineContentViewModel>[0]['textOnlyPropsInput'];

  // ── SectionViewModelsInput deps ──
  selectedTimelineMediaFilename: string | null;
  player: Parameters<typeof useTranscriptionSectionViewModelsInput>[0]['player'];
  waveformDisplayMode: Parameters<typeof useTranscriptionSectionViewModelsInput>[0]['waveformDisplayMode'];
  setWaveformDisplayMode: Parameters<typeof useTranscriptionSectionViewModelsInput>[0]['setWaveformDisplayMode'];
  waveformVisualStyle: Parameters<typeof useTranscriptionSectionViewModelsInput>[0]['waveformVisualStyle'];
  setWaveformVisualStyle: Parameters<typeof useTranscriptionSectionViewModelsInput>[0]['setWaveformVisualStyle'];
  acousticOverlayMode: Parameters<typeof useTranscriptionSectionViewModelsInput>[0]['acousticOverlayMode'];
  setAcousticOverlayMode: Parameters<typeof useTranscriptionSectionViewModelsInput>[0]['setAcousticOverlayMode'];
  globalLoopPlayback: boolean;
  setGlobalLoopPlayback: (v: boolean) => void;
  handleGlobalPlayPauseAction: () => void;
  canUndo: boolean;
  canRedo: boolean;
  undoLabel: string;
  hasSelectedTimelineMedia: boolean;
  hasActiveTextId: boolean;
  selectedTimelineUnit: Parameters<typeof useTranscriptionSectionViewModelsInput>[0]['selectedTimelineUnit'];
  notePopoverOpen: boolean;
  showExportMenu: boolean;
  exportMenuRef: Parameters<typeof useTranscriptionSectionViewModelsInput>[0]['exportMenuRef'];
  loadSnapshot: Parameters<typeof useTranscriptionSectionViewModelsInput>[0]['loadSnapshot'];
  undo: Parameters<typeof useTranscriptionSectionViewModelsInput>[0]['undo'];
  redo: Parameters<typeof useTranscriptionSectionViewModelsInput>[0]['redo'];
  setShowProjectSetup: (v: boolean) => void;
  setShowAudioImport: (v: boolean) => void;
  handleDeleteCurrentAudio: () => void;
  handleDeleteCurrentProject: () => void;
  toggleNotes: () => void;
  setUttOpsMenu: Parameters<typeof useTranscriptionSectionViewModelsInput>[0]['setUttOpsMenu'];
  handleAutoSegment: Parameters<typeof useTranscriptionSectionViewModelsInput>[0]['handleAutoSegment'];
  autoSegmentBusy: boolean;
  setShowExportMenu: Parameters<typeof useTranscriptionSectionViewModelsInput>[0]['setShowExportMenu'];
  handleExportEaf: Parameters<typeof useTranscriptionSectionViewModelsInput>[0]['handleExportEaf'];
  handleExportTextGrid: Parameters<typeof useTranscriptionSectionViewModelsInput>[0]['handleExportTextGrid'];
  handleExportTrs: Parameters<typeof useTranscriptionSectionViewModelsInput>[0]['handleExportTrs'];
  handleExportFlextext: Parameters<typeof useTranscriptionSectionViewModelsInput>[0]['handleExportFlextext'];
  handleExportToolbox: Parameters<typeof useTranscriptionSectionViewModelsInput>[0]['handleExportToolbox'];
  handleExportJyt: Parameters<typeof useTranscriptionSectionViewModelsInput>[0]['handleExportJyt'];
  handleExportJym: Parameters<typeof useTranscriptionSectionViewModelsInput>[0]['handleExportJym'];
  handleImportFile: Parameters<typeof useTranscriptionSectionViewModelsInput>[0]['handleImportFile'];
  utterancesOnCurrentMedia: Parameters<typeof useTranscriptionSectionViewModelsInput>[0]['utterancesOnCurrentMedia'];
  rulerView: Parameters<typeof useTranscriptionSectionViewModelsInput>[0]['rulerView'];
  zoomPxPerSec: number;
  isTimelineLaneHeaderCollapsed: boolean;
  toggleTimelineLaneHeader: () => void;
  waveCanvasRef: Parameters<typeof useTranscriptionSectionViewModelsInput>[0]['waveCanvasRef'];
  tierContainerRef: Parameters<typeof useTranscriptionSectionViewModelsInput>[0]['tierContainerRef'];
  showSearch: boolean;
  searchableItems: Parameters<typeof useTranscriptionSectionViewModelsInput>[0]['searchableItems'];
  orthographies: Parameters<typeof useTranscriptionSectionViewModelsInput>[0]['orthographies'];
  activeLayerIdForEdits: Parameters<typeof useTranscriptionSectionViewModelsInput>[0]['activeLayerIdForEdits'];
  selectedTimelineUtteranceId: string;
  searchOverlayRequest: Parameters<typeof useTranscriptionSectionViewModelsInput>[0]['searchOverlayRequest'];
  manualSelectTsRef: Parameters<typeof useTranscriptionSectionViewModelsInput>[0]['manualSelectTsRef'];
  selectUtterance: Parameters<typeof useTranscriptionSectionViewModelsInput>[0]['selectUtterance'];
  handleSearchReplace: Parameters<typeof useTranscriptionSectionViewModelsInput>[0]['handleSearchReplace'];
  setShowSearch: (v: boolean) => void;
  setSearchOverlayRequest: Parameters<typeof useTranscriptionSectionViewModelsInput>[0]['setSearchOverlayRequest'];

  // ── SidebarSections deps ──
  sidebarSectionsInput: Parameters<typeof useTranscriptionSectionViewModels>[0]['sidebarSectionsInput'];
}

export interface UseOrchestratorViewModelsResult {
  timelineContentViewModel: TranscriptionPageTimelineContentProps;
  toolbarProps: ReturnType<typeof useTranscriptionSectionViewModels>['toolbarProps'];
  timelineTopProps: ReturnType<typeof useTranscriptionSectionViewModels>['timelineTopProps'];
  timelineContentProps: ReturnType<typeof useTranscriptionSectionViewModels>['timelineContentProps'];
  aiSidebarProps: ReturnType<typeof useTranscriptionSectionViewModels>['aiSidebarProps'];
  dialogsProps: ReturnType<typeof useTranscriptionSectionViewModels>['dialogsProps'];
}

export function useOrchestratorViewModels(
  input: UseOrchestratorViewModelsInput,
): UseOrchestratorViewModelsResult {
  const timelineContentViewModel = useTranscriptionTimelineContentViewModel({
    selectedMediaUrl: input.selectedMediaUrl,
    playerIsReady: input.playerIsReady,
    playerDuration: input.playerDuration,
    layersCount: input.layersCount,
    locale: input.locale,
    importFileRef: input.importFileRef,
    layerActionSetCreateTranscription: input.layerActionSetCreateTranscription,
    mediaLanesPropsInput: input.mediaLanesPropsInput,
    textOnlyPropsInput: input.textOnlyPropsInput,
  });

  const sectionViewModelsInput = useTranscriptionSectionViewModelsInput({
    locale: input.locale,
    selectedTimelineMediaFilename: input.selectedTimelineMediaFilename,
    player: input.player,
    waveformDisplayMode: input.waveformDisplayMode,
    setWaveformDisplayMode: input.setWaveformDisplayMode,
    waveformVisualStyle: input.waveformVisualStyle,
    setWaveformVisualStyle: input.setWaveformVisualStyle,
    acousticOverlayMode: input.acousticOverlayMode,
    setAcousticOverlayMode: input.setAcousticOverlayMode,
    globalLoopPlayback: input.globalLoopPlayback,
    setGlobalLoopPlayback: input.setGlobalLoopPlayback,
    handleGlobalPlayPauseAction: input.handleGlobalPlayPauseAction,
    canUndo: input.canUndo,
    canRedo: input.canRedo,
    undoLabel: input.undoLabel,
    hasSelectedTimelineMedia: input.hasSelectedTimelineMedia,
    hasActiveTextId: input.hasActiveTextId,
    selectedTimelineUnit: input.selectedTimelineUnit,
    notePopoverOpen: input.notePopoverOpen,
    showExportMenu: input.showExportMenu,
    importFileRef: input.importFileRef,
    exportMenuRef: input.exportMenuRef,
    loadSnapshot: input.loadSnapshot,
    undo: input.undo,
    redo: input.redo,
    setShowProjectSetup: input.setShowProjectSetup,
    setShowAudioImport: input.setShowAudioImport,
    handleDeleteCurrentAudio: input.handleDeleteCurrentAudio,
    handleDeleteCurrentProject: input.handleDeleteCurrentProject,
    toggleNotes: input.toggleNotes,
    setUttOpsMenu: input.setUttOpsMenu,
    selectedMediaUrl: input.selectedMediaUrl,
    handleAutoSegment: input.handleAutoSegment,
    autoSegmentBusy: input.autoSegmentBusy,
    setShowExportMenu: input.setShowExportMenu,
    handleExportEaf: input.handleExportEaf,
    handleExportTextGrid: input.handleExportTextGrid,
    handleExportTrs: input.handleExportTrs,
    handleExportFlextext: input.handleExportFlextext,
    handleExportToolbox: input.handleExportToolbox,
    handleExportJyt: input.handleExportJyt,
    handleExportJym: input.handleExportJym,
    handleImportFile: input.handleImportFile,
    utterancesOnCurrentMedia: input.utterancesOnCurrentMedia,
    rulerView: input.rulerView,
    zoomPxPerSec: input.zoomPxPerSec,
    isTimelineLaneHeaderCollapsed: input.isTimelineLaneHeaderCollapsed,
    toggleTimelineLaneHeader: input.toggleTimelineLaneHeader,
    waveCanvasRef: input.waveCanvasRef,
    tierContainerRef: input.tierContainerRef,
    showSearch: input.showSearch,
    searchableItems: input.searchableItems,
    orthographies: input.orthographies,
    activeLayerIdForEdits: input.activeLayerIdForEdits,
    selectedTimelineUtteranceId: input.selectedTimelineUtteranceId,
    searchOverlayRequest: input.searchOverlayRequest,
    manualSelectTsRef: input.manualSelectTsRef,
    selectUtterance: input.selectUtterance,
    handleSearchReplace: input.handleSearchReplace,
    setShowSearch: input.setShowSearch,
    setSearchOverlayRequest: input.setSearchOverlayRequest,
    timelineContentProps: timelineContentViewModel,
  });

  const {
    toolbarProps,
    timelineTopProps,
    timelineContentProps,
    aiSidebarProps,
    dialogsProps,
  } = useTranscriptionSectionViewModels({
    ...sectionViewModelsInput,
    sidebarSectionsInput: input.sidebarSectionsInput,
  });

  return {
    timelineContentViewModel,
    toolbarProps,
    timelineTopProps,
    timelineContentProps,
    aiSidebarProps,
    dialogsProps,
  };
}
