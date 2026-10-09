import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LayerUnitDocType } from '../db';
import { JIEYU_DEXIE_DB_NAME } from '../db/engine';
import {
  RECOVERY_SCHEMA_VERSION,
  clearRecoverySnapshot,
  dismissRecoverySnapshotSkip,
  getRecoveryLayerUnits,
  getRecoverySnapshot,
  getRecoverySnapshotSkip,
  saveRecoverySnapshot,
} from './SnapshotService';

const { mockExportRecoveryDatabaseAsJson, mockExportProjectScopedDatabaseAsJson } = vi.hoisted(
  () => ({
    mockExportRecoveryDatabaseAsJson: vi.fn<
      () => Promise<Awaited<ReturnType<typeof import('../db/io').exportRecoveryDatabaseAsJson>>>
    >(async () => ({
      schemaVersion: 5,
      exportedAt: '2026-06-01T00:00:00.000Z',
      dbName: JIEYU_DEXIE_DB_NAME,
      collections: {
        layer_units: [],
        layer_unit_contents: [],
        layers: [],
      },
    })),
    mockExportProjectScopedDatabaseAsJson: vi.fn<
      (
        textId: string,
      ) => Promise<
        Awaited<
          ReturnType<typeof import('../db/projectScopedSnapshot').exportProjectScopedDatabaseAsJson>
        >
      >
    >(async (_textId) => {
      throw new Error('exportProjectScopedDatabaseAsJson mock not configured');
    }),
  }),
);

vi.mock('../db/io', () => ({
  exportRecoveryDatabaseAsJson: mockExportRecoveryDatabaseAsJson,
  RECOVERY_EXPORT_COLLECTIONS: [
    'texts',
    'media_items',
    'layers',
    'layer_links',
    'layer_units',
    'layer_unit_contents',
    'segment_meta',
    'unit_relations',
    'unit_tokens',
    'unit_morphemes',
    'speakers',
    'user_notes',
    'anchors',
  ],
}));

vi.mock('../db/projectScopedSnapshot', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../db/projectScopedSnapshot')>();
  return {
    ...actual,
    exportProjectScopedDatabaseAsJson: mockExportProjectScopedDatabaseAsJson,
  };
});

describe('SnapshotService', () => {
  beforeEach(async () => {
    mockExportRecoveryDatabaseAsJson.mockClear();
    await clearRecoverySnapshot(JIEYU_DEXIE_DB_NAME);
    await clearRecoverySnapshot(JIEYU_DEXIE_DB_NAME, 't1');
    await clearRecoverySnapshot(JIEYU_DEXIE_DB_NAME, 't2');
    dismissRecoverySnapshotSkip();
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

    await expect(
      saveRecoverySnapshot(JIEYU_DEXIE_DB_NAME, { maxSerializedUtf8Bytes: 120 }),
    ).resolves.toMatchObject({ status: 'skipped-too-large', staleCleared: false });
    await expect(getRecoverySnapshot(JIEYU_DEXIE_DB_NAME)).resolves.toBeNull();
  });

  it('T43: an over-limit save is reported as skipped and clears the stale snapshot', async () => {
    const smallUnit: LayerUnitDocType = {
      id: 'u-small',
      textId: 't1',
      mediaId: 'm1',
      layerId: 'l1',
      unitType: 'unit',
      startTime: 0,
      endTime: 1,
      transcription: { default: 'keep-me' },
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };

    mockExportRecoveryDatabaseAsJson.mockResolvedValueOnce({
      schemaVersion: 4,
      exportedAt: '2026-06-01T00:00:00.000Z',
      dbName: JIEYU_DEXIE_DB_NAME,
      collections: { layer_units: [smallUnit] },
    });
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
            ...smallUnit,
            transcription: { default: 'x'.repeat(400) },
          },
        ],
      },
    });

    const result = await saveRecoverySnapshot(JIEYU_DEXIE_DB_NAME, { maxSerializedUtf8Bytes: 120 });
    expect(result).toMatchObject({
      status: 'skipped-too-large',
      maxBytes: 120,
      staleCleared: true,
    });
    // 旧快照比当前数据旧，不能再被当成可恢复 | The stale snapshot must not be offered any more
    await expect(getRecoverySnapshot(JIEYU_DEXIE_DB_NAME)).resolves.toBeNull();
    expect(getRecoverySnapshotSkip()).toMatchObject({
      dbName: JIEYU_DEXIE_DB_NAME,
      projectId: null,
      maxBytes: 120,
      staleCleared: true,
    });

    // 下一次成功保存后“已跳过”提示消失 | The next successful save clears the skipped notice
    mockExportRecoveryDatabaseAsJson.mockResolvedValueOnce({
      schemaVersion: 4,
      exportedAt: '2026-06-01T00:00:00.000Z',
      dbName: JIEYU_DEXIE_DB_NAME,
      collections: { layer_units: [smallUnit] },
    });
    await expect(saveRecoverySnapshot(JIEYU_DEXIE_DB_NAME)).resolves.toMatchObject({
      status: 'saved',
    });
    expect(getRecoverySnapshotSkip()).toBeNull();
  });

  it('T43: stores and reads recovery snapshots per project, keeping only that project', async () => {
    const unitOf = (id: string, textId: string): LayerUnitDocType => ({
      id,
      textId,
      mediaId: `m-${textId}`,
      layerId: `l-${textId}`,
      unitType: 'unit',
      startTime: 0,
      endTime: 1,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    const whole = {
      schemaVersion: 5,
      exportedAt: '2026-06-01T00:00:00.000Z',
      dbName: JIEYU_DEXIE_DB_NAME,
      collections: {
        texts: [
          { id: 't1', title: { default: 'one' } },
          { id: 't2', title: { default: 'two' } },
        ],
        layer_units: [unitOf('u1', 't1'), unitOf('u2', 't2')],
        layer_unit_contents: [],
        layers: [],
      },
    };
    const scopedOf = (textId: string) => ({
      ...whole,
      collections: {
        texts: whole.collections.texts.filter((row) => row.id === textId),
        layer_units: whole.collections.layer_units.filter((row) => row.textId === textId),
        layer_unit_contents: [],
        layers: [],
      },
    });
    mockExportProjectScopedDatabaseAsJson.mockResolvedValueOnce(scopedOf('t1'));
    await saveRecoverySnapshot(JIEYU_DEXIE_DB_NAME, { projectId: 't1' });
    mockExportProjectScopedDatabaseAsJson.mockResolvedValueOnce(scopedOf('t2'));
    await saveRecoverySnapshot(JIEYU_DEXIE_DB_NAME, { projectId: 't2' });

    const one = await getRecoverySnapshot(JIEYU_DEXIE_DB_NAME, 't1');
    expect(getRecoveryLayerUnits(one!).map((u) => u.id)).toEqual(['u1']);
    expect(one!.snapshot.collections.texts).toEqual([{ id: 't1', title: { default: 'one' } }]);
    const two = await getRecoverySnapshot(JIEYU_DEXIE_DB_NAME, 't2');
    expect(getRecoveryLayerUnits(two!).map((u) => u.id)).toEqual(['u2']);
    // 没有整库键 | No whole-database row is written
    await expect(getRecoverySnapshot(JIEYU_DEXIE_DB_NAME)).resolves.toBeNull();

    // 一个项目超限只清自己的快照 | One project over the cap only clears its own snapshot
    mockExportProjectScopedDatabaseAsJson.mockResolvedValueOnce(scopedOf('t1'));
    const skipped = await saveRecoverySnapshot(JIEYU_DEXIE_DB_NAME, {
      projectId: 't1',
      maxSerializedUtf8Bytes: 50,
    });
    expect(skipped).toMatchObject({ status: 'skipped-too-large', staleCleared: true });
    expect(getRecoverySnapshotSkip()).toMatchObject({ projectId: 't1' });
    await expect(getRecoverySnapshot(JIEYU_DEXIE_DB_NAME, 't1')).resolves.toBeNull();
    await expect(getRecoverySnapshot(JIEYU_DEXIE_DB_NAME, 't2')).resolves.not.toBeNull();

    await clearRecoverySnapshot(JIEYU_DEXIE_DB_NAME, 't2');
    await expect(getRecoverySnapshot(JIEYU_DEXIE_DB_NAME, 't2')).resolves.toBeNull();
  });

  it('T43: a pre-upgrade whole-database snapshot is read per project and cleared with it', async () => {
    mockExportRecoveryDatabaseAsJson.mockResolvedValueOnce({
      schemaVersion: 4,
      exportedAt: '2026-06-01T00:00:00.000Z',
      dbName: JIEYU_DEXIE_DB_NAME,
      collections: {
        texts: [{ id: 't1' }, { id: 't2' }],
        layer_units: [
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
          },
          {
            id: 'u2',
            textId: 't2',
            mediaId: 'm2',
            layerId: 'l2',
            unitType: 'unit',
            startTime: 0,
            endTime: 1,
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
          },
        ],
      },
    });
    // 旧版本按库名保存整库 | Older builds stored the whole database under the db name
    await saveRecoverySnapshot(JIEYU_DEXIE_DB_NAME);

    const one = await getRecoverySnapshot(JIEYU_DEXIE_DB_NAME, 't1');
    expect(getRecoveryLayerUnits(one!).map((u) => u.id)).toEqual(['u1']);

    // 较旧的项目快照不会盖过较新的整库快照 | An older project snapshot does not shadow a newer whole-db one
    const db = new Dexie('jieyu_recovery');
    db.version(1).stores({ snapshots: 'dbName' });
    await db.table('snapshots').put({
      dbName: `${JIEYU_DEXIE_DB_NAME}::project::t1`,
      schemaVersion: RECOVERY_SCHEMA_VERSION,
      timestamp: one!.timestamp - 1000,
      snapshotJson: JSON.stringify({
        schemaVersion: 4,
        exportedAt: '',
        dbName: 'x',
        collections: {},
      }),
    });
    db.close();
    const newer = await getRecoverySnapshot(JIEYU_DEXIE_DB_NAME, 't1');
    expect(getRecoveryLayerUnits(newer!).map((u) => u.id)).toEqual(['u1']);
    await clearRecoverySnapshot(JIEYU_DEXIE_DB_NAME, 't1');
    await expect(getRecoverySnapshot(JIEYU_DEXIE_DB_NAME, 't1')).resolves.toBeNull();
    await expect(getRecoverySnapshot(JIEYU_DEXIE_DB_NAME)).resolves.toBeNull();
  });

  it('persists v2 recovery snapshots from exportRecoveryDatabaseAsJson', async () => {
    await saveRecoverySnapshot(JIEYU_DEXIE_DB_NAME);
    expect(mockExportRecoveryDatabaseAsJson).toHaveBeenCalledTimes(1);
    await expect(getRecoverySnapshot(JIEYU_DEXIE_DB_NAME)).resolves.toMatchObject({
      schemaVersion: RECOVERY_SCHEMA_VERSION,
      snapshot: {
        schemaVersion: 5,
        dbName: JIEYU_DEXIE_DB_NAME,
      },
    });
  });

  it('preserves non-layer collections from the recovery DB export', async () => {
    mockExportRecoveryDatabaseAsJson.mockResolvedValueOnce({
      schemaVersion: 4,
      exportedAt: '2026-06-01T00:00:00.000Z',
      dbName: JIEYU_DEXIE_DB_NAME,
      collections: {
        layer_units: [],
        layer_unit_contents: [],
        layers: [],
        media: [{ id: 'media_1', name: 'source.wav', createdAt: '2026-01-01T00:00:00.000Z' }],
        speakers: [{ id: 'speaker_1', name: 'Speaker 1', createdAt: '2026-01-01T00:00:00.000Z' }],
        layer_links: [{ id: 'link_1', layerId: 'layer_trl', transcriptionLayerKey: 'trc' }],
      },
    });

    await saveRecoverySnapshot(JIEYU_DEXIE_DB_NAME);

    const snap = await getRecoverySnapshot(JIEYU_DEXIE_DB_NAME);
    expect(snap?.snapshot.collections.media).toEqual([
      { id: 'media_1', name: 'source.wav', createdAt: '2026-01-01T00:00:00.000Z' },
    ]);
    expect(snap?.snapshot.collections.speakers).toEqual([
      { id: 'speaker_1', name: 'Speaker 1', createdAt: '2026-01-01T00:00:00.000Z' },
    ]);
    expect(snap?.snapshot.collections.layer_links).toEqual([
      { id: 'link_1', layerId: 'layer_trl', transcriptionLayerKey: 'trc' },
    ]);
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
