import { describe, expect, it, vi } from 'vitest';
import { createTranscriptionToolbarProps } from './transcriptionToolbarProps';
import type { TranscriptionReviewPreset } from '../utils/transcriptionReviewQueue';

type ToolbarInput = Parameters<typeof createTranscriptionToolbarProps>[0];

const makeInput = (overrides: Partial<ToolbarInput> = {}): ToolbarInput => ({
  locale: 'zh-CN',
  selectedTimelineMediaFilename: null,
  player: {
    isReady: false,
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
  canUndo: false,
  canRedo: false,
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
  playableAcoustic: false,
  handleAutoSegment: vi.fn(),
  autoSegmentBusy: false,
  ...overrides,
});

describe('createTranscriptionToolbarProps', () => {
  it('disables delete audio when selected media has no playable url', () => {
    const props = createTranscriptionToolbarProps(makeInput({
      hasSelectedTimelineMedia: true,
      selectedMediaUrl: null,
    }));

    expect(props.canDeleteAudio).toBe(false);
  });

  it('enables delete audio when selected media is playable', () => {
    const props = createTranscriptionToolbarProps(makeInput({
      hasSelectedTimelineMedia: true,
      selectedMediaUrl: 'blob:mock-url',
    }));

    expect(props.canDeleteAudio).toBe(true);
  });
});
