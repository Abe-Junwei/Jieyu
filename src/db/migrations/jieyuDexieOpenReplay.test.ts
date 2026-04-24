/**
 * ARCH-5: 在干净 IndexedDB 上从 v1 回放至 `JIEYU_DEXIE_TARGET_SCHEMA_VERSION`，作为 CI 迁移链回归。
 */
import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, describe, expect, it } from 'vitest';
import { JieyuDexie, JIEYU_DEXIE_TARGET_SCHEMA_VERSION } from '../engine';

const REPLAY_DB_NAME = 'jieyudb_v2_open_replay_ci';

describe('JieyuDexie migration open replay (ARCH-5)', () => {
  afterEach(async () => {
    if (Dexie.dependencies.indexedDB && (await Dexie.exists(REPLAY_DB_NAME))) {
      await Dexie.delete(REPLAY_DB_NAME);
    }
  });

  it('opens a fresh database and applies all version upgrades to the target schema', async () => {
    if (await Dexie.exists(REPLAY_DB_NAME)) {
      await Dexie.delete(REPLAY_DB_NAME);
    }
    const db = new JieyuDexie(REPLAY_DB_NAME);
    await db.open();
    try {
      expect(db.verno).toBe(JIEYU_DEXIE_TARGET_SCHEMA_VERSION);
    } finally {
      await db.close();
    }
  });
});
