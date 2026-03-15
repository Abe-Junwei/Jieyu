import { describe, expect, it } from 'vitest';
import { computeLassoOutcome, type TimeSpan } from '../src/utils/waveformSelectionUtils';

const utterances: TimeSpan[] = [
  { id: 'u1', startTime: 0.0, endTime: 1.0 },
  { id: 'u2', startTime: 1.2, endTime: 2.0 },
  { id: 'u3', startTime: 2.1, endTime: 3.0 },
];

describe('computeLassoOutcome', () => {
  it('returns create mode when no overlap hit', () => {
    const out = computeLassoOutcome(utterances, 3.2, 3.6, new Set());
    expect(out.mode).toBe('create');
    expect(out.hitCount).toBe(0);
    expect(out.primaryId).toBe('');
    expect(out.ids.size).toBe(0);
  });

  it('returns select mode and counts overlaps', () => {
    const out = computeLassoOutcome(utterances, 0.8, 2.2, new Set());
    expect(out.mode).toBe('select');
    expect(out.hitCount).toBe(3);
    expect(out.primaryId).toBe('u1');
    expect(Array.from(out.ids)).toEqual(['u1', 'u2', 'u3']);
  });

  it('merges baseIds into result set', () => {
    const out = computeLassoOutcome(utterances, 0.0, 0.5, new Set(['u3']));
    expect(out.mode).toBe('select');
    expect(out.hitCount).toBe(1);
    expect(out.primaryId).toBe('u1');
    expect(Array.from(out.ids)).toEqual(['u3', 'u1']);
  });

  it('respects strict overlap boundaries', () => {
    const out = computeLassoOutcome(utterances, 1.0, 1.2, new Set());
    expect(out.hitCount).toBe(0);
    expect(out.mode).toBe('create');
  });

  it('preferBasePrimary picks first new hit', () => {
    const out = computeLassoOutcome(utterances, 0.0, 2.5, new Set(['u1']), true);
    expect(out.hitCount).toBe(3);
    expect(out.primaryId).toBe('u2');
  });
});
