import { iso6393 } from 'iso-639-3';

type Iso6393Record = (typeof iso6393)[number];

export type Iso639_3Seed = {
  name: string;
  iso6391?: string | undefined;
  iso6392B?: string | undefined;
  iso6392T?: string | undefined;
  scope: string;
  type: string;
};

const ISO_639_3_BY_CODE = new Map<string, Iso6393Record>(
  iso6393
    .filter((entry) => entry.iso6393.trim().length > 0)
    .map((entry) => [entry.iso6393.toLowerCase(), entry] as const),
);

export function lookupIso639_3Seed(code: string): Iso639_3Seed | undefined {
  return ISO_639_3_BY_CODE.get(code.trim().toLowerCase());
}