/**
 * @vitest-environment jsdom
 */

import { render, screen } from '@testing-library/react';
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