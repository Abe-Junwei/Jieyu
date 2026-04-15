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
      localStorage.setItem('jieyu:waveform-visual-style', 'line');
      localStorage.setItem('jieyu:acoustic-overlay-mode', 'both');
      emitWaveformRuntimePreferenceChanged();
    });

    expect(result.current.waveformHeight).toBe(240);
    expect(result.current.waveformDisplayMode).toBe('spectrogram');
    expect(result.current.amplitudeScale).toBe(1.8);
    expect(result.current.waveformVisualStyle).toBe('line');
    expect(result.current.acousticOverlayMode).toBe('both');
  });

  it('migrates legacy praat waveform visual style key to line in localStorage', () => {
    localStorage.setItem('jieyu:waveform-height', '180');
    localStorage.setItem('jieyu:waveform-display-mode', 'waveform');
    localStorage.setItem('jieyu:amplitude-scale', '1');
    localStorage.setItem('jieyu:waveform-visual-style', 'praat');
    localStorage.setItem('jieyu:acoustic-overlay-mode', 'none');

    const { result } = renderHook(() => useWaveformRuntimeController());
    expect(result.current.waveformVisualStyle).toBe('line');
    expect(localStorage.getItem('jieyu:waveform-visual-style')).toBe('line');
  });

  it('restores base height after auto-expand when leaving split mode', () => {
    localStorage.setItem('jieyu:waveform-height', '180');
    localStorage.setItem('jieyu:waveform-display-mode', 'waveform');
    localStorage.setItem('jieyu:amplitude-scale', '1');
    localStorage.setItem('jieyu:waveform-visual-style', 'balanced');
    localStorage.setItem('jieyu:acoustic-overlay-mode', 'none');

    const { result } = renderHook(() => useWaveformRuntimeController());
    expect(result.current.waveformHeight).toBe(180);

    act(() => {
      result.current.setWaveformDisplayMode('split');
    });
    expect(result.current.waveformHeight).toBe(260);

    act(() => {
      result.current.setWaveformDisplayMode('waveform');
    });
    expect(result.current.waveformHeight).toBe(180);
  });

  it('does not restore stale low baseline after switching to a higher non-split height', () => {
    localStorage.setItem('jieyu:waveform-height', '180');
    localStorage.setItem('jieyu:waveform-display-mode', 'waveform');
    localStorage.setItem('jieyu:amplitude-scale', '1');
    localStorage.setItem('jieyu:waveform-visual-style', 'balanced');
    localStorage.setItem('jieyu:acoustic-overlay-mode', 'none');

    const { result } = renderHook(() => useWaveformRuntimeController());

    act(() => {
      result.current.setWaveformDisplayMode('split');
    });
    expect(result.current.waveformHeight).toBe(260);

    act(() => {
      result.current.setWaveformDisplayMode('waveform');
    });
    expect(result.current.waveformHeight).toBe(180);

    act(() => {
      localStorage.setItem('jieyu:waveform-height', '300');
      emitWaveformRuntimePreferenceChanged();
    });
    expect(result.current.waveformHeight).toBe(300);

    act(() => {
      result.current.setWaveformDisplayMode('split');
    });
    expect(result.current.waveformHeight).toBe(300);

    act(() => {
      result.current.setWaveformDisplayMode('waveform');
    });
    expect(result.current.waveformHeight).toBe(300);
  });
});
