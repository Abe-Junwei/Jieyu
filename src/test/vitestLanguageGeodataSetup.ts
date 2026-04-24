/**
 * Vitest：从 `public/` 同步水合 ISO 639-3 种子与语言目录 baseline，避免 jsdom 下 `fetch('/data/...')` 未接线导致用例空数据。
 * Hydrates ISO 639-3 seeds + language catalog baseline from `public/` for tests (no fetch to dev server).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildBaselineLanguageCatalogRuntimeCacheFromPublicRecords,
  primeLanguageCatalogRuntimeCacheForSession,
} from '../data/languageCatalogRuntimeCache';
import type { LanguageDisplayCoreEntry } from '../data/languageNameTypes';
import { hydrateIso6393SeedsFromRowsForTests, type Iso639_3SeedRow } from '../data/iso6393Seed';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function loadPublicJson<T>(pathUnderPublic: string): T {
  const abs = path.join(repoRoot, 'public', pathUnderPublic);
  return JSON.parse(fs.readFileSync(abs, 'utf8')) as T;
}

const isoRows = loadPublicJson<Iso639_3SeedRow[]>('data/language-support/iso6393-seed-rows.json');
hydrateIso6393SeedsFromRowsForTests(isoRows);

const displayPayload = loadPublicJson<{ languages?: Record<string, LanguageDisplayCoreEntry> }>(
  'data/language-support/language-display-names.core.json',
);
const aliasPayload = loadPublicJson<{
  aliasToCode?: Record<string, string>;
  aliasesByCode?: Record<string, readonly string[]>;
}>('data/language-support/language-query-aliases.json');

primeLanguageCatalogRuntimeCacheForSession(
  buildBaselineLanguageCatalogRuntimeCacheFromPublicRecords(
    displayPayload.languages ?? {},
    aliasPayload.aliasToCode ?? {},
    aliasPayload.aliasesByCode ?? {},
  ),
);
