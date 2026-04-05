import type { LanguageCatalogVisibility } from '../db';

const LANGUAGE_CATALOG_RUNTIME_CACHE_STORAGE_KEY = 'jieyu.language-catalog.runtime-cache.v1';

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
  visibility?: LanguageCatalogVisibility;
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

let inMemoryRuntimeCache: LanguageCatalogRuntimeCache = EMPTY_LANGUAGE_CATALOG_RUNTIME_CACHE;

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
  const visibility = record.visibility === 'hidden' ? 'hidden' : record.visibility === 'visible' ? 'visible' : undefined;

  if (!languageCode && !canonicalTag && !iso6391 && !iso6392B && !iso6392T && !iso6393
    && !english && !native && !byLocale && (!aliases || aliases.length === 0) && !visibility) {
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
    ...(visibility ? { visibility } : {}),
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
  try {
    if (typeof window === 'undefined') {
      return inMemoryRuntimeCache;
    }
    const raw = window.localStorage.getItem(LANGUAGE_CATALOG_RUNTIME_CACHE_STORAGE_KEY);
    if (!raw) {
      return inMemoryRuntimeCache;
    }
    const parsed = sanitizeRuntimeCache(JSON.parse(raw));
    inMemoryRuntimeCache = parsed;
    return parsed;
  } catch {
    return inMemoryRuntimeCache;
  }
}

export function writeLanguageCatalogRuntimeCache(cache: LanguageCatalogRuntimeCache): void {
  const sanitized = sanitizeRuntimeCache(cache);
  inMemoryRuntimeCache = sanitized;
  try {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(LANGUAGE_CATALOG_RUNTIME_CACHE_STORAGE_KEY, JSON.stringify(sanitized));
    }
  } catch {
    // 忽略本地缓存写入失败，保留内存态 | Ignore storage failures and keep in-memory cache
  }
}

export function clearLanguageCatalogRuntimeCache(): void {
  inMemoryRuntimeCache = EMPTY_LANGUAGE_CATALOG_RUNTIME_CACHE;
  try {
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(LANGUAGE_CATALOG_RUNTIME_CACHE_STORAGE_KEY);
    }
  } catch {
    // 忽略缓存删除失败 | Ignore cache removal failures
  }
}