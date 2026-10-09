import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db, JIEYU_DEXIE_DB_NAME } from './index';
import {
  assertSupportedSnapshotVersion,
  exportDatabaseAsJson,
  importDatabaseFromJson,
  prepareSnapshotImport,
  SNAPSHOT_SCHEMA_VERSION,
} from './io';
import { findSnapshotFormatError, LEGACY_MAIN_DB_NAME } from './snapshotFormatError';

const NOW = '2026-10-09T00:00:00.000Z';

async function captureFormatError(run: () => Promise<unknown> | unknown) {
  try {
    await run();
  } catch (error) {
    const formatError = findSnapshotFormatError(error);
    if (formatError) return formatError;
    throw error;
  }
  throw new Error('expected a SnapshotFormatError');
}

/** RD-1 复现：旧库导出的媒体缺三个状态字段（timelineKind 在 details 里），另有 system 结构规则 */
function legacyShapedCollections() {
  return {
    texts: [{ id: 't1', title: { default: 'T' }, createdAt: NOW, updatedAt: NOW }],
    media_items: [
      {
        id: 'm1',
        textId: 't1',
        filename: 'a.wav',
        isOfflineCached: false,
        details: { timelineKind: 'acoustic', audioExportOmitted: true },
        createdAt: NOW,
      },
    ],
  };
}

describe('RD-1 snapshot version gate and per-record pre-check', () => {
  beforeEach(async () => {
    await db.open();
    await Promise.all([db.texts.clear(), db.media_items.clear()]);
  });

  it('rejects exports of the pre-reset database with a legacy error', async () => {
    const error = await captureFormatError(() =>
      assertSupportedSnapshotVersion({ schemaVersion: 4, dbName: LEGACY_MAIN_DB_NAME }),
    );
    expect(error.code).toBe('legacy-database');
    expect(error.dbName).toBe(LEGACY_MAIN_DB_NAME);
  });

  it('treats any older schemaVersion as legacy and a newer one as unsupported', async () => {
    expect(
      (await captureFormatError(() => assertSupportedSnapshotVersion({ schemaVersion: 4 }))).code,
    ).toBe('legacy-database');
    expect(
      (
        await captureFormatError(() =>
          assertSupportedSnapshotVersion({ schemaVersion: SNAPSHOT_SCHEMA_VERSION + 1 }),
        )
      ).code,
    ).toBe('unsupported-version');
    expect(() =>
      assertSupportedSnapshotVersion({
        schemaVersion: SNAPSHOT_SCHEMA_VERSION,
        dbName: JIEYU_DEXIE_DB_NAME,
      }),
    ).not.toThrow();
  });

  it('pre-check counts every invalid record per collection instead of passing preview', async () => {
    const error = await captureFormatError(() =>
      prepareSnapshotImport(
        {
          schemaVersion: SNAPSHOT_SCHEMA_VERSION,
          exportedAt: NOW,
          dbName: JIEYU_DEXIE_DB_NAME,
          collections: legacyShapedCollections(),
        },
        NOW,
      ),
    );
    expect(error.code).toBe('invalid-records');
    expect(error.invalidCollections).toEqual([
      expect.objectContaining({ collection: 'media_items', invalid: 1 }),
    ]);
    // 只报字段和原因，不带行内容 | Only field and reason, never row content
    expect(error.message).not.toContain('a.wav');
  });

  it('import of an old-database snapshot writes nothing', async () => {
    const error = await captureFormatError(() =>
      importDatabaseFromJson({
        schemaVersion: 4,
        exportedAt: NOW,
        dbName: LEGACY_MAIN_DB_NAME,
        collections: legacyShapedCollections(),
      }),
    );
    expect(error.code).toBe('legacy-database');
    expect(await db.texts.count()).toBe(0);
    expect(await db.media_items.count()).toBe(0);
  });

  it('export stamps the current snapshot version', async () => {
    const snapshot = await exportDatabaseAsJson();
    expect(snapshot.schemaVersion).toBe(SNAPSHOT_SCHEMA_VERSION);
    expect(snapshot.dbName).toBe(JIEYU_DEXIE_DB_NAME);
  });
});

describe('JY-13 export reads in one read-only transaction', () => {
  beforeEach(async () => {
    await db.open();
    await Promise.all([db.layer_units.clear(), db.layer_unit_contents.clear()]);
  });

  it('a write racing the export is either fully in the snapshot or fully absent', async () => {
    const exporting = exportDatabaseAsJson();
    const writing = db.transaction('rw', db.layer_units, db.layer_unit_contents, async () => {
      await db.layer_units.put({
        id: 'u_race',
        textId: 't_race',
        mediaId: 'm_race',
        layerId: 'l_race',
        unitType: 'unit',
        startTime: 0,
        endTime: 1,
        createdAt: NOW,
        updatedAt: NOW,
      } as never);
      await db.layer_unit_contents.put({
        id: 'c_race',
        textId: 't_race',
        unitId: 'u_race',
        layerId: 'l_race',
        contentRole: 'primary_text',
        modality: 'text',
        text: 'x',
        sourceType: 'human',
        createdAt: NOW,
        updatedAt: NOW,
      } as never);
    });
    const [snapshot] = await Promise.all([exporting, writing.catch(() => undefined)]);
    const hasUnit = (snapshot.collections['layer_units'] ?? []).some(
      (row) => (row as { id?: string }).id === 'u_race',
    );
    const hasContent = (snapshot.collections['layer_unit_contents'] ?? []).some(
      (row) => (row as { id?: string }).id === 'c_race',
    );
    expect(hasUnit).toBe(hasContent);
  });
});
