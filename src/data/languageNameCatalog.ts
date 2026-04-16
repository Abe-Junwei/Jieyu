/**
 * 统一读取层：只消费语言目录运行时读模型快照。
 * Unified read layer: consumes only the language-catalog runtime snapshot.
 * Baseline generated data is now lowered into the runtime cache layer as a
 * fallback seed, so callers no longer merge generated modules directly here.
 */
import { normalizeLanguageCatalogRuntimeLookupKey, readLanguageCatalogRuntimeCache } from './languageCatalogRuntimeCache';
import { LANGUAGE_NAME_QUERY_LOCALES, type LanguageDisplayCoreEntry, type LanguageNameQueryLocale, type LanguageQueryLabelEntry, type LanguageQueryLabelKind } from './languageNameTypes';

function normalizeLanguageCode(languageId: string | undefined): string {
  return languageId?.trim().toLowerCase() ?? '';
}

function dedupeNames(names: Array<string | undefined>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  names.forEach((name) => {
    const trimmed = name?.trim();
    if (!trimmed) {
      return;
    }
    const normalized = trimmed.normalize('NFKC').toLowerCase();
    if (seen.has(normalized)) {
      return;
    }
    seen.add(normalized);
    result.push(trimmed);
  });

  return result;
}

function normalizeLanguageLabelKey(label: string | undefined): string {
  return label?.normalize('NFKC').trim().toLowerCase() ?? '';
}

function getRuntimeLanguageEntry(languageId: string | undefined) {
  const normalizedCode = normalizeLanguageCode(languageId);
  if (!normalizedCode) {
    return undefined;
  }
  const cache = readLanguageCatalogRuntimeCache();
  const resolvedId = cache.entries[normalizedCode]
    ? normalizedCode
    : cache.lookupToId[normalizeLanguageCatalogRuntimeLookupKey(normalizedCode)];
  return resolvedId ? cache.entries[resolvedId] : undefined;
}

function isRuntimeLanguageHidden(languageId: string | undefined): boolean {
  return getRuntimeLanguageEntry(languageId)?.visibility === 'hidden';
}

function resolveCatalogLanguageCode(languageId: string | undefined): string | undefined {
  const normalizedCode = normalizeLanguageCode(languageId);
  if (!normalizedCode) {
    return undefined;
  }
  const runtimeEntry = getRuntimeLanguageEntry(normalizedCode);
  return runtimeEntry?.languageCode?.trim().toLowerCase() || normalizedCode;
}

function readLanguageDisplayCoreEntry(
  languageId: string | undefined,
): LanguageDisplayCoreEntry | undefined {
  const runtimeEntry = getRuntimeLanguageEntry(languageId);
  if (runtimeEntry?.visibility === 'hidden') {
    return undefined;
  }
  if (!runtimeEntry) {
    return undefined;
  }

  const byLocale = runtimeEntry.byLocale ?? {};
  const english = runtimeEntry.english?.trim()
    || byLocale['en-US']?.trim()
    || runtimeEntry.native?.trim()
    || normalizeLanguageCode(languageId);

  const native = runtimeEntry.native?.trim() || undefined;

  return {
    english,
    ...(native ? { native } : {}),
    ...(Object.keys(byLocale).length > 0 ? { byLocale } : {}),
  };
}

function dedupeQueryEntries(entries: Array<LanguageQueryLabelEntry | undefined>): LanguageQueryLabelEntry[] {
  const seen = new Set<string>();
  const result: LanguageQueryLabelEntry[] = [];

  entries.forEach((entry) => {
    if (!entry) {
      return;
    }
    const normalizedLabel = normalizeLanguageLabelKey(entry.label);
    if (!normalizedLabel || seen.has(normalizedLabel)) {
      return;
    }
    seen.add(normalizedLabel);
    result.push({
      label: entry.label.trim(),
      kind: entry.kind,
    });
  });

  return result;
}

export { LANGUAGE_NAME_QUERY_LOCALES };
export type { LanguageDisplayCoreEntry, LanguageNameQueryLocale, LanguageQueryLabelEntry, LanguageQueryLabelKind };

export function listLanguageCodesFromCatalog(): readonly string[] {
  return Array.from(new Set(
    Object.entries(readLanguageCatalogRuntimeCache().entries)
      .flatMap(([languageId, entry]) => [languageId, entry.languageCode?.trim().toLowerCase()])
      .filter((code): code is string => Boolean(code)),
  )).sort();
}

export function getLanguageDisplayCoreEntry(languageId: string | undefined): LanguageDisplayCoreEntry | undefined {
  const normalizedCode = normalizeLanguageCode(languageId);
  if (!normalizedCode) {
    return undefined;
  }
  return readLanguageDisplayCoreEntry(normalizedCode);
}

export function getLanguageEnglishDisplayNameFromCatalog(languageId: string | undefined): string | undefined {
  return getLanguageDisplayCoreEntry(languageId)?.english?.trim() || undefined;
}

export function getLanguageNativeDisplayNameFromCatalog(languageId: string | undefined): string | undefined {
  return getLanguageDisplayCoreEntry(languageId)?.native?.trim() || undefined;
}

export function getLanguageLocalDisplayNameFromCatalog(
  languageId: string | undefined,
  locale: LanguageNameQueryLocale,
): string | undefined {
  if (isRuntimeLanguageHidden(languageId)) {
    return undefined;
  }
  return getLanguageDisplayCoreEntry(languageId)?.byLocale?.[locale]?.trim() || undefined;
}

export function getLanguageAliasCodeFromCatalog(query: string | undefined): string | undefined {
  const normalizedQuery = normalizeLanguageLabelKey(query);
  if (!normalizedQuery) {
    return undefined;
  }
  const cache = readLanguageCatalogRuntimeCache();
  const runtimeAlias = cache.aliasToId[normalizedQuery];
  if (runtimeAlias) {
    return cache.entries[runtimeAlias]?.languageCode?.trim().toLowerCase() || runtimeAlias;
  }
  return undefined;
}

export function getLanguageAliasesForCodeFromCatalog(languageId: string | undefined): readonly string[] {
  const normalizedCode = resolveCatalogLanguageCode(languageId);
  if (!normalizedCode) {
    return [];
  }
  const runtimeEntry = getRuntimeLanguageEntry(normalizedCode);
  if (runtimeEntry?.visibility === 'hidden') {
    return [];
  }
  return dedupeNames(runtimeEntry?.aliases ?? []);
}

export function getLanguageQueryEntriesFromCatalog(
  languageId: string | undefined,
  locale: LanguageNameQueryLocale,
): readonly LanguageQueryLabelEntry[] {
  const normalizedCode = resolveCatalogLanguageCode(languageId);
  if (!normalizedCode) {
    return [];
  }

  const mergedEntry = getLanguageDisplayCoreEntry(normalizedCode);
  if (!mergedEntry) {
    return [];
  }

  const runtimeEntry = getRuntimeLanguageEntry(normalizedCode);
  const crossLocaleEntries = Object.entries(runtimeEntry?.byLocale ?? {})
    .filter(([entryLocale, value]) => entryLocale !== locale && value.trim().length > 0)
    .map(([, value]) => ({ label: value, kind: 'alias' as const }));

  return dedupeQueryEntries([
    ...(runtimeEntry?.byLocale?.[locale] ? [{ label: runtimeEntry.byLocale[locale]!, kind: 'local' as const }] : []),
    ...(runtimeEntry?.native ? [{ label: runtimeEntry.native, kind: 'native' as const }] : []),
    ...(runtimeEntry?.english ? [{ label: runtimeEntry.english, kind: 'english' as const }] : []),
    ...(runtimeEntry?.aliases ?? []).map((label) => ({ label, kind: 'alias' as const })),
    ...crossLocaleEntries,
  ]);
}

export function getLanguageQueryNamesFromCatalog(
  languageId: string | undefined,
  locale: LanguageNameQueryLocale,
): readonly string[] {
  return dedupeNames(getLanguageQueryEntriesFromCatalog(languageId, locale).map((entry) => entry.label));
}