import { describe, expect, it } from 'vitest';
import { resolveDeletePlan } from '../src/utils/deleteSelectionUtils';

describe('resolveDeletePlan', () => {
  it('returns none when both primary and ids are empty', () => {
    const plan = resolveDeletePlan('', []);
    expect(plan.kind).toBe('none');
  });

  it('returns single when only primary exists', () => {
    const plan = resolveDeletePlan('u1', []);
    expect(plan.kind).toBe('single');
    if (plan.kind === 'single') {
      expect(plan.id).toBe('u1');
    }
  });

  it('returns single using normalized primary when one id is selected', () => {
    const plan = resolveDeletePlan('missing', ['u2']);
    expect(plan.kind).toBe('single');
    if (plan.kind === 'single') {
      expect(plan.id).toBe('u2');
    }
  });

  it('returns multi when multiple ids are selected', () => {
    const plan = resolveDeletePlan('u1', ['u1', 'u2', 'u3']);
    expect(plan.kind).toBe('multi');
    if (plan.kind === 'multi') {
      expect(Array.from(plan.ids)).toEqual(['u1', 'u2', 'u3']);
    }
  });

  it('falls back to selected set when primary is stale', () => {
    const plan = resolveDeletePlan('stale', ['u3', 'u4']);
    expect(plan.kind).toBe('multi');
    if (plan.kind === 'multi') {
      expect(plan.ids.has('u3')).toBe(true);
      expect(plan.ids.has('u4')).toBe(true);
    }
  });
});
