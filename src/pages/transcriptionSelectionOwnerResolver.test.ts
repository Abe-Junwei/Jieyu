import { describe, expect, it } from 'vitest';
import { resolveFallbackOwnerUtterance, resolveSegmentOwnerUtterance } from './transcriptionSelectionOwnerResolver';

type UtteranceLike = {
  id: string;
  startTime: number;
  endTime: number;
  mediaId?: string;
};

describe('transcriptionSelectionOwnerResolver', () => {
  it('prioritizes explicit owner id when present', () => {
    const utterances: UtteranceLike[] = [
      { id: 'utt-1', startTime: 0, endTime: 1, mediaId: 'media-1' },
      { id: 'utt-2', startTime: 1, endTime: 2, mediaId: 'media-1' },
    ];
    const segment = {
      utteranceId: 'utt-2',
      startTime: 0.2,
      endTime: 0.8,
      mediaId: 'media-1',
    };

    expect(resolveSegmentOwnerUtterance(segment, utterances)?.id).toBe('utt-2');
  });

  it('chooses narrower containing utterance when no explicit owner exists', () => {
    const utterances: UtteranceLike[] = [
      { id: 'utt-wide', startTime: 8, endTime: 14, mediaId: 'media-1' },
      { id: 'utt-narrow', startTime: 9, endTime: 13, mediaId: 'media-1' },
    ];

    expect(resolveFallbackOwnerUtterance({ startTime: 10, endTime: 12, mediaId: 'media-1' }, utterances)?.id).toBe('utt-narrow');
  });

  it('uses overlap tie-break by center distance when no containing utterance exists', () => {
    const utterances: UtteranceLike[] = [
      { id: 'utt-far', startTime: 9, endTime: 10.8, mediaId: 'media-1' },
      { id: 'utt-close', startTime: 11, endTime: 11.8, mediaId: 'media-1' },
    ];

    expect(resolveFallbackOwnerUtterance({ startTime: 10, endTime: 12, mediaId: 'media-1' }, utterances)?.id).toBe('utt-close');
  });

  it('returns undefined when no candidate overlaps', () => {
    const utterances: UtteranceLike[] = [
      { id: 'utt-1', startTime: 20, endTime: 22, mediaId: 'media-1' },
    ];

    expect(resolveSegmentOwnerUtterance({ startTime: 10, endTime: 12, mediaId: 'media-1' }, utterances)).toBeUndefined();
  });
});
