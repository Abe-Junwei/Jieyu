import { useMemo } from 'react';
import type { TranscriptionPageTimelineTopProps } from './TranscriptionPage.TimelineTop';
import { useTranscriptionSidebarSectionsViewModel } from './useTranscriptionSidebarSectionsViewModel';
import { createTranscriptionExportCallbacks } from './transcriptionExportCallbacks';
import { createTranscriptionTimelineTopProps } from './transcriptionTimelineTopProps';
import type {
  UseTranscriptionSectionViewModelsInput,
  UseTranscriptionSectionViewModelsResult,
} from './transcriptionSectionViewModelTypes';
import { useTranscriptionReviewSectionViewModel } from './useTranscriptionReviewSectionViewModel';
import { useTranscriptionToolbarProps } from './useTranscriptionToolbarProps';

interface UseTranscriptionSectionViewModelsResolvedResult extends UseTranscriptionSectionViewModelsResult {
  aiSidebarProps: ReturnType<typeof useTranscriptionSidebarSectionsViewModel>['aiSidebarProps'];
  dialogsProps: ReturnType<typeof useTranscriptionSidebarSectionsViewModel>['dialogsProps'];
}

export function useTranscriptionSectionViewModels(
  input: UseTranscriptionSectionViewModelsInput,
): UseTranscriptionSectionViewModelsResolvedResult {
  const {
    player,
    selectedTimelineUnit,
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

  const reviewVM = useTranscriptionReviewSectionViewModel({
    unitsOnCurrentMedia,
    selectedTimelineUnit,
    manualSelectTsRef,
    selectUnit,
    player,
  });

  const exportCallbacks = useMemo(
    () =>
      createTranscriptionExportCallbacks({
        setShowExportMenu,
        handleExportEaf,
        handleExportTextGrid,
        handleExportTrs,
        handleExportFlextext,
        handleExportToolbox,
        handleExportJyt,
        handleExportJym,
        handleImportFile,
      }),
    [
      handleExportEaf,
      handleExportFlextext,
      handleExportJym,
      handleExportJyt,
      handleExportTextGrid,
      handleExportToolbox,
      handleExportTrs,
      handleImportFile,
      setShowExportMenu,
    ],
  );

  const toolbarProps = useTranscriptionToolbarProps({
    ...input,
    exportCallbacks,
    lowConfidenceCount: reviewVM.lowConfidenceCount,
    reviewIssueCount: reviewVM.reviewPresetCounts.all,
    reviewPresetCounts: reviewVM.reviewPresetCounts,
    activeReviewPreset: reviewVM.activeReviewPreset,
    onSelectReviewPreset: reviewVM.handleSelectReviewPreset,
    onOpenReviewIssues: reviewVM.handleOpenReviewIssues,
    onReviewPrev: () => {
      reviewVM.handleStepReviewIssue(-1);
    },
    onReviewNext: () => {
      reviewVM.handleStepReviewIssue(1);
    },
  });

  const timelineTopProps = useMemo<TranscriptionPageTimelineTopProps>(
    () =>
      createTranscriptionTimelineTopProps({
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
      }),
    [
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
    ],
  );

  const { aiSidebarProps, dialogsProps } =
    useTranscriptionSidebarSectionsViewModel(sidebarSectionsInput);

  return {
    toolbarProps,
    timelineTopProps,
    timelineContentProps,
    aiSidebarProps,
    dialogsProps,
  };
}
