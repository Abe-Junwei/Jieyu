import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LayerUnitDocType } from '../db';
import { JIEYU_DEXIE_DB_NAME } from '../db/engine';
import {
  RECOVERY_SCHEMA_VERSION,
  clearRecoverySnapshot,
  getRecoveryLayerUnits,
  getRecoverySnapshot,
  saveRecoverySnapshot,
} from './SnapshotService';

const { mockExportRecoveryDatabaseAsJson } = vi.hoisted(() => ({
  mockExportRecoveryDatabaseAsJson: vi.fn<
    () => Promise<Awaited<ReturnType<typeof import('../db/io').exportRecoveryDatabaseAsJson>>>
  >(async () => ({
    schemaVersion: 4,
    exportedAt: '2026-06-01T00:00:00.000Z',
    dbName: JIEYU_DEXIE_DB_NAME,
    collections: {
      layer_units: [],
      layer_unit_contents: [],
      layers: [],
    },
  })),
}));

vi.mock('../db/io', () => ({
  exportRecoveryDatabaseAsJson: mockExportRecoveryDatabaseAsJson,
}));

describe('SnapshotService', () => {
  beforeEach(async () => {
    mockExportRecoveryDatabaseAsJson.mockClear();
    await clearRecoverySnapshot(JIEYU_DEXIE_DB_NAME);
  });

  it('drops a corrupted recovery snapshot instead of surfacing a parse error', async () => {
    const db = new Dexie('jieyu_recovery');
    db.version(1).stores({ snapshots: 'dbName' });
    await db.open();

    await db.table('snapshots').put({
      dbName: JIEYU_DEXIE_DB_NAME,
      schemaVersion: RECOVERY_SCHEMA_VERSION,
      timestamp: Date.now(),
      snapshotJson: '{not-json',
    });

    await expect(getRecoverySnapshot(JIEYU_DEXIE_DB_NAME)).resolves.toBeNull();
    await expect(db.table('snapshots').get(JIEYU_DEXIE_DB_NAME)).resolves.toBeUndefined();

    db.close();
    await Dexie.delete('jieyu_recovery');
  });

  it('reads legacy v1 snapshots by converting them to import-compatible shape', async () => {
    const db = new Dexie('jieyu_recovery');
    db.version(1).stores({ snapshots: 'dbName' });
    await db.open();

    await db.table('snapshots').put({
      dbName: JIEYU_DEXIE_DB_NAME,
      schemaVersion: 1,
      timestamp: Date.now(),
      units: JSON.stringify([
        {
          id: 'u1',
          textId: 't1',
          mediaId: 'm1',
          layerId: 'l1',
          unitType: 'unit',
          startTime: 0,
          endTime: 1,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        } satisfies LayerUnitDocType,
      ]),
      translations: '[]',
      layers: '[]',
    });

    const snap = await getRecoverySnapshot(JIEYU_DEXIE_DB_NAME);
    expect(snap?.schemaVersion).toBe(RECOVERY_SCHEMA_VERSION);
    expect(getRecoveryLayerUnits(snap!)).toHaveLength(1);

    db.close();
    await Dexie.delete('jieyu_recovery');
  });

  it('skips persist when combined serialized UTF-8 size exceeds the configured limit', async () => {
    mockExportRecoveryDatabaseAsJson.mockResolvedValueOnce({
      schemaVersion: 4,
      exportedAt: '2026-06-01T00:00:00.000Z',
      dbName: JIEYU_DEXIE_DB_NAME,
      collections: {
        layer_units: [
          {
            id: 'u1',
            textId: 't1',
            mediaId: 'm1',
            layerId: 'l1',
            unitType: 'unit',
            startTime: 0,
            endTime: 1,
            transcription: { default: 'x'.repeat(400) },
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
          } satisfies LayerUnitDocType,
        ],
      },
    });

    await saveRecoverySnapshot(JIEYU_DEXIE_DB_NAME, { maxSerializedUtf8Bytes: 120 });
    await expect(getRecoverySnapshot(JIEYU_DEXIE_DB_NAME)).resolves.toBeNull();
  });

  it('preserves an existing recovery snapshot when a new save exceeds the size limit', async () => {
    await saveRecoverySnapshot(JIEYU_DEXIE_DB_NAME);
    const existing = await getRecoverySnapshot(JIEYU_DEXIE_DB_NAME);
    expect(existing).not.toBeNull();

    mockExportRecoveryDatabaseAsJson.mockResolvedValueOnce({
      schemaVersion: 4,
      exportedAt: '2026-06-01T00:00:00.000Z',
      dbName: JIEYU_DEXIE_DB_NAME,
      collections: {
        layer_units: [
          {
            id: 'u-oversize',
            textId: 't1',
            mediaId: 'm1',
            layerId: 'l1',
            unitType: 'unit',
            startTime: 0,
            endTime: 1,
            transcription: { default: 'x'.repeat(400) },
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
          } satisfies LayerUnitDocType,
        ],
      },
    });

    await saveRecoverySnapshot(JIEYU_DEXIE_DB_NAME, { maxSerializedUtf8Bytes: 120 });
    await expect(getRecoverySnapshot(JIEYU_DEXIE_DB_NAME)).resolves.toEqual(existing);
  });

  it('persists v2 recovery snapshots from exportRecoveryDatabaseAsJson', async () => {
    await saveRecoverySnapshot(JIEYU_DEXIE_DB_NAME);
    expect(mockExportRecoveryDatabaseAsJson).toHaveBeenCalledTimes(1);
    await expect(getRecoverySnapshot(JIEYU_DEXIE_DB_NAME)).resolves.toMatchObject({
      schemaVersion: RECOVERY_SCHEMA_VERSION,
      snapshot: {
        schemaVersion: 4,
        dbName: JIEYU_DEXIE_DB_NAME,
      },
    });
  });

  it('overlays in-memory layer graph on top of the DB export', async () => {
    mockExportRecoveryDatabaseAsJson.mockResolvedValueOnce({
      schemaVersion: 4,
      exportedAt: '2026-06-01T00:00:00.000Z',
      dbName: JIEYU_DEXIE_DB_NAME,
      collections: {
        layer_units: [],
        layer_unit_contents: [],
        layers: [],
      },
    });

    const liveUnit: LayerUnitDocType = {
      id: 'u-live',
      textId: 't1',
      mediaId: 'm1',
      layerId: 'l1',
      unitType: 'unit',
      startTime: 0,
      endTime: 1,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };

    await saveRecoverySnapshot(JIEYU_DEXIE_DB_NAME, {
      liveLayerGraph: {
        layer_units: [liveUnit],
        layer_unit_contents: [],
        layers: [],
      },
    });

    const snap = await getRecoverySnapshot(JIEYU_DEXIE_DB_NAME);
    expect(getRecoveryLayerUnits(snap!)).toEqual([liveUnit]);
  });

  it('merges live unit edits without dropping segment rows from the DB export', async () => {
    const segmentUnit: LayerUnitDocType = {
      id: 'seg-1',
      textId: 't1',
      mediaId: 'm1',
      layerId: 'l1',
      unitType: 'segment',
      startTime: 0,
      endTime: 5,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    const staleUnit: LayerUnitDocType = {
      id: 'u-live',
      textId: 't1',
      mediaId: 'm1',
      layerId: 'l1',
      unitType: 'unit',
      startTime: 0,
      endTime: 1,
      transcription: { default: 'stale from db' },
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    const liveUnit: LayerUnitDocType = {
      ...staleUnit,
      transcription: { default: 'edited in memory' },
      updatedAt: '2026-06-01T12:00:00.000Z',
    };

    mockExportRecoveryDatabaseAsJson.mockResolvedValueOnce({
      schemaVersion: 4,
      exportedAt: '2026-06-01T00:00:00.000Z',
      dbName: JIEYU_DEXIE_DB_NAME,
      collections: {
        layer_units: [segmentUnit, staleUnit],
        layer_unit_contents: [],
        layers: [],
      },
    });

    await saveRecoverySnapshot(JIEYU_DEXIE_DB_NAME, {
      liveLayerGraph: {
        layer_units: [liveUnit],
        layer_unit_contents: [],
        layers: [],
      },
    });

    const snap = await getRecoverySnapshot(JIEYU_DEXIE_DB_NAME);
    const units = getRecoveryLayerUnits(snap!);
    expect(units).toHaveLength(2);
    expect(units.find((u) => u.id === 'seg-1')).toEqual(segmentUnit);
    expect(units.find((u) => u.id === 'u-live')?.transcription).toEqual({
      default: 'edited in memory',
    });
  });
});
