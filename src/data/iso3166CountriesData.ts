import snapshot from './iso3166CountriesSnapshot.json';

export type Iso3166CountryRow = { readonly isoCode: string; readonly name: string };

type SnapshotFile = { readonly countries: readonly Iso3166CountryRow[] };

const data = snapshot as SnapshotFile;

/** ISO 3166-1 alpha-2 + English `name` from the committed `iso3166CountriesSnapshot.json` (A-5, replaces `country-state-city` at runtime). */
export const ISO3166_COUNTRIES: readonly Iso3166CountryRow[] = data.countries;
