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

    const { result } = renderHook(() => useWaveformRuntimeController());
    expect(result.current.waveformHeight).toBe(180);
    expect(result.current.waveformDisplayMode).toBe('waveform');

    await act(async () => {
      await Promise.resolve();
    });

    act(() => {
      localStorage.setItem('jieyu:waveform-height', '240');
      localStorage.setItem('jieyu:waveform-display-mode', 'spectrogram');
      emitWaveformRuntimePreferenceChanged();
    });

    expect(result.current.waveformHeight).toBe(240);
    expect(result.current.waveformDisplayMode).toBe('spectrogram');
  });
});
