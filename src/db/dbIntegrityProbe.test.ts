import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { jieyuDatabaseSingletonHealthCheck, probeJieyuDatabaseIntegrity } from './dbIntegrityProbe';
import type { JieyuDatabase } from './engine';

describe('probeJieyuDatabaseIntegrity', () => {
  it('returns ok when critical tables are readable', async () => {
    const db = {
      dexie: {
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
