export const EAF_TIME_UNITS = [
  'milliseconds',
  'NTSC-frames',
  'PAL-frames',
  'PAL-50-frames',
] as const;

export type EafTimeUnit = (typeof EAF_TIME_UNITS)[number];

export type ResolvedEafTimeUnit = {
  unit: EafTimeUnit;
  unrecognized: boolean;
};

export function resolveEafTimeUnit(raw: string | null | undefined): ResolvedEafTimeUnit {
  const value = raw?.trim() ?? '';
  if (value.length === 0 || value === 'milliseconds') {
    return { unit: 'milliseconds', unrecognized: false };
  }
  if (value === 'NTSC-frames' || value === 'PAL-frames' || value === 'PAL-50-frames') {
    return { unit: value, unrecognized: false };
  }
  return { unit: 'milliseconds', unrecognized: true };
}

/** Convert an ELAN TIME_VALUE integer into seconds. */
export function eafTimeValueToSeconds(raw: number, unit: EafTimeUnit): number {
  if (unit === 'PAL-frames') return raw / 25;
  if (unit === 'PAL-50-frames') return raw / 50;
  if (unit === 'NTSC-frames') return (raw * 1001) / 30000;
  return raw / 1000;
}
