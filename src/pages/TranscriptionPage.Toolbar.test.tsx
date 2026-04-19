/**
 * @vitest-environment jsdom
 */

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LocaleProvider } from '../i18n';
import { TranscriptionPageToolbar } from './TranscriptionPage.Toolbar';

describe('TranscriptionPageToolbar', () => {
  it('renders runtime progress badges in the top waveform toolbar', () => {
    render(
      <LocaleProvider locale="zh-CN">
        <TranscriptionPageToolbar
          filename="demo.wav"
          isReady
          isPlaying={false}
          playbackRate={1}
          onPlaybackRateChange={vi.fn()}
          waveformDisplayMode="waveform"
          onWaveformDisplayModeChange={vi.fn()}
          waveformVisualStyle="balanced"
          onWaveformVisualStyleChange={vi.fn()}
          acousticOverlayMode="both"
          onAcousticOverlayModeChange={vi.fn()}
          volume={0.5}
          onVolumeChange={vi.fn()}
          loop={false}
          onLoopChange={vi.fn()}
          onTogglePlayback={vi.fn()}
          onSeek={vi.fn()}
          canUndo={false}
          canRedo={false}
          undoLabel=""
          canDeleteAudio={false}
          canDeleteProject={false}
          canToggleNotes={false}
          canOpenUttOpsMenu={false}
          notePopoverOpen={false}
          showExportMenu={false}
          importFileRef={{ current: null }}
          exportMenuRef={{ current: null }}
          exportCallbacks={{
            onToggleExportMenu: vi.fn(),
            onExportEaf: vi.fn(),
            onExportTextGrid: vi.fn(),
            onExportTrs: vi.fn(),
            onExportFlextext: vi.fn(),
            onExportToolbox: vi.fn(),
            onExportJyt: vi.fn(async () => undefined),
            onExportJym: vi.fn(async () => undefined),
            onImportFile: vi.fn(),
          }}
          onRefresh={vi.fn()}
          onUndo={vi.fn()}
          onRedo={vi.fn()}
          onOpenProjectSetup={vi.fn()}
          onOpenAudioImport={vi.fn()}
          onDeleteCurrentAudio={vi.fn()}
          onDeleteCurrentProject={vi.fn()}
          onToggleNotes={vi.fn()}
          onOpenUttOpsMenu={vi.fn()}
          acousticRuntimeStatus={{ state: 'loading', phase: 'analyzing', progressRatio: 0.4, processedFrames: 40, totalFrames: 100 }}
          vadCacheStatus={{ state: 'warming', engine: 'silero', progressRatio: 0.25, processedFrames: 25, totalFrames: 100 }}
        />
      </LocaleProvider>,
    );

    expect(screen.getByText('分析进度 40%')).toBeTruthy();
    expect(screen.getByText('VAD 缓存 25%')).toBeTruthy();
  });

  it('renders the moved review preset chooser in the top toolbar', () => {
    const onReviewPrev = vi.fn();
    const onReviewNext = vi.fn();
    const onOpenReviewIssues = vi.fn();
    const onSelectReviewPreset = vi.fn();

    render(
      <LocaleProvider locale="zh-CN">
        <TranscriptionPageToolbar
          filename="demo.wav"
          isReady
          isPlaying={false}
          playbackRate={1}
          onPlaybackRateChange={vi.fn()}
          waveformDisplayMode="waveform"
          onWaveformDisplayModeChange={vi.fn()}
          waveformVisualStyle="balanced"
          onWaveformVisualStyleChange={vi.fn()}
          acousticOverlayMode="both"
          onAcousticOverlayModeChange={vi.fn()}
          volume={0.5}
          onVolumeChange={vi.fn()}
          loop={false}
          onLoopChange={vi.fn()}
          onTogglePlayback={vi.fn()}
          onSeek={vi.fn()}
          canUndo={false}
          canRedo={false}
          undoLabel=""
          canDeleteAudio={false}
          canDeleteProject={false}
          canToggleNotes={false}
          canOpenUttOpsMenu={false}
          notePopoverOpen={false}
          showExportMenu={false}
          importFileRef={{ current: null }}
          exportMenuRef={{ current: null }}
          exportCallbacks={{
            onToggleExportMenu: vi.fn(),
            onExportEaf: vi.fn(),
            onExportTextGrid: vi.fn(),
            onExportTrs: vi.fn(),
            onExportFlextext: vi.fn(),
            onExportToolbox: vi.fn(),
            onExportJyt: vi.fn(async () => undefined),
            onExportJym: vi.fn(async () => undefined),
            onImportFile: vi.fn(),
          }}
          onRefresh={vi.fn()}
          onUndo={vi.fn()}
          onRedo={vi.fn()}
          onOpenProjectSetup={vi.fn()}
          onOpenAudioImport={vi.fn()}
          onDeleteCurrentAudio={vi.fn()}
          onDeleteCurrentProject={vi.fn()}
          onToggleNotes={vi.fn()}
          onOpenUttOpsMenu={vi.fn()}
          reviewIssueCount={3}
          reviewPresetCounts={{
            all: 3,
            time: 0,
            content_concern: 1,
            content_missing: 2,
            manual_attention: 0,
            pending_review: 1,
          }}
          activeReviewPreset="all"
          onSelectReviewPreset={onSelectReviewPreset}
          onReviewPrev={onReviewPrev}
          onReviewNext={onReviewNext}
          onOpenReviewIssues={onOpenReviewIssues}
        />
      </LocaleProvider>,
    );

    const prevButton = screen.getByRole('button', { name: '上一条待复核' });
    const nextButton = screen.getByRole('button', { name: '下一条待复核' });
    const summaryButton = screen.getByRole('button', { name: '全部问题 3' });

    fireEvent.click(prevButton);
    fireEvent.click(nextButton);
    fireEvent.click(summaryButton);
    fireEvent.click(screen.getByRole('button', { name: /内容缺失/ }));

    expect(summaryButton.closest('.transcription-wave-toolbar-left')).toBeTruthy();
    expect(summaryButton.closest('.transcription-wave-toolbar-right')).toBeNull();
    expect(onReviewPrev).toHaveBeenCalledTimes(1);
    expect(onReviewNext).toHaveBeenCalledTimes(1);
    expect(onSelectReviewPreset).toHaveBeenCalledWith('content_missing');
    expect(onOpenReviewIssues).toHaveBeenCalledTimes(1);
  });

  it('keeps the all-issues entry visible in the top toolbar even when the current count is zero', () => {
    render(
      <LocaleProvider locale="zh-CN">
        <TranscriptionPageToolbar
          filename="demo.wav"
          isReady
          isPlaying={false}
          playbackRate={1}
          onPlaybackRateChange={vi.fn()}
          waveformDisplayMode="waveform"
          onWaveformDisplayModeChange={vi.fn()}
          waveformVisualStyle="balanced"
          onWaveformVisualStyleChange={vi.fn()}
          acousticOverlayMode="both"
          onAcousticOverlayModeChange={vi.fn()}
          volume={0.5}
          onVolumeChange={vi.fn()}
          loop={false}
          onLoopChange={vi.fn()}
          onTogglePlayback={vi.fn()}
          onSeek={vi.fn()}
          canUndo={false}
          canRedo={false}
          undoLabel=""
          canDeleteAudio={false}
          canDeleteProject={false}
          canToggleNotes={false}
          canOpenUttOpsMenu={false}
          notePopoverOpen={false}
          showExportMenu={false}
          importFileRef={{ current: null }}
          exportMenuRef={{ current: null }}
          exportCallbacks={{
            onToggleExportMenu: vi.fn(),
            onExportEaf: vi.fn(),
            onExportTextGrid: vi.fn(),
            onExportTrs: vi.fn(),
            onExportFlextext: vi.fn(),
            onExportToolbox: vi.fn(),
            onExportJyt: vi.fn(async () => undefined),
            onExportJym: vi.fn(async () => undefined),
            onImportFile: vi.fn(),
          }}
          onRefresh={vi.fn()}
          onUndo={vi.fn()}
          onRedo={vi.fn()}
          onOpenProjectSetup={vi.fn()}
          onOpenAudioImport={vi.fn()}
          onDeleteCurrentAudio={vi.fn()}
          onDeleteCurrentProject={vi.fn()}
          onToggleNotes={vi.fn()}
          onOpenUttOpsMenu={vi.fn()}
          reviewIssueCount={0}
          reviewPresetCounts={{
            all: 0,
            time: 0,
            content_concern: 0,
            content_missing: 0,
            manual_attention: 0,
            pending_review: 0,
          }}
          activeReviewPreset="all"
          onSelectReviewPreset={vi.fn()}
        />
      </LocaleProvider>,
    );

    const reviewEntry = screen.getByRole('button', { name: '全部问题 0' });
    fireEvent.click(reviewEntry);

    expect(reviewEntry.closest('.transcription-wave-toolbar-left')).toBeTruthy();
    expect(screen.getByRole('dialog', { name: '语段列表' })).toBeTruthy();
  });

  it('keeps the status badges visible in the top toolbar after analysis becomes ready', () => {
    render(
      <LocaleProvider locale="zh-CN">
        <TranscriptionPageToolbar
          filename="demo.wav"
          isReady
          isPlaying={false}
          playbackRate={1}
          onPlaybackRateChange={vi.fn()}
          waveformDisplayMode="waveform"
          onWaveformDisplayModeChange={vi.fn()}
          waveformVisualStyle="balanced"
          onWaveformVisualStyleChange={vi.fn()}
          acousticOverlayMode="both"
          onAcousticOverlayModeChange={vi.fn()}
          volume={0.5}
          onVolumeChange={vi.fn()}
          loop={false}
          onLoopChange={vi.fn()}
          onTogglePlayback={vi.fn()}
          onSeek={vi.fn()}
          canUndo={false}
          canRedo={false}
          undoLabel=""
          canDeleteAudio={false}
          canDeleteProject={false}
          canToggleNotes={false}
          canOpenUttOpsMenu={false}
          notePopoverOpen={false}
          showExportMenu={false}
          importFileRef={{ current: null }}
          exportMenuRef={{ current: null }}
          exportCallbacks={{
            onToggleExportMenu: vi.fn(),
            onExportEaf: vi.fn(),
            onExportTextGrid: vi.fn(),
            onExportTrs: vi.fn(),
            onExportFlextext: vi.fn(),
            onExportToolbox: vi.fn(),
            onExportJyt: vi.fn(async () => undefined),
            onExportJym: vi.fn(async () => undefined),
            onImportFile: vi.fn(),
          }}
          onRefresh={vi.fn()}
          onUndo={vi.fn()}
          onRedo={vi.fn()}
          onOpenProjectSetup={vi.fn()}
          onOpenAudioImport={vi.fn()}
          onDeleteCurrentAudio={vi.fn()}
          onDeleteCurrentProject={vi.fn()}
          onToggleNotes={vi.fn()}
          onOpenUttOpsMenu={vi.fn()}
          acousticRuntimeStatus={{ state: 'ready', phase: 'done', progressRatio: 1, processedFrames: 100, totalFrames: 100 }}
          vadCacheStatus={{ state: 'ready', engine: 'silero', segmentCount: 3 }}
        />
      </LocaleProvider>,
    );

    expect(screen.getByText('已完成')).toBeTruthy();
    expect(screen.getByText('已命中 · silero · 3 段')).toBeTruthy();
  });
});