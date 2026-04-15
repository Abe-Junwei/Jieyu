import { describe, expect, it } from 'vitest';
import {
  mergeUtteranceSelfCertaintyConservative,
  resolveSelfCertaintyHostUtteranceId,
  resolveSelfCertaintyHostUtteranceIds,
} from './utteranceSelfCertainty';

describe('mergeUtteranceSelfCertaintyConservative', () => {
  it('returns undefined when no tiers are set', () => {
    expect(mergeUtteranceSelfCertaintyConservative([])).toBeUndefined();
    expect(mergeUtteranceSelfCertaintyConservative([undefined, undefined])).toBeUndefined();
  });

  it('picks not_understood if any participant has it', () => {
    expect(mergeUtteranceSelfCertaintyConservative(['certain', 'not_understood'])).toBe('not_understood');
    expect(mergeUtteranceSelfCertaintyConservative(['uncertain', 'not_understood'])).toBe('not_understood');
  });

  it('picks uncertain when no not_understood but some uncertain', () => {
    expect(mergeUtteranceSelfCertaintyConservative(['certain', 'uncertain'])).toBe('uncertain');
    expect(mergeUtteranceSelfCertaintyConservative([undefined, 'uncertain'])).toBe('uncertain');
  });

  it('picks certain only when every participant is explicitly certain', () => {
    expect(mergeUtteranceSelfCertaintyConservative(['certain'])).toBe('certain');
    expect(mergeUtteranceSelfCertaintyConservative(['certain', 'certain'])).toBe('certain');
  });

  it('treats certain mixed with unmarked as uncertain', () => {
    expect(mergeUtteranceSelfCertaintyConservative([undefined, 'certain'])).toBe('uncertain');
    expect(mergeUtteranceSelfCertaintyConservative(['certain', undefined, 'certain'])).toBe('uncertain');
  });

  it('falls back to a containing utterance when a segment has no explicit parent id', () => {
    const resolved = resolveSelfCertaintyHostUtteranceId(
      'seg-1',
      [{ id: 'utt-1', startTime: 1, endTime: 2 }],
      { startTime: 1.2, endTime: 1.8 },
    );
    expect(resolved).toBe('utt-1');
  });

  it('resolves raw target ids through timeline view parent hints', () => {
    const hints = new Map([
      ['seg-view-1', { parentUtteranceId: 'utt-host', startTime: 1.2, endTime: 1.8 }],
    ]);
    const resolved = resolveSelfCertaintyHostUtteranceIds(
      ['seg-view-1'],
      [{ id: 'utt-host', startTime: 1, endTime: 2 }],
      hints,
    );
    expect(resolved).toEqual(['utt-host']);
  });

  it('prefers a host utterance on the same media when multiple utterances share the same time range', () => {
    const resolved = resolveSelfCertaintyHostUtteranceId(
      'seg-1',
      [
        { id: 'utt-other-media', mediaId: 'media-b', startTime: 1, endTime: 2 },
        { id: 'utt-same-media', mediaId: 'media-a', startTime: 1, endTime: 2 },
      ],
      { mediaId: 'media-a', startTime: 1.2, endTime: 1.8 },
    );
    expect(resolved).toBe('utt-same-media');
  });
});
