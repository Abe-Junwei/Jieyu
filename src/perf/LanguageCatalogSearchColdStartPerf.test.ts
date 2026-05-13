// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  resetLanguageCatalogSearchServiceForTests,
  searchLanguageCatalogSuggestions,
} from '../services/LanguageCatalogSearchService';

const displayCorePayload = {
  languages: {
    eng: {
      english: 'English',
      native: 'English',
      byLocale: { 'zh-CN': '英语', 'en-US': 'English' },
    },
    fra: {
      english: 'French',
      native: 'français',
      byLocale: { 'zh-CN': '法语', 'en-US': 'French' },
    },
  },
};

const aliasPayload = {
  aliasToCode: { english: 'eng', francais: 'fra' },
  aliasesByCode: { eng: ['英文'], fra: ['法文'] },
};

const zhQueryIndexPayload = {
  locale: 'zh-CN',
  entriesByIso6393: {
    eng: [{ label: '英语', kind: 'local' }],
    fra: [{ label: '法语', kind: 'local' }],
  },
} as const;

const coverageRelaxed = process.env.npm_lifecycle_event === 'test:coverage';

describe('LanguageCatalogSearchService cold-start / keystroke perf baseline', () => {
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
      if (url.endsWith('iso6393-country-baselines.json')) {
        return new Response(JSON.stringify({ distributionByIso6393: {}, officialByIso6393: {} }), {
          status: 200,
        });
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

  it(
    'keeps sequential prefix queries under a loose keystroke budget',
    async () => {
      const keystrokes = ['f', 'fr', 'fra', '法', '法语', '法', '英', 'eng'];
      const started = performance.now();
      for (let i = 0; i < 72; i++) {
        const query = keystrokes[i % keystrokes.length] ?? '法';
        await searchLanguageCatalogSuggestions({
          query,
          locale: 'zh-CN',
          limit: 8,
        });
      }
      const elapsed = performance.now() - started;
      const maxMs = coverageRelaxed ? 60_000 : 4_000;
      expect(elapsed).toBeLessThan(maxMs);
      globalThis['console'].info('[LanguageCatalogSearch keystroke perf]', {
        elapsedMs: Number(elapsed.toFixed(2)),
        rounds: 72,
      });
    },
    coverageRelaxed ? 120_000 : 12_000,
  );
});
