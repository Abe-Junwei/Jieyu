import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { jieyuDatabaseSingletonHealthCheck, probeJieyuDatabaseIntegrity } from './dbIntegrityProbe';
import type { JieyuDatabase } from './engine';

async function runMockTransaction(...args: unknown[]) {
  const callback = args[args.length - 1];
  if (typeof callback !== 'function') {
    throw new Error('missing transaction callback');
  }
  return await callback();
}

describe('probeJieyuDatabaseIntegrity', () => {
  it('returns ok when critical tables are readable', async () => {
    const db = {
      dexie: {
        transaction: runMockTransaction,
        texts: { limit: () => ({ toArray: async () => [] }) },
        layer_units: { limit: () => ({ toArray: async () => [] }) },
        tier_definitions: { limit: () => ({ toArray: async () => [] }) },
      },
    } as unknown as JieyuDatabase;
    await expect(probeJieyuDatabaseIntegrity(db)).resolves.toEqual({ ok: true });
  });

  it('returns failure when a read throws', async () => {
    const db = {
      dexie: {
        transaction: runMockTransaction,
        texts: { limit: () => ({ toArray: async () => { throw new Error('boom'); } }) },
        layer_units: { limit: () => ({ toArray: async () => [] }) },
        tier_definitions: { limit: () => ({ toArray: async () => [] }) },
      },
    } as unknown as JieyuDatabase;
    await expect(probeJieyuDatabaseIntegrity(db)).resolves.toEqual({ ok: false, reason: 'boom' });
  });
});

describe('jieyuDatabaseSingletonHealthCheck', () => {
  it('delegates to probe on the live getDb() singleton', async () => {
    await expect(jieyuDatabaseSingletonHealthCheck()).resolves.toEqual({ ok: true });
  });
});
