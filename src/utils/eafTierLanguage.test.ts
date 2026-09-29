import { describe, expect, it } from 'vitest';
import { getLanguageCatalogEntry, resolveLanguageQuery } from './langMapping';
import { resolveImportedEafTierLanguage } from './eafTierLanguage';

const chinese = getLanguageCatalogEntry('zh')?.iso6393 ?? 'zho';
const french = getLanguageCatalogEntry('fr')?.iso6393 ?? 'fra';
const swahili = getLanguageCatalogEntry('swa')?.iso6393 ?? 'swa';
const datooga = resolveLanguageQuery('Datooga') ?? 'Datooga';
const cashinahua = resolveLanguageQuery('Cashinahua') ?? 'Cashinahua';
const kurdish = resolveLanguageQuery('Northern Kurdish') ?? 'Northern_Kurdish';

const anim = new Map([
  ['AnIM', { label: 'Anim', def: 'cmn' }],
  ['en', { label: 'English', def: 'en' }],
]);

describe('resolveImportedEafTierLanguage', () => {
  it('uses each tier LANG_REF instead of a shared English DEFAULT_LOCALE', () => {
    expect(
      resolveImportedEafTierLanguage({
        tierId: 'tx@AnIM',
        langRef: 'AnIM',
        defaultLocale: 'en',
        languages: anim,
      }),
    ).toBe('cmn');
    expect(
      resolveImportedEafTierLanguage({
        tierId: 'ft@AnIM',
        langRef: 'en',
        defaultLocale: 'en',
        languages: anim,
      }),
    ).toBe('eng');
  });

  it('does not treat the speaker id after @ or DEFAULT_LOCALE as a language', () => {
    expect(
      resolveImportedEafTierLanguage({
        tierId: 'ph@AnIM',
        defaultLocale: 'en',
        languages: anim,
      }),
    ).toBeUndefined();
  });

  it('prefers the FLEx language slot over a shared English DEFAULT_LOCALE', () => {
    expect(
      resolveImportedEafTierLanguage({
        tierId: 'A_word-gls-zh-CN',
        defaultLocale: 'en',
        languages: anim,
      }),
    ).toBe(chinese);
    expect(
      resolveImportedEafTierLanguage({
        tierId: 'AB5_phrase-gls-fr',
        defaultLocale: 'en',
        languages: anim,
      }),
    ).toBe(french);
  });

  it('reads a language tag used as the tier name', () => {
    expect(
      resolveImportedEafTierLanguage({
        tierId: 'en',
        defaultLocale: 'en',
        languages: new Map([['en', { label: 'English' }]]),
      }),
    ).toBe('eng');
    expect(
      resolveImportedEafTierLanguage({
        tierId: 'mvm-fonipa-x-emic',
        defaultLocale: 'mvm-fonipa-x-emic',
        languages: new Map([['mvm-fonipa-x-emic', { label: 'Muya (IPA)' }]]),
      }),
    ).toBe('mvm');
    expect(
      resolveImportedEafTierLanguage({
        tierId: 'English',
        defaultLocale: 'en',
        languages: new Map(),
      }),
    ).toBe('eng');
  });

  it('reads a language token written in the tier name', () => {
    expect(
      resolveImportedEafTierLanguage({
        tierId: 'FT-SWA',
        defaultLocale: 'en',
        languages: new Map(),
      }),
    ).toBe(swahili);
    expect(
      resolveImportedEafTierLanguage({
        tierId: 'Translation-ENG',
        defaultLocale: 'en',
        languages: new Map(),
      }),
    ).toBe('eng');
    expect(
      resolveImportedEafTierLanguage({
        tierId: 'rus',
        defaultLocale: 'ru',
        languages: new Map(),
      }),
    ).toBe('rus');
  });

  it('extracts the ISO 639-3 primary from a phonetic private-use tag', () => {
    expect(
      resolveImportedEafTierLanguage({
        tierId: 'Transcription',
        langRef: 'mvm-fonipa-x-emic',
        languages: new Map([
          ['mvm-fonipa-x-emic', { label: 'mvm-fonipa-x-emic', def: 'mvm-fonipa-x-emic' }],
        ]),
      }),
    ).toBe('mvm');
  });

  it('keeps an unknown LANG_REF instead of substituting English', () => {
    expect(
      resolveImportedEafTierLanguage({
        tierId: 'tx@XYZ',
        langRef: 'XYZ',
        defaultLocale: 'en',
        languages: new Map(),
      }),
    ).toBe('XYZ');
  });

  it('keeps the document name Nuu and does not fold it into nuu', () => {
    const nuu = new Map([['Nuu', { label: 'Nuu' }]]);
    expect(
      resolveImportedEafTierLanguage({
        tierId: 'tx@F',
        defaultLocale: 'us',
        languages: nuu,
      }),
    ).toBe('Nuu');
    expect(
      resolveImportedEafTierLanguage({
        tierId: 'ft@F',
        defaultLocale: 'us',
        languages: nuu,
      }),
    ).toBeUndefined();
    expect(
      resolveImportedEafTierLanguage({
        tierId: 'tx@F',
        langRef: 'Nuu',
        languages: nuu,
      }),
    ).toBe('Nuu');
    expect(getLanguageCatalogEntry('nuu')?.name).not.toBe('Nuu');
  });

  it('uses the document language for an object tier whose locale is a working language', () => {
    expect(
      resolveImportedEafTierLanguage({
        tierId: 'tx@MM',
        defaultLocale: 'en',
        languages: new Map([['Datooga', { label: 'Datooga' }]]),
      }),
    ).toBe(datooga);
    expect(
      resolveImportedEafTierLanguage({
        tierId: 'ft@MM',
        defaultLocale: 'en',
        languages: new Map([['Datooga', { label: 'Datooga' }]]),
      }),
    ).toBeUndefined();
  });

  it('ignores an undetermined language row and a private-use tag', () => {
    const cashinahuaFile = new Map<string, { label: string }>([
      ['und', { label: 'undetermined (und)' }],
      ['Cashinahua', { label: 'Cashinahua' }],
    ]);
    expect(
      resolveImportedEafTierLanguage({
        tierId: 'tx@JC',
        defaultLocale: 'en',
        languages: cashinahuaFile,
      }),
    ).toBe(cashinahua);
    expect(
      resolveImportedEafTierLanguage({
        tierId: 'mb@WS1',
        defaultLocale: 'qaa-x-aaa',
        languages: new Map([['Fanbyak', { label: 'Fanbyak' }]]),
      }),
    ).toBe('Fanbyak');
    expect(
      resolveImportedEafTierLanguage({
        tierId: 'HSH1_morph-gls-qaa-KR-fonipa-x-jej',
        languages: new Map([['Jejuan', { label: 'Jejuan' }]]),
      }),
    ).toBeUndefined();
  });

  it('matches a document language name that uses underscores', () => {
    expect(
      resolveImportedEafTierLanguage({
        tierId: 'tx@NK02',
        languages: new Map([['Northern_Kurdish', { label: 'Northern_Kurdish' }]]),
      }),
    ).toBe(kurdish);
  });

  it('does not guess a language from DEFAULT_LOCALE when the tier has no tag', () => {
    expect(
      resolveImportedEafTierLanguage({
        tierId: 'notes',
        defaultLocale: 'en',
        languages: anim,
      }),
    ).toBeUndefined();
  });
});
