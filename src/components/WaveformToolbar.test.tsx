// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LocaleProvider } from '../i18n';
import { WaveformToolbar } from './WaveformToolbar';

describe('WaveformToolbar', () => {
  it('exposes accessible names for transport, speed, and volume controls', () => {
    const onPlaybackRateChange = vi.fn();
    const onWaveformDisplayModeChange = vi.fn<(mode: 'waveform' | 'spectrogram' | 'split') => void>();
    const onWaveformVisualStyleChange = vi.fn<(style: 'balanced' | 'dense' | 'contrast') => void>();
    const onVolumeChange = vi.fn();

    render(
      <LocaleProvider locale="zh-CN">
        <WaveformToolbar
          filename="demo.wav"
          isReady
          isPlaying={false}
          playbackRate={1}
          onPlaybackRateChange={onPlaybackRateChange}
          waveformDisplayMode="waveform"
          onWaveformDisplayModeChange={onWaveformDisplayModeChange}
          waveformVisualStyle="balanced"
          onWaveformVisualStyleChange={onWaveformVisualStyleChange}
          volume={0.5}
          onVolumeChange={onVolumeChange}
          loop={false}
          onLoopChange={vi.fn()}
          onTogglePlayback={vi.fn()}
          onSeek={vi.fn()}
        />
      </LocaleProvider>,
    );

    fireEvent.change(screen.getByRole('combobox', { name: /语段播放速度/i }), { target: { value: '1.5' } });
    fireEvent.change(screen.getByRole('combobox', { name: /显示模式/i }), { target: { value: 'split' } });
    fireEvent.change(screen.getByRole('combobox', { name: /波形样式/i }), { target: { value: 'contrast' } });
    fireEvent.change(screen.getByRole('slider', { name: /音量/i }), { target: { value: '0.8' } });

    expect(screen.getByRole('button', { name: '后退 10 秒' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '前进 10 秒' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '开启全局循环播放' })).toBeTruthy();
    expect(onPlaybackRateChange).toHaveBeenCalledWith(1.5);
    expect(onWaveformDisplayModeChange).toHaveBeenCalledWith('split');
    expect(onWaveformVisualStyleChange).toHaveBeenCalledWith('contrast');
    expect(onVolumeChange).toHaveBeenCalledWith(0.8);
  });
});
