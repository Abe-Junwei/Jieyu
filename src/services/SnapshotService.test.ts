import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { beforeEach, describe, expect, it } from 'vitest';
import type { LayerUnitDocType } from '../db';
import { JIEYU_DEXIE_DB_NAME } from '../db/engine';
import { clearRecoverySnapshot, getRecoverySnapshot, saveRecoverySnapshot } from './SnapshotService';

describe('SnapshotService', () => {
  beforeEach(async () => {
    await clearRecoverySnapshot(JIEYU_DEXIE_DB_NAME);
  });

  it('drops a corrupted recovery snapshot instead of surfacing a parse error', async () => {
    const db = new Dexie('jieyu_recovery');
    db.version(1).stores({ snapshots: 'dbName' });
    await db.open();

    await db.table('snapshots').put({
      dbName: JIEYU_DEXIE_DB_NAME,
      schemaVersion: 1,
      timestamp: Date.now(),
      units: 'undefined',
      translations: '[]',
      layers: '[]',
    });

    await expect(getRecoverySnapshot(JIEYU_DEXIE_DB_NAME)).resolves.toBeNull();
    await expect(db.table('snapshots').get(JIEYU_DEXIE_DB_NAME)).resolves.toBeUndefined();

    db.close();
    await Dexie.delete('jieyu_recovery');
  });

  it('normalizes missing arrays while saving recovery snapshots', async () => {
    await saveRecoverySnapshot(JIEYU_DEXIE_DB_NAME, {
      units: undefined as unknown as [],
      translations: undefined as unknown as [],
      layers: undefined as unknown as [],
    });

    await expect(getRecoverySnapshot(JIEYU_DEXIE_DB_NAME)).resolves.toMatchObject({
      units: [],
      translations: [],
      layers: [],
    });
  });

  it('skips persist when combined serialized UTF-8 size exceeds the configured limit', async () => {
    const now = '2026-01-01T00:00:00.000Z';
    const unit = {
      id: 'u1',
      textId: 't1',
      mediaId: 'm1',
      layerId: 'l1',
      unitType: 'unit',
      startTime: 0,
      endTime: 1,
      transcription: { default: 'x'.repeat(400) },
      createdAt: now,
      updatedAt: now,
    } as LayerUnitDocType;

    await saveRecoverySnapshot(
      JIEYU_DEXIE_DB_NAME,
      { units: [unit], translations: [], layers: [] },
      { maxSerializedUtf8Bytes: 120 },
    );

    await expect(getRecoverySnapshot(JIEYU_DEXIE_DB_NAME)).resolves.toBeNull();
  });

  it('clears an older snapshot when a newer oversized snapshot is skipped', async () => {
    const now = '2026-01-01T00:00:00.000Z';

    await saveRecoverySnapshot(JIEYU_DEXIE_DB_NAME, {
      units: [{
        id: 'u-small',
        textId: 't1',
        mediaId: 'm1',
        layerId: 'l1',
        unitType: 'unit',
        startTime: 0,
        endTime: 1,
        createdAt: now,
        updatedAt: now,
      } as LayerUnitDocType],
      translations: [],
      layers: [],
    });

    await saveRecoverySnapshot(
      JIEYU_DEXIE_DB_NAME,
      {
        units: [{
          id: 'u-big',
          textId: 't1',
          mediaId: 'm1',
          layerId: 'l1',
          unitType: 'unit',
          startTime: 0,
          endTime: 1,
          transcription: { default: 'x'.repeat(400) },
          createdAt: now,
          updatedAt: now,
        } as LayerUnitDocType],
        translations: [],
        layers: [],
      },
      { maxSerializedUtf8Bytes: 120 },
    );

    await expect(getRecoverySnapshot(JIEYU_DEXIE_DB_NAME)).resolves.toBeNull();
  });
});
