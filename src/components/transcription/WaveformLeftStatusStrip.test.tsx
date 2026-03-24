// @vitest-environment jsdom
import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { WaveformLeftStatusStrip } from './WaveformLeftStatusStrip';

describe('WaveformLeftStatusStrip', () => {
  it('renders lane-label resize handle and triggers callback on pointer down', () => {
    const onLaneLabelWidthResize = vi.fn();

    const { container } = render(
      <WaveformLeftStatusStrip
        zoomPercent={100}
        snapEnabled={false}
        onSnapToggle={() => {}}
        playbackRate={1}
        currentTime={12}
        selectedUtteranceDuration={3}
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
