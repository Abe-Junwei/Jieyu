/**
 * ISO 3166-1 alpha-2 → UI locale display + multi–endonym locales (CLDR-style via Intl).
 */
import { Country } from 'country-state-city';

const COUNTRY_BY_ISO = new Map(Country.getAllCountries().map((c) => [c.isoCode, c] as const));

/** Territories with multiple official languages: ordered BCP47 list for endonym-style region names */
export const ISO2_ENDONYM_LOCALE_LISTS: Readonly<Record<string, readonly string[]>> = {
  BE: ['nl-BE', 'fr-BE', 'de-BE'],
  CH: ['de-CH', 'fr-CH', 'it-CH', 'rm-CH'],
  CA: ['en-CA', 'fr-CA'],
  IN: ['hi-IN', 'en-IN'],
  SG: ['en-SG', 'zh-SG', 'ms-SG', 'ta-SG'],
  ZA: ['en-ZA', 'af-ZA', 'zu-ZA'],
  FI: ['fi-FI', 'sv-FI'],
  LU: ['lb-LU', 'fr-LU', 'de-LU'],
  MT: ['mt-MT', 'en-MT'],
  NO: ['nb-NO', 'nn-NO'],
  BO: ['es-BO', 'qu-BO', 'ay-BO'],
  PY: ['es-PY', 'gn-PY'],
  SZ: ['en-SZ', 'ss-SZ'],
};

const MAX_INLINE_ISO2 = 4;
const MAX_ENDONYM_FRAGMENTS = 4;

function regionDisplayName(iso2: string, locale: string): string {
  if (typeof Intl.DisplayNames !== 'function') {
    return COUNTRY_BY_ISO.get(iso2)?.name ?? iso2;
  }
  try {
    const dn = new Intl.DisplayNames([locale], { type: 'region' });
    return dn.of(iso2) ?? COUNTRY_BY_ISO.get(iso2)?.name ?? iso2;
  } catch {
    return COUNTRY_BY_ISO.get(iso2)?.name ?? iso2;
  }
}

function endonymFragmentsForIso2(iso2: string): string[] {
  const locales = ISO2_ENDONYM_LOCALE_LISTS[iso2];
  const seen = new Set<string>();
  const out: string[] = [];

  const tryLocale = (loc: string) => {
    if (typeof Intl.DisplayNames !== 'function') return;
    try {
      const dn = new Intl.DisplayNames([loc], { type: 'region' });
      const label = dn.of(iso2)?.trim();
      if (!label) return;
      const key = label.normalize('NFKC').toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      out.push(label);
    } catch {
      /* skip */
    }
  };

  if (locales?.length) {
    locales.forEach(tryLocale);
  } else {
    tryLocale('en');
  }

  if (out.length === 0) {
    const fallback = COUNTRY_BY_ISO.get(iso2)?.name ?? iso2;
    return [fallback];
  }
  return out;
}

/**
 * Comma/顿号-separated UI-language names for ISO2 list; truncates with " +N".
 */
export function formatIso3166Alpha2ListUi(iso2List: readonly string[] | undefined, uiLocale: string): string {
  if (!iso2List?.length) return '';
  const upper = iso2List.map((c) => c.trim().toUpperCase()).filter((c) => /^[A-Z]{2}$/.test(c));
  if (!upper.length) return '';
  const shown = upper.slice(0, MAX_INLINE_ISO2);
  const labels = shown.map((c) => regionDisplayName(c, uiLocale));
  const sep = uiLocale.startsWith('zh') ? '、' : ', ';
  let s = labels.join(sep);
  const rest = upper.length - shown.length;
  if (rest > 0) {
    s += sep + `+${rest}`;
  }
  return s;
}

/**
 * Slash-separated endonym fragments per country, joined across countries; truncates with "…".
 */
export function formatIso3166Alpha2ListEndonyms(iso2List: readonly string[] | undefined): string {
  if (!iso2List?.length) return '';
  const upper = iso2List.map((c) => c.trim().toUpperCase()).filter((c) => /^[A-Z]{2}$/.test(c));
  if (!upper.length) return '';
  const parts: string[] = [];
  let fragments = 0;
  for (const code of upper) {
    const fr = endonymFragmentsForIso2(code);
    for (const f of fr) {
      if (fragments >= MAX_ENDONYM_FRAGMENTS) {
        parts.push('…');
        return parts.join(' / ');
      }
      parts.push(f);
      fragments++;
    }
  }
  return parts.join(' / ');
}
