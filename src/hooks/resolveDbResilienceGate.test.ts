import { describe, expect, it, vi } from 'vitest';
import { mergeIntegrityProbeGate, resolveDbResilienceProbe } from './resolveDbResilienceGate';
import type { JieyuDatabase } from '../db/engine';
import type { DbIntegrityProbeResult } from '../db/dbIntegrityProbe';

function mockDb(): JieyuDatabase {
  return {} as JieyuDatabase;
}

describe('resolveDbResilienceProbe', () => {
  it('returns idle when probe passes', async () => {
    const getDb = vi.fn().mockResolvedValue(mockDb());
    const probe = vi.fn().mockResolvedValue({ ok: true } satisfies DbIntegrityProbeResult);
    await expect(resolveDbResilienceProbe(getDb, probe)).resolves.toEqual({ kind: 'idle' });
  });

  it('classifies getDb failure as open', async () => {
    const getDb = vi.fn().mockRejectedValue(new Error('IndexedDB blocked'));
    const probe = vi.fn();
    await expect(resolveDbResilienceProbe(getDb, probe)).resolves.toEqual({
      kind: 'failed',
      failureKind: 'open',
      reason: 'IndexedDB blocked',
    });
    expect(probe).not.toHaveBeenCalled();
  });

  it('classifies probe ok:false as integrity', async () => {
    const getDb = vi.fn().mockResolvedValue(mockDb());
    const probe = vi
      .fn()
      .mockResolvedValue({ ok: false, reason: 'table read' } satisfies DbIntegrityProbeResult);
    await expect(resolveDbResilienceProbe(getDb, probe)).resolves.toEqual({
      kind: 'failed',
      failureKind: 'integrity',
      reason: 'table read',
    });
  });

  it('classifies probe throw as integrity', async () => {
    const getDb = vi.fn().mockResolvedValue(mockDb());
    const probe = vi.fn().mockRejectedValue(new Error('read failed'));
    await expect(resolveDbResilienceProbe(getDb, probe)).resolves.toEqual({
      kind: 'failed',
      failureKind: 'integrity',
      reason: 'read failed',
    });
  });
});

describe('mergeIntegrityProbeGate', () => {
  const openFailed = {
    kind: 'failed' as const,
    failureKind: 'open' as const,
    reason: 'IndexedDB blocked',
  };
  const integrityFailed = {
    kind: 'failed' as const,
    failureKind: 'integrity' as const,
    reason: 'table read',
  };

  it('keeps an explicit open-failure overlay when a late probe returns idle', () => {
    expect(mergeIntegrityProbeGate(openFailed, { kind: 'idle' })).toEqual(openFailed);
  });

  it('keeps an explicit open-failure overlay when a late probe returns integrity', () => {
    expect(mergeIntegrityProbeGate(openFailed, integrityFailed)).toEqual(openFailed);
  });

  it('applies probe idle when the current gate is not an open failure', () => {
    expect(mergeIntegrityProbeGate({ kind: 'idle' }, { kind: 'idle' })).toEqual({ kind: 'idle' });
    expect(mergeIntegrityProbeGate(integrityFailed, { kind: 'idle' })).toEqual({ kind: 'idle' });
  });

  it('applies probe integrity when the current gate is idle', () => {
    expect(mergeIntegrityProbeGate({ kind: 'idle' }, integrityFailed)).toEqual(integrityFailed);
  });
});
