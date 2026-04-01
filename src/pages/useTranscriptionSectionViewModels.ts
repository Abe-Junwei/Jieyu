import { useMemo } from 'react';
import type { TranscriptionPageTimelineTopProps } from './TranscriptionPage.TimelineTop';
import type { TranscriptionPageToolbarProps } from './TranscriptionPage.Toolbar';
import {
  useTranscriptionSidebarSectionsViewModel,
} from './useTranscriptionSidebarSectionsViewModel';
import { createTranscriptionExportCallbacks } from './transcriptionExportCallbacks';
import { createTranscriptionTimelineTopProps } from './transcriptionTimelineTopProps';
import { createTranscriptionToolbarProps } from './transcriptionToolbarProps';
import type {
  UseTranscriptionSectionViewModelsInput,
  UseTranscriptionSectionViewModelsResult,
} from './transcriptionSectionViewModelTypes';

interface UseTranscriptionSectionViewModelsResolvedResult extends UseTranscriptionSectionViewModelsResult {
  aiSidebarProps: ReturnType<typeof useTranscriptionSidebarSectionsViewModel>['aiSidebarProps'];
  dialogsProps: ReturnType<typeof useTranscriptionSidebarSectionsViewModel>['dialogsProps'];
}

export function useTranscriptionSectionViewModels(
  input: UseTranscriptionSectionViewModelsInput,
): UseTranscriptionSectionViewModelsResolvedResult {
  const {
    locale,
    selectedTimelineMediaFilename,
    player,
    globalLoopPlayback,
    setGlobalLoopPlayback,
    handleGlobalPlayPauseAction,
    canUndo,
    canRedo,
    undoLabel,
    hasSelectedTimelineMedia,
    hasActiveTextId,
    selectedTimelineUnit,
    notePopoverOpen,
    showExportMenu,
    importFileRef,
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
    selectedMediaUrl,
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
    zoomPxPerSec,
    isTimelineLaneHeaderCollapsed,
    toggleTimelineLaneHeader,
    waveCanvasRef,
    tierContainerRef,
    showSearch,
    searchableItems,
    orthographies,
    activeLayerIdForEdits,
    selectedTimelineUtteranceId,
    searchOverlayRequest,
    manualSelectTsRef,
    selectUtterance,
    handleSearchReplace,
    setShowSearch,
    setSearchOverlayRequest,
    timelineContentProps,
    sidebarSectionsInput,
  } = input;

  const lowConfidenceCount = useMemo(() => utterancesOnCurrentMedia.filter(
    (utterance) => typeof utterance.ai_metadata?.confidence === 'number' && utterance.ai_metadata.confidence < 0.75,
  ).length, [utterancesOnCurrentMedia]);

  const exportCallbacks = useMemo(() => createTranscriptionExportCallbacks({
    setShowExportMenu,
    handleExportEaf,
    handleExportTextGrid,
    handleExportTrs,
    handleExportFlextext,
    handleExportToolbox,
    handleExportJyt,
    handleExportJym,
    handleImportFile,
  }), [handleExportEaf, handleExportFlextext, handleExportJym, handleExportJyt, handleExportTextGrid, handleExportToolbox, handleExportTrs, handleImportFile, setShowExportMenu]);

  const toolbarProps = useMemo<TranscriptionPageToolbarProps>(() => createTranscriptionToolbarProps({
    locale,
    selectedTimelineMediaFilename,
    player,
    globalLoopPlayback,
    setGlobalLoopPlayback,
    handleGlobalPlayPauseAction,
    canUndo,
    canRedo,
    undoLabel,
    hasSelectedTimelineMedia,
    hasActiveTextId,
    selectedTimelineUnit,
    notePopoverOpen,
    showExportMenu,
    importFileRef,
    exportMenuRef,
    loadSnapshot,
    undo,
    redo,
    setShowProjectSetup,
    setShowAudioImport,
    handleDeleteCurrentAudio,
    handleDeleteCurrentProject,
    exportCallbacks,
    toggleNotes,
    setUttOpsMenu,
    lowConfidenceCount,
    selectedMediaUrl,
    handleAutoSegment,
    autoSegmentBusy,
  }), [
    autoSegmentBusy, canRedo, canUndo, exportCallbacks, exportMenuRef, globalLoopPlayback,
    handleAutoSegment, handleDeleteCurrentAudio, handleDeleteCurrentProject, hasActiveTextId,
    hasSelectedTimelineMedia, importFileRef, loadSnapshot, locale, lowConfidenceCount,
    notePopoverOpen, player, redo, selectedMediaUrl, selectedTimelineMediaFilename,
    selectedTimelineUnit, setGlobalLoopPlayback, setShowAudioImport, setShowProjectSetup,
    setUttOpsMenu, showExportMenu, toggleNotes, undo, undoLabel,
  ]);

  const timelineTopProps = useMemo<TranscriptionPageTimelineTopProps>(() => createTranscriptionTimelineTopProps({
    player,
    utterancesOnCurrentMedia,
    rulerView,
    zoomPxPerSec,
    isTimelineLaneHeaderCollapsed,
    toggleTimelineLaneHeader,
    waveCanvasRef,
    tierContainerRef,
    showSearch,
    searchableItems,
    orthographies,
    activeLayerIdForEdits,
    selectedTimelineUtteranceId,
    searchOverlayRequest,
    manualSelectTsRef,
    selectUtterance,
    handleSearchReplace,
    setShowSearch,
    setSearchOverlayRequest,
  }), [
    activeLayerIdForEdits,
    handleSearchReplace,
    isTimelineLaneHeaderCollapsed,
    manualSelectTsRef,
    player,
    rulerView,
    searchOverlayRequest,
    searchableItems,
    orthographies,
    selectUtterance,
    selectedTimelineUtteranceId,
    setSearchOverlayRequest,
    setShowSearch,
    showSearch,
    tierContainerRef,
    toggleTimelineLaneHeader,
    utterancesOnCurrentMedia,
    waveCanvasRef,
    zoomPxPerSec,
  ]);

  const { aiSidebarProps, dialogsProps } = useTranscriptionSidebarSectionsViewModel(sidebarSectionsInput);

  return {
    toolbarProps,
    timelineTopProps,
    timelineContentProps,
    aiSidebarProps,
    dialogsProps,
  };
}
