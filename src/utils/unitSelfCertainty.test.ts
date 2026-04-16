import { describe, expect, it } from 'vitest';
import { mergeUnitSelfCertaintyConservative, resolveSelfCertaintyHostUnitId, resolveSelfCertaintyHostUnitIds } from './unitSelfCertainty';

describe('mergeUnitSelfCertaintyConservative', () => {
  it('returns undefined when no tiers are set', () => {
    expect(mergeUnitSelfCertaintyConservative([])).toBeUndefined();
    expect(mergeUnitSelfCertaintyConservative([undefined, undefined])).toBeUndefined();
  });

  it('picks not_understood if any participant has it', () => {
    expect(mergeUnitSelfCertaintyConservative(['certain', 'not_understood'])).toBe('not_understood');
    expect(mergeUnitSelfCertaintyConservative(['uncertain', 'not_understood'])).toBe('not_understood');
  });

  it('picks uncertain when no not_understood but some uncertain', () => {
    expect(mergeUnitSelfCertaintyConservative(['certain', 'uncertain'])).toBe('uncertain');
    expect(mergeUnitSelfCertaintyConservative([undefined, 'uncertain'])).toBe('uncertain');
  });

  it('picks certain only when every participant is explicitly certain', () => {
    expect(mergeUnitSelfCertaintyConservative(['certain'])).toBe('certain');
    expect(mergeUnitSelfCertaintyConservative(['certain', 'certain'])).toBe('certain');
  });

  it('treats certain mixed with unmarked as uncertain', () => {
    expect(mergeUnitSelfCertaintyConservative([undefined, 'certain'])).toBe('uncertain');
    expect(mergeUnitSelfCertaintyConservative(['certain', undefined, 'certain'])).toBe('uncertain');
  });

  it('falls back to a containing unit when a segment has no explicit parent id', () => {
    const resolved = resolveSelfCertaintyHostUnitId(
      'seg-1',
      [{ id: 'utt-1', startTime: 1, endTime: 2 }],
      { startTime: 1.2, endTime: 1.8 },
    );
    expect(resolved).toBe('utt-1');
  });

  it('resolves raw target ids through timeline view parent hints', () => {
    const hints = new Map([
      ['seg-view-1', { parentUnitId: 'utt-host', startTime: 1.2, endTime: 1.8 }],
    ]);
    const resolved = resolveSelfCertaintyHostUnitIds(
      ['seg-view-1'],
      [{ id: 'utt-host', startTime: 1, endTime: 2 }],
      hints,
    );
    expect(resolved).toEqual(['utt-host']);
  });

  it('prefers a host unit on the same media when multiple units share the same time range', () => {
    const resolved = resolveSelfCertaintyHostUnitId(
      'seg-1',
      [
        { id: 'utt-other-media', mediaId: 'media-b', startTime: 1, endTime: 2 },
        { id: 'utt-same-media', mediaId: 'media-a', startTime: 1, endTime: 2 },
      ],
      { mediaId: 'media-a', startTime: 1.2, endTime: 1.8 },
    );
    expect(resolved).toBe('utt-same-media');
  });

  it('picks the best overlap host instead of first overlap candidate', () => {
    const resolved = resolveSelfCertaintyHostUnitId(
      'seg-overlap',
      [
        { id: 'utt-small-overlap', startTime: 0.8, endTime: 1.12 },
        { id: 'utt-large-overlap', startTime: 1.05, endTime: 1.9 },
      ],
      { startTime: 1.1, endTime: 1.7 },
    );
    expect(resolved).toBe('utt-large-overlap');
  });

});
