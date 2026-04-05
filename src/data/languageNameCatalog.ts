/**
 * 统一读取层：合并“内置基线”与“运行时缓存（用户数据库）”两层语言名称信息。
 * Unified read layer: merges the built-in baseline (generated module) with the
 * runtime cache (sourced from IndexedDB via localStorage). Runtime entries take
 * priority, allowing user overrides while keeping generated data as a fallback.
 *
 * 数据分层：
 *   Layer ① — 内置基线 (Generated baseline)
 *     来源： scripts/generate-language-name-indexes.mjs → src/data/generated/
 *     特点：只读，随构建更新，提供 ISO 639 数据库的完整快照
 *   Layer ② — 运行时缓存 (Runtime cache from user DB)
 *     来源： LinguisticService.languageCatalog → languageCatalogRuntimeCache
 *     特点：同步可读（localStorage），包含用户自定义条目与显示名覆盖，优先级高于 Layer ①
 */
import { getLanguageDisplayNameOverride } from './languageNameOverrides';
import {
  GENERATED_LANGUAGE_ALIAS_TO_CODE,
  GENERATED_LANGUAGE_ALIASES_BY_CODE,
  GENERATED_LANGUAGE_DISPLAY_NAME_CORE,
  GENERATED_LANGUAGE_QUERY_INDEXES,
} from './generated/languageNameCatalog.generated';
import {
  normalizeLanguageCatalogRuntimeLookupKey,
  readLanguageCatalogRuntimeCache,
} from './languageCatalogRuntimeCache';
import {
  LANGUAGE_NAME_QUERY_LOCALES,
  type LanguageDisplayCoreEntry,
  type LanguageNameQueryLocale,
  type LanguageQueryLabelEntry,
  type LanguageQueryLabelKind,
} from './languageNameTypes';

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

function mergeLanguageDisplayCoreEntry(
  languageId: string | undefined,
  generatedEntry: LanguageDisplayCoreEntry | undefined,
): LanguageDisplayCoreEntry | undefined {
  const runtimeEntry = getRuntimeLanguageEntry(languageId);
  if (runtimeEntry?.visibility === 'hidden') {
    return undefined;
  }
  if (!runtimeEntry) {
    return generatedEntry;
  }

  const byLocale = {
    ...(generatedEntry?.byLocale ?? {}),
    ...(runtimeEntry.byLocale ?? {}),
  };
  const english = runtimeEntry.english?.trim()
    || generatedEntry?.english?.trim()
    || byLocale['en-US']?.trim()
    || runtimeEntry.native?.trim()
    || normalizeLanguageCode(languageId);

  const native = runtimeEntry.native?.trim() || generatedEntry?.native?.trim() || undefined;

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
  const runtimeCodes = Object.values(readLanguageCatalogRuntimeCache().entries)
    .map((entry) => entry.languageCode?.trim().toLowerCase())
    .filter((code): code is string => Boolean(code));
  return Array.from(new Set([
    ...Object.keys(GENERATED_LANGUAGE_DISPLAY_NAME_CORE),
    ...runtimeCodes,
  ])).sort();
}

export function getLanguageDisplayCoreEntry(languageId: string | undefined): LanguageDisplayCoreEntry | undefined {
  const normalizedCode = normalizeLanguageCode(languageId);
  if (!normalizedCode) {
    return undefined;
  }
  return mergeLanguageDisplayCoreEntry(normalizedCode, GENERATED_LANGUAGE_DISPLAY_NAME_CORE[normalizedCode]);
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
  const override = getLanguageDisplayNameOverride(resolveCatalogLanguageCode(languageId), locale);
  if (override) {
    return override;
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
  const generatedCode = GENERATED_LANGUAGE_ALIAS_TO_CODE[normalizedQuery];
  if (!generatedCode || isRuntimeLanguageHidden(generatedCode)) {
    return undefined;
  }
  return generatedCode;
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
  return dedupeNames([
    ...(GENERATED_LANGUAGE_ALIASES_BY_CODE[normalizedCode] ?? []),
    ...(runtimeEntry?.aliases ?? []),
  ]);
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

  const override = isRuntimeLanguageHidden(normalizedCode)
    ? undefined
    : getLanguageDisplayNameOverride(normalizedCode, locale);
  const generatedEntries = GENERATED_LANGUAGE_QUERY_INDEXES[locale][normalizedCode] ?? [];
  const runtimeEntry = getRuntimeLanguageEntry(normalizedCode);
  return dedupeQueryEntries([
    ...(override ? [{ label: override, kind: 'local' as const }] : []),
    ...(runtimeEntry?.byLocale?.[locale] ? [{ label: runtimeEntry.byLocale[locale]!, kind: 'local' as const }] : []),
    ...(runtimeEntry?.native ? [{ label: runtimeEntry.native, kind: 'native' as const }] : []),
    ...(runtimeEntry?.english ? [{ label: runtimeEntry.english, kind: 'english' as const }] : []),
    ...(runtimeEntry?.aliases ?? []).map((label) => ({ label, kind: 'alias' as const })),
    ...generatedEntries,
  ]);
}

export function getLanguageQueryNamesFromCatalog(
  languageId: string | undefined,
  locale: LanguageNameQueryLocale,
): readonly string[] {
  return dedupeNames(getLanguageQueryEntriesFromCatalog(languageId, locale).map((entry) => entry.label));
}