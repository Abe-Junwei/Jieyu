import { useCallback, useMemo, useState } from 'react';
import type { TranscriptionPageTimelineTopProps } from './TranscriptionPage.TimelineTop';
import type { TranscriptionPageToolbarProps } from './TranscriptionPage.Toolbar';
import { useTranscriptionSidebarSectionsViewModel } from './useTranscriptionSidebarSectionsViewModel';
import { createTranscriptionExportCallbacks } from './transcriptionExportCallbacks';
import {
  buildTranscriptionReviewItems,
  countTranscriptionReviewPresets,
  filterTranscriptionReviewQueue,
  type TranscriptionReviewPreset,
} from '../utils/transcriptionReviewQueue';
import { createTranscriptionTimelineTopProps } from './transcriptionTimelineTopProps';
import { createTranscriptionToolbarProps } from './transcriptionToolbarProps';
import type { UseTranscriptionSectionViewModelsInput, UseTranscriptionSectionViewModelsResult } from './transcriptionSectionViewModelTypes';

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
    unitsOnCurrentMedia,
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
    activeTimelineUnitId,
    searchOverlayRequest,
    manualSelectTsRef,
    selectUnit,
    handleSearchReplace,
    setShowSearch,
    setSearchOverlayRequest,
    timelineContentProps,
    sidebarSectionsInput,
  } = input;

  const [activeReviewPreset, setActiveReviewPreset] = useState<TranscriptionReviewPreset>('all');

  const lowConfidenceCount = useMemo(() => unitsOnCurrentMedia.filter(
    (unit) => typeof unit.ai_metadata?.confidence === 'number' && unit.ai_metadata.confidence < 0.75,
  ).length, [unitsOnCurrentMedia]);

  const reviewItems = useMemo(
    () => buildTranscriptionReviewItems(unitsOnCurrentMedia),
    [unitsOnCurrentMedia],
  );

  const reviewPresetCounts = useMemo(
    () => countTranscriptionReviewPresets(reviewItems),
    [reviewItems],
  );

  const reviewQueue = useMemo(
    () => filterTranscriptionReviewQueue(reviewItems, activeReviewPreset),
    [activeReviewPreset, reviewItems],
  );

  const focusReviewUnit = useCallback((unitId: string) => {
    const target = unitsOnCurrentMedia.find((unit) => unit.id === unitId);
    if (!target) return;
    manualSelectTsRef.current = Date.now();
    selectUnit(unitId);
    player.seekTo(target.startTime);
  }, [manualSelectTsRef, player, selectUnit, unitsOnCurrentMedia]);

  const activeReviewIndex = useMemo(() => reviewQueue.findIndex((unit) => unit.id === selectedTimelineUnit?.unitId), [reviewQueue, selectedTimelineUnit?.unitId]);

  const handleOpenReviewIssues = useCallback(() => {
    const target = reviewQueue[activeReviewIndex >= 0 ? activeReviewIndex : 0];
    if (target) focusReviewUnit(target.id);
  }, [activeReviewIndex, focusReviewUnit, reviewQueue]);

  const handleStepReviewIssue = useCallback((direction: -1 | 1) => {
    if (reviewQueue.length === 0) return;
    const currentIndex = activeReviewIndex >= 0 ? activeReviewIndex : 0;
    const nextIndex = (currentIndex + direction + reviewQueue.length) % reviewQueue.length;
    const next = reviewQueue[nextIndex];
    if (!next) return;
    focusReviewUnit(next.id);
  }, [activeReviewIndex, focusReviewUnit, reviewQueue]);

  const handleSelectReviewPreset = useCallback((preset: TranscriptionReviewPreset) => {
    setActiveReviewPreset(preset);
    const next = filterTranscriptionReviewQueue(reviewItems, preset)[0];
    if (next) focusReviewUnit(next.id);
  }, [focusReviewUnit, reviewItems]);

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
    reviewIssueCount: reviewPresetCounts.all,
    reviewPresetCounts,
    activeReviewPreset,
    onSelectReviewPreset: handleSelectReviewPreset,
    onOpenReviewIssues: handleOpenReviewIssues,
    onReviewPrev: () => handleStepReviewIssue(-1),
    onReviewNext: () => handleStepReviewIssue(1),
    selectedMediaUrl,
    handleAutoSegment,
    autoSegmentBusy,
  }), [
    activeReviewPreset, autoSegmentBusy, canRedo, canUndo, exportCallbacks, exportMenuRef, globalLoopPlayback,
    handleAutoSegment, handleDeleteCurrentAudio, handleDeleteCurrentProject, handleOpenReviewIssues, handleSelectReviewPreset, handleStepReviewIssue, hasActiveTextId,
    hasSelectedTimelineMedia, importFileRef, loadSnapshot, locale, lowConfidenceCount,
    notePopoverOpen, player, redo, reviewPresetCounts, selectedMediaUrl, selectedTimelineMediaFilename,
    selectedTimelineUnit, setGlobalLoopPlayback, setShowAudioImport, setShowProjectSetup,
    setWaveformDisplayMode,
    setUttOpsMenu, setWaveformVisualStyle, setAcousticOverlayMode, showExportMenu, toggleNotes, undo, undoLabel,
    acousticOverlayMode,
    waveformDisplayMode,
    waveformVisualStyle,
  ]);

  const timelineTopProps = useMemo<TranscriptionPageTimelineTopProps>(() => createTranscriptionTimelineTopProps({
    player,
    unitsOnCurrentMedia,
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
    activeTimelineUnitId,
    searchOverlayRequest,
    manualSelectTsRef,
    selectUnit,
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
    selectUnit,
    activeTimelineUnitId,
    setSearchOverlayRequest,
    setShowSearch,
    showSearch,
    tierContainerRef,
    toggleTimelineLaneHeader,
    unitsOnCurrentMedia,
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
