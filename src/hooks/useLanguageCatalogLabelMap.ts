import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Locale } from '../i18n';
import type { LanguageCatalogEntry } from '../services/LinguisticService';
import type { ResolveLanguageDisplayName } from '../utils/languageDisplayNameResolver';
import { LinguisticService } from '../services/LinguisticService';
import { getLanguageDisplayName } from '../utils/langMapping';

export function useLanguageCatalogLabelMap(locale: Locale): {
  labelById: ReadonlyMap<string, string>;
  resolveLabel: (languageId: string | undefined) => string;
  resolveLanguageDisplayName: ResolveLanguageDisplayName;
} {
  const [entries, setEntries] = useState<LanguageCatalogEntry[]>([]);

  useEffect(() => {
    let cancelled = false;

    void LinguisticService.listLanguageCatalogEntries({ locale })
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
  }, [locale]);

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

  const resolveLabel = useCallback((languageId: string | undefined): string => {
    const normalizedLanguageId = languageId?.trim().toLowerCase() ?? '';
    if (!normalizedLanguageId) {
      return '';
    }
    return labelById.get(normalizedLanguageId) ?? getLanguageDisplayName(normalizedLanguageId, locale);
  }, [labelById, locale]);

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
    () => ({ labelById, resolveLabel, resolveLanguageDisplayName }),
    [labelById, resolveLabel, resolveLanguageDisplayName],
  );
}