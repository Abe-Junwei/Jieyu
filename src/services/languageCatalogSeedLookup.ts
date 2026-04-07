import { getIso639_3SeedMap, type Iso639_3Seed } from '../data/iso6393Seed';

export type { Iso639_3Seed } from '../data/iso6393Seed';

export function lookupIso639_3Seed(code: string): Iso639_3Seed | undefined {
  return getIso639_3SeedMap().get(code.trim().toLowerCase());
}