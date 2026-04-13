// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  lookupLanguageCatalogEntriesByIds,
  lookupLanguageCatalogEntryById,
  resetLanguageCatalogSearchServiceForTests,
  searchLanguageCatalogSuggestions,
} from './LanguageCatalogSearchService';

const LANGUAGE_CATALOG_RUNTIME_CACHE_STORAGE_KEY = 'jieyu.language-catalog.runtime-cache.v1';

const displayCorePayload = {
  languages: {
    eng: {
      english: 'English',
      native: 'English',
      byLocale: {
        'zh-CN': '英语',
        'en-US': 'English',
      },
    },
    fra: {
      english: 'French',
      native: 'français',
      byLocale: {
        'zh-CN': '法语',
        'en-US': 'French',
      },
    },
  },
};

const aliasPayload = {
  aliasToCode: {
    english: 'eng',
    anglais: 'eng',
    francais: 'fra',
  },
  aliasesByCode: {
    eng: ['英文', 'anglais'],
    fra: ['法文'],
  },
};

const zhQueryIndexPayload = {
  locale: 'zh-CN',
  entriesByIso6393: {
    eng: [
      { label: '英语', kind: 'local' },
      { label: 'English', kind: 'native' },
      { label: 'anglais', kind: 'alias' },
    ],
    fra: [
      { label: '法语', kind: 'local' },
      { label: 'français', kind: 'native' },
      { label: 'French', kind: 'english' },
      { label: '法文', kind: 'alias' },
    ],
  },
} as const;

describe('LanguageCatalogSearchService', () => {
  beforeEach(() => {
    resetLanguageCatalogSearchServiceForTests();
    window.localStorage.clear();

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('language-display-names.core.json')) {
        return new Response(JSON.stringify(displayCorePayload), { status: 200 });
      }
      if (url.endsWith('language-query-aliases.json')) {
        return new Response(JSON.stringify(aliasPayload), { status: 200 });
      }
      if (url.endsWith('language-query-index.zh-CN.json')) {
        return new Response(JSON.stringify(zhQueryIndexPayload), { status: 200 });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });

    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    resetLanguageCatalogSearchServiceForTests();
    window.localStorage.clear();
    vi.unstubAllGlobals();
  });

  it('lazy-loads JSON assets once and reuses cached payloads for repeated searches', async () => {
    const first = await searchLanguageCatalogSuggestions({
      query: '法',
      locale: 'zh-CN',
      limit: 5,
    });
    const second = await searchLanguageCatalogSuggestions({
      query: '英',
      locale: 'zh-CN',
      limit: 5,
    });

    expect(first[0]?.id).toBe('fra');
    expect(second[0]?.id).toBe('eng');
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(3);
  });

  it('prioritizes exact code and exact label hits over weaker substring matches', async () => {
    const codeMatch = await searchLanguageCatalogSuggestions({
      query: 'fra',
      locale: 'zh-CN',
      limit: 5,
    });
    const aliasMatch = await searchLanguageCatalogSuggestions({
      query: 'français',
      locale: 'zh-CN',
      limit: 5,
    });

    expect(codeMatch[0]).toMatchObject({
      id: 'fra',
      matchedLabel: 'fra',
      matchedLabelKind: 'code',
      matchSource: 'code-exact',
    });
    expect(aliasMatch[0]).toMatchObject({
      id: 'fra',
      matchedLabel: 'français',
      matchedLabelKind: 'native',
      matchSource: 'native-exact',
    });
  });

  it('merges runtime custom entries and ranks them ahead of baseline matches at the same strength', async () => {
    window.localStorage.setItem(LANGUAGE_CATALOG_RUNTIME_CACHE_STORAGE_KEY, JSON.stringify({
      entries: {
        'user:fra-demo': {
          languageCode: 'fra-demo',
          english: 'French Demo',
          native: 'francais demo',
          byLocale: {
            'zh-CN': '法语演示',
            'en-US': 'French Demo',
          },
          aliases: ['法演'],
          visibility: 'visible',
        },
      },
    }));

    const suggestions = await searchLanguageCatalogSuggestions({
      query: '法',
      locale: 'zh-CN',
      limit: 5,
    });

    expect(suggestions[0]).toMatchObject({
      id: 'user:fra-demo',
      primaryLabel: '法语演示',
      hasRuntimeOverride: true,
    });
    expect(suggestions[1]?.id).toBe('fra');
  });

  it('applies runtime overrides when looking up entry details', async () => {
    window.localStorage.setItem(LANGUAGE_CATALOG_RUNTIME_CACHE_STORAGE_KEY, JSON.stringify({
      entries: {
        fra: {
          languageCode: 'fra',
          english: 'French Override',
          native: 'francais local',
          byLocale: {
            'zh-CN': '法语覆写',
            'en-US': 'French Override',
          },
          aliases: ['法语别名'],
          visibility: 'visible',
        },
      },
    }));

    const detail = await lookupLanguageCatalogEntryById('fra', 'zh-CN');
    const list = await lookupLanguageCatalogEntriesByIds(['fra', 'eng'], 'zh-CN');

    expect(detail).toMatchObject({
      id: 'fra',
      languageCode: 'fra',
      englishName: 'French Override',
      localName: '法语覆写',
      nativeName: 'francais local',
      hasRuntimeOverride: true,
    });
    expect(detail?.aliases).toEqual(expect.arrayContaining(['法语别名', '法文']));
    expect(list.map((entry) => entry.id)).toEqual(['fra', 'eng']);
  });

  it('falls back to ISO639-3 seed when querying an exact non-top500 code like mvm in language scope', async () => {
    const suggestions = await searchLanguageCatalogSuggestions({
      query: 'mvm',
      locale: 'zh-CN',
      limit: 5,
      catalogScope: 'language',
    });

    expect(suggestions[0]).toMatchObject({
      id: 'mvm',
      languageCode: 'mvm',
      matchedLabel: 'mvm',
      matchedLabelKind: 'code',
      matchSource: 'code-exact',
    });
    expect(suggestions[0]?.primaryLabel.toLowerCase()).toContain('muya');
  });

  it('matches non-top500 english name in language scope but not in orthography scope', async () => {
    const languageScope = await searchLanguageCatalogSuggestions({
      query: 'muya',
      locale: 'zh-CN',
      limit: 5,
      catalogScope: 'language',
    });
    const orthographyScope = await searchLanguageCatalogSuggestions({
      query: 'muya',
      locale: 'zh-CN',
      limit: 5,
      catalogScope: 'orthography',
    });

    expect(languageScope[0]).toMatchObject({
      id: 'mvm',
      languageCode: 'mvm',
    });
    expect(orthographyScope).toHaveLength(0);
  });
});