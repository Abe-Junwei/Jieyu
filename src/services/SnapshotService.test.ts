import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { beforeEach, describe, expect, it } from 'vitest';
import { clearRecoverySnapshot, getRecoverySnapshot, saveRecoverySnapshot } from './SnapshotService';

describe('SnapshotService', () => {
  beforeEach(async () => {
    await clearRecoverySnapshot('jieyudb');
  });

  it('drops a corrupted recovery snapshot instead of surfacing a parse error', async () => {
    const db = new Dexie('jieyu_recovery');
    db.version(1).stores({ snapshots: 'dbName' });
    await db.open();

    await db.table('snapshots').put({
      dbName: 'jieyudb',
      schemaVersion: 1,
      timestamp: Date.now(),
      units: 'undefined',
      translations: '[]',
      layers: '[]',
    });

    await expect(getRecoverySnapshot('jieyudb')).resolves.toBeNull();
    await expect(db.table('snapshots').get('jieyudb')).resolves.toBeUndefined();

    db.close();
    await Dexie.delete('jieyu_recovery');
  });

  it('normalizes missing arrays while saving recovery snapshots', async () => {
    await saveRecoverySnapshot('jieyudb', {
      units: undefined as unknown as [],
      translations: undefined as unknown as [],
      layers: undefined as unknown as [],
    });

    await expect(getRecoverySnapshot('jieyudb')).resolves.toMatchObject({
      units: [],
      translations: [],
      layers: [],
    });
  });
});
