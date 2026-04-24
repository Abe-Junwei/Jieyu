/**
 * 运行时读模型缓存：以 localStorage 提供同步可读的语言资产投影快照。
 * Runtime read-model cache: provides synchronous access to the projected
 * language asset catalog via localStorage. The snapshot is rebuilt by
 * LinguisticService after writes and on application boot, allowing sync
 * consumers to read the same merged catalog semantics as the Service layer.
 */
import type { LanguageCatalogVisibility, LanguageDocType } from '../db';
import type { LanguageDisplayCoreEntry } from './languageNameTypes';
import { getLanguageDisplayNameOverride } from './languageNameOverrides';

const LANGUAGE_CATALOG_RUNTIME_CACHE_STORAGE_KEY = 'jieyu.language-catalog.runtime-cache.v1';
const LANGUAGE_DISPLAY_CORE_URL = '/data/language-support/language-display-names.core.json';
const LANGUAGE_QUERY_ALIAS_URL = '/data/language-support/language-query-aliases.json';

export type LanguageCatalogRuntimeEntry = {
  languageCode?: string;
  canonicalTag?: string;
  iso6391?: string;
  iso6392B?: string;
  iso6392T?: string;
  iso6393?: string;
  english?: string;
  native?: string;
  byLocale?: Record<string, string>;
  aliases?: string[];
  scope?: LanguageDocType['scope'];
  languageType?: LanguageDocType['languageType'];
  macrolanguage?: string;
  visibility?: LanguageCatalogVisibility;
  /** Glottolog CLDF baseline ISO 3166-1 alpha-2 (uppercase), sorted */
  baselineDistributionCountryCodes?: string[];
  /** CLDR official-status baseline ISO2, sorted */
  baselineOfficialCountryCodes?: string[];
  /** User override for official countries (same shape as Dexie `countriesOfficial`) */
  countriesOfficial?: string[];
  /** Glottolog baseline (from public display JSON when present) */
  latitude?: number;
  longitude?: number;
};

export type LanguageCatalogRuntimeCache = {
  entries: Record<string, LanguageCatalogRuntimeEntry>;
  aliasToId: Record<string, string>;
  lookupToId: Record<string, string>;
  updatedAt: string;
};

const EMPTY_LANGUAGE_CATALOG_RUNTIME_CACHE: LanguageCatalogRuntimeCache = {
  entries: {},
  aliasToId: {},
  lookupToId: {},
  updatedAt: '',
};

export function buildBaselineLanguageCatalogRuntimeCacheFromPublicRecords(
  languages: Readonly<Record<string, LanguageDisplayCoreEntry>>,
  aliasToCode: Readonly<Record<string, string>>,
  aliasesByCode: Readonly<Record<string, readonly string[]>>,
): LanguageCatalogRuntimeCache {
  const entries = Object.fromEntries(
    Object.entries(languages).map(([languageId, entry]) => {
      const zhOverride = getLanguageDisplayNameOverride(languageId, 'zh-CN');
      const byLocale = {
        ...(entry.byLocale ?? {}),
        ...(zhOverride ? { 'zh-CN': zhOverride } : {}),
      };
      const aliases = aliasesByCode[languageId];

      return [languageId, {
        languageCode: languageId,
        english: entry.english,
        ...(entry.native ? { native: entry.native } : {}),
        ...(Object.keys(byLocale).length > 0 ? { byLocale } : {}),
        ...(aliases?.length ? { aliases: [...aliases] } : {}),
        ...(typeof entry.latitude === 'number' && Number.isFinite(entry.latitude) ? { latitude: entry.latitude } : {}),
        ...(typeof entry.longitude === 'number' && Number.isFinite(entry.longitude) ? { longitude: entry.longitude } : {}),
        visibility: 'visible' as const,
      }] as const;
    }),
  );

  const aliasToId: Record<string, string> = {};
  for (const [alias, languageId] of Object.entries(aliasToCode)) {
    const key = normalizeLanguageCatalogRuntimeLabelKey(alias);
    const id = languageId.trim().toLowerCase();
    if (key.length > 0 && id.length > 0 && !(key in aliasToId)) {
      aliasToId[key] = id;
    }
  }
  for (const [languageId, aliases] of Object.entries(aliasesByCode)) {
    for (const alias of aliases) {
      const key = normalizeLanguageCatalogRuntimeLabelKey(alias);
      if (key.length > 0 && !(key in aliasToId)) {
        aliasToId[key] = languageId;
      }
    }
  }

  const lookupToId = Object.fromEntries(
    Object.keys(languages).map((languageId) => [normalizeLanguageCatalogRuntimeLookupKey(languageId), languageId] as const),
  );

  return {
    entries,
    aliasToId,
    lookupToId,
    updatedAt: 'baseline-public-json',
  };
}

/** Last successfully fetched / primed baseline (used by tests after `clearLanguageCatalogRuntimeCache`). */
let sessionBaselineCache: LanguageCatalogRuntimeCache = EMPTY_LANGUAGE_CATALOG_RUNTIME_CACHE;
let baselineGeneratedLanguageIds: readonly string[] = [];
let baselineGeneratedLanguageIdSet: ReadonlySet<string> = new Set();

/**
 * Fetches public JSON baselines (B-3). Throws on hard network/parse failure — caller may catch and fall back to empty.
 */
export async function fetchLanguageCatalogBaselineRuntimeCache(): Promise<LanguageCatalogRuntimeCache> {
  const [displayRes, aliasRes] = await Promise.all([
    fetch(LANGUAGE_DISPLAY_CORE_URL, { cache: 'force-cache' }),
    fetch(LANGUAGE_QUERY_ALIAS_URL, { cache: 'force-cache' }),
  ]);
  if (!displayRes.ok || !aliasRes.ok) {
    throw new Error(`language baseline fetch failed (${displayRes.status} / ${aliasRes.status})`);
  }
  const displayPayload = await displayRes.json() as { languages?: Record<string, LanguageDisplayCoreEntry> };
  const aliasPayload = await aliasRes.json() as {
    aliasToCode?: Record<string, string>;
    aliasesByCode?: Record<string, readonly string[]>;
  };
  const languages = displayPayload.languages ?? {};
  const aliasToCode = aliasPayload.aliasToCode ?? {};
  const aliasesByCode = aliasPayload.aliasesByCode ?? {};
  return buildBaselineLanguageCatalogRuntimeCacheFromPublicRecords(languages, aliasToCode, aliasesByCode);
}

/**
 * Boot-time: prefer Dexie/localStorage snapshot if present; otherwise install fetched baseline.
 * Must run before first consumer `readLanguageCatalogRuntimeCache()` in production.
 */
export function primeLanguageCatalogRuntimeCacheForSession(fetchedBaseline: LanguageCatalogRuntimeCache): void {
  const sanitized = sanitizeRuntimeCache(fetchedBaseline);
  sessionBaselineCache = Object.freeze(sanitized) as LanguageCatalogRuntimeCache;
  baselineGeneratedLanguageIds = Object.keys(sessionBaselineCache.entries).sort();
  baselineGeneratedLanguageIdSet = new Set(baselineGeneratedLanguageIds);
  try {
    if (typeof window !== 'undefined') {
      const raw = window.localStorage.getItem(LANGUAGE_CATALOG_RUNTIME_CACHE_STORAGE_KEY);
      if (raw) {
        inMemoryRuntimeCache = sanitizeRuntimeCache(JSON.parse(raw));
        localStorageHydrated = true;
        return;
      }
    }
  } catch {
    // fall through to baseline
  }
  inMemoryRuntimeCache = sessionBaselineCache;
  localStorageHydrated = true;
}

export function getBaselineGeneratedLanguageIds(): readonly string[] {
  return baselineGeneratedLanguageIds;
}

/** True iff `languageId` is a key from the last fetched public baseline (legacy `GENERATED_LANGUAGE_*[id]` scope). */
export function isPublicBaselineCatalogLanguageId(languageId: string | undefined): boolean {
  const id = languageId?.trim().toLowerCase() ?? '';
  return id.length > 0 && baselineGeneratedLanguageIdSet.has(id);
}

let inMemoryRuntimeCache: LanguageCatalogRuntimeCache = EMPTY_LANGUAGE_CATALOG_RUNTIME_CACHE;
// 标记是否已从 localStorage 水合过 | Whether the cache has been hydrated from localStorage
let localStorageHydrated = false;

function normalizeBaselineIso2Array(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const upper = value
    .filter((item): item is string => typeof item === 'string' && /^[A-Za-z]{2}$/.test(item.trim()))
    .map((item) => item.trim().toUpperCase());
  if (!upper.length) {
    return undefined;
  }
  return [...new Set(upper)].sort((a, b) => a.localeCompare(b));
}

function normalizeRuntimeLocaleMap(value: unknown): Record<string, string> | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }

  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => typeof item === 'string' && item.trim().length > 0)
    .map(([locale, item]) => [locale, (item as string).trim()] as const);

  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

function sanitizeRuntimeEntry(value: unknown): LanguageCatalogRuntimeEntry | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }

  const record = value as Record<string, unknown>;
  const languageCode = typeof record.languageCode === 'string' && record.languageCode.trim().length > 0
    ? record.languageCode.trim().toLowerCase()
    : undefined;
  const canonicalTag = typeof record.canonicalTag === 'string' && record.canonicalTag.trim().length > 0
    ? record.canonicalTag.trim()
    : undefined;
  const iso6391 = typeof record.iso6391 === 'string' && record.iso6391.trim().length > 0
    ? record.iso6391.trim().toLowerCase()
    : undefined;
  const iso6392B = typeof record.iso6392B === 'string' && record.iso6392B.trim().length > 0
    ? record.iso6392B.trim().toLowerCase()
    : undefined;
  const iso6392T = typeof record.iso6392T === 'string' && record.iso6392T.trim().length > 0
    ? record.iso6392T.trim().toLowerCase()
    : undefined;
  const iso6393 = typeof record.iso6393 === 'string' && record.iso6393.trim().length > 0
    ? record.iso6393.trim().toLowerCase()
    : undefined;
  const english = typeof record.english === 'string' && record.english.trim().length > 0
    ? record.english.trim()
    : undefined;
  const native = typeof record.native === 'string' && record.native.trim().length > 0
    ? record.native.trim()
    : undefined;
  const byLocale = normalizeRuntimeLocaleMap(record.byLocale);
  const aliases = Array.isArray(record.aliases)
    ? record.aliases
      .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
      .map((item) => item.trim())
    : undefined;
  const scope = record.scope === 'individual'
    || record.scope === 'macrolanguage'
    || record.scope === 'collection'
    || record.scope === 'special'
    || record.scope === 'private-use'
    ? record.scope
    : undefined;
  const languageType = record.languageType === 'living'
    || record.languageType === 'historical'
    || record.languageType === 'extinct'
    || record.languageType === 'ancient'
    || record.languageType === 'constructed'
    || record.languageType === 'special'
    ? record.languageType
    : undefined;
  const macrolanguage = typeof record.macrolanguage === 'string' && record.macrolanguage.trim().length > 0
    ? record.macrolanguage.trim().toLowerCase()
    : undefined;
  const visibility = record.visibility === 'hidden' ? 'hidden' : record.visibility === 'visible' ? 'visible' : undefined;
  const baselineDistributionCountryCodes = normalizeBaselineIso2Array(record.baselineDistributionCountryCodes);
  const baselineOfficialCountryCodes = normalizeBaselineIso2Array(record.baselineOfficialCountryCodes);
  const countriesOfficial = Array.isArray(record.countriesOfficial)
    ? record.countriesOfficial
      .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
      .map((item) => item.trim())
    : undefined;
  const latitude = typeof record.latitude === 'number' && Number.isFinite(record.latitude) ? record.latitude : undefined;
  const longitude = typeof record.longitude === 'number' && Number.isFinite(record.longitude) ? record.longitude : undefined;

  if (!languageCode && !canonicalTag && !iso6391 && !iso6392B && !iso6392T && !iso6393
    && !english && !native && !byLocale && (!aliases || aliases.length === 0)
    && !scope && !languageType && !macrolanguage && !visibility
    && !baselineDistributionCountryCodes && !baselineOfficialCountryCodes
    && !(countriesOfficial && countriesOfficial.length > 0)
    && latitude === undefined && longitude === undefined) {
    return undefined;
  }

  return {
    ...(languageCode ? { languageCode } : {}),
    ...(canonicalTag ? { canonicalTag } : {}),
    ...(iso6391 ? { iso6391 } : {}),
    ...(iso6392B ? { iso6392B } : {}),
    ...(iso6392T ? { iso6392T } : {}),
    ...(iso6393 ? { iso6393 } : {}),
    ...(english ? { english } : {}),
    ...(native ? { native } : {}),
    ...(byLocale ? { byLocale } : {}),
    ...(aliases && aliases.length > 0 ? { aliases } : {}),
    ...(scope ? { scope } : {}),
    ...(languageType ? { languageType } : {}),
    ...(macrolanguage ? { macrolanguage } : {}),
    ...(visibility ? { visibility } : {}),
    ...(baselineDistributionCountryCodes?.length ? { baselineDistributionCountryCodes } : {}),
    ...(baselineOfficialCountryCodes?.length ? { baselineOfficialCountryCodes } : {}),
    ...(countriesOfficial && countriesOfficial.length > 0 ? { countriesOfficial } : {}),
    ...(latitude !== undefined ? { latitude } : {}),
    ...(longitude !== undefined ? { longitude } : {}),
  };
}

function sanitizeRuntimeCache(value: unknown): LanguageCatalogRuntimeCache {
  if (!value || typeof value !== 'object') {
    return EMPTY_LANGUAGE_CATALOG_RUNTIME_CACHE;
  }

  const record = value as Record<string, unknown>;
  const entriesSource = record.entries && typeof record.entries === 'object'
    ? record.entries as Record<string, unknown>
    : {};
  const aliasToIdSource = record.aliasToId && typeof record.aliasToId === 'object'
    ? record.aliasToId as Record<string, unknown>
    : {};
  const lookupToIdSource = record.lookupToId && typeof record.lookupToId === 'object'
    ? record.lookupToId as Record<string, unknown>
    : {};

  const entries = Object.fromEntries(
    Object.entries(entriesSource)
      .map(([languageId, entry]) => [languageId.trim().toLowerCase(), sanitizeRuntimeEntry(entry)] as const)
      .filter((item): item is [string, LanguageCatalogRuntimeEntry] => Boolean(item[0]) && Boolean(item[1])),
  );
  const aliasToId = Object.fromEntries(
    Object.entries(aliasToIdSource)
      .filter(([, languageId]) => typeof languageId === 'string' && languageId.trim().length > 0)
      .map(([alias, languageId]) => [alias, (languageId as string).trim().toLowerCase()] as const),
  );
  const lookupToId = Object.fromEntries(
    Object.entries(lookupToIdSource)
      .filter(([, languageId]) => typeof languageId === 'string' && languageId.trim().length > 0)
      .map(([lookupKey, languageId]) => [normalizeLanguageCatalogRuntimeLookupKey(lookupKey), (languageId as string).trim().toLowerCase()] as const)
      .filter(([lookupKey]) => lookupKey.length > 0),
  );

  return {
    entries,
    aliasToId,
    lookupToId,
    updatedAt: typeof record.updatedAt === 'string' ? record.updatedAt : '',
  };
}

export function normalizeLanguageCatalogRuntimeLabelKey(label: string | undefined): string {
  return label?.normalize('NFKC').trim().toLowerCase() ?? '';
}

export function normalizeLanguageCatalogRuntimeLookupKey(value: string | undefined): string {
  return value?.normalize('NFKC').trim().toLowerCase() ?? '';
}

export function readLanguageCatalogRuntimeCache(): LanguageCatalogRuntimeCache {
  // 首次读取时从 localStorage 水合一次，后续直接返回内存缓存 | Hydrate once from localStorage on first read, then return in-memory cache
  if (!localStorageHydrated) {
    localStorageHydrated = true;
    try {
      if (typeof window !== 'undefined') {
        const raw = window.localStorage.getItem(LANGUAGE_CATALOG_RUNTIME_CACHE_STORAGE_KEY);
        if (raw) {
          inMemoryRuntimeCache = sanitizeRuntimeCache(JSON.parse(raw));
        }
      }
    } catch {
      // 解析失败保留基线缓存 | Keep baseline cache on parse failure
    }
  }
  return inMemoryRuntimeCache;
}

export function writeLanguageCatalogRuntimeCache(cache: LanguageCatalogRuntimeCache): void {
  const sanitized = sanitizeRuntimeCache(cache);
  // C6: 写入时生成不可变快照，避免并发读取到半更新状态 | Freeze snapshot on write to prevent concurrent reads from seeing partial updates
  inMemoryRuntimeCache = Object.freeze(sanitized) as LanguageCatalogRuntimeCache;
  try {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(LANGUAGE_CATALOG_RUNTIME_CACHE_STORAGE_KEY, JSON.stringify(sanitized));
    }
  } catch {
    // 忽略本地缓存写入失败，保留内存态 | Ignore storage failures and keep in-memory cache
  }
  // H8: 通知消费端缓存已刷新 | Notify consumers that cache has been refreshed
  notifyLanguageCatalogCacheListeners();
}

type LanguageCatalogCacheListener = () => void;
const cacheListeners = new Set<LanguageCatalogCacheListener>();

export function subscribeLanguageCatalogCacheChange(listener: LanguageCatalogCacheListener): () => void {
  cacheListeners.add(listener);
  return () => { cacheListeners.delete(listener); };
}

function notifyLanguageCatalogCacheListeners(): void {
  cacheListeners.forEach((listener) => {
    try { listener(); } catch { /* 忽略监听器错误 | Ignore listener errors */ }
  });
}

export function clearLanguageCatalogRuntimeCache(): void {
  inMemoryRuntimeCache = sessionBaselineCache;
  localStorageHydrated = true; // 已显式重置，无需再水合 | Explicitly reset, no need to re-hydrate
  try {
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(LANGUAGE_CATALOG_RUNTIME_CACHE_STORAGE_KEY);
    }
  } catch {
    // 忽略缓存删除失败 | Ignore cache removal failures
  }
  // H8: 清除时也通知消费端 | Notify consumers on clear as well
  notifyLanguageCatalogCacheListeners();
}