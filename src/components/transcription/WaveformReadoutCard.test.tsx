// @vitest-environment jsdom

import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LocaleProvider } from '../../i18n';
import { WaveformReadoutCard } from './WaveformReadoutCard';

describe('WaveformReadoutCard', () => {
  it('renders waveform readout without frequency line', () => {
    const { queryByText, getByText } = render(
      <LocaleProvider locale="zh-CN">
        <WaveformReadoutCard
          readout={{
            source: 'waveform',
            timeSec: 1.25,
            f0Hz: 196,
            intensityDb: -12.4,
          }}
          formatTime={(seconds) => `${seconds.toFixed(2)}s`}
        />
      </LocaleProvider>,
    );

    expect(getByText(/时间 1.25s/i)).toBeTruthy();
    expect(getByText(/F0 196 Hz/i)).toBeTruthy();
    expect(getByText(/强度 -12.4 dB/i)).toBeTruthy();
    expect(queryByText(/频率/i)).toBeNull();
  });

  it('renders spectrogram readout with frequency line', () => {
    const { getByText } = render(
      <LocaleProvider locale="en-US">
        <WaveformReadoutCard
          readout={{
            source: 'spectrogram',
            timeSec: 2.5,
            frequencyHz: 880,
            f0Hz: null,
            intensityDb: -18.2,
          }}
          formatTime={(seconds) => `${seconds.toFixed(2)}s`}
        />
      </LocaleProvider>,
    );

    expect(getByText(/Time 2.50s/i)).toBeTruthy();
    expect(getByText(/Frequency 880 Hz/i)).toBeTruthy();
    expect(getByText(/F0 —/i)).toBeTruthy();
    expect(getByText(/Intensity -18.2 dB/i)).toBeTruthy();
  });
});