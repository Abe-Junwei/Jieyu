import {
  LANGUAGE_NAME_QUERY_LOCALES,
  type LanguageDisplayCoreEntry,
  type LanguageNameQueryLocale,
  type LanguageQueryIndexLocaleRecord,
  type LanguageQueryLabelEntry,
} from '../data/languageNameTypes';

const LANGUAGE_CATALOG_RUNTIME_CACHE_STORAGE_KEY = 'jieyu.language-catalog.runtime-cache.v1';
const LANGUAGE_DISPLAY_CORE_URL = '/data/language-support/language-display-names.core.json';
const LANGUAGE_QUERY_ALIAS_URL = '/data/language-support/language-query-aliases.json';

type RuntimeLanguageCatalogEntry = {
  languageCode?: string;
  english?: string;
  native?: string;
  byLocale?: Record<string, string>;
  aliases?: string[];
  visibility?: 'visible' | 'hidden';
};

type RuntimeLanguageCatalogSnapshot = {
  entries: Record<string, RuntimeLanguageCatalogEntry>;
};

type LanguageDisplayCorePayload = {
  languages: Record<string, LanguageDisplayCoreEntry>;
};

type LanguageQueryAliasPayload = {
  aliasToCode: Record<string, string>;
  aliasesByCode: Record<string, readonly string[]>;
};

type LanguageQueryIndexPayload = {
  locale: LanguageNameQueryLocale;
  entriesByIso6393: LanguageQueryIndexLocaleRecord;
};

type LanguageSearchLabelKind = LanguageQueryLabelEntry['kind'] | 'code';

type LanguageCatalogCandidate = {
  id: string;
  languageCode: string;
  englishName?: string;
  nativeName?: string;
  byLocale?: Partial<Record<LanguageNameQueryLocale, string>>;
  aliases: readonly string[];
  visibility: 'visible' | 'hidden';
  hasRuntimeOverride: boolean;
  queryEntries: readonly LanguageQueryLabelEntry[];
};

type LanguageCatalogMatch = {
  rank: number;
  matchedLabel: string;
  matchedLabelKind: LanguageSearchLabelKind;
  matchSource: string;
  runtimePriority: 0 | 1;
};

export type LanguageCatalogSearchSuggestion = {
  id: string;
  languageCode: string;
  primaryLabel: string;
  secondaryLabel?: string;
  matchedLabel: string;
  matchedLabelKind: LanguageSearchLabelKind;
  matchSource: string;
  rank: number;
  hasRuntimeOverride: boolean;
};

export type LanguageCatalogSearchEntry = {
  id: string;
  languageCode: string;
  englishName: string;
  localName: string;
  nativeName?: string;
  aliases: readonly string[];
  byLocale?: Partial<Record<LanguageNameQueryLocale, string>>;
  visibility: 'visible' | 'hidden';
  hasRuntimeOverride: boolean;
};

export type SearchLanguageCatalogSuggestionsOptions = {
  query: string;
  locale: LanguageNameQueryLocale;
  limit?: number;
};

let displayCorePromise: Promise<LanguageDisplayCorePayload> | null = null;
let queryAliasPromise: Promise<LanguageQueryAliasPayload> | null = null;
const queryIndexPromiseByLocale = new Map<LanguageNameQueryLocale, Promise<LanguageQueryIndexPayload>>();

function normalizeSearchKey(value: string | undefined): string {
  return value?.normalize('NFKC').trim().toLowerCase() ?? '';
}

function sanitizeLocaleMap(value: unknown): Partial<Record<LanguageNameQueryLocale, string>> | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }

  const entries = Object.entries(value as Record<string, unknown>)
    .filter((entry): entry is [string, string] => (
      typeof entry[1] === 'string'
      && entry[1].trim().length > 0
      && LANGUAGE_NAME_QUERY_LOCALES.includes(entry[0] as LanguageNameQueryLocale)
    ))
    .map(([locale, label]) => [locale as LanguageNameQueryLocale, label.trim()] as const);

  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

function sanitizeStringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value
      .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
      .map((item) => item.trim())
    : [];
}

function sanitizeRuntimeEntry(value: unknown): RuntimeLanguageCatalogEntry | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }

  const record = value as Record<string, unknown>;
  const languageCode = typeof record.languageCode === 'string' && record.languageCode.trim().length > 0
    ? record.languageCode.trim().toLowerCase()
    : undefined;
  const english = typeof record.english === 'string' && record.english.trim().length > 0
    ? record.english.trim()
    : undefined;
  const native = typeof record.native === 'string' && record.native.trim().length > 0
    ? record.native.trim()
    : undefined;
  const byLocale = sanitizeLocaleMap(record.byLocale);
  const aliases = sanitizeStringList(record.aliases);
  const visibility = record.visibility === 'hidden' ? 'hidden' : 'visible';

  if (!languageCode && !english && !native && !byLocale && aliases.length === 0 && visibility === 'visible') {
    return undefined;
  }

  return {
    ...(languageCode ? { languageCode } : {}),
    ...(english ? { english } : {}),
    ...(native ? { native } : {}),
    ...(byLocale ? { byLocale } : {}),
    ...(aliases.length > 0 ? { aliases } : {}),
    visibility,
  };
}

function readRuntimeLanguageCatalogSnapshot(): RuntimeLanguageCatalogSnapshot {
  if (typeof window === 'undefined') {
    return { entries: {} };
  }

  try {
    const raw = window.localStorage.getItem(LANGUAGE_CATALOG_RUNTIME_CACHE_STORAGE_KEY);
    if (!raw) {
      return { entries: {} };
    }

    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const entriesSource = parsed.entries && typeof parsed.entries === 'object'
      ? parsed.entries as Record<string, unknown>
      : {};

    const entries = Object.fromEntries(
      Object.entries(entriesSource)
        .map(([id, entry]) => [id.trim().toLowerCase(), sanitizeRuntimeEntry(entry)] as const)
        .filter((entry): entry is [string, RuntimeLanguageCatalogEntry] => Boolean(entry[0]) && Boolean(entry[1])),
    );

    return { entries };
  } catch {
    return { entries: {} };
  }
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: 'force-cache' });
  if (!response.ok) {
    throw new Error(`Failed to load language catalog asset: ${url}`);
  }
  return await response.json() as T;
}

async function loadLanguageDisplayCore(): Promise<LanguageDisplayCorePayload> {
  if (!displayCorePromise) {
    displayCorePromise = fetchJson<LanguageDisplayCorePayload>(LANGUAGE_DISPLAY_CORE_URL);
  }
  return await displayCorePromise;
}

async function loadLanguageQueryAliases(): Promise<LanguageQueryAliasPayload> {
  if (!queryAliasPromise) {
    queryAliasPromise = fetchJson<LanguageQueryAliasPayload>(LANGUAGE_QUERY_ALIAS_URL);
  }
  return await queryAliasPromise;
}

async function loadLanguageQueryIndex(locale: LanguageNameQueryLocale): Promise<LanguageQueryIndexPayload> {
  const existing = queryIndexPromiseByLocale.get(locale);
  if (existing) {
    return await existing;
  }

  const nextPromise = fetchJson<LanguageQueryIndexPayload>(`/data/language-support/language-query-index.${locale}.json`);
  queryIndexPromiseByLocale.set(locale, nextPromise);
  return await nextPromise;
}

function dedupeStrings(values: Array<string | undefined>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  values.forEach((value) => {
    const trimmed = value?.trim();
    if (!trimmed) {
      return;
    }
    const normalized = normalizeSearchKey(trimmed);
    if (!normalized || seen.has(normalized)) {
      return;
    }
    seen.add(normalized);
    result.push(trimmed);
  });

  return result;
}

function getCandidatePrimaryLabel(candidate: LanguageCatalogCandidate, locale: LanguageNameQueryLocale): string {
  return candidate.byLocale?.[locale]?.trim()
    || candidate.nativeName?.trim()
    || candidate.englishName?.trim()
    || candidate.languageCode;
}

function getCandidateSecondaryLabel(candidate: LanguageCatalogCandidate, locale: LanguageNameQueryLocale): string | undefined {
  const primaryLabel = getCandidatePrimaryLabel(candidate, locale);
  return dedupeStrings([
    candidate.nativeName,
    candidate.englishName,
    candidate.byLocale?.[locale],
    candidate.languageCode,
  ]).find((label) => normalizeSearchKey(label) !== normalizeSearchKey(primaryLabel));
}

function buildRuntimeQueryEntries(
  runtimeEntry: RuntimeLanguageCatalogEntry | undefined,
  locale: LanguageNameQueryLocale,
): readonly LanguageQueryLabelEntry[] {
  if (!runtimeEntry) {
    return [];
  }

  const crossLocaleEntries = Object.entries(runtimeEntry.byLocale ?? {})
    .filter(([entryLocale, label]) => entryLocale !== locale && label.trim().length > 0)
    .map(([, label]) => ({ label: label.trim(), kind: 'alias' as const }));

  const merged = [
    ...(runtimeEntry.byLocale?.[locale] ? [{ label: runtimeEntry.byLocale[locale]!, kind: 'local' as const }] : []),
    ...(runtimeEntry.native ? [{ label: runtimeEntry.native, kind: 'native' as const }] : []),
    ...(runtimeEntry.english ? [{ label: runtimeEntry.english, kind: 'english' as const }] : []),
    ...sanitizeStringList(runtimeEntry.aliases).map((label) => ({ label, kind: 'alias' as const })),
    ...crossLocaleEntries,
  ];

  const seen = new Set<string>();
  return merged.filter((entry) => {
    const normalized = normalizeSearchKey(entry.label);
    if (!normalized || seen.has(normalized)) {
      return false;
    }
    seen.add(normalized);
    return true;
  });
}

function mergeQueryEntries(
  baselineEntries: readonly LanguageQueryLabelEntry[],
  runtimeEntries: readonly LanguageQueryLabelEntry[],
): readonly LanguageQueryLabelEntry[] {
  const seen = new Set<string>();
  return [...runtimeEntries, ...baselineEntries].filter((entry) => {
    const normalized = normalizeSearchKey(entry.label);
    if (!normalized || seen.has(normalized)) {
      return false;
    }
    seen.add(normalized);
    return true;
  });
}

function buildCandidate(
  id: string,
  locale: LanguageNameQueryLocale,
  coreEntry: LanguageDisplayCoreEntry | undefined,
  aliasPayload: LanguageQueryAliasPayload,
  queryEntries: readonly LanguageQueryLabelEntry[],
  runtimeEntry: RuntimeLanguageCatalogEntry | undefined,
): LanguageCatalogCandidate | null {
  const normalizedId = id.trim().toLowerCase();
  if (!normalizedId) {
    return null;
  }

  const mergedByLocale = {
    ...(coreEntry?.byLocale ?? {}),
    ...(runtimeEntry?.byLocale ?? {}),
  } satisfies Partial<Record<LanguageNameQueryLocale, string>>;
  const aliases = dedupeStrings([
    ...(aliasPayload.aliasesByCode[normalizedId] ?? []),
    ...(runtimeEntry?.aliases ?? []),
  ]);
  const mergedQueryEntries = mergeQueryEntries(
    queryEntries,
    buildRuntimeQueryEntries(runtimeEntry, locale),
  );
  const languageCode = runtimeEntry?.languageCode?.trim().toLowerCase() || normalizedId;
  const englishName = runtimeEntry?.english?.trim() || coreEntry?.english?.trim() || languageCode;
  const nativeName = runtimeEntry?.native?.trim() || coreEntry?.native?.trim() || undefined;
  const visibility = runtimeEntry?.visibility === 'hidden' ? 'hidden' : 'visible';

  return {
    id: normalizedId,
    languageCode,
    englishName,
    ...(nativeName ? { nativeName } : {}),
    ...(Object.keys(mergedByLocale).length > 0 ? { byLocale: mergedByLocale } : {}),
    aliases,
    visibility,
    hasRuntimeOverride: Boolean(runtimeEntry),
    queryEntries: mergedQueryEntries,
  };
}

function evaluateCodeMatch(query: string, candidate: LanguageCatalogCandidate): LanguageCatalogMatch | null {
  const candidateCodes = dedupeStrings([candidate.languageCode, candidate.id]);
  let bestMatch: LanguageCatalogMatch | null = null;

  candidateCodes.forEach((code) => {
    const normalizedCode = normalizeSearchKey(code);
    if (!normalizedCode) {
      return;
    }

    let rank: number | null = null;
    let matchSource = '';
    if (normalizedCode === query) {
      rank = 0;
      matchSource = 'code-exact';
    } else if (normalizedCode.startsWith(query)) {
      rank = 10;
      matchSource = 'code-prefix';
    } else if (normalizedCode.includes(query)) {
      rank = 20;
      matchSource = 'code-contains';
    }

    if (rank === null) {
      return;
    }

    const nextMatch: LanguageCatalogMatch = {
      rank,
      matchedLabel: code,
      matchedLabelKind: 'code',
      matchSource,
      runtimePriority: candidate.hasRuntimeOverride ? 0 : 1,
    };

    if (!bestMatch || compareMatches(nextMatch, bestMatch) < 0) {
      bestMatch = nextMatch;
    }
  });

  return bestMatch;
}

function getLabelKindOrder(kind: LanguageQueryLabelEntry['kind']): number {
  switch (kind) {
    case 'local':
      return 0;
    case 'native':
      return 1;
    case 'english':
      return 2;
    case 'alias':
      return 3;
    default:
      return 4;
  }
}

function evaluateLabelMatch(query: string, candidate: LanguageCatalogCandidate): LanguageCatalogMatch | null {
  let bestMatch: LanguageCatalogMatch | null = null;

  candidate.queryEntries.forEach((entry) => {
    const normalizedLabel = normalizeSearchKey(entry.label);
    if (!normalizedLabel) {
      return;
    }

    let rank: number | null = null;
    let matchSource = '';
    if (normalizedLabel === query) {
      rank = 1 + getLabelKindOrder(entry.kind);
      matchSource = `${entry.kind}-exact`;
    } else if (normalizedLabel.startsWith(query)) {
      rank = 30 + getLabelKindOrder(entry.kind);
      matchSource = `${entry.kind}-prefix`;
    } else if (normalizedLabel.includes(query)) {
      rank = 50 + getLabelKindOrder(entry.kind);
      matchSource = `${entry.kind}-contains`;
    }

    if (rank === null) {
      return;
    }

    const nextMatch: LanguageCatalogMatch = {
      rank,
      matchedLabel: entry.label,
      matchedLabelKind: entry.kind,
      matchSource,
      runtimePriority: candidate.hasRuntimeOverride ? 0 : 1,
    };

    if (!bestMatch || compareMatches(nextMatch, bestMatch) < 0) {
      bestMatch = nextMatch;
    }
  });

  return bestMatch;
}

function compareMatches(left: LanguageCatalogMatch, right: LanguageCatalogMatch): number {
  if (left.rank !== right.rank) {
    return left.rank - right.rank;
  }
  if (left.runtimePriority !== right.runtimePriority) {
    return left.runtimePriority - right.runtimePriority;
  }
  if (left.matchedLabel.length !== right.matchedLabel.length) {
    return left.matchedLabel.length - right.matchedLabel.length;
  }
  return left.matchedLabel.localeCompare(right.matchedLabel, 'en');
}

function evaluateCandidateMatch(query: string, candidate: LanguageCatalogCandidate): LanguageCatalogMatch | null {
  const codeMatch = evaluateCodeMatch(query, candidate);
  const labelMatch = evaluateLabelMatch(query, candidate);

  if (!codeMatch) {
    return labelMatch;
  }
  if (!labelMatch) {
    return codeMatch;
  }
  return compareMatches(codeMatch, labelMatch) <= 0 ? codeMatch : labelMatch;
}

async function buildCatalogCandidateIndex(locale: LanguageNameQueryLocale): Promise<Map<string, LanguageCatalogCandidate>> {
  const [displayCore, aliasPayload, queryIndexPayload] = await Promise.all([
    loadLanguageDisplayCore(),
    loadLanguageQueryAliases(),
    loadLanguageQueryIndex(locale),
  ]);
  const runtimeSnapshot = readRuntimeLanguageCatalogSnapshot();
  const candidateIds = new Set<string>([
    ...Object.keys(displayCore.languages),
    ...Object.keys(queryIndexPayload.entriesByIso6393),
    ...Object.keys(runtimeSnapshot.entries),
  ]);
  const candidates = new Map<string, LanguageCatalogCandidate>();

  candidateIds.forEach((candidateId) => {
    const candidate = buildCandidate(
      candidateId,
      locale,
      displayCore.languages[candidateId],
      aliasPayload,
      queryIndexPayload.entriesByIso6393[candidateId] ?? [],
      runtimeSnapshot.entries[candidateId],
    );
    if (!candidate || candidate.visibility === 'hidden') {
      return;
    }
    candidates.set(candidate.id, candidate);
  });

  return candidates;
}

export async function searchLanguageCatalogSuggestions(
  options: SearchLanguageCatalogSuggestionsOptions,
): Promise<LanguageCatalogSearchSuggestion[]> {
  const normalizedQuery = normalizeSearchKey(options.query);
  if (!normalizedQuery) {
    return [];
  }

  const limit = options.limit && options.limit > 0 ? options.limit : 10;
  const candidates = await buildCatalogCandidateIndex(options.locale);
  const matches = Array.from(candidates.values())
    .map((candidate) => {
      const match = evaluateCandidateMatch(normalizedQuery, candidate);
      if (!match) {
        return null;
      }

      const secondaryLabel = getCandidateSecondaryLabel(candidate, options.locale);

      return {
        id: candidate.id,
        languageCode: candidate.languageCode,
        primaryLabel: getCandidatePrimaryLabel(candidate, options.locale),
        ...(secondaryLabel ? { secondaryLabel } : {}),
        matchedLabel: match.matchedLabel,
        matchedLabelKind: match.matchedLabelKind,
        matchSource: match.matchSource,
        rank: match.rank,
        hasRuntimeOverride: candidate.hasRuntimeOverride,
      } satisfies LanguageCatalogSearchSuggestion;
    })
    .filter((match): match is LanguageCatalogSearchSuggestion => Boolean(match))
    .sort((left, right) => {
      if (left.rank !== right.rank) {
        return left.rank - right.rank;
      }
      if (left.hasRuntimeOverride !== right.hasRuntimeOverride) {
        return left.hasRuntimeOverride ? -1 : 1;
      }
      if (left.primaryLabel.length !== right.primaryLabel.length) {
        return left.primaryLabel.length - right.primaryLabel.length;
      }
      return left.primaryLabel.localeCompare(right.primaryLabel, 'en');
    });

  return matches.slice(0, limit);
}

export async function lookupLanguageCatalogEntryById(
  id: string,
  locale: LanguageNameQueryLocale,
): Promise<LanguageCatalogSearchEntry | null> {
  const normalizedId = normalizeSearchKey(id);
  if (!normalizedId) {
    return null;
  }

  const candidates = await buildCatalogCandidateIndex(locale);
  const candidate = candidates.get(normalizedId);
  if (!candidate) {
    return null;
  }

  return {
    id: candidate.id,
    languageCode: candidate.languageCode,
    englishName: candidate.englishName || candidate.languageCode,
    localName: getCandidatePrimaryLabel(candidate, locale),
    ...(candidate.nativeName ? { nativeName: candidate.nativeName } : {}),
    aliases: candidate.aliases,
    ...(candidate.byLocale ? { byLocale: candidate.byLocale } : {}),
    visibility: candidate.visibility,
    hasRuntimeOverride: candidate.hasRuntimeOverride,
  };
}

export async function lookupLanguageCatalogEntriesByIds(
  ids: readonly string[],
  locale: LanguageNameQueryLocale,
): Promise<LanguageCatalogSearchEntry[]> {
  const normalizedIds = Array.from(new Set(ids.map((id) => normalizeSearchKey(id)).filter(Boolean)));
  if (normalizedIds.length === 0) {
    return [];
  }

  const results = await Promise.all(normalizedIds.map((id) => lookupLanguageCatalogEntryById(id, locale)));
  return results.filter((result): result is LanguageCatalogSearchEntry => Boolean(result));
}

export function resetLanguageCatalogSearchServiceForTests(): void {
  displayCorePromise = null;
  queryAliasPromise = null;
  queryIndexPromiseByLocale.clear();
}
