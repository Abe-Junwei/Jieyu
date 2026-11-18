import { describe, expect, it } from 'vitest';
import { msToSeconds, secondsToMs } from './timeMs';

describe('secondsToMs', () => {
  it('rounds an exact half millisecond toward the positive direction', () => {
    expect(secondsToMs(0.0005)).toBe(1);
    expect(secondsToMs(1.0005)).toBe(1001);
    expect(secondsToMs(1.0004)).toBe(1000);
    expect(secondsToMs(0)).toBe(0);
  });

  it('rejects a non-finite value', () => {
    expect(() => secondsToMs(Number.NaN)).toThrow('time is invalid');
  });

  it('turns integer milliseconds back into seconds', () => {
    expect(msToSeconds(1500)).toBe(1.5);
    expect(() => msToSeconds(1.5)).toThrow('time is invalid');
  });
});
