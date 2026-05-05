import type { WorkspaceLocale } from './languageMetadataWorkspace.shared';
import {
  buildCountryAliasTokens,
  normalizeCountryToken,
  parseCountriesText,
  resolveCountryByToken,
  type CountryOption,
} from './languageMetadataWorkspace.country';

export type SearchStatus = 'idle' | 'loading' | 'empty' | 'error' | 'resolved';

export type ResolvedAdministrativeLocation = {
  country: string;
  countryCode: string;
  province: string;
  city: string;
  county: string;
  township: string;
  village: string;
  sourceDisplayName: string;
};

export function countryOptionMatchesFilter(option: CountryOption, normalizedFilter: string): boolean {
  if (!normalizedFilter) {
    return true;
  }
  return (
    normalizeCountryToken(option.label).includes(normalizedFilter)
    || normalizeCountryToken(option.searchName).includes(normalizedFilter)
    || normalizeCountryToken(option.value).includes(normalizedFilter)
    || option.aliasTokens.some((token) => token.includes(normalizedFilter))
  );
}

/** 查询框按 Enter 时：仅当可唯一确定一国时才返回（无长列表时避免误加）| */
export function pickCountryOptionToAdd(
  locale: WorkspaceLocale,
  query: string,
  countryOptions: CountryOption[],
  filtered: CountryOption[],
): CountryOption | null {
  const q = query.trim();
  if (!q) {
    return null;
  }

  const resolved = resolveCountryByToken(locale, q);
  if (resolved) {
    return countryOptions.find((option) => option.value === resolved.isoCode) ?? null;
  }

  const n = normalizeCountryToken(q);
  if (n.length === 2) {
    const byCode = countryOptions.find((option) => normalizeCountryToken(option.value) === n);
    if (byCode) {
      return byCode;
    }
  }

  if (filtered.length === 1) {
    return filtered[0] ?? null;
  }

  return null;
}

export function appendCountryIfMissing(
  locale: WorkspaceLocale,
  countriesText: string,
  input: { countryCode?: string; countryName?: string },
): string {
  const normalizedCode = input.countryCode?.trim().toUpperCase() ?? '';
  const normalizedName = input.countryName?.trim() ?? '';
  if (normalizedCode.length !== 2 && !normalizedName) {
    return countriesText;
  }

  const existingTokens = parseCountriesText(countriesText);
  const matchedCountry = normalizedCode.length === 2
    ? resolveCountryByToken(locale, normalizedCode)
    : (normalizedName ? resolveCountryByToken(locale, normalizedName) : null);

  const aliases = new Set<string>([
    ...(normalizedName ? [normalizeCountryToken(normalizedName)] : []),
    ...(matchedCountry
      ? buildCountryAliasTokens(locale, matchedCountry)
      : (normalizedCode.length === 2 ? [normalizeCountryToken(normalizedCode)] : [])),
  ]);

  if (existingTokens.some((token) => aliases.has(normalizeCountryToken(token)))) {
    return countriesText;
  }

  return [...existingTokens, normalizedCode.length === 2 ? normalizedCode : normalizedName].join(', ');
}

export function createEmptyResolvedLocation(): ResolvedAdministrativeLocation {
  return {
    country: '',
    countryCode: '',
    province: '',
    city: '',
    county: '',
    township: '',
    village: '',
    sourceDisplayName: '',
  };
}

export function buildAdministrativeLocateQuery(location: ResolvedAdministrativeLocation): string {
  return [
    location.village,
    location.township,
    location.county,
    location.city,
    location.province,
    location.country,
  ]
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((item, index, items) => items.indexOf(item) === index)
    .join(', ');
}