// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import {
  annotationMediaHasPlayableSrc,
  annotationPlaybackSourceKey,
  pickAnnotationPlaybackMedia,
  resolveAnnotationMediaSrc,
  resolveAnnotationPlaybackRange,
  shouldStopAnnotationPlayback,
  toggleAnnotationRangePlayback,
} from './playAnnotationUnitRange';

describe('playAnnotationUnitRange', () => {
  it('resolves a playable range and skips inverted times', () => {
    expect(
      resolveAnnotationPlaybackRange({ id: 'u1', startTime: 1.2, endTime: 2.4, mediaId: 'm1' }),
    ).toEqual({ unitId: 'u1', startSec: 1.2, endSec: 2.4, mediaId: 'm1' });
    expect(resolveAnnotationPlaybackRange({ id: 'u1', startTime: 2, endTime: 2 })).toBeNull();
  });

  it('stops slightly before the range end', () => {
    expect(shouldStopAnnotationPlayback(1.99, 2)).toBe(true);
    expect(shouldStopAnnotationPlayback(1.9, 2)).toBe(false);
  });

  it('toggles pause when the same unit is already playing', async () => {
    const audio = {
      paused: false,
      currentTime: 1.2,
      src: 'blob:test',
      play: async () => {
        audio.paused = false;
      },
      pause: () => {
        audio.paused = true;
      },
    };
    await expect(
      toggleAnnotationRangePlayback({
        audio,
        range: { unitId: 'u1', startSec: 1, endSec: 2, mediaId: 'm1' },
        playingUnitId: 'u1',
      }),
    ).resolves.toBe('paused');
    expect(audio.paused).toBe(true);
  });

  it('seeks and plays a new range', async () => {
    const audio = {
      paused: true,
      currentTime: 0,
      src: 'blob:test',
      play: async () => {
        audio.paused = false;
      },
      pause: () => {
        audio.paused = true;
      },
    };
    await expect(
      toggleAnnotationRangePlayback({
        audio,
        range: { unitId: 'u1', startSec: 1.5, endSec: 2, mediaId: 'm1' },
        playingUnitId: null,
      }),
    ).resolves.toBe('played');
    expect(audio.currentTime).toBe(1.5);
    expect(audio.paused).toBe(false);
  });

  it('skips when audio has no source', async () => {
    await expect(
      toggleAnnotationRangePlayback({
        audio: {
          paused: true,
          currentTime: 0,
          src: '',
          play: async () => undefined,
          pause: () => undefined,
        },
        range: { unitId: 'u1', startSec: 0, endSec: 1, mediaId: '' },
        playingUnitId: null,
      }),
    ).resolves.toBe('skipped');
  });

  it('prefers a media url over a missing blob', () => {
    expect(resolveAnnotationMediaSrc({ url: ' https://example.test/a.wav ' })).toEqual({
      src: 'https://example.test/a.wav',
      objectUrl: null,
    });
    expect(resolveAnnotationMediaSrc({ details: {} })).toBeNull();
  });

  it('picks fallback media without allocating object URLs, then caches by resolved id', () => {
    const created: string[] = [];
    const originalCreate = URL.createObjectURL.bind(URL);
    URL.createObjectURL = ((_blob: Blob) => {
      const url = `blob:test-${created.length}`;
      created.push(url);
      return url;
    }) as typeof URL.createObjectURL;
    try {
      const blobItem = { id: 'm-blob', details: { audioBlob: new Blob(['x']) } };
      const urlItem = { id: 'm-url', url: ' https://example.test/a.wav ' };
      expect(annotationMediaHasPlayableSrc(blobItem)).toBe(true);
      expect(pickAnnotationPlaybackMedia([blobItem, urlItem], '')).toEqual(blobItem);
      expect(created).toEqual([]);
      expect(annotationPlaybackSourceKey('tid', blobItem.id)).toBe('tid:m-blob');
      expect(pickAnnotationPlaybackMedia([blobItem, urlItem], 'm-url')?.id).toBe('m-url');
    } finally {
      URL.createObjectURL = originalCreate;
    }
  });
});
