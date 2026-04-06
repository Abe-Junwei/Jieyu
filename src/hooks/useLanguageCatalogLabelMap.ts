import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Locale } from '../i18n';
import type { LanguageCatalogEntry } from '../services/LinguisticService';
import type { ResolveLanguageDisplayName } from '../utils/languageDisplayNameResolver';
import { LinguisticService } from '../services/LinguisticService';
import { getLanguageDisplayName } from '../utils/langMapping';

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
  const [entries, setEntries] = useState<LanguageCatalogEntry[]>([]);
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

  useEffect(() => {
    let cancelled = false;

    if (normalizedLanguageIds && normalizedLanguageIds.length === 0) {
      setEntries([]);
      return () => {
        cancelled = true;
      };
    }

    void LinguisticService.listLanguageCatalogEntries({
      locale,
      ...(normalizedLanguageIds ? { languageIds: normalizedLanguageIds } : {}),
    })
      .then((records) => {
        if (!cancelled) {
          setEntries(records);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setEntries([]);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [locale, normalizedLanguageIds]);

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