/**
 * Fetches pinned ISO 639-3 country baseline JSON (Glottolog distribution + CLDR official).
 */
export type Iso6393CountryBaselinesPayload = {
  generatedAt?: string;
  sources?: Record<string, unknown>;
  distributionByIso6393: Record<string, string[]>;
  officialByIso6393: Record<string, string[]>;
};

const ISO6393_COUNTRY_BASELINES_URL = '/data/language-support/iso6393-country-baselines.json';

let countryBaselinesPromise: Promise<Iso6393CountryBaselinesPayload> | null = null;

export function resetIso6393CountryBaselinesCacheForTests(): void {
  countryBaselinesPromise = null;
}

export async function loadIso6393CountryBaselines(): Promise<Iso6393CountryBaselinesPayload> {
  if (!countryBaselinesPromise) {
    countryBaselinesPromise = fetch(ISO6393_COUNTRY_BASELINES_URL, { cache: 'force-cache' }).then(async (response) => {
      if (!response.ok) {
        throw new Error(`Failed to load ${ISO6393_COUNTRY_BASELINES_URL}: ${response.status}`);
      }
      return response.json() as Promise<Iso6393CountryBaselinesPayload>;
    });
  }
  return countryBaselinesPromise;
}
