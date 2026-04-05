import { afterEach, describe, expect, it } from 'vitest';

import {
  getLanguageAliasCodeFromCatalog,
  getLanguageAliasesForCodeFromCatalog,
  getLanguageDisplayCoreEntry,
  getLanguageEnglishDisplayNameFromCatalog,
  getLanguageLocalDisplayNameFromCatalog,
  getLanguageNativeDisplayNameFromCatalog,
  getLanguageQueryEntriesFromCatalog,
  getLanguageQueryNamesFromCatalog,
} from './languageNameCatalog';
import {
  clearLanguageCatalogRuntimeCache,
  writeLanguageCatalogRuntimeCache,
} from './languageCatalogRuntimeCache';

afterEach(() => {
  clearLanguageCatalogRuntimeCache();
});

describe('languageNameCatalog', () => {
  it('reads generated core display entries for top500 languages', () => {
    expect(getLanguageDisplayCoreEntry('fra')).toEqual({
      english: 'French',
      native: 'français',
      byLocale: {
        'zh-CN': '法语',
        'en-US': 'French',
        'fr-FR': 'français',
        'es-ES': 'francés',
        'de-DE': 'Französisch',
      },
    });
  });

  it('uses generated English and native names without regional noise', () => {
    expect(getLanguageEnglishDisplayNameFromCatalog('eng')).toBe('English');
    expect(getLanguageNativeDisplayNameFromCatalog('eng')).toBe('English');
    expect(getLanguageNativeDisplayNameFromCatalog('spa')).toBe('español');
    expect(getLanguageEnglishDisplayNameFromCatalog('ckb')).toBe('Central Kurdish');
    expect(getLanguageEnglishDisplayNameFromCatalog('kmr')).toBe('Northern Kurdish');
    expect(getLanguageEnglishDisplayNameFromCatalog('gsw')).toBe('Swiss German');
    expect(getLanguageEnglishDisplayNameFromCatalog('iii')).toBe('Sichuan Yi');
    expect(getLanguageEnglishDisplayNameFromCatalog('div')).toBe('Dhivehi');
    expect(getLanguageNativeDisplayNameFromCatalog('ind')).toBe('Bahasa Indonesia');
    expect(getLanguageNativeDisplayNameFromCatalog('tgl')).toBe('Tagalog');
    expect(getLanguageNativeDisplayNameFromCatalog('kur')).toBe('Kurdî');
    expect(getLanguageNativeDisplayNameFromCatalog('hbs')).toBe('srpskohrvatski');
    expect(getLanguageNativeDisplayNameFromCatalog('cnr')).toBe('crnogorski');
    expect(getLanguageLocalDisplayNameFromCatalog('cnr', 'zh-CN')).toBe('黑山语');
    expect(getLanguageLocalDisplayNameFromCatalog('div', 'en-US')).toBe('Dhivehi');
    expect(getLanguageLocalDisplayNameFromCatalog('cnr', 'fr-FR')).toBe('monténégrin');
    expect(getLanguageLocalDisplayNameFromCatalog('cnr', 'es-ES')).toBe('montenegrino');
    expect(getLanguageLocalDisplayNameFromCatalog('cnr', 'de-DE')).toBe('Montenegrinisch');
    expect(getLanguageLocalDisplayNameFromCatalog('kmr', 'zh-CN')).toBe('库尔曼吉语');
    expect(getLanguageLocalDisplayNameFromCatalog('kmr', 'en-US')).toBe('Northern Kurdish');
  });

  it('keeps Chinese varieties out of generic Chinese fallback labels', () => {
    expect(getLanguageEnglishDisplayNameFromCatalog('cmn')).toBe('Mandarin');
    expect(getLanguageNativeDisplayNameFromCatalog('cmn')).toBe('普通话');
    expect(getLanguageLocalDisplayNameFromCatalog('cmn', 'en-US')).toBe('Mandarin');

    expect(getLanguageEnglishDisplayNameFromCatalog('yue')).toBe('Cantonese');
    expect(getLanguageNativeDisplayNameFromCatalog('yue')).toBe('粵語');
    expect(getLanguageLocalDisplayNameFromCatalog('yue', 'en-US')).toBe('Cantonese');

    expect(getLanguageNativeDisplayNameFromCatalog('wuu')).toBe('吴语');
    expect(getLanguageLocalDisplayNameFromCatalog('wuu', 'en-US')).toBe('Wu Chinese');

    expect(getLanguageNativeDisplayNameFromCatalog('nan')).toBe('閩南語');
    expect(getLanguageLocalDisplayNameFromCatalog('nan', 'en-US')).toBe('Southern Min');
  });

  it('applies zh-CN overrides on top of generated local display names', () => {
    expect(getLanguageLocalDisplayNameFromCatalog('cmn', 'zh-CN')).toBe('普通话');
    expect(getLanguageLocalDisplayNameFromCatalog('eng', 'zh-CN')).toBe('英语');
  });

  it('returns multi-name query indexes with semantic kinds for extension locales', () => {
    expect(getLanguageQueryEntriesFromCatalog('deu', 'fr-FR')).toEqual(expect.arrayContaining([
      { label: 'allemand', kind: 'local' },
      { label: 'Deutsch', kind: 'native' },
      { label: 'German', kind: 'english' },
      { label: '德语', kind: 'alias' },
      { label: 'alemán', kind: 'alias' },
      { label: '德文', kind: 'alias' },
    ]));

    expect(getLanguageQueryNamesFromCatalog('fra', 'es-ES')).toEqual(expect.arrayContaining([
      'francés',
      'français',
      'French',
      '法语',
      'Französisch',
      '法文',
    ]));

    expect(getLanguageQueryNamesFromCatalog('yue', 'en-US')).toEqual(expect.arrayContaining([
      'Cantonese',
      '粵語',
      '粤语',
    ]));
  });

  it('exposes externalized alias lookup through the catalog layer', () => {
    expect(getLanguageAliasCodeFromCatalog('mandarin')).toBe('cmn');
    expect(getLanguageAliasCodeFromCatalog('sorani')).toBe('ckb');
    expect(getLanguageAliasCodeFromCatalog('kurmanji')).toBe('kmr');
    expect(getLanguageAliasCodeFromCatalog('alemannic')).toBe('gsw');
    expect(getLanguageAliasCodeFromCatalog('nuosu')).toBe('iii');
    expect(getLanguageAliasCodeFromCatalog('dhivehi')).toBe('div');
    expect(getLanguageAliasCodeFromCatalog('客家话')).toBe('hak');
    expect(getLanguageAliasCodeFromCatalog('farsi')).toBe('fas');
    expect(getLanguageAliasCodeFromCatalog('英語')).toBe('eng');
    expect(getLanguageAliasCodeFromCatalog('shanghainese')).toBe('wuu');
    expect(getLanguageAliasCodeFromCatalog('hangul')).toBeUndefined();
    expect(getLanguageAliasCodeFromCatalog('taiwanese')).toBeUndefined();
    expect(getLanguageAliasesForCodeFromCatalog('cmn')).toEqual(expect.arrayContaining(['中文', 'mandarin', '普通话']));
    expect(getLanguageAliasesForCodeFromCatalog('eng')).toEqual(expect.arrayContaining(['英文', '英語', 'american english', 'british english']));
    expect(getLanguageAliasesForCodeFromCatalog('por')).toEqual(expect.arrayContaining(['葡语', '葡文', 'brazilian portuguese']));
  });

  it('resolves runtime custom entries by languageCode instead of internal catalog id', () => {
    writeLanguageCatalogRuntimeCache({
      entries: {
        'user:demo-language': {
          languageCode: 'demo',
          english: 'Demo Language',
          native: 'Demo Native',
          byLocale: {
            'zh-CN': '示例语言',
            'en-US': 'Demo Language',
          },
          aliases: ['示例别名'],
          visibility: 'visible',
        },
      },
      aliasToId: {
        '示例别名': 'user:demo-language',
      },
      lookupToId: {
        demo: 'user:demo-language',
        'user:demo-language': 'user:demo-language',
      },
      updatedAt: '2026-04-05T00:00:00.000Z',
    });

    expect(getLanguageLocalDisplayNameFromCatalog('demo', 'zh-CN')).toBe('示例语言');
    expect(getLanguageEnglishDisplayNameFromCatalog('demo')).toBe('Demo Language');
    expect(getLanguageAliasCodeFromCatalog('示例别名')).toBe('demo');
    expect(getLanguageAliasesForCodeFromCatalog('demo')).toEqual(expect.arrayContaining(['示例别名']));
    expect(getLanguageQueryNamesFromCatalog('demo', 'zh-CN')).toEqual(expect.arrayContaining(['示例语言', 'Demo Language', 'Demo Native', '示例别名']));
  });

  it('suppresses overrides, aliases, and query entries for runtime-hidden languages', () => {
    writeLanguageCatalogRuntimeCache({
      entries: {
        eng: {
          languageCode: 'eng',
          english: 'English',
          byLocale: {
            'zh-CN': '英语',
            'en-US': 'English',
          },
          visibility: 'hidden',
        },
      },
      aliasToId: {},
      lookupToId: {
        eng: 'eng',
      },
      updatedAt: '2026-04-05T00:00:00.000Z',
    });

    expect(getLanguageLocalDisplayNameFromCatalog('eng', 'zh-CN')).toBeUndefined();
    expect(getLanguageQueryEntriesFromCatalog('eng', 'zh-CN')).toEqual([]);
    expect(getLanguageAliasesForCodeFromCatalog('eng')).toEqual([]);
    expect(getLanguageAliasCodeFromCatalog('english')).toBeUndefined();
  });
});