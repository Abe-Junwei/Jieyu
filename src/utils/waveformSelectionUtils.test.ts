import { describe, expect, it } from 'vitest';
import { computeLassoOutcome } from './waveformSelectionUtils';

describe('waveformSelectionUtils', () => {
  const units = [
    { id: 'a', startTime: 0, endTime: 1 },
    { id: 'b', startTime: 0.5, endTime: 1.5 },
    { id: 'c', startTime: 3, endTime: 4 },
  ];

  it('selects overlapping units and uses first hit as primary by default', () => {
    const base = new Set<string>();
    const out = computeLassoOutcome(units, 0.2, 1.2, base, false);
    expect(out.mode).toBe('select');
    expect(out.hitCount).toBe(2);
    expect(out.ids.has('a') && out.ids.has('b')).toBe(true);
    expect(out.primaryId).toBe('a');
  });

  it('returns create mode when lasso misses all units', () => {
    const out = computeLassoOutcome(units, 5, 6, new Set(), false);
    expect(out.mode).toBe('create');
    expect(out.hitCount).toBe(0);
    expect(out.primaryId).toBe('');
  });

  it('preferBasePrimary picks first new hit not in base', () => {
    const base = new Set(['a']);
    const out = computeLassoOutcome(units, 0.2, 1.2, base, true);
    expect(out.primaryId).toBe('b');
  });

  it('normalizes reversed drag window', () => {
    const out = computeLassoOutcome(units, 1.2, 0.2, new Set(), false);
    expect(out.hitCount).toBe(2);
  });
});
