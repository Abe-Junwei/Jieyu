export type Iso639_3SeedScope = 'individual' | 'macrolanguage' | 'collection' | 'special' | 'private-use';
export type Iso639_3SeedType = 'living' | 'historical' | 'extinct' | 'ancient' | 'constructed' | 'special';

export type Iso639_3Seed = {
  iso6393: string;
  name: string;
  invertedName?: string;
  iso6391?: string;
  iso6392B?: string;
  iso6392T?: string;
  scope: Iso639_3SeedScope;
  type: Iso639_3SeedType;
};

export type Iso639_3SeedRow = readonly [
  iso6393: string,
  name: string,
  invertedName: string | null,
  iso6391: string | null,
  iso6392B: string | null,
  iso6392T: string | null,
  scope: Iso639_3SeedScope,
  type: Iso639_3SeedType,
];

const ISO6393_SEED_JSON_URL = '/data/language-support/iso6393-seed-rows.json';

let iso639_3SeedsCache: readonly Iso639_3Seed[] | undefined;
let iso639_3SeedMapCache: ReadonlyMap<string, Iso639_3Seed> | undefined;
let iso6393LoadPromise: Promise<void> | null = null;

let invalidateIso6393Derived: (() => void) | null = null;

/** Called from `langMapping` so seed hydration can drop derived ISO indexes safely. */
export function registerIso6393DerivedInvalidator(fn: () => void): void {
  invalidateIso6393Derived = fn;
}

function materializeIso639_3Seed(row: Iso639_3SeedRow): Iso639_3Seed {
  const [iso6393, name, invertedName, iso6391, iso6392B, iso6392T, scope, type] = row;
  return {
    iso6393,
    name,
    ...(invertedName ? { invertedName } : {}),
    ...(iso6391 ? { iso6391 } : {}),
    ...(iso6392B ? { iso6392B } : {}),
    ...(iso6392T ? { iso6392T } : {}),
    scope,
    type,
  };
}

/**
 * Loads ISO 639-3 seed rows from static JSON (B-3). Idempotent; safe to call before first UI paint.
 * Offline / fetch failure: caches empty arrays / empty map and logs a warning (voice static map still works).
 */
export async function ensureIso6393SeedsLoaded(): Promise<void> {
  if (iso639_3SeedsCache) return;
  if (iso6393LoadPromise) {
    await iso6393LoadPromise;
    return;
  }
  iso6393LoadPromise = (async () => {
    try {
      const response = await fetch(ISO6393_SEED_JSON_URL, { cache: 'force-cache' });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const rows = (await response.json()) as Iso639_3SeedRow[];
      if (!Array.isArray(rows) || rows.length === 0) {
        throw new Error('Invalid seed payload');
      }
      iso639_3SeedsCache = rows.map(materializeIso639_3Seed);
      iso639_3SeedMapCache = new Map(iso639_3SeedsCache.map((entry) => [entry.iso6393, entry] as const));
      invalidateIso6393Derived?.();
    } catch (error) {
      console.warn('[iso6393Seed] Failed to load seed JSON; ISO name resolution will be limited until reload', error);
      iso639_3SeedsCache = [];
      iso639_3SeedMapCache = new Map();
      invalidateIso6393Derived?.();
    } finally {
      iso6393LoadPromise = null;
    }
  })();
  await iso6393LoadPromise;
}

/** Test-only: inject rows without going through fetch. */
export function hydrateIso6393SeedsFromRowsForTests(rows: readonly Iso639_3SeedRow[]): void {
  iso639_3SeedsCache = rows.map(materializeIso639_3Seed);
  iso639_3SeedMapCache = new Map(iso639_3SeedsCache.map((entry) => [entry.iso6393, entry] as const));
  invalidateIso6393Derived?.();
}

export function resetIso6393SeedsCacheForTests(): void {
  iso639_3SeedsCache = undefined;
  iso639_3SeedMapCache = undefined;
  iso6393LoadPromise = null;
  invalidateIso6393Derived?.();
}

export function listIso639_3Seeds(): readonly Iso639_3Seed[] {
  return iso639_3SeedsCache ?? [];
}

export function getIso639_3SeedMap(): ReadonlyMap<string, Iso639_3Seed> {
  if (iso639_3SeedMapCache && iso639_3SeedMapCache.size > 0) {
    return iso639_3SeedMapCache;
  }
  const seeds = listIso639_3Seeds();
  if (seeds.length === 0) {
    return new Map();
  }
  iso639_3SeedMapCache = new Map(seeds.map((entry) => [entry.iso6393, entry] as const));
  return iso639_3SeedMapCache;
}