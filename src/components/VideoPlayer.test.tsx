// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VideoPlayer } from './VideoPlayer';
import { useVideoPlayer } from '../hooks/useVideoPlayer';

vi.mock('../hooks/useVideoPlayer', () => ({
  useVideoPlayer: vi.fn(),
}));

function createPlayerStub() {
  return {
    videoRef: { current: document.createElement('video') },
    instanceRef: { current: null as HTMLVideoElement | null },
    isReady: true,
    isPlaying: false,
    currentTime: 0,
    duration: 120,
    playbackRate: 1,
    setPlaybackRate: vi.fn(),
    volume: 0.8,
    setVolume: vi.fn(),
    togglePlayback: vi.fn(),
    playRegion: vi.fn(),
    stop: vi.fn(),
    seekBySeconds: vi.fn(),
    seekTo: vi.fn(),
  };
}

describe('VideoPlayer', () => {
  beforeEach(() => {
    vi.mocked(useVideoPlayer).mockReturnValue(createPlayerStub());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('falls back to fit mode and logs when localStorage read throws', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(window.localStorage, 'getItem').mockImplementation(() => {
      throw new Error('read-failed');
    });
    vi.spyOn(window.localStorage, 'setItem').mockImplementation(() => {});

    render(<VideoPlayer mediaUrl="blob:demo-video" />);

    expect(screen.getByRole('button', { name: 'Fit' })).toBeTruthy();
    expect(errorSpy).toHaveBeenCalledWith(
      '[VideoPlayer]',
      'failed to read video fit mode from localStorage, using default',
      expect.objectContaining({ err: expect.anything() }),
    );
  });

  it('logs when localStorage persistence fails', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(window.localStorage, 'getItem').mockReturnValue('fill');
    vi.spyOn(window.localStorage, 'setItem').mockImplementation(() => {
      throw new Error('write-failed');
    });

    render(<VideoPlayer mediaUrl="blob:demo-video" />);

    expect(screen.getByRole('button', { name: 'Fill' })).toBeTruthy();
    expect(errorSpy).toHaveBeenCalledWith(
      '[VideoPlayer]',
      'failed to persist video fit mode to localStorage',
      expect.objectContaining({ err: expect.anything() }),
    );
  });
});