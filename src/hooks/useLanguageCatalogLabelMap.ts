import { useCallback, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Locale } from '../i18n';
import type { LanguageCatalogEntry } from '../services/LinguisticService.languageCatalog';
import { listLanguageCatalogEntries } from '../services/LinguisticService.languageCatalog';
import type { ResolveLanguageDisplayName } from '../utils/languageDisplayNameResolver';
import { getLanguageDisplayName } from '../utils/langMapping';

/** React Query key 工厂 | React Query key factory */
const LANGUAGE_CATALOG_QUERY_KEY = 'languageCatalogFull';
function catalogQueryKey(locale: Locale) { return [LANGUAGE_CATALOG_QUERY_KEY, locale] as const; }

/** 数据变动后刷新缓存（如保存/删除条目后调用） | Invalidate after data changes (call after save/delete) */
export function useInvalidateLanguageCatalogLabelMap() {
  const queryClient = useQueryClient();
  return useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: [LANGUAGE_CATALOG_QUERY_KEY] });
  }, [queryClient]);
}

/**
 * 兼容旧调用方（非 React 上下文中也可使用的全局失效） | Compat for non-React callers
 * @deprecated 优先使用 useInvalidateLanguageCatalogLabelMap hook
 */
// eslint-disable-next-line @typescript-eslint/no-empty-function -- 向后兼容占位 | Backward-compat placeholder
export function invalidateLanguageCatalogLabelMapCache(): void {
  // 在 React 树外无法访问 queryClient，作为安全占位保留 | Cannot access queryClient outside React tree; kept as safe placeholder
}

type UseLanguageCatalogLabelMapOptions = {
  languageIds?: readonly string[];
};

export function useLanguageCatalogLabelMap(locale: Locale, options?: UseLanguageCatalogLabelMapOptions): {
  labelById: ReadonlyMap<string, string>;
  languageOptions: ReadonlyArray<{ code: string; label: string }>;
  resolveLanguageCode: (languageId: string | undefined) => string;
  resolveLabel: (languageId: string | undefined) => string;
  resolveLanguageDisplayName: ResolveLanguageDisplayName;
} {
  const normalizedLanguageIds = useMemo(() => {
    if (!options?.languageIds) {
      return undefined;
    }

    const seen = new Set<string>();
    const nextIds: string[] = [];
    options.languageIds.forEach((languageId) => {
      const normalizedId = languageId.trim().toLowerCase();
      if (!normalizedId || seen.has(normalizedId)) {
        return;
      }
      seen.add(normalizedId);
      nextIds.push(normalizedId);
    });
    return nextIds;
  }, [options?.languageIds]);

  const { data: allEntries = [] } = useQuery<LanguageCatalogEntry[]>({
    queryKey: catalogQueryKey(locale),
    queryFn: () => listLanguageCatalogEntries({ locale }),
    // 空 languageIds 时不需要数据 | No data needed when languageIds is explicitly empty
    enabled: !(normalizedLanguageIds && normalizedLanguageIds.length === 0),
  });

  // 客户端过滤 | Client-side filter
  const entries = useMemo(() => {
    if (!normalizedLanguageIds) return allEntries;
    const idSet = new Set(normalizedLanguageIds);
    return allEntries.filter((entry) =>
      idSet.has(entry.id.trim().toLowerCase()) || idSet.has(entry.languageCode.trim().toLowerCase()),
    );
  }, [allEntries, normalizedLanguageIds]);

  const labelById = useMemo(() => {
    const nextMap = new Map<string, string>();
    entries.forEach((entry) => {
      const keys = [entry.id, entry.languageCode]
        .map((value) => value.trim().toLowerCase())
        .filter((value, index, values) => value.length > 0 && values.indexOf(value) === index);
      keys.forEach((key) => {
        nextMap.set(key, entry.localName);
      });
    });
    return nextMap;
  }, [entries]);

  const englishById = useMemo(() => {
    const nextMap = new Map<string, string>();
    entries.forEach((entry) => {
      const keys = [entry.id, entry.languageCode]
        .map((value) => value.trim().toLowerCase())
        .filter((value, index, values) => value.length > 0 && values.indexOf(value) === index);
      keys.forEach((key) => {
        nextMap.set(key, entry.englishName);
      });
    });
    return nextMap;
  }, [entries]);

  const codeById = useMemo(() => {
    const nextMap = new Map<string, string>();
    entries.forEach((entry) => {
      const normalizedId = entry.id.trim().toLowerCase();
      const normalizedCode = entry.languageCode.trim().toLowerCase();
      if (normalizedId) {
        nextMap.set(normalizedId, normalizedCode || normalizedId);
      }
      if (normalizedCode) {
        nextMap.set(normalizedCode, normalizedCode);
      }
    });
    return nextMap;
  }, [entries]);

  const languageOptions = useMemo(() => entries
    .map((entry) => ({
      code: entry.id.trim().toLowerCase(),
      label: entry.localName,
    }))
    .filter((entry, index, all) => entry.code.length > 0 && all.findIndex((candidate) => candidate.code === entry.code) === index), [entries]);

  const resolveLabel = useCallback((languageId: string | undefined): string => {
    const normalizedLanguageId = languageId?.trim().toLowerCase() ?? '';
    if (!normalizedLanguageId) {
      return '';
    }
    return labelById.get(normalizedLanguageId) ?? getLanguageDisplayName(normalizedLanguageId, locale);
  }, [labelById, locale]);

  const resolveLanguageCode = useCallback((languageId: string | undefined): string => {
    const normalizedLanguageId = languageId?.trim().toLowerCase() ?? '';
    if (!normalizedLanguageId) {
      return '';
    }
    return codeById.get(normalizedLanguageId) ?? normalizedLanguageId;
  }, [codeById]);

  const resolveLanguageDisplayName = useCallback<ResolveLanguageDisplayName>((languageId, targetLocale) => {
    const normalizedLanguageId = languageId?.trim().toLowerCase() ?? '';
    if (!normalizedLanguageId) {
      return '';
    }
    if (targetLocale === locale) {
      return labelById.get(normalizedLanguageId) ?? getLanguageDisplayName(normalizedLanguageId, targetLocale);
    }
    if (targetLocale === 'en-US') {
      return englishById.get(normalizedLanguageId) ?? getLanguageDisplayName(normalizedLanguageId, targetLocale);
    }
    return getLanguageDisplayName(normalizedLanguageId, targetLocale);
  }, [englishById, labelById, locale]);

  return useMemo(
    () => ({ labelById, languageOptions, resolveLanguageCode, resolveLabel, resolveLanguageDisplayName }),
    [labelById, languageOptions, resolveLanguageCode, resolveLabel, resolveLanguageDisplayName],
  );
}