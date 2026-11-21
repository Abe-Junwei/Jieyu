import { describe, expect, it } from 'vitest';
import { formatMsSpan } from './timeMs';

describe('formatMsSpan', () => {
  it('keeps one decimal on 100 ms steps', () => {
    expect(formatMsSpan(0, 2000)).toBe('0.0–2.0');
  });

  it('shows enough decimals that short spans are not zero length', () => {
    expect(formatMsSpan(0, 10)).toBe('0.0–0.01');
    expect(formatMsSpan(40, 90)).toBe('0.04–0.09');
    expect(formatMsSpan(1234, 1500)).toBe('1.234–1.5');
  });
});
