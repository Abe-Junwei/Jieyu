import type { LanguageCatalogEntry } from './languageCatalogTypes';
import * as lcNorm from './languageCatalogCoreNormalization';

export function filterLanguageCatalogEntriesBySearchText(
  entries: LanguageCatalogEntry[],
  searchText: string | undefined,
): LanguageCatalogEntry[] {
  const normalizedSearch = searchText?.trim().toLowerCase();
  if (!normalizedSearch) {
    return entries;
  }

  return entries.filter((entry) => {
    const haystack = [
      entry.id,
      entry.languageCode,
      entry.canonicalTag,
      entry.iso6391,
      entry.iso6392B,
      entry.iso6392T,
      entry.iso6393,
      entry.englishName,
      entry.localName,
      entry.nativeName,
      entry.genus,
      entry.subfamily,
      entry.branch,
      entry.classificationPath,
      ...(entry.countriesOfficial ?? []),
      ...(entry.dialects ?? []),
      ...(entry.vernaculars ?? []),
      entry.glottocode,
      entry.wikidataId,
      ...entry.aliases,
      ...entry.displayNames.map((d) => d.value),
      ...Object.values(entry.notes ?? {}),
      ...lcNorm.flattenCustomFieldSearchValues(entry.customFields),
    ]
      .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      .join(' ')
      .toLowerCase();

    return haystack.includes(normalizedSearch);
  });
}
