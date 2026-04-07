import { GENERATED_ISO6393_SEED_ROWS } from './generated/iso6393Seed.generated';

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

let iso639_3SeedsCache: readonly Iso639_3Seed[] | undefined;
let iso639_3SeedMapCache: ReadonlyMap<string, Iso639_3Seed> | undefined;

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

export function listIso639_3Seeds(): readonly Iso639_3Seed[] {
  if (iso639_3SeedsCache) {
    return iso639_3SeedsCache;
  }

  iso639_3SeedsCache = GENERATED_ISO6393_SEED_ROWS.map(materializeIso639_3Seed);
  return iso639_3SeedsCache;
}

export function getIso639_3SeedMap(): ReadonlyMap<string, Iso639_3Seed> {
  if (iso639_3SeedMapCache) {
    return iso639_3SeedMapCache;
  }

  iso639_3SeedMapCache = new Map(
    listIso639_3Seeds().map((entry) => [entry.iso6393, entry] as const),
  );
  return iso639_3SeedMapCache;
}