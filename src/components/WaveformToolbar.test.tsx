// @vitest-environment jsdom
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LocaleProvider } from '../i18n';
import { WaveformToolbar } from './WaveformToolbar';

describe('WaveformToolbar', () => {
  it('exposes accessible names for transport, speed, and volume controls', () => {
    const onPlaybackRateChange = vi.fn();
    const onWaveformDisplayModeChange = vi.fn<(mode: 'waveform' | 'spectrogram' | 'split') => void>();
    const onWaveformVisualStyleChange = vi.fn<(style: 'balanced' | 'dense' | 'contrast' | 'line') => void>();
    const onAcousticOverlayModeChange = vi.fn<(mode: 'none' | 'f0' | 'intensity' | 'both') => void>();
    const onVolumeChange = vi.fn();

    const toolbarProps = {
      filename: 'demo.wav',
      isReady: true,
      isPlaying: false,
      playbackRate: 1,
      onPlaybackRateChange,
      waveformDisplayMode: 'waveform' as const,
      onWaveformDisplayModeChange,
      waveformVisualStyle: 'balanced' as const,
      onWaveformVisualStyleChange,
      acousticOverlayMode: 'none' as const,
      onAcousticOverlayModeChange,
      volume: 0.5,
      onVolumeChange,
      loop: false,
      onLoopChange: vi.fn(),
      onTogglePlayback: vi.fn(),
      onSeek: vi.fn(),
    };

    const { rerender } = render(
      <LocaleProvider locale="zh-CN">
        <WaveformToolbar {...toolbarProps} />
      </LocaleProvider>,
    );

    fireEvent.change(screen.getByRole('combobox', { name: /语段播放速度/i }), { target: { value: '1.5' } });
    fireEvent.click(screen.getByRole('button', { name: /波形画布、声学叠加与波形绘制样式/i }));
    const viewPanel = screen.getByRole('dialog', { name: /波形与声学显示/i });
    fireEvent.click(within(viewPanel).getByRole('radio', { name: '上下分屏' }));
    const acousticGroup = within(viewPanel).getByRole('group', { name: /声学叠加/i });
    fireEvent.click(within(acousticGroup).getByRole('button', { name: 'F0' }));
    expect(onAcousticOverlayModeChange).toHaveBeenLastCalledWith('f0');
    rerender(
      <LocaleProvider locale="zh-CN">
        <WaveformToolbar {...toolbarProps} acousticOverlayMode="f0" />
      </LocaleProvider>,
    );
    const viewPanelAfter = screen.getByRole('dialog', { name: /波形与声学显示/i });
    const acousticGroupAfter = within(viewPanelAfter).getByRole('group', { name: /声学叠加/i });
    fireEvent.click(within(acousticGroupAfter).getByRole('button', { name: '强度' }));
    fireEvent.click(within(viewPanelAfter).getByRole('radio', { name: '强对比' }));
    fireEvent.change(screen.getByRole('slider', { name: /音量/i }), { target: { value: '0.8' } });

    expect(screen.getByRole('button', { name: '后退 10 秒' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '前进 10 秒' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '开启全局循环播放' })).toBeTruthy();
    expect(onPlaybackRateChange).toHaveBeenCalledWith(1.5);
    expect(onWaveformDisplayModeChange).toHaveBeenCalledWith('split');
    expect(onAcousticOverlayModeChange).toHaveBeenCalledWith('both');
    expect(onWaveformVisualStyleChange).toHaveBeenCalledWith('contrast');
    expect(onVolumeChange).toHaveBeenCalledWith(0.8);
  });
});
