import { Country } from 'country-state-city';
import type { WorkspaceLocale } from './languageMetadataWorkspace.shared';

export type CountryOption = {
  value: string;
  label: string;
  searchName: string;
  aliasTokens: string[];
};

const COUNTRY_ALIAS_LOCALES = ['en-US', 'zh-CN'] as const;
const COUNTRIES = Country.getAllCountries();
const COUNTRY_BY_ISO = new Map(COUNTRIES.map((country) => [country.isoCode, country] as const));
const COUNTRY_OPTIONS_CACHE = new Map<WorkspaceLocale, CountryOption[]>();

export function parseCountriesText(value: string): string[] {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

export function normalizeCountryToken(value: string): string {
  return value.normalize('NFKC').trim().toLowerCase();
}

export function buildCountryAliasTokens(locale: WorkspaceLocale, country: { isoCode: string; name: string }): string[] {
  const aliasSet = new Set<string>([
    normalizeCountryToken(country.isoCode),
    normalizeCountryToken(country.name),
  ]);

  if (typeof Intl.DisplayNames === 'function') {
    const locales = Array.from(new Set([locale, ...COUNTRY_ALIAS_LOCALES]));
    locales.forEach((displayLocale) => {
      const displayName = new Intl.DisplayNames([displayLocale], { type: 'region' }).of(country.isoCode);
      if (displayName) {
        aliasSet.add(normalizeCountryToken(displayName));
      }
    });
  }

  return [...aliasSet];
}

export function getCountryOptions(locale: WorkspaceLocale): CountryOption[] {
  const cached = COUNTRY_OPTIONS_CACHE.get(locale);
  if (cached) {
    return cached;
  }

  const displayNames = typeof Intl.DisplayNames === 'function'
    ? new Intl.DisplayNames([locale], { type: 'region' })
    : null;

  const options = COUNTRIES.map((country) => ({
    value: country.isoCode,
    label: displayNames?.of(country.isoCode) ?? country.name,
    searchName: country.name,
    aliasTokens: buildCountryAliasTokens(locale, country),
  }));

  COUNTRY_OPTIONS_CACHE.set(locale, options);
  return options;
}

export function resolveCountryCodes(tokens: string[], options: CountryOption[]): string[] {
  const matched = new Set<string>();
  tokens.forEach((token) => {
    const normalizedToken = normalizeCountryToken(token);
    if (!normalizedToken) {
      return;
    }
    const match = options.find((option) => option.aliasTokens.includes(normalizedToken));
    if (match) {
      matched.add(match.value);
    }
  });
  return [...matched];
}

export function resolveCountryByToken(locale: WorkspaceLocale, token: string): { isoCode: string; name: string } | null {
  const normalizedToken = normalizeCountryToken(token);
  if (!normalizedToken) {
    return null;
  }

  const match = getCountryOptions(locale).find((option) => option.aliasTokens.includes(normalizedToken));
  if (!match) {
    return null;
  }

  const country = COUNTRY_BY_ISO.get(match.value);
  return country
    ? { isoCode: country.isoCode, name: country.name }
    : { isoCode: match.value, name: match.searchName };
}

export function normalizeCountryCodesForGeocoder(countryCodes: string[]): string[] {
  return Array.from(new Set(
    countryCodes
      .map((code) => code.trim().toLowerCase())
      .filter((code) => /^[a-z]{2}$/.test(code)),
  ));
}
