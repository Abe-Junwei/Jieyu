/**
 * BF1N3-1：纯 JSON 导入时，父行既不在包里也不在本机库里的行被丢掉并计数。
 * BF1N3-1: plain JSON import drops (and counts) rows whose parent is in neither the snapshot nor
 * the local DB.
 */
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db, importDatabaseFromJson, JIEYU_DEXIE_DB_NAME } from './index';
import {
  exportProjectScopedDatabaseAsJson,
  importProjectScopedDatabaseFromJson,
} from './projectScopedSnapshot';

const NOW = '2026-10-09T01:00:00.000Z';

const unit = (id: string, textId: string) =>
  ({
    id,
    textId,
    layerId: `${textId}-layer`,
    unitType: 'unit',
    startTime: 0,
    endTime: 1,
    createdAt: NOW,
    updatedAt: NOW,
  }) as never;
const token = (id: string, textId: string, unitId: string) =>
  ({
    id,
    textId,
    unitId,
    form: { default: 'dog' },
    tokenIndex: 0,
    createdAt: NOW,
    updatedAt: NOW,
  }) as never;

const snapshot = (collections: Record<string, unknown[]>) => ({
  schemaVersion: 5,
  exportedAt: NOW,
  dbName: JIEYU_DEXIE_DB_NAME,
  collections,
});

describe('importDatabaseFromJson drops orphan rows (BF1N3-1)', () => {
  beforeEach(async () => {
    await db.open();
    await Promise.all(db.tables.map((table) => table.clear()));
    await db.layer_units.put(unit('pA-unit', 'pA'));
  });

  it('drops a token whose unit is in neither the snapshot nor the local DB; keeps local parents', async () => {
    const result = await importDatabaseFromJson(
      snapshot({
        unit_tokens: [token('tok-missing', 'pB', 'unit-X'), token('tok-local', 'pA', 'pA-unit')],
      }),
    );
    expect(result.skippedOrphanRows).toEqual([{ collection: 'unit_tokens', count: 1 }]);
    expect(await db.unit_tokens.get('tok-missing')).toBeUndefined();
    expect(await db.unit_tokens.get('tok-local')).toBeDefined();
  });

  it('keeps rows whose parent is in the snapshot and reports nothing', async () => {
    const result = await importDatabaseFromJson(
      snapshot({
        layer_units: [unit('pB-unit', 'pB')],
        unit_tokens: [token('t', 'pB', 'pB-unit')],
      }),
    );
    expect(result.skippedOrphanRows).toBeUndefined();
    expect(await db.unit_tokens.get('t')).toBeDefined();
  });

  it('replace-all: a local parent in a table the import clears does not count', async () => {
    const result = await importDatabaseFromJson(
      snapshot({
        layer_units: [unit('pB-unit', 'pB')],
        unit_tokens: [token('t', 'pA', 'pA-unit')],
      }),
      { strategy: 'replace-all' },
    );
    expect(result.skippedOrphanRows).toEqual([{ collection: 'unit_tokens', count: 1 }]);
    expect(await db.unit_tokens.count()).toBe(0);
  });
});

describe('project-scoped JSON import checks orphans after the prune (PF-1)', () => {
  beforeEach(async () => {
    await db.open();
    await Promise.all(db.tables.map((table) => table.clear()));
  });

  it('a parent that exists only locally and is pruned by preWrite does not keep its child alive', async () => {
    await db.layer_units.put(unit('pA-unit', 'pA'));
    await db.unit_tokens.put(token('pA-tok', 'pA', 'pA-unit'));
    const exported = (await exportProjectScopedDatabaseAsJson('pA')) as unknown as {
      snapshot?: { collections: Record<string, unknown[]> };
    };
    const snap = JSON.parse(JSON.stringify(exported.snapshot ?? exported)) as {
      collections: Record<string, unknown[]>;
    };
    expect(snap.collections.unit_tokens).toHaveLength(1);
    snap.collections.layer_units = (snap.collections.layer_units ?? []).filter(
      (row) => (row as { id: string }).id !== 'pA-unit',
    );

    const result = await importProjectScopedDatabaseFromJson(snap, 'pA');

    expect(await db.layer_units.get('pA-unit')).toBeUndefined();
    expect(await db.unit_tokens.get('pA-tok')).toBeUndefined();
    expect(result.skippedOrphanRows).toEqual([{ collection: 'unit_tokens', count: 1 }]);
  });

  it('B5-5: a layer whose document is missing keeps the layer, drops the documentId, and is not reported as skipped', async () => {
    await db.texts.put({ id: 'pA', title: { default: 'A' }, createdAt: NOW, updatedAt: NOW });
    await db.annotation_documents.put({
      id: 'doc-local',
      textId: 'pA',
      isDefault: true,
      createdAt: NOW,
      updatedAt: NOW,
    });
    const layer = (id: string, documentId: string) =>
      ({
        id,
        textId: 'pA',
        key: id,
        name: { default: id },
        tierType: 'time-aligned',
        contentType: 'transcription',
        languageId: 'user:demo',
        documentId,
        createdAt: NOW,
        updatedAt: NOW,
      }) as never;
    const viewLayer = (id: string, documentId: string) =>
      ({
        id,
        textId: 'pA',
        key: id,
        name: { default: id },
        layerType: 'transcription',
        languageId: 'user:demo',
        modality: 'text',
        documentId,
        createdAt: NOW,
        updatedAt: NOW,
      }) as never;
    // 评审 R5-5：同一批层既在 tier_definitions 里，也在 `layers` 别名里 | the R5-5 shape: both names
    const result = await importDatabaseFromJson(
      snapshot({
        tier_definitions: [layer('L-missing', 'doc-gone'), layer('L-local', 'doc-local')],
        layers: [viewLayer('L-missing', 'doc-gone'), viewLayer('L-local', 'doc-local')],
      }),
    );
    expect(result.skippedOrphanRows).toBeUndefined();
    const missing = await db.tier_definitions.get('L-missing');
    expect(missing).toBeDefined();
    expect((missing as { documentId?: string }).documentId).toBeUndefined();
    expect(((await db.tier_definitions.get('L-local')) as { documentId?: string }).documentId).toBe(
      'doc-local',
    );
  });
});
