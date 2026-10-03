// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockListMediaByTextId } = vi.hoisted(() => ({
  mockListMediaByTextId: vi.fn(),
}));

vi.mock('../app/languageAssetPageAccess', () => ({
  LinguisticService: {
    media: {
      listByTextId: mockListMediaByTextId,
    },
  },
}));

import { useAnnotationSegmentPlaybackController } from './useAnnotationSegmentPlaybackController';

class FakeAudio {
  paused = true;
  currentTime = 0;
  srcSetCount = 0;
  private _src = '';

  get src() {
    return this._src;
  }

  set src(value: string) {
    this._src = value;
    this.srcSetCount += 1;
    this.paused = true;
    this.currentTime = 0;
  }

  addEventListener() {}

  removeEventListener() {}

  play = async () => {
    this.paused = false;
  };

  pause = () => {
    this.paused = true;
  };
}

describe('useAnnotationSegmentPlaybackController', () => {
  let lastAudio: FakeAudio;

  beforeEach(() => {
    lastAudio = new FakeAudio();
    vi.stubGlobal(
      'Audio',
      vi.fn(function AudioStub(this: void) {
        lastAudio = new FakeAudio();
        return lastAudio;
      }),
    );
    mockListMediaByTextId.mockReset();
    mockListMediaByTextId.mockResolvedValue([
      { id: 'mid-actual', url: 'https://example.test/clip.wav' },
    ]);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('does not reload src on the second Space when the row has no mediaId', async () => {
    const { result } = renderHook(() => useAnnotationSegmentPlaybackController('tid-1'));
    const rows = [
      {
        id: 'uid-1',
        startTime: 1,
        endTime: 2,
        mediaId: '',
      },
    ];

    await act(async () => {
      await result.current.onPlayToggle('uid-1', rows as never);
    });
    expect(result.current.lastOutcome).toBe('played');
    expect(lastAudio.srcSetCount).toBe(1);
    expect(lastAudio.paused).toBe(false);

    await act(async () => {
      await result.current.onPlayToggle('uid-1', rows as never);
    });
    expect(result.current.lastOutcome).toBe('paused');
    expect(lastAudio.srcSetCount).toBe(1);
    expect(lastAudio.paused).toBe(true);
    expect(mockListMediaByTextId).toHaveBeenCalledTimes(1);
  });

  it('swallows AbortError from play() without surfacing an error outcome', async () => {
    const { result } = renderHook(() => useAnnotationSegmentPlaybackController('tid-1'));
    const rows = [{ id: 'uid-1', startTime: 1, endTime: 2, mediaId: '' }];
    lastAudio.play = async () => {
      throw new DOMException('interrupted by a new load request', 'AbortError');
    };

    await act(async () => {
      await result.current.onPlayToggle('uid-1', rows as never);
    });

    expect(result.current.playingUnitId).toBeNull();
    expect(result.current.lastOutcome).toBe('idle');
  });

  it('reports skipped when play() rejects with a non-abort error', async () => {
    const { result } = renderHook(() => useAnnotationSegmentPlaybackController('tid-1'));
    const rows = [{ id: 'uid-1', startTime: 1, endTime: 2, mediaId: '' }];
    lastAudio.play = async () => {
      throw new DOMException('user gesture required', 'NotAllowedError');
    };

    await act(async () => {
      await result.current.onPlayToggle('uid-1', rows as never);
    });

    expect(result.current.playingUnitId).toBeNull();
    expect(result.current.lastOutcome).toBe('skipped');
  });

  it('drops a stale toggle continuation after a newer toggle starts', async () => {
    let resolveFirst!: (value: unknown) => void;
    let resolveSecond!: (value: unknown) => void;
    const mediaItems = [{ id: 'mid-actual', url: 'https://example.test/clip.wav' }];
    mockListMediaByTextId
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFirst = resolve;
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveSecond = resolve;
          }),
      );
    const { result } = renderHook(() => useAnnotationSegmentPlaybackController('tid-1'));
    const rowsA = [{ id: 'uid-a', startTime: 1, endTime: 2, mediaId: '' }];
    const rowsB = [{ id: 'uid-b', startTime: 3, endTime: 4, mediaId: '' }];

    let toggleA: Promise<void> = Promise.resolve();
    let toggleB: Promise<void> = Promise.resolve();
    act(() => {
      toggleA = result.current.onPlayToggle('uid-a', rowsA as never);
      toggleB = result.current.onPlayToggle('uid-b', rowsB as never);
    });
    // B's source resolves first and wins; A resolves afterwards and must be dropped.
    await act(async () => {
      resolveSecond(mediaItems);
      await toggleB;
    });
    await act(async () => {
      resolveFirst(mediaItems);
      await toggleA;
    });

    expect(result.current.playingUnitId).toBe('uid-b');
    expect(result.current.lastOutcome).toBe('played');
  });
});
