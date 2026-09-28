import { describe, expect, it } from 'vitest';
import {
  formatEafSideChannelNote,
  parseEafSideChannelNote,
  proposeEafTierRoles,
} from './eafTierRole';

describe('eaf tier roles', () => {
  it('proposes transcription for the first independent tier and translation after that', () => {
    expect(
      proposeEafTierRoles([
        { tierId: 'utt' },
        { tierId: 'free' },
        { tierId: 'gloss', parentTierId: 'utt' },
      ]),
    ).toEqual([
      { tierId: 'utt', role: 'transcription' },
      { tierId: 'free', role: 'translation' },
      { tierId: 'gloss', role: 'translation' },
    ]);
    expect(proposeEafTierRoles([{ tierId: 'only' }])).toBeUndefined();
  });

  it('round-trips a side-channel note prefix', () => {
    const text = formatEafSideChannelNote('controlled-vocabulary', ' noun ');
    expect(text).toBe('controlled-vocabulary: noun');
    expect(parseEafSideChannelNote(text)).toEqual({
      kind: 'controlled-vocabulary',
      value: 'noun',
    });
  });
});
