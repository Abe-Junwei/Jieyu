import { describe, expect, it } from 'vitest';
import { ISO3166_COUNTRIES } from './iso3166CountriesData';

describe('iso3166CountriesData', () => {
  it('exposes a stable country list (A-5 snapshot)', () => {
    expect(ISO3166_COUNTRIES.length).toBe(250);
    const codes = new Set(ISO3166_COUNTRIES.map((c) => c.isoCode));
    expect(codes.size).toBe(250);
    expect(ISO3166_COUNTRIES.find((c) => c.isoCode === 'CN')?.name).toBe('China');
  });
});
