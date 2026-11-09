// @vitest-environment jsdom
/**
 * #495: video playRegion and waveform seek must share the same forced start.
 */
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useVideoPlayer } from './useVideoPlayer';

function attachFakeVideo(
  videoRef: { current: HTMLVideoElement | null },
  opts: { currentTime: number; duration?: number },
) {
  const video = document.createElement('video');
  Object.defineProperty(video, 'duration', {
    configurable: true,
    get: () => opts.duration ?? 120,
  });
  let time = opts.currentTime;
  Object.defineProperty(video, 'currentTime', {
    configurable: true,
    get: () => time,
    set: (v: number) => {
      time = v;
    },
  });
  video.play = vi.fn(async () => undefined) as unknown as HTMLVideoElement['play'];
  video.pause = vi.fn() as unknown as HTMLVideoElement['pause'];
  videoRef.current = video;
  return video;
}

describe('useVideoPlayer region sync (#495)', () => {
  it('forces video currentTime to region.start even when already inside the region', () => {
    const { result } = renderHook(() => useVideoPlayer({ mediaUrl: 'blob:demo' }));
    const video = attachFakeVideo(result.current.videoRef, { currentTime: 15 });

    act(() => {
      result.current.playRegion(10, 20, false);
    });

    expect(video.currentTime).toBe(10);
    expect(video.play).toHaveBeenCalled();
  });

  it('keeps video and waveform currentTime aligned when both force-replay from region.start', () => {
    const { result: videoHook } = renderHook(() => useVideoPlayer({ mediaUrl: 'blob:demo' }));
    const video = attachFakeVideo(videoHook.current.videoRef, { currentTime: 15 });

    // Minimal waveform stand-in with the same resume semantics as useWaveSurfer.playRegion.
    let waveTime = 15;
    const waveform = {
      getCurrentTime: () => waveTime,
      setTime: (t: number) => {
        waveTime = t;
      },
      play: vi.fn(),
    };
    const playWaveRegion = (start: number, end: number, resume?: boolean) => {
      const cur = waveform.getCurrentTime();
      const canResume = Boolean(resume && cur >= start && cur < end);
      if (!canResume) waveform.setTime(start);
      waveform.play();
    };

    // Mirrors TranscriptionTimelineSections onRegionClick + VideoPlayer progress hit (#495 product choice).
    act(() => {
      videoHook.current.playRegion(10, 20, false);
      playWaveRegion(10, 20, false);
    });

    expect(video.currentTime).toBe(10);
    expect(waveTime).toBe(10);
    expect(video.currentTime).toBe(waveTime);
  });
});
