import { describe, expect, it } from 'vitest';
import { eafTimeValueToSeconds, resolveEafTimeUnit } from './eafTimeUnits';

describe('eaf time units', () => {
  it('reads PAL frames as 25 per second', () => {
    expect(resolveEafTimeUnit('PAL-frames')).toEqual({
      unit: 'PAL-frames',
      unrecognized: false,
    });
    expect(eafTimeValueToSeconds(25, 'PAL-frames')).toBe(1);
  });

  it('treats a missing unit as milliseconds', () => {
    expect(resolveEafTimeUnit(undefined)).toEqual({
      unit: 'milliseconds',
      unrecognized: false,
    });
    expect(eafTimeValueToSeconds(1000, 'milliseconds')).toBe(1);
  });

  it('keeps milliseconds and flags an unrecognized unit', () => {
    expect(resolveEafTimeUnit('furlongs')).toEqual({
      unit: 'milliseconds',
      unrecognized: true,
    });
  });
});
