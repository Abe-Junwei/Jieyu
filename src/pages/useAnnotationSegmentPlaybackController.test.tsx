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
});
