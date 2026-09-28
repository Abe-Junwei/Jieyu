import { describe, expect, it } from 'vitest';
import {
  isEafContentAnchor,
  isPhoneticTranscriptionTier,
  phoneticTranscriptionTier,
  pickEafTiers,
  tokenizeEafLabel,
} from './eafTierPick';

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
  it('keeps a ph tier as phonetic transcription and ignores phrase', () => {
    expect(isPhoneticTranscriptionTier('ph@NHK')).toBe(true);
    expect(isPhoneticTranscriptionTier('phrase-txt')).toBe(false);
    expect(
      phoneticTranscriptionTier({
        tierId: 'ph',
        annotations: [
          { startTime: 1, endTime: 1.2, text: 'a', annotationId: 'p1' },
          { startTime: 1.2, endTime: 1.4, text: '   ' },
        ],
      })?.units,
    ).toEqual([{ startTime: 1, endTime: 1.2, transcription: 'a', annotationId: 'p1' }]);
  });

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

  it('does not treat a linguistic type named txt as the transcription', () => {
    const picked = pickEafTiers([
      tier('A_phrase-segnum-en', { nonemptyTexts: ['1', '2', '3', '4'] }),
      tier('interlinear-text-title-en', {
        linguisticTypeId: 'txt',
        nonemptyTexts: ['duoxu001'],
      }),
      tier('A_phrase-gls-zh-CN', {
        parentTierId: 'A_phrase-segnum-en',
        nonemptyTexts: ['两口子有两个女儿'],
      }),
      tier('A_word-txt-ers-CN', {
        parentTierId: 'A_phrase-segnum-en',
        symbolicSubdivision: true,
        maxChildrenPerParent: 3,
        nonemptyTexts: ['ni⁵⁵ɕu³¹'],
      }),
      tier('A_word-gls-zh-CN', {
        parentTierId: 'A_word-txt-ers-CN',
        nonemptyTexts: ['两口子'],
      }),
    ]);
    expect(picked.transcriptionTierId).toBeUndefined();
    expect(picked.anchorTierIds.has('A_phrase-segnum-en')).toBe(true);
    expect(picked.headerTierIds.has('interlinear-text-title-en')).toBe(true);
    expect(picked.wordTierIds.has('A_word-txt-ers-CN')).toBe(true);
    expect(picked.wordTierIds.has('A_word-gls-zh-CN')).toBe(true);
    expect(picked.promptTiers).toBeUndefined();
  });

  it('keeps a gloss tier whose linguistic type is Note on the translation side', () => {
    const picked = pickEafTiers([
      tier('A_Transcription-txt-woe', { nonemptyTexts: ['Dechedech ke ngarker?'] }),
      tier('A_Translation-gls-en', {
        parentTierId: 'A_Transcription-txt-woe',
        linguisticTypeId: 'Note',
        nonemptyTexts: ['Frog, where are you?'],
      }),
      tier('Interlinear-title-en', {
        linguisticTypeId: 'text',
        nonemptyTexts: ['Pear Story'],
      }),
    ]);
    expect(picked.transcriptionTierId).toBe('A_Transcription-txt-woe');
    expect(picked.anchorTierIds.has('A_Translation-gls-en')).toBe(false);
    expect(picked.headerTierIds.has('Interlinear-title-en')).toBe(true);
    expect(picked.promptTiers).toBeUndefined();
  });

  it('leaves recording metadata and interlinear-text headers out of the role dialog', () => {
    const picked = pickEafTiers([
      tier('ref@NHK', { nonemptyTexts: ['<p:>', '0114_doreco_x'] }),
      tier('tx@NHK', { parentTierId: 'ref@NHK', nonemptyTexts: ['aay idaye'] }),
      tier('ft@NHK', { parentTierId: 'ref@NHK', nonemptyTexts: ['yes, if there is wedding'] }),
      tier('tx@KBK', { parentTierId: 'ref@KBK', nonemptyTexts: ['[clap]'] }),
      tier('sound@NOBODY', { parentTierId: 'ref@NOBODY', nonemptyTexts: ['Zoom H4n'] }),
      tier('interlinear-text-title-en', {
        linguisticTypeId: 'txt',
        nonemptyTexts: ['today'],
      }),
    ]);
    expect(picked.promptTiers?.map((row) => row.tierId)).toEqual(['tx@NHK', 'ft@NHK', 'tx@KBK']);
  });

  it('reads a sentence tier whose element is 句子 and whose item type is txt', () => {
    const picked = pickEafTiers([
      tier('句子-txt-ers-Qaaa-CN-x-Ersu', { nonemptyTexts: ['ssintrema o la'] }),
      tier('单词-txt-ers-Qaaa-CN-x-Ersu', {
        parentTierId: '句子-txt-ers-Qaaa-CN-x-Ersu',
        symbolicSubdivision: true,
        maxChildrenPerParent: 4,
        nonemptyTexts: ['ssintrema'],
      }),
    ]);
    expect(picked.transcriptionTierId).toBe('句子-txt-ers-Qaaa-CN-x-Ersu');
    expect(picked.wordTierIds.has('单词-txt-ers-Qaaa-CN-x-Ersu')).toBe(true);
  });
});
