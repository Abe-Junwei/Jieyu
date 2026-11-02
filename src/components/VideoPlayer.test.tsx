// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VideoPlayer } from './VideoPlayer';
import { useVideoPlayer } from '~/hooks/media/useVideoPlayer';

vi.mock('../hooks/media/useVideoPlayer', () => ({
  useVideoPlayer: vi.fn(),
}));

const VIDEO_FIT_MODE_STORAGE_KEY = 'jieyu.video.fitMode';

function stubLocalStorage(overrides: {
  getItem: (this: Storage, key: string) => string | null;
  setItem: (this: Storage, key: string, value: string) => void;
}): () => void {
  const full: Storage = {
    length: 0,
    clear: () => {},
    key: () => null,
    removeItem: () => {},
    getItem(key: string) {
      return overrides.getItem.call(this, key);
    },
    setItem(key: string, value: string) {
      overrides.setItem.call(this, key, value);
    },
  };
  const descriptor = Object.getOwnPropertyDescriptor(window, 'localStorage');
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: full,
  });
  return () => {
    if (descriptor) {
      Object.defineProperty(window, 'localStorage', descriptor);
    }
  };
}

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
    const restoreStorage = stubLocalStorage({
      getItem: (key) => {
        if (key === VIDEO_FIT_MODE_STORAGE_KEY) throw new Error('read-failed');
        return null;
      },
      setItem: () => {},
    });

    try {
      render(<VideoPlayer mediaUrl="blob:demo-video" />);

      expect(screen.getByRole('button', { name: 'Fit' })).toBeTruthy();
      expect(errorSpy).toHaveBeenCalledWith(
        '[VideoPlayer]',
        'failed to read video fit mode from localStorage, using default',
        expect.objectContaining({ err: expect.anything() }),
      );
    } finally {
      restoreStorage();
    }
  });

  it('logs when localStorage persistence fails', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const restoreStorage = stubLocalStorage({
      getItem: (key) => (key === VIDEO_FIT_MODE_STORAGE_KEY ? 'fill' : null),
      setItem: () => {
        throw new Error('write-failed');
      },
    });

    try {
      render(<VideoPlayer mediaUrl="blob:demo-video" />);

      expect(screen.getByRole('button', { name: 'Fill' })).toBeTruthy();
      expect(errorSpy).toHaveBeenCalledWith(
        '[VideoPlayer]',
        'failed to persist video fit mode to localStorage',
        expect.objectContaining({ err: expect.anything() }),
      );
    } finally {
      restoreStorage();
    }
  });

  it('plays the video region when the progress bar hits a segment (#489)', () => {
    const stub = createPlayerStub();
    stub.videoRef.current = {
      duration: 100,
      currentTime: 0,
      paused: true,
      play: vi.fn(),
      pause: vi.fn(),
    } as unknown as HTMLVideoElement;
    vi.mocked(useVideoPlayer).mockReturnValue(stub);
    const onRegionClick = vi.fn();

    render(
      <VideoPlayer
        mediaUrl="blob:demo-video"
        regions={[{ id: 'r1', start: 10, end: 20 }]}
        onRegionClick={onRegionClick}
      />,
    );

    const bar = document.querySelector('.video-player-progress');
    expect(bar).toBeTruthy();
    vi.spyOn(bar as HTMLElement, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      width: 100,
      top: 0,
      height: 10,
      right: 100,
      bottom: 10,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect);

    fireEvent(
      bar as Element,
      new MouseEvent('click', { bubbles: true, clientX: 15, clientY: 1 }),
    );

    expect(stub.playRegion).toHaveBeenCalledWith(10, 20, true);
    expect(onRegionClick).toHaveBeenCalledWith('r1', 15, expect.any(MouseEvent));
    expect(stub.seekTo).not.toHaveBeenCalled();
  });
});
