import type { RefObject } from 'react';
import type { TimelineUnit } from '../hooks/transcriptionTypes';
import { t, type Locale } from '../i18n';
import { DOCUMENT_PLACEHOLDER_TRACK_FILENAME } from '../utils/mediaItemTimelineKind';
import type { AcousticOverlayMode } from '../utils/acousticOverlayTypes';
import type { WaveformDisplayMode } from '../utils/waveformDisplayMode';
import type { WaveformVisualStyle } from '../utils/waveformVisualStyle';
import { canDeleteCurrentAudio } from './transcriptionMediaGuards';
import type { UttOpsMenuState } from './TranscriptionPage.UIState';
import type { TranscriptionPageToolbarProps } from './TranscriptionPage.Toolbar';
import type { TranscriptionReviewPreset } from '../utils/transcriptionReviewQueue';

interface CreateTranscriptionToolbarPropsInput {
  locale: string;
  selectedTimelineMediaFilename: string | null;
  player: {
    isReady: boolean;
    isPlaying: boolean;
    playbackRate: number;
    setPlaybackRate: (rate: number) => void;
    volume: number;
    setVolume: (volume: number) => void;
    seekBySeconds: (delta: number) => void;
  };
  waveformDisplayMode: WaveformDisplayMode;
  setWaveformDisplayMode: (mode: WaveformDisplayMode) => void;
  waveformVisualStyle: WaveformVisualStyle;
  setWaveformVisualStyle: (style: WaveformVisualStyle) => void;
  acousticOverlayMode: AcousticOverlayMode;
  setAcousticOverlayMode: (mode: AcousticOverlayMode) => void;
  globalLoopPlayback: boolean;
  setGlobalLoopPlayback: (loop: boolean) => void;
  handleGlobalPlayPauseAction: () => void;
  canUndo: boolean;
  canRedo: boolean;
  undoLabel: string;
  hasSelectedTimelineMedia: boolean;
  hasActiveTextId: boolean;
  selectedTimelineUnit: TimelineUnit | null;
  notePopoverOpen: boolean;
  showExportMenu: boolean;
  importFileRef: RefObject<HTMLInputElement | null>;
  exportMenuRef: RefObject<HTMLDivElement | null>;
  loadSnapshot: () => Promise<void>;
  undo: () => Promise<void>;
  redo: () => Promise<void>;
  setShowProjectSetup: (value: boolean) => void;
  setShowAudioImport: (value: boolean) => void;
  handleDeleteCurrentAudio: () => void;
  handleDeleteCurrentProject: () => void;
  exportCallbacks: TranscriptionPageToolbarProps['exportCallbacks'];
  toggleNotes: () => void;
  setUttOpsMenu: (state: UttOpsMenuState | null) => void;
  lowConfidenceCount: number;
  reviewIssueCount: number;
  reviewPresetCounts: Record<TranscriptionReviewPreset, number>;
  activeReviewPreset: TranscriptionReviewPreset;
  onSelectReviewPreset: (preset: TranscriptionReviewPreset) => void;
  onOpenReviewIssues: () => void;
  onReviewPrev: () => void;
  onReviewNext: () => void;
  selectedMediaUrl: string | null;
  playableAcoustic: boolean;
  handleAutoSegment: () => void;
  autoSegmentBusy: boolean;
}

export function createTranscriptionToolbarProps(
  input: CreateTranscriptionToolbarPropsInput,
): TranscriptionPageToolbarProps {
  const locale = input.locale as Locale;
  const rawFilename = input.selectedTimelineMediaFilename;
  const toolbarFilename = rawFilename == null
    ? t(locale, 'transcription.media.unbound')
    : rawFilename === DOCUMENT_PLACEHOLDER_TRACK_FILENAME
      ? t(locale, 'transcription.timelineAxisStatus.placeholderAxis')
      : rawFilename;

  return {
    filename: toolbarFilename,
    isReady: input.player.isReady,
    isPlaying: input.player.isPlaying,
    playbackRate: input.player.playbackRate,
    onPlaybackRateChange: input.player.setPlaybackRate,
    waveformDisplayMode: input.waveformDisplayMode,
    onWaveformDisplayModeChange: input.setWaveformDisplayMode,
    waveformVisualStyle: input.waveformVisualStyle,
    onWaveformVisualStyleChange: input.setWaveformVisualStyle,
    acousticOverlayMode: input.acousticOverlayMode,
    onAcousticOverlayModeChange: input.setAcousticOverlayMode,
    volume: input.player.volume,
    onVolumeChange: input.player.setVolume,
    loop: input.globalLoopPlayback,
    onLoopChange: input.setGlobalLoopPlayback,
    onTogglePlayback: input.handleGlobalPlayPauseAction,
    onSeek: input.player.seekBySeconds,
    canUndo: input.canUndo,
    canRedo: input.canRedo,
    undoLabel: input.undoLabel,
    canDeleteAudio: canDeleteCurrentAudio({
      hasSelectedTimelineMedia: input.hasSelectedTimelineMedia,
      selectedMediaUrl: input.selectedMediaUrl,
    }),
    canDeleteProject: input.hasActiveTextId,
    canToggleNotes: Boolean((input.selectedTimelineUnit?.kind === 'unit' && input.selectedTimelineUnit.unitId) || input.notePopoverOpen),
    canOpenUttOpsMenu: Boolean(input.selectedTimelineUnit?.unitId),
    notePopoverOpen: input.notePopoverOpen,
    showExportMenu: input.showExportMenu,
    importFileRef: input.importFileRef,
    exportMenuRef: input.exportMenuRef,
    onRefresh: () => { void input.loadSnapshot(); },
    onUndo: () => { void input.undo(); },
    onRedo: () => { void input.redo(); },
    onOpenProjectSetup: () => input.setShowProjectSetup(true),
    onOpenAudioImport: () => input.setShowAudioImport(true),
    onDeleteCurrentAudio: input.handleDeleteCurrentAudio,
    onDeleteCurrentProject: input.handleDeleteCurrentProject,
    exportCallbacks: input.exportCallbacks,
    onToggleNotes: input.toggleNotes,
    onOpenUttOpsMenu: (x, y) => input.setUttOpsMenu({ x, y }),
    lowConfidenceCount: input.lowConfidenceCount,
    reviewIssueCount: input.reviewIssueCount,
    reviewPresetCounts: input.reviewPresetCounts,
    activeReviewPreset: input.activeReviewPreset,
    onSelectReviewPreset: input.onSelectReviewPreset,
    onOpenReviewIssues: input.onOpenReviewIssues,
    onReviewPrev: input.onReviewPrev,
    onReviewNext: input.onReviewNext,
    ...(input.playableAcoustic ? { onAutoSegment: input.handleAutoSegment } : {}),
    autoSegmentBusy: input.autoSegmentBusy,
  };
}
