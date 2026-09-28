import { describe, expect, it } from 'vitest';
import { isEafContentAnchor, pickEafTiers, tokenizeEafLabel } from './eafTierPick';

function tier(
  tierId: string,
  extras: Partial<{
    linguisticTypeId: string;
    parentTierId: string;
    timeAlignable: boolean;
    symbolicSubdivision: boolean;
    nonemptyTexts: string[];
    maxChildrenPerParent: number;
  }> = {},
) {
  return {
    tierId,
    timeAlignable:
      extras.timeAlignable ??
      (extras.parentTierId === undefined || extras.parentTierId.length === 0),
    symbolicSubdivision: extras.symbolicSubdivision ?? false,
    nonemptyTexts: extras.nonemptyTexts ?? ['sentence'],
    maxChildrenPerParent: extras.maxChildrenPerParent ?? 0,
    ...(extras.linguisticTypeId !== undefined && extras.linguisticTypeId.length > 0
      ? { linguisticTypeId: extras.linguisticTypeId }
      : {}),
    ...(extras.parentTierId !== undefined && extras.parentTierId.length > 0
      ? { parentTierId: extras.parentTierId }
      : {}),
  };
}

describe('eaf tier pick', () => {
  it('splits labels on non-letters and keeps gl distinct from gloss', () => {
    expect(tokenizeEafLabel('Thai-gloss')).toEqual(['thai', 'gloss']);
    expect(tokenizeEafLabel('tx@33')).toEqual(['tx']);
    expect(tokenizeEafLabel('A_phrase-segnum-en')).toEqual(['a', 'phrase', 'segnum', 'en']);
    const thai = pickEafTiers([
      tier('default', { nonemptyTexts: ['kʰɔ̃ː'] }),
      tier('Thai-gloss', { nonemptyTexts: ['คุณ'] }),
    ]);
    expect(thai.transcriptionTierId).toBe('default');
    expect(thai.wordTierIds.has('Thai-gloss')).toBe(false);
  });

  it('treats corpus ids, paragraph marks, and digits as anchors', () => {
    expect(isEafContentAnchor(['0001_doreco_x', '<p:>'])).toBe(true);
    expect(isEafContentAnchor(['12', '13', '14', '15', 'hello'])).toBe(true);
    expect(isEafContentAnchor(['hello', '0001_doreco_x'])).toBe(false);
    const picked = pickEafTiers([
      tier('tx', {
        nonemptyTexts: [
          '0001_doreco_a',
          '0001_doreco_b',
          '0001_doreco_c',
          '0001_doreco_d',
          'hello',
        ],
      }),
      tier('trs', { parentTierId: 'tx', nonemptyTexts: ['a real sentence'] }),
    ]);
    expect(picked.transcriptionTierId).toBe('trs');
    expect(picked.anchorTierIds.has('tx')).toBe(true);
  });

  it('picks the transcription child of a ref anchor and does not prompt', () => {
    const picked = pickEafTiers([
      tier('ref', { nonemptyTexts: ['0001_doreco_x', '<p:>'] }),
      tier('tx', { parentTierId: 'ref', nonemptyTexts: ['nono'] }),
      tier('ft', { parentTierId: 'ref', nonemptyTexts: ['Arapaho language'] }),
    ]);
    expect(picked.transcriptionTierId).toBe('tx');
    expect(picked.promptTiers).toBeUndefined();
    expect(picked.firstIndependentTimeAlignedTierId).toBe('ref');
  });

  it('prompts when two phrase tiers are both named tx', () => {
    const picked = pickEafTiers([
      tier('tx', { nonemptyTexts: ['one'] }),
      tier('tx-b', { nonemptyTexts: ['two'] }),
    ]);
    expect(picked.promptTiers).toEqual([
      { tierId: 'tx', role: 'transcription' },
      { tierId: 'tx-b', role: 'translation' },
    ]);
  });

  it('keeps a one-to-one translation subdivision as a phrase and many word children as words', () => {
    const picked = pickEafTiers([
      tier('Sundanese', { nonemptyTexts: ['Èta'] }),
      tier('Translation-ENG', {
        parentTierId: 'Sundanese',
        linguisticTypeId: 'words',
        symbolicSubdivision: true,
        maxChildrenPerParent: 1,
        nonemptyTexts: ['The story is about'],
      }),
      tier('words', {
        parentTierId: 'Sundanese',
        symbolicSubdivision: true,
        maxChildrenPerParent: 3,
        nonemptyTexts: ['one', 'two'],
      }),
    ]);
    expect(picked.phraseSubdivisionTierIds.has('Translation-ENG')).toBe(true);
    expect(picked.wordTierIds.has('words')).toBe(true);
    expect(picked.transcriptionTierId).toBe('Sundanese');
  });
});
