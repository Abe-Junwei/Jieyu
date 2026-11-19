import { describe, expect, it } from 'vitest';
import { formatMillisecondInstant, formatMillisecondSpan } from './formatMillisecondSpan';

describe('formatMillisecondSpan', () => {
  it('keeps zero, 1ms and 10ms visible', () => {
    expect(formatMillisecondInstant(0)).toBe('0.000');
    expect(formatMillisecondInstant(1)).toBe('0.001');
    expect(formatMillisecondInstant(10)).toBe('0.010');
    expect(formatMillisecondSpan(0, 1)).toBe('0.000–0.001');
    expect(formatMillisecondSpan(0, 10)).toBe('0.000–0.010');
    expect(formatMillisecondSpan(40, 90)).toBe('0.040–0.090');
    expect(formatMillisecondSpan(50, 100)).toBe('0.050–0.100');
  });

  it('prints a shared boundary the same way on both spans', () => {
    const left = formatMillisecondSpan(0, 10);
    const right = formatMillisecondSpan(10, 20);
    expect(left).toBe('0.000–0.010');
    expect(right).toBe('0.010–0.020');
    expect(left.slice(left.indexOf('\u2013') + 1)).toBe(right.slice(0, right.indexOf('\u2013')));
    expect(left).not.toBe(right);
  });

  it('keeps a 1ms difference after a multi-hour offset', () => {
    expect(formatMillisecondSpan(7_200_000, 7_200_001)).toBe('7200.000–7200.001');
    expect(formatMillisecondSpan(3_661_001, 3_661_002)).toBe('3661.001–3661.002');
    expect(formatMillisecondSpan(0, 2000)).toBe('0.000–2.000');
  });

  it('leaves a missing time blank', () => {
    expect(formatMillisecondSpan(null, null)).toBe('');
    expect(formatMillisecondSpan(0, null)).toBe('');
    expect(formatMillisecondSpan(null, 10)).toBe('');
  });

  it('does not round a non-integer into the label', () => {
    expect(() => formatMillisecondInstant(1.5)).toThrow('time is invalid');
  });
});
