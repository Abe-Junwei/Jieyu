// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useWaveformRuntimeController } from './useWaveformRuntimeController';
import { emitWaveformRuntimePreferenceChanged } from '../utils/waveformRuntimePreferenceSync';

describe('useWaveformRuntimeController', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('applies waveform display defaults immediately after settings update event', async () => {
    localStorage.setItem('jieyu:waveform-height', '180');
    localStorage.setItem('jieyu:waveform-display-mode', 'waveform');
    localStorage.setItem('jieyu:amplitude-scale', '1');
    localStorage.setItem('jieyu:waveform-visual-style', 'balanced');
    localStorage.setItem('jieyu:acoustic-overlay-mode', 'none');

    const { result } = renderHook(() => useWaveformRuntimeController());
    expect(result.current.waveformHeight).toBe(180);
    expect(result.current.waveformDisplayMode).toBe('waveform');
    expect(result.current.amplitudeScale).toBe(1);
    expect(result.current.waveformVisualStyle).toBe('balanced');
    expect(result.current.acousticOverlayMode).toBe('none');

    await act(async () => {
      await Promise.resolve();
    });

    act(() => {
      localStorage.setItem('jieyu:waveform-height', '240');
      localStorage.setItem('jieyu:waveform-display-mode', 'spectrogram');
      localStorage.setItem('jieyu:amplitude-scale', '1.8');
      localStorage.setItem('jieyu:waveform-visual-style', 'praat');
      localStorage.setItem('jieyu:acoustic-overlay-mode', 'both');
      emitWaveformRuntimePreferenceChanged();
    });

    expect(result.current.waveformHeight).toBe(240);
    expect(result.current.waveformDisplayMode).toBe('spectrogram');
    expect(result.current.amplitudeScale).toBe(1.8);
    expect(result.current.waveformVisualStyle).toBe('praat');
    expect(result.current.acousticOverlayMode).toBe('both');
  });
});
