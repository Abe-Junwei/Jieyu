import { describe, expect, it } from 'vitest';
import { resolveFallbackOwnerUnit, resolveSegmentOwnerUnit } from './transcriptionSelectionOwnerResolver';

type UnitLike = {
  id: string;
  startTime: number;
  endTime: number;
  mediaId?: string;
};

describe('transcriptionSelectionOwnerResolver', () => {
  it('prioritizes explicit owner id when present', () => {
    const units: UnitLike[] = [
      { id: 'utt-1', startTime: 0, endTime: 1, mediaId: 'media-1' },
      { id: 'utt-2', startTime: 1, endTime: 2, mediaId: 'media-1' },
    ];
    const segment = {
      unitId: 'utt-2',
      startTime: 0.2,
      endTime: 0.8,
      mediaId: 'media-1',
    };

    expect(resolveSegmentOwnerUnit(segment, units)?.id).toBe('utt-2');
  });

  it('chooses narrower containing unit when no explicit owner exists', () => {
    const units: UnitLike[] = [
      { id: 'utt-wide', startTime: 8, endTime: 14, mediaId: 'media-1' },
      { id: 'utt-narrow', startTime: 9, endTime: 13, mediaId: 'media-1' },
    ];

    expect(resolveFallbackOwnerUnit({ startTime: 10, endTime: 12, mediaId: 'media-1' }, units)?.id).toBe('utt-narrow');
  });

  it('uses overlap tie-break by center distance when no containing unit exists', () => {
    const units: UnitLike[] = [
      { id: 'utt-far', startTime: 9, endTime: 10.8, mediaId: 'media-1' },
      { id: 'utt-close', startTime: 11, endTime: 11.8, mediaId: 'media-1' },
    ];

    expect(resolveFallbackOwnerUnit({ startTime: 10, endTime: 12, mediaId: 'media-1' }, units)?.id).toBe('utt-close');
  });

  it('returns undefined when no candidate overlaps', () => {
    const units: UnitLike[] = [
      { id: 'utt-1', startTime: 20, endTime: 22, mediaId: 'media-1' },
    ];

    expect(resolveSegmentOwnerUnit({ startTime: 10, endTime: 12, mediaId: 'media-1' }, units)).toBeUndefined();
  });
});
