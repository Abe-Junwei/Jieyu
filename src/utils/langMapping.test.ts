import { afterEach, describe, expect, it } from 'vitest';
import {
  formatLanguageDisplayName,
  formatLanguageCatalogMatch,
  getLanguageDisplayNames,
  isDeferredLanguageCodeDraft,
  pickAutoFillLanguageMatch,
  resolveLanguageCodeInput,
  resolveLanguageQuery,
  resolveLanguageCodeInputChange,
  sanitizeLanguageCodeInput,
  searchLanguageCatalog,
} from './langMapping';
import {
  clearLanguageCatalogRuntimeCache,
  writeLanguageCatalogRuntimeCache,
} from '../data/languageCatalogRuntimeCache';

afterEach(() => {
  clearLanguageCatalogRuntimeCache();
});

describe('langMapping input helpers', () => {
  it('sanitizes code input before resolution', () => {
    expect(sanitizeLanguageCodeInput(' EN_us!! ')).toBe('enus');
    expect(sanitizeLanguageCodeInput('zh-Hant-HK***')).toBe('zh-hant-hk');
  });

  it('marks two-letter pure alphabetic codes as deferred drafts', () => {
    expect(isDeferredLanguageCodeDraft('en')).toBe(true);
    expect(isDeferredLanguageCodeDraft('zh')).toBe(true);
    expect(isDeferredLanguageCodeDraft('en-US')).toBe(false);
    expect(isDeferredLanguageCodeDraft('eng')).toBe(false);
  });

  it('keeps a shortened two-letter code as a draft during editing', () => {
    const nextState = resolveLanguageCodeInputChange('en', 'eng', 'zh-CN');

    expect(nextState.sanitizedInput).toBe('en');
    expect(nextState.keepsDraft).toBe(true);
    expect(nextState.status).toBe('deferred');
    expect(nextState.resolution.status).toBe('resolved');
    expect(nextState.resolution.languageId).toBe('eng');
  });

  it('preserves deletion drafts while allowing empty input', () => {
    const nextState = resolveLanguageCodeInputChange('', 'en', 'zh-CN');

    expect(nextState.sanitizedInput).toBe('');
    expect(nextState.keepsDraft).toBe(true);
    expect(nextState.status).toBe('empty');
    expect(nextState.resolution.status).toBe('empty');
  });

  it('resolves language tags without treating them as deferred drafts', () => {
    const nextState = resolveLanguageCodeInputChange('zh-Hant-HK', 'eng', 'zh-CN');

    expect(nextState.keepsDraft).toBe(false);
    expect(nextState.status).toBe('resolved');
    expect(nextState.resolution.languageId).toBe('zho');
    expect(nextState.resolution.localeTag).toBe('zh-Hant-HK');
    expect(nextState.resolution.scriptTag).toBe('Hant');
    expect(nextState.resolution.regionTag).toBe('HK');
  });

  it('picks an exact auto-fill match when the language name is unambiguous', () => {
    const match = pickAutoFillLanguageMatch('Portuguese', 'en-US');

    expect(match?.entry.iso6393).toBe('por');
    expect(match?.matchSource).toBe('alias-exact');
  });

  it('builds core display names for local, native, and English', () => {
    expect(getLanguageDisplayNames('fra', 'zh-CN')).toEqual({
      local: '法语',
      native: 'français',
      english: 'French',
    });
  });

  it('does not surface generic Chinese fallback labels for Chinese varieties', () => {
    expect(getLanguageDisplayNames('cmn', 'zh-CN')).toEqual({
      local: '普通话',
      native: '普通话',
      english: 'Mandarin',
    });

    expect(getLanguageDisplayNames('yue', 'zh-CN')).toEqual({
      local: '粤语',
      native: '粵語',
      english: 'Cantonese',
    });

    expect(getLanguageDisplayNames('nan', 'zh-CN')).toEqual({
      local: '闽南语',
      native: '閩南語',
      english: 'Southern Min',
    });

    expect(getLanguageDisplayNames('ind', 'zh-CN')).toEqual({
      local: '印尼语',
      native: 'Bahasa Indonesia',
      english: 'Indonesian',
    });

    expect(getLanguageDisplayNames('ckb', 'zh-CN')).toEqual({
      local: '中库尔德语',
      native: 'کوردیی ناوەندی',
      english: 'Central Kurdish',
    });

    expect(getLanguageDisplayNames('tgl', 'zh-CN')).toEqual({
      local: '他加禄语',
      native: 'Tagalog',
      english: 'Tagalog',
    });

    expect(getLanguageDisplayNames('cnr', 'zh-CN')).toEqual({
      local: '黑山语',
      native: 'crnogorski',
      english: 'Montenegrin',
    });

    expect(getLanguageDisplayNames('kmr', 'zh-CN')).toEqual({
      local: '库尔曼吉语',
      native: 'kurdî (kurmancî)',
      english: 'Northern Kurdish',
    });

    expect(getLanguageDisplayNames('gsw', 'zh-CN')).toEqual({
      local: '瑞士德语',
      native: 'Schwiizertüütsch',
      english: 'Swiss German',
    });

    expect(getLanguageDisplayNames('iii', 'zh-CN')).toEqual({
      local: '彝语',
      native: 'ꆈꌠꉙ',
      english: 'Sichuan Yi',
    });

    expect(getLanguageDisplayNames('div', 'zh-CN')).toEqual({
      local: '迪维希语',
      english: 'Dhivehi',
    });
  });

  it('matches native language names in search results', () => {
    const [match] = searchLanguageCatalog('français', 'zh-CN', 5);

    expect(match?.entry.iso6393).toBe('fra');
    expect(match?.matchedLabelKind).toBe('native');
    expect(match?.matchedLabel).toBe('français');
  });

  it('formats catalog matches with local, native, and English names', () => {
    const [match] = searchLanguageCatalog('français', 'zh-CN', 5);

    expect(match).toBeTruthy();
    expect(formatLanguageCatalogMatch(match!, 'zh-CN')).toContain('法语');
    expect(formatLanguageCatalogMatch(match!, 'zh-CN')).toContain('français');
    expect(formatLanguageCatalogMatch(match!, 'zh-CN')).toContain('French');
    expect(formatLanguageCatalogMatch(match!, 'zh-CN')).toContain('fra');
  });

  it('orders the remaining labels by matched-label kind for input-first display', () => {
    expect(formatLanguageDisplayName('fra', 'zh-CN', 'input-first', 'French', 'english')).toBe('French · 法语 · français');
    expect(formatLanguageDisplayName('fra', 'zh-CN', 'input-first', 'français', 'native')).toBe('français · 法语 · French');
    expect(formatLanguageDisplayName('fra', 'en-US', 'input-first', 'French', 'english')).toBe('French · français');
    expect(formatLanguageDisplayName('fra', 'en-US', 'input-first', 'français', 'native')).toBe('français · French');
  });

  it('supports French query-locale display and lookup as an extension locale', () => {
    const [match] = searchLanguageCatalog('allemand', 'fr-FR', 5);

    expect(match?.entry.iso6393).toBe('deu');
    expect(match?.matchedLabelKind).toBe('local');
    expect(getLanguageDisplayNames('deu', 'fr-FR')).toEqual({
      local: 'allemand',
      native: 'Deutsch',
      english: 'German',
    });
    expect(formatLanguageCatalogMatch(match!, 'fr-FR')).toContain('allemand');
    expect(formatLanguageCatalogMatch(match!, 'fr-FR')).toContain('Deutsch');
    expect(formatLanguageCatalogMatch(match!, 'fr-FR')).toContain('German');
  });

  it('matches cross-locale alias labels through the generated query matrix', () => {
    const [match] = searchLanguageCatalog('德语', 'fr-FR', 5);

    expect(match?.entry.iso6393).toBe('deu');
    expect(match?.matchSource).toBe('alias-exact');
    expect(match?.matchedLabelKind).toBe('alias');
    expect(match?.matchedLabel).toBe('德语');
  });

  it('resolves externalized aliases through resolveLanguageQuery', () => {
    expect(resolveLanguageQuery('mandarin')).toBe('cmn');
    expect(resolveLanguageQuery('sorani')).toBe('ckb');
    expect(resolveLanguageQuery('kurmanji')).toBe('kmr');
    expect(resolveLanguageQuery('alemannic')).toBe('gsw');
    expect(resolveLanguageQuery('nuosu')).toBe('iii');
    expect(resolveLanguageQuery('dhivehi')).toBe('div');
    expect(resolveLanguageQuery('客家话')).toBe('hak');
    expect(resolveLanguageQuery('german')).toBe('deu');
    expect(resolveLanguageQuery('英語')).toBe('eng');
    expect(resolveLanguageQuery('葡语')).toBe('por');
    expect(resolveLanguageQuery('farsi')).toBe('fas');
    expect(resolveLanguageQuery('shanghainese')).toBe('wuu');
    expect(resolveLanguageQuery('brazilian portuguese')).toBe('por');
    expect(resolveLanguageQuery('taiwanese hokkien')).toBe('nan');
    expect(resolveLanguageQuery('中文')).toBeUndefined();
    expect(resolveLanguageQuery('Chinese')).toBeUndefined();
    expect(resolveLanguageQuery('hangul')).toBeUndefined();
    expect(resolveLanguageQuery('taiwanese')).toBeUndefined();
  });

  it('surfaces runtime custom language assets in search and code resolution', () => {
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

    expect(getLanguageDisplayNames('demo', 'zh-CN')).toEqual({
      local: '示例语言',
      native: 'Demo Native',
      english: 'Demo Language',
    });
    expect(resolveLanguageQuery('示例别名')).toBe('demo');
    expect(resolveLanguageCodeInput('demo', 'zh-CN')).toMatchObject({
      status: 'resolved',
      languageId: 'user:demo-language',
      languageName: '示例语言',
    });
    expect(searchLanguageCatalog('示例', 'zh-CN', 5)[0]?.entry.iso6393).toBe('demo');
  });

  it('treats runtime-hidden languages as unavailable across query and code resolution', () => {
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

    expect(resolveLanguageQuery('english')).toBeUndefined();
    expect(resolveLanguageCodeInput('eng', 'zh-CN')).toEqual({ status: 'invalid', warnings: [] });
    expect(searchLanguageCatalog('English', 'en-US', 5).some((match) => match.entry.iso6393 === 'eng')).toBe(false);
  });
});