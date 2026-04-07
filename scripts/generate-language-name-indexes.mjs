/**
 * 基线种子生成器与快照构建器 | Baseline seed generator & snapshot builder
 *
 * 本脚本从 ISO 639 数据库和种子文件生成内置基线数据（Layer ①），
 * 并非运行时唯一数据来源。用户通过 UI 添加/修改的条目存储在 IndexedDB 中（Layer ②），
 * 并通过运行时缓存在读取时优先于本文件的输出。
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import { iso6393 } from 'iso-639-3';

const TOP500_SEED_PATH = path.resolve(process.cwd(), 'public/data/language-support/top500-language-orthography-seeds.json');
const ALIAS_SEED_PATH = path.resolve(process.cwd(), 'scripts/lib/language-name-aliases.json');
const DISPLAY_OVERRIDE_SEED_PATH = path.resolve(process.cwd(), 'scripts/lib/language-name-display-overrides.json');
const OUTPUT_DIR = path.resolve(process.cwd(), 'public/data/language-support');
const OUTPUT_CORE_JSON = path.join(OUTPUT_DIR, 'language-display-names.core.json');
const OUTPUT_ALIAS_JSON = path.join(OUTPUT_DIR, 'language-query-aliases.json');
const OUTPUT_TS = path.resolve(process.cwd(), 'src/data/generated/languageNameCatalog.generated.ts');
const OUTPUT_ISO_SEED_TS = path.resolve(process.cwd(), 'src/data/generated/iso6393Seed.generated.ts');

const QUERY_LOCALES = [
  { locale: 'zh-CN', cldr: 'zh' },
  { locale: 'en-US', cldr: 'en' },
  { locale: 'fr-FR', cldr: 'fr' },
  { locale: 'es-ES', cldr: 'es' },
  { locale: 'de-DE', cldr: 'de' },
];

const LANGUAGE_BCP47_FALLBACK = {
  cmn: 'zh-CN',
  yue: 'zh-HK',
  wuu: 'zh-CN',
  nan: 'zh-TW',
  bod: 'bo',
  uig: 'ug',
  mon: 'mn',
  zha: 'za',
  kor: 'ko-KR',
  jpn: 'ja-JP',
  tha: 'th-TH',
  vie: 'vi-VN',
  khm: 'km-KH',
  mya: 'my-MM',
  ind: 'id-ID',
  msa: 'ms-MY',
  tgl: 'tl-PH',
  hin: 'hi-IN',
  ben: 'bn-IN',
  tam: 'ta-IN',
  urd: 'ur-PK',
  nep: 'ne-NP',
  eng: 'en-US',
  fra: 'fr-FR',
  deu: 'de-DE',
  spa: 'es-ES',
  por: 'pt-BR',
  rus: 'ru-RU',
  ita: 'it-IT',
  nld: 'nl-NL',
  pol: 'pl-PL',
  tur: 'tr-TR',
  ara: 'ar-SA',
  heb: 'he-IL',
  swa: 'sw-KE',
  amh: 'am-ET',
};

const ISO6393_ENGLISH_NAME_BY_CODE = new Map(
  iso6393
    .map((entry) => [entry.iso6393.toLowerCase(), entry.name])
    .filter((entry) => entry[0].length > 0 && entry[1].trim().length > 0),
);

const CHINESE_VARIETY_CODES = new Set(['cmn', 'yue', 'wuu', 'nan', 'hak']);

const SUPPRESSED_NATIVE_DISPLAY_NAMES_BY_CODE = {
  ind: new Set(['indonesia']),
  tgl: new Set(['filipino']),
};

function normalizeLabel(value) {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  if (!trimmed || trimmed === '↑↑↑') {
    return '';
  }
  return trimmed;
}

function normalizeLanguageLabelKey(value) {
  return normalizeLabel(value).normalize('NFKC').toLowerCase();
}

function dedupeQueryEntries(entries) {
  const seen = new Set();
  const result = [];

  entries.forEach((entry) => {
    if (!entry?.label || !entry?.kind) {
      return;
    }
    const normalizedLabel = normalizeLanguageLabelKey(entry.label);
    if (!normalizedLabel || seen.has(normalizedLabel)) {
      return;
    }
    seen.add(normalizedLabel);
    result.push({
      label: normalizeLabel(entry.label),
      kind: entry.kind,
    });
  });

  return result;
}

function resolveEnglishDisplayName(language) {
  const preferredLabel = normalizeLabel(language.languageLabel);
  if (preferredLabel && !/^Q\d+$/i.test(preferredLabel)) {
    return preferredLabel;
  }
  return ISO6393_ENGLISH_NAME_BY_CODE.get(language.iso6393) ?? language.iso6393;
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'GitHubCopilot/1.0 (Jieyu language name generator)',
    },
  });
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status} ${response.statusText} (${url})`);
  }
  return response.json();
}

async function loadTop500SeedLanguages() {
  const raw = await readFile(TOP500_SEED_PATH, 'utf8');
  const parsed = JSON.parse(raw);
  return Array.isArray(parsed.languages) ? parsed.languages : [];
}

async function loadAliasSeed() {
  const raw = await readFile(ALIAS_SEED_PATH, 'utf8');
  const parsed = JSON.parse(raw);
  return parsed && typeof parsed === 'object' ? parsed : {};
}

async function loadDisplayOverrideSeed() {
  const raw = await readFile(DISPLAY_OVERRIDE_SEED_PATH, 'utf8');
  const parsed = JSON.parse(raw);
  return parsed && typeof parsed === 'object' ? parsed : {};
}

async function loadCldrLanguageMaps() {
  const entries = await Promise.all(
    QUERY_LOCALES.map(async ({ locale, cldr }) => {
      const url = `https://raw.githubusercontent.com/unicode-org/cldr-json/main/cldr-json/cldr-localenames-full/main/${cldr}/languages.json`;
      const response = await fetchJson(url);
      const languageMap = response?.main?.[cldr]?.localeDisplayNames?.languages ?? {};
      return [locale, languageMap];
    }),
  );
  return Object.fromEntries(entries);
}

function resolveLanguageTagCandidates(language) {
  return Array.from(new Set([
    language.iso6391,
    LANGUAGE_BCP47_FALLBACK[language.iso6393],
    language.iso6393,
  ].filter((value) => typeof value === 'string' && value.trim().length > 0)));
}

function tryIntlDisplayName(locale, languageTag) {
  try {
    if (Intl.DisplayNames.supportedLocalesOf([locale]).length === 0) {
      return '';
    }
    const displayName = new Intl.DisplayNames([locale], { type: 'language' }).of(languageTag)?.trim() ?? '';
    return displayName && displayName.toLowerCase() !== languageTag.toLowerCase()
      ? displayName
      : '';
  } catch {
    return '';
  }
}

function isGenericChineseDisplayName(languageCode, displayName) {
  if (!CHINESE_VARIETY_CODES.has(languageCode)) {
    return false;
  }
  const normalized = normalizeLanguageLabelKey(displayName);
  return normalized === '中文'
    || normalized === 'chinese'
    || normalized.startsWith('中文(')
    || normalized.startsWith('中文（')
    || normalized.startsWith('chinese(')
    || normalized.startsWith('chinese (')
    || normalized.startsWith('chinese（');
}

function sanitizeResolvedDisplayName(languageCode, displayName) {
  const normalizedDisplayName = normalizeLabel(displayName);
  if (!normalizedDisplayName) {
    return '';
  }
  return isGenericChineseDisplayName(languageCode, normalizedDisplayName)
    ? ''
    : normalizedDisplayName;
}

function sanitizeResolvedNativeDisplayName(languageCode, displayName) {
  const sanitizedDisplayName = sanitizeResolvedDisplayName(languageCode, displayName);
  if (!sanitizedDisplayName) {
    return '';
  }
  const normalizedDisplayName = normalizeLanguageLabelKey(sanitizedDisplayName);
  return SUPPRESSED_NATIVE_DISPLAY_NAMES_BY_CODE[languageCode]?.has(normalizedDisplayName)
    ? ''
    : sanitizedDisplayName;
}

function shouldPreferPrimaryDisplayName(exactDisplayName, primaryDisplayName) {
  const normalizedExact = normalizeLanguageLabelKey(exactDisplayName);
  const normalizedPrimary = normalizeLanguageLabelKey(primaryDisplayName);
  if (!normalizedExact || !normalizedPrimary || normalizedExact === normalizedPrimary) {
    return false;
  }
  return normalizedExact.includes(normalizedPrimary);
}

function resolveLocaleDisplayName(language, locale, cldrLanguageMap) {
  const candidates = resolveLanguageTagCandidates(language);
  for (const candidate of candidates) {
    const exact = sanitizeResolvedDisplayName(language.iso6393, cldrLanguageMap[candidate]);
    const primarySubtag = candidate.split(/[-_]/)[0] ?? '';
    const primary = sanitizeResolvedDisplayName(language.iso6393, cldrLanguageMap[primarySubtag]);
    if (exact && primary && shouldPreferPrimaryDisplayName(exact, primary)) {
      return primary;
    }
    if (exact) {
      return exact;
    }
    if (primary) {
      return primary;
    }
  }

  for (const candidate of candidates) {
    const intlDisplayName = sanitizeResolvedDisplayName(language.iso6393, tryIntlDisplayName(locale, candidate));
    if (intlDisplayName) {
      return intlDisplayName;
    }
  }

  return '';
}

function resolveNativeDisplayName(language, cldrLanguageMaps) {
  const candidates = resolveLanguageTagCandidates(language);

  for (const candidate of candidates) {
    const primarySubtag = candidate.split(/[-_]/)[0] ?? '';
    const cldrLocaleMap = cldrLanguageMaps[candidate] ?? cldrLanguageMaps[primarySubtag] ?? null;
    if (cldrLocaleMap) {
      const exact = sanitizeResolvedNativeDisplayName(language.iso6393, cldrLocaleMap[candidate]);
      const primary = sanitizeResolvedNativeDisplayName(language.iso6393, cldrLocaleMap[primarySubtag]);
      if (exact && primary && shouldPreferPrimaryDisplayName(exact, primary)) {
        return primary;
      }
      if (exact) {
        return exact;
      }
      if (primary) {
        return primary;
      }
    }
  }

  for (const candidate of candidates) {
    const intlDisplayName = sanitizeResolvedNativeDisplayName(language.iso6393, tryIntlDisplayName(candidate, candidate));
    if (intlDisplayName) {
      return intlDisplayName;
    }
  }

  return '';
}

function applyDisplayOverride(languageCode, entry, displayOverrideSeed) {
  const override = displayOverrideSeed[languageCode];
  if (!override || typeof override !== 'object') {
    return entry;
  }

  const nextByLocale = { ...(entry.byLocale ?? {}) };
  if (override.byLocale && typeof override.byLocale === 'object') {
    QUERY_LOCALES.forEach(({ locale }) => {
      const overrideLabel = normalizeLabel(override.byLocale[locale]);
      if (overrideLabel) {
        nextByLocale[locale] = overrideLabel;
      }
    });
  }

  const english = normalizeLabel(override.english) || entry.english;
  const native = normalizeLabel(override.native) || entry.native || '';

  return {
    english,
    ...(native ? { native } : {}),
    ...(Object.keys(nextByLocale).length > 0 ? { byLocale: nextByLocale } : {}),
  };
}

function buildAliasMaps(aliasSeed) {
  const aliasToCode = {};
  const aliasesByCodeBuckets = new Map();

  Object.entries(aliasSeed).forEach(([alias, code]) => {
    const normalizedAlias = normalizeLanguageLabelKey(alias);
    const normalizedCode = normalizeLabel(code).toLowerCase();
    if (!normalizedAlias || !normalizedCode) {
      return;
    }
    if (!(normalizedAlias in aliasToCode)) {
      aliasToCode[normalizedAlias] = normalizedCode;
    }

    const bucket = aliasesByCodeBuckets.get(normalizedCode) ?? [];
    if (!bucket.some((existingAlias) => normalizeLanguageLabelKey(existingAlias) === normalizedAlias)) {
      bucket.push(normalizeLabel(alias));
    }
    aliasesByCodeBuckets.set(normalizedCode, bucket);
  });

  return {
    aliasToCode,
    aliasesByCode: Object.fromEntries(aliasesByCodeBuckets.entries()),
  };
}

function buildQueryEntriesForLocale({
  locale,
  english,
  native,
  byLocale,
  aliases,
}) {
  const currentLocal = byLocale[locale];
  const otherLocaleLabels = QUERY_LOCALES
    .map(({ locale: candidateLocale }) => candidateLocale)
    .filter((candidateLocale) => candidateLocale !== locale)
    .map((candidateLocale) => byLocale[candidateLocale])
    .filter(Boolean);

  return dedupeQueryEntries([
    ...(currentLocal ? [{ label: currentLocal, kind: 'local' }] : []),
    ...(native ? [{ label: native, kind: 'native' }] : []),
    ...(english ? [{ label: english, kind: 'english' }] : []),
    ...otherLocaleLabels.map((label) => ({ label, kind: 'alias' })),
    ...aliases.map((label) => ({ label, kind: 'alias' })),
  ]);
}

function buildCoreDisplayPayload(languages, cldrLanguageMaps, aliasesByCode, displayOverrideSeed) {
  const core = {};
  const queryIndexes = Object.fromEntries(QUERY_LOCALES.map(({ locale }) => [locale, {}]));

  languages.forEach((language) => {
    const generatedByLocale = {};
    const generatedEnglish = resolveEnglishDisplayName(language);
    QUERY_LOCALES.forEach(({ locale }) => {
      const localeDisplayName = resolveLocaleDisplayName(language, locale, cldrLanguageMaps[locale] ?? {});
      if (localeDisplayName) {
        generatedByLocale[locale] = localeDisplayName;
      }
    });

    const native = resolveNativeDisplayName(language, cldrLanguageMaps);
    const displayEntry = applyDisplayOverride(language.iso6393, {
      english: generatedEnglish,
      ...(native ? { native } : {}),
      ...(Object.keys(generatedByLocale).length > 0 ? { byLocale: generatedByLocale } : {}),
    }, displayOverrideSeed);
    const aliases = aliasesByCode[language.iso6393] ?? [];
    QUERY_LOCALES.forEach(({ locale }) => {
      queryIndexes[locale][language.iso6393] = buildQueryEntriesForLocale({
        locale,
        english: displayEntry.english,
        native: displayEntry.native,
        byLocale: displayEntry.byLocale ?? {},
        aliases,
      });
    });

    if (language.latitude !== undefined && language.longitude !== undefined) {
      displayEntry.latitude = language.latitude;
      displayEntry.longitude = language.longitude;
    }
    core[language.iso6393] = displayEntry;
  });

  return { core, queryIndexes };
}

function toTsModule(core, queryIndexes, aliasToCode, aliasesByCode) {
  return [
    "import type {",
    "  LanguageAliasToCodeRecord,",
    "  LanguageAliasesByCodeRecord,",
    "  LanguageDisplayCoreEntry,",
    "  LanguageNameQueryLocale,",
    "  LanguageQueryIndexLocaleRecord,",
    "} from '../languageNameTypes';",
    '',
    'export const GENERATED_LANGUAGE_DISPLAY_NAME_CORE: Readonly<Record<string, LanguageDisplayCoreEntry>> = ',
    `${JSON.stringify(core, null, 2)};`,
    '',
    'export const GENERATED_LANGUAGE_QUERY_INDEXES: Readonly<Record<LanguageNameQueryLocale, LanguageQueryIndexLocaleRecord>> = ',
    `${JSON.stringify(queryIndexes, null, 2)};`,
    '',
    'export const GENERATED_LANGUAGE_ALIAS_TO_CODE: LanguageAliasToCodeRecord = ',
    `${JSON.stringify(aliasToCode, null, 2)};`,
    '',
    'export const GENERATED_LANGUAGE_ALIASES_BY_CODE: LanguageAliasesByCodeRecord = ',
    `${JSON.stringify(aliasesByCode, null, 2)};`,
    '',
  ].join('\n');
}

function toIsoSeedTsModule() {
  const rows = iso6393
    .filter((entry) => entry.iso6393.trim().length > 0)
    .map((entry) => ([
      entry.iso6393.toLowerCase(),
      entry.name,
      ('invertedName' in entry && typeof entry.invertedName === 'string' && entry.invertedName.trim().length > 0)
        ? entry.invertedName
        : null,
      entry.iso6391?.toLowerCase() ?? null,
      entry.iso6392B?.toLowerCase() ?? null,
      entry.iso6392T?.toLowerCase() ?? null,
      entry.scope,
      entry.type,
    ]));

  return [
    "import type { Iso639_3SeedRow } from '../iso6393Seed';",
    '',
    'export const GENERATED_ISO6393_SEED_ROWS: readonly Iso639_3SeedRow[] = ',
    `${JSON.stringify(rows, null, 2)} as const;`,
    '',
  ].join('\n');
}

async function main() {
  const [languages, cldrLanguageMaps, aliasSeed, displayOverrideSeed] = await Promise.all([
    loadTop500SeedLanguages(),
    loadCldrLanguageMaps(),
    loadAliasSeed(),
    loadDisplayOverrideSeed(),
  ]);
  const { aliasToCode, aliasesByCode } = buildAliasMaps(aliasSeed);
  const { core, queryIndexes } = buildCoreDisplayPayload(languages, cldrLanguageMaps, aliasesByCode, displayOverrideSeed);

  await mkdir(OUTPUT_DIR, { recursive: true });
  await mkdir(path.dirname(OUTPUT_TS), { recursive: true });

  await writeFile(OUTPUT_CORE_JSON, `${JSON.stringify({
    generatedAt: new Date().toISOString(),
    sourceSeed: 'top500-language-orthography-seeds.json',
    sourceAliasSeed: 'language-name-aliases.json',
    queryLocales: QUERY_LOCALES.map(({ locale }) => locale),
    languages: core,
  }, null, 2)}\n`, 'utf8');

  await writeFile(OUTPUT_ALIAS_JSON, `${JSON.stringify({
    generatedAt: new Date().toISOString(),
    sourceAliasSeed: 'language-name-aliases.json',
    aliasToCode,
    aliasesByCode,
  }, null, 2)}\n`, 'utf8');

  await Promise.all(
    QUERY_LOCALES.map(async ({ locale }) => {
      const filePath = path.join(OUTPUT_DIR, `language-query-index.${locale}.json`);
      await writeFile(filePath, `${JSON.stringify({
        generatedAt: new Date().toISOString(),
        sourceSeed: 'top500-language-orthography-seeds.json',
        sourceAliasSeed: 'language-name-aliases.json',
        locale,
        entriesByIso6393: queryIndexes[locale],
      }, null, 2)}\n`, 'utf8');
    }),
  );

  await writeFile(OUTPUT_TS, toTsModule(core, queryIndexes, aliasToCode, aliasesByCode), 'utf8');
  await writeFile(OUTPUT_ISO_SEED_TS, toIsoSeedTsModule(), 'utf8');

  console.log(`Generated language name core: ${OUTPUT_CORE_JSON}`);
  console.log(`Generated language alias index: ${OUTPUT_ALIAS_JSON}`);
  console.log(`Generated runtime module: ${OUTPUT_TS}`);
  console.log(`Generated ISO seed runtime module: ${OUTPUT_ISO_SEED_TS}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});