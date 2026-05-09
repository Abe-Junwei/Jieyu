import { useMemo } from 'react';
import type { TranscriptionPageToolbarProps } from './TranscriptionPage.Toolbar';
import { createTranscriptionToolbarProps } from './transcriptionToolbarProps';
import type { UseTranscriptionSectionViewModelsInput } from './transcriptionSectionViewModelTypes';
import type { createTranscriptionExportCallbacks } from './transcriptionExportCallbacks';
import type { TranscriptionReviewPreset } from '../utils/transcriptionReviewQueue';

export interface UseTranscriptionToolbarPropsInput extends Pick<
  UseTranscriptionSectionViewModelsInput,
  | 'locale'
  | 'selectedTimelineMediaFilename'
  | 'player'
  | 'waveformDisplayMode'
  | 'setWaveformDisplayMode'
  | 'waveformVisualStyle'
  | 'setWaveformVisualStyle'
  | 'acousticOverlayMode'
  | 'setAcousticOverlayMode'
  | 'globalLoopPlayback'
  | 'setGlobalLoopPlayback'
  | 'handleGlobalPlayPauseAction'
  | 'canUndo'
  | 'canRedo'
  | 'undoLabel'
  | 'hasSelectedTimelineMedia'
  | 'hasActiveTextId'
  | 'selectedTimelineUnit'
  | 'notePopoverOpen'
  | 'showExportMenu'
  | 'importFileRef'
  | 'exportMenuRef'
  | 'loadSnapshot'
  | 'undo'
  | 'redo'
  | 'setShowProjectSetup'
  | 'setShowAudioImport'
  | 'handleDeleteCurrentAudio'
  | 'handleDeleteCurrentProject'
  | 'toggleNotes'
  | 'setUttOpsMenu'
  | 'selectedMediaUrl'
  | 'playableAcoustic'
  | 'handleAutoSegment'
  | 'autoSegmentBusy'
> {
  exportCallbacks: ReturnType<typeof createTranscriptionExportCallbacks>;
  lowConfidenceCount: number;
  reviewIssueCount: number;
  reviewPresetCounts: Record<TranscriptionReviewPreset, number>;
  activeReviewPreset: TranscriptionReviewPreset;
  onSelectReviewPreset: (preset: TranscriptionReviewPreset) => void;
  onOpenReviewIssues: () => void;
  onReviewPrev: () => void;
  onReviewNext: () => void;
}

export function useTranscriptionToolbarProps(
  input: UseTranscriptionToolbarPropsInput,
): TranscriptionPageToolbarProps {
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
    exportCallbacks,
    toggleNotes,
    setUttOpsMenu,
    lowConfidenceCount,
    reviewIssueCount,
    reviewPresetCounts,
    activeReviewPreset,
    onSelectReviewPreset,
    onOpenReviewIssues,
    onReviewPrev,
    onReviewNext,
    selectedMediaUrl,
    playableAcoustic,
    handleAutoSegment,
    autoSegmentBusy,
  } = input;

  return useMemo<TranscriptionPageToolbarProps>(
    () =>
      createTranscriptionToolbarProps({
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
        reviewIssueCount,
        reviewPresetCounts,
        activeReviewPreset,
        onSelectReviewPreset,
        onOpenReviewIssues,
        onReviewPrev,
        onReviewNext,
        selectedMediaUrl,
        playableAcoustic,
        handleAutoSegment,
        autoSegmentBusy,
      }),
    [
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
      reviewIssueCount,
      reviewPresetCounts,
      activeReviewPreset,
      onSelectReviewPreset,
      onOpenReviewIssues,
      onReviewPrev,
      onReviewNext,
      selectedMediaUrl,
      playableAcoustic,
      handleAutoSegment,
      autoSegmentBusy,
    ],
  );
}
