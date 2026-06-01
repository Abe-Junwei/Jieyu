import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import {
  jieyuDatabaseSingletonHealthCheck,
  probeJieyuDatabaseIntegrity,
  runJieyuDatabaseDeepDiagnostics,
  spotCheckJieyuDatabaseAfterMigration,
} from './dbIntegrityProbe';
import { getDb } from './engine';
import type { JieyuDatabase } from './engine';

async function runMockTransaction(...args: unknown[]) {
  const callback = args[args.length - 1];
  if (typeof callback !== 'function') {
    throw new Error('missing transaction callback');
  }
  return await callback();
}

function createMockTable(ok = true) {
  return {
    limit: () => ({
      toArray: async () => {
        if (!ok) throw new Error('boom');
        return [];
      },
    }),
  };
}

function createMockTableWithData<T extends { id: string }>(data: T[]) {
  return {
    toArray: async () => data,
    limit: (n: number) => ({
      toArray: async () => data.slice(0, n),
    }),
    where: () => ({
      anyOf: (keys: string[]) => ({
        primaryKeys: async () => {
          const validKeys = new Set(keys);
          return data.filter((row) => validKeys.has(row.id)).map((row) => row.id);
        },
      }),
    }),
  };
}

describe('probeJieyuDatabaseIntegrity', () => {
  it('returns ok when all tables are readable', async () => {
    const tables = [createMockTable(), createMockTable(), createMockTable()];
    const db = {
      dexie: {
        transaction: runMockTransaction,
        tables,
      },
    } as unknown as JieyuDatabase;
    await expect(probeJieyuDatabaseIntegrity(db)).resolves.toEqual({ ok: true });
  });

  it('returns failure when any read throws', async () => {
    const tables = [createMockTable(false), createMockTable(), createMockTable()];
    const db = {
      dexie: {
        transaction: runMockTransaction,
        tables,
      },
    } as unknown as JieyuDatabase;
    await expect(probeJieyuDatabaseIntegrity(db)).resolves.toEqual({ ok: false, reason: 'boom' });
  });
});

describe('spotCheckJieyuDatabaseAfterMigration', () => {
  function makeSpotCheckDb(overrides: {
    texts?: Array<{ id: string }>;
    layer_units?: Array<{ id: string; textId: string }>;
    tier_definitions?: Array<{ id: string; textId: string }>;
    tier_annotations?: Array<{ id: string; tierId: string }>;
    layer_unit_contents?: Array<{ id: string; unitId: string }>;
  }) {
    const texts = createMockTableWithData(overrides.texts ?? []);
    const layer_units = createMockTableWithData(overrides.layer_units ?? []);
    const tier_definitions = createMockTableWithData(overrides.tier_definitions ?? []);
    const tier_annotations = createMockTableWithData(overrides.tier_annotations ?? []);
    const layer_unit_contents = createMockTableWithData(overrides.layer_unit_contents ?? []);
    return {
      dexie: {
        transaction: runMockTransaction,
        tables: [texts, layer_units, tier_definitions, tier_annotations, layer_unit_contents],
        texts,
        layer_units,
        tier_definitions,
        tier_annotations,
        layer_unit_contents,
      },
    } as unknown as JieyuDatabase;
  }

  it('returns ok when referential integrity is intact', async () => {
    const db = makeSpotCheckDb({
      texts: [{ id: 't1' }],
      layer_units: [{ id: 'u1', textId: 't1' }],
      tier_definitions: [{ id: 'td1', textId: 't1' }],
      tier_annotations: [{ id: 'a1', tierId: 'td1' }],
      layer_unit_contents: [{ id: 'c1', unitId: 'u1' }],
    });
    await expect(spotCheckJieyuDatabaseAfterMigration(db)).resolves.toEqual({ ok: true });
  });

  it('returns ok for empty tables (greenfield)', async () => {
    const db = makeSpotCheckDb({});
    await expect(spotCheckJieyuDatabaseAfterMigration(db)).resolves.toEqual({ ok: true });
  });

  it('returns failure when layer_units references missing textId', async () => {
    const db = makeSpotCheckDb({
      texts: [{ id: 't1' }],
      layer_units: [{ id: 'u1', textId: 't-missing' }],
    });
    const result = await spotCheckJieyuDatabaseAfterMigration(db);
    expect(result.ok).toBe(false);
    expect((result as { reason: string }).reason).toContain('layer_units.textId -> texts.id');
  });

  it('returns failure when tier_annotations references missing tierId', async () => {
    const db = makeSpotCheckDb({
      texts: [{ id: 't1' }],
      tier_definitions: [{ id: 'td1', textId: 't1' }],
      tier_annotations: [{ id: 'a1', tierId: 'td-missing' }],
    });
    const result = await spotCheckJieyuDatabaseAfterMigration(db);
    expect(result.ok).toBe(false);
    expect((result as { reason: string }).reason).toContain(
      'tier_annotations.tierId -> tier_definitions.id',
    );
  });

  it('returns failure when layer_unit_contents references missing unitId', async () => {
    const db = makeSpotCheckDb({
      texts: [{ id: 't1' }],
      layer_units: [{ id: 'u1', textId: 't1' }],
      layer_unit_contents: [{ id: 'c1', unitId: 'u-missing' }],
    });
    const result = await spotCheckJieyuDatabaseAfterMigration(db);
    expect(result.ok).toBe(false);
    expect((result as { reason: string }).reason).toContain(
      'layer_unit_contents.unitId -> layer_units.id',
    );
  });

  it('deep diagnostics full scan catches references beyond the migration sample window', async () => {
    const firstTwentyUnits = Array.from({ length: 20 }, (_, index) => ({
      id: `u${index + 1}`,
      textId: 't1',
    }));
    const db = makeSpotCheckDb({
      texts: [{ id: 't1' }],
      layer_units: [...firstTwentyUnits, { id: 'u21', textId: 't-missing' }],
    });

    await expect(spotCheckJieyuDatabaseAfterMigration(db)).resolves.toEqual({ ok: true });

    const report = await runJieyuDatabaseDeepDiagnostics(db);
    expect(report.ok).toBe(false);
    expect(report.mode).toBe('full');
    expect(report.failures[0]).toContain('layer_units.textId -> texts.id');
    expect(report.references.find((item) => item.sourceTable === 'layer_units')).toMatchObject({
      checkedCount: 21,
      missingReferences: [{ missingValue: 't-missing', sourceIds: ['u21'] }],
    });
  });

  it('deep diagnostics sample mode reports sample metadata', async () => {
    const db = makeSpotCheckDb({
      texts: [{ id: 't1' }],
      layer_units: [{ id: 'u1', textId: 't1' }],
    });

    const report = await runJieyuDatabaseDeepDiagnostics(db, { sampleSize: 1 });
    expect(report).toMatchObject({ ok: true, mode: 'sample', tableCount: 5 });
    expect(report.references.find((item) => item.sourceTable === 'layer_units')).toMatchObject({
      checkedCount: 1,
      missingReferences: [],
    });
  });
});

describe('jieyuDatabaseSingletonHealthCheck', () => {
  it('delegates to probe on the live getDb() singleton', async () => {
    await expect(jieyuDatabaseSingletonHealthCheck()).resolves.toEqual({ ok: true });
  });

  it('live Dexie schema keeps key diagnostic indexes available', async () => {
    const db = await getDb();
    await db.dexie.open();

    expect(db.dexie.ai_tasks.schema.primKey.name).toBe('id');
    expect(db.dexie.ai_tasks.schema.idxByName.status).toBeDefined();
    expect(db.dexie.ai_tasks.schema.idxByName.updatedAt).toBeDefined();
    expect(db.dexie.ai_session_memories.schema.primKey.name).toBe('conversationId');
    expect(db.dexie.ai_session_memories.schema.idxByName.updatedAt).toBeDefined();
    expect(db.dexie.layer_unit_contents.schema.idxByName.unitId).toBeDefined();
    expect(db.dexie.tier_annotations.schema.idxByName.tierId).toBeDefined();
  });
});
