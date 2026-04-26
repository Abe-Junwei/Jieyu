import type { RefObject } from 'react';
import type { TimelineUnit } from '../hooks/transcriptionTypes';
import { t, type Locale } from '../i18n';
import { DOCUMENT_PLACEHOLDER_TRACK_FILENAME } from '../utils/mediaItemTimelineKind';
import type { AcousticOverlayMode } from '../utils/acousticOverlayTypes';
import type { WaveformDisplayMode } from '../utils/waveformDisplayMode';
import type { WaveformVisualStyle } from '../utils/waveformVisualStyle';
import { canDeleteCurrentAudio } from './transcriptionMediaGuards';
import { recordTranscriptionKeyboardAction } from '../services/transcriptionKeyboardActionTelemetry';
import type { UttOpsMenuState } from './TranscriptionPage.UIState';
import type { TranscriptionPageToolbarProps } from './TranscriptionPage.Toolbar';
import type { TranscriptionReviewPreset } from '../utils/transcriptionReviewQueue';
import type { ActionId } from '../services/IntentRouter';

const DISPLAY_MODE_TO_ACTION: Record<WaveformDisplayMode, ActionId> = {
  waveform: 'toolbarDisplayModeWaveform',
  spectrogram: 'toolbarDisplayModeSpectrogram',
  split: 'toolbarDisplayModeSplit',
};

const VISUAL_STYLE_TO_ACTION: Record<WaveformVisualStyle, ActionId> = {
  balanced: 'toolbarVisualStyleBalanced',
  dense: 'toolbarVisualStyleDense',
  contrast: 'toolbarVisualStyleContrast',
  line: 'toolbarVisualStyleLine',
};

const ACOUSTIC_TO_ACTION: Record<AcousticOverlayMode, ActionId> = {
  none: 'toolbarAcousticOverlayNone',
  f0: 'toolbarAcousticOverlayF0',
  intensity: 'toolbarAcousticOverlayIntensity',
  both: 'toolbarAcousticOverlayBoth',
};

const REVIEW_PRESET_TO_ACTION: Record<TranscriptionReviewPreset, ActionId> = {
  all: 'toolbarReviewPresetAll',
  time: 'toolbarReviewPresetTime',
  content_concern: 'toolbarReviewPresetContentConcern',
  content_missing: 'toolbarReviewPresetContentMissing',
  manual_attention: 'toolbarReviewPresetManualAttention',
  pending_review: 'toolbarReviewPresetPendingReview',
};

let lastToolbarVolumeTelemetryMs = 0;
const TOOLBAR_VOLUME_TELEMETRY_INTERVAL_MS = 350;

function recordToolbarVolumeTelemetryThrottled(): void {
  const now = Date.now();
  if (now - lastToolbarVolumeTelemetryMs < TOOLBAR_VOLUME_TELEMETRY_INTERVAL_MS) return;
  lastToolbarVolumeTelemetryMs = now;
  recordTranscriptionKeyboardAction('toolbarVolumeChange');
}

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
    onPlaybackRateChange: (rate) => {
      recordTranscriptionKeyboardAction('toolbarPlaybackRateChange');
      input.player.setPlaybackRate(rate);
    },
    waveformDisplayMode: input.waveformDisplayMode,
    onWaveformDisplayModeChange: (mode) => {
      recordTranscriptionKeyboardAction(DISPLAY_MODE_TO_ACTION[mode]);
      input.setWaveformDisplayMode(mode);
    },
    waveformVisualStyle: input.waveformVisualStyle,
    onWaveformVisualStyleChange: (style) => {
      recordTranscriptionKeyboardAction(VISUAL_STYLE_TO_ACTION[style]);
      input.setWaveformVisualStyle(style);
    },
    acousticOverlayMode: input.acousticOverlayMode,
    onAcousticOverlayModeChange: (mode) => {
      recordTranscriptionKeyboardAction(ACOUSTIC_TO_ACTION[mode]);
      input.setAcousticOverlayMode(mode);
    },
    volume: input.player.volume,
    onVolumeChange: (vol) => {
      recordToolbarVolumeTelemetryThrottled();
      input.player.setVolume(vol);
    },
    loop: input.globalLoopPlayback,
    onLoopChange: (loop) => {
      recordTranscriptionKeyboardAction('toggleGlobalLoop');
      input.setGlobalLoopPlayback(loop);
    },
    onTogglePlayback: () => {
      recordTranscriptionKeyboardAction('playPause');
      input.handleGlobalPlayPauseAction();
    },
    onSeek: (delta) => {
      recordTranscriptionKeyboardAction(delta < 0 ? 'seekBack10Sec' : 'seekForward10Sec');
      input.player.seekBySeconds(delta);
    },
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
    onRefresh: () => {
      recordTranscriptionKeyboardAction('toolbarRefresh');
      void input.loadSnapshot();
    },
    onUndo: () => {
      recordTranscriptionKeyboardAction('undo');
      void input.undo();
    },
    onRedo: () => {
      recordTranscriptionKeyboardAction('redo');
      void input.redo();
    },
    onOpenProjectSetup: () => {
      recordTranscriptionKeyboardAction('toolbarOpenProjectSetup');
      input.setShowProjectSetup(true);
    },
    onOpenAudioImport: () => {
      recordTranscriptionKeyboardAction('toolbarOpenAudioImport');
      input.setShowAudioImport(true);
    },
    onDeleteCurrentAudio: () => {
      recordTranscriptionKeyboardAction('deleteTimelineAudio');
      input.handleDeleteCurrentAudio();
    },
    onDeleteCurrentProject: () => {
      recordTranscriptionKeyboardAction('deleteTranscriptionProject');
      input.handleDeleteCurrentProject();
    },
    exportCallbacks: input.exportCallbacks,
    onToggleNotes: () => {
      recordTranscriptionKeyboardAction('toggleNotes');
      input.toggleNotes();
    },
    onOpenUttOpsMenu: (x, y) => {
      recordTranscriptionKeyboardAction('toolbarOpenUttOpsMenu');
      input.setUttOpsMenu({ x, y });
    },
    lowConfidenceCount: input.lowConfidenceCount,
    reviewIssueCount: input.reviewIssueCount,
    reviewPresetCounts: input.reviewPresetCounts,
    activeReviewPreset: input.activeReviewPreset,
    onSelectReviewPreset: (preset) => {
      recordTranscriptionKeyboardAction(REVIEW_PRESET_TO_ACTION[preset]);
      input.onSelectReviewPreset(preset);
    },
    onOpenReviewIssues: input.onOpenReviewIssues,
    onReviewPrev: () => {
      recordTranscriptionKeyboardAction('reviewPrev');
      input.onReviewPrev();
    },
    onReviewNext: () => {
      recordTranscriptionKeyboardAction('reviewNext');
      input.onReviewNext();
    },
    ...(input.playableAcoustic ? {
      onAutoSegment: () => {
        recordTranscriptionKeyboardAction('autoSegmentRun');
        input.handleAutoSegment();
      },
    } : {}),
    autoSegmentBusy: input.autoSegmentBusy,
  };
}
