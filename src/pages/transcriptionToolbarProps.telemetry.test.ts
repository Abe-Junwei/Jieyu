import { afterEach, describe, expect, it, vi } from 'vitest';

const mockRecord = vi.fn();
vi.mock('../utils/transcriptionKeyboardActionTelemetry', () => ({
  recordTranscriptionKeyboardAction: (...args: unknown[]) => mockRecord(...args),
}));

import { createTranscriptionToolbarProps } from './transcriptionToolbarProps';
import type { TranscriptionReviewPreset } from '../utils/transcriptionReviewQueue';

type ToolbarInput = Parameters<typeof createTranscriptionToolbarProps>[0];

const makeInput = (overrides: Partial<ToolbarInput> = {}): ToolbarInput => ({
  locale: 'zh-CN',
  selectedTimelineMediaFilename: null,
  player: {
    isReady: true,
    isPlaying: false,
    playbackRate: 1,
    setPlaybackRate: vi.fn(),
    volume: 1,
    setVolume: vi.fn(),
    seekBySeconds: vi.fn(),
  },
  waveformDisplayMode: 'waveform',
  setWaveformDisplayMode: vi.fn(),
  waveformVisualStyle: 'balanced',
  setWaveformVisualStyle: vi.fn(),
  acousticOverlayMode: 'none',
  setAcousticOverlayMode: vi.fn(),
  globalLoopPlayback: false,
  setGlobalLoopPlayback: vi.fn(),
  handleGlobalPlayPauseAction: vi.fn(),
  canUndo: true,
  canRedo: true,
  undoLabel: '',
  hasSelectedTimelineMedia: false,
  hasActiveTextId: false,
  selectedTimelineUnit: null,
  notePopoverOpen: false,
  showExportMenu: false,
  importFileRef: { current: null },
  exportMenuRef: { current: null },
  loadSnapshot: vi.fn(async () => {}),
  undo: vi.fn(async () => {}),
  redo: vi.fn(async () => {}),
  setShowProjectSetup: vi.fn(),
  setShowAudioImport: vi.fn(),
  handleDeleteCurrentAudio: vi.fn(),
  handleDeleteCurrentProject: vi.fn(),
  exportCallbacks: {} as ToolbarInput['exportCallbacks'],
  toggleNotes: vi.fn(),
  setUttOpsMenu: vi.fn(),
  lowConfidenceCount: 0,
  reviewIssueCount: 0,
  reviewPresetCounts: {} as Record<TranscriptionReviewPreset, number>,
  activeReviewPreset: 'all' as TranscriptionReviewPreset,
  onSelectReviewPreset: vi.fn(),
  onOpenReviewIssues: vi.fn(),
  onReviewPrev: vi.fn(),
  onReviewNext: vi.fn(),
  selectedMediaUrl: null,
  playableAcoustic: true,
  handleAutoSegment: vi.fn(),
  autoSegmentBusy: false,
  ...overrides,
});

describe('createTranscriptionToolbarProps text-modality telemetry', () => {
  afterEach(() => {
    mockRecord.mockClear();
  });

  it('records playPause then invokes global play handler', () => {
    const handleGlobalPlayPauseAction = vi.fn();
    const props = createTranscriptionToolbarProps(makeInput({ handleGlobalPlayPauseAction }));
    props.onTogglePlayback();
    expect(mockRecord).toHaveBeenCalledWith('playPause');
    expect(handleGlobalPlayPauseAction).toHaveBeenCalledTimes(1);
  });

  it('records seek direction for ±10s toolbar seeks', () => {
    const props = createTranscriptionToolbarProps(makeInput());
    props.onSeek(-10);
    expect(mockRecord).toHaveBeenLastCalledWith('seekBack10Sec');
    props.onSeek(10);
    expect(mockRecord).toHaveBeenLastCalledWith('seekForward10Sec');
  });

  it('records playback rate and display mode toolbar actions', () => {
    const setPlaybackRate = vi.fn();
    const setWaveformDisplayMode = vi.fn();
    const base = makeInput();
    const props = createTranscriptionToolbarProps({
      ...base,
      player: { ...base.player, setPlaybackRate },
      setWaveformDisplayMode,
    });
    props.onPlaybackRateChange(1.5);
    expect(mockRecord).toHaveBeenLastCalledWith('toolbarPlaybackRateChange');
    expect(setPlaybackRate).toHaveBeenCalledWith(1.5);
    props.onWaveformDisplayModeChange('spectrogram');
    expect(mockRecord).toHaveBeenLastCalledWith('toolbarDisplayModeSpectrogram');
    expect(setWaveformDisplayMode).toHaveBeenCalledWith('spectrogram');
  });

  it('records review preset selection from toolbar props', () => {
    const onSelectReviewPreset = vi.fn();
    const props = createTranscriptionToolbarProps(makeInput({ onSelectReviewPreset }));
    expect(props.onSelectReviewPreset).toBeDefined();
    props.onSelectReviewPreset!('time');
    expect(mockRecord).toHaveBeenLastCalledWith('toolbarReviewPresetTime');
    expect(onSelectReviewPreset).toHaveBeenCalledWith('time');
  });
});
