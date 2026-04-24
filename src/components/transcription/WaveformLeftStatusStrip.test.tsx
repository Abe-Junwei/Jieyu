// @vitest-environment jsdom
import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { resetTranscriptionPlaybackClockForTests, setTranscriptionPlaybackClock } from '../../hooks/transcriptionPlaybackClock';
import { WaveformLeftStatusStrip } from './WaveformLeftStatusStrip';

describe('WaveformLeftStatusStrip', () => {
  it('updates current time via playback clock DOM path when currentTime prop is omitted', () => {
    resetTranscriptionPlaybackClockForTests(0);
    const { container } = render(
      <WaveformLeftStatusStrip
        zoomPercent={100}
        snapEnabled={false}
        onSnapToggle={() => {}}
        playbackRate={1}
        selectedUnitDuration={null}
        amplitudeScale={1}
        onAmplitudeChange={() => {}}
        onAmplitudeReset={() => {}}
        selectedMediaIsVideo={false}
        videoLayoutMode="top"
        onVideoLayoutModeChange={() => {}}
        formatTime={(seconds) => `${seconds.toFixed(1)}s`}
      />,
    );
    const value = container.querySelector('.waveform-left-status-item:nth-of-type(4) .waveform-left-status-value');
    expect(value?.textContent).toBe('0.0s');
    setTranscriptionPlaybackClock(3.25);
    expect(value?.textContent).toBe('3.3s');
  });

  it('renders lane-label resize handle and triggers callback on pointer down', () => {
    const onLaneLabelWidthResize = vi.fn();

    const { container } = render(
      <WaveformLeftStatusStrip
        zoomPercent={100}
        snapEnabled={false}
        onSnapToggle={() => {}}
        playbackRate={1}
        currentTime={12}
        selectedUnitDuration={3}
        amplitudeScale={1}
        onAmplitudeChange={() => {}}
        onAmplitudeReset={() => {}}
        selectedMediaIsVideo={false}
        videoLayoutMode="top"
        onVideoLayoutModeChange={() => {}}
        onLaneLabelWidthResize={onLaneLabelWidthResize}
        formatTime={(seconds) => `${seconds}s`}
      />,
    );

    const handle = container.querySelector('.lane-label-resize-handle');
    expect(handle).not.toBeNull();

    fireEvent.pointerDown(handle as Element, { clientX: 200, clientY: 40 });
    expect(onLaneLabelWidthResize).toHaveBeenCalledTimes(1);
  });
});
