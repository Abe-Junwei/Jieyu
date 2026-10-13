// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db, getDb, importDatabaseFromJson, JIEYU_DEXIE_DB_NAME } from './index';
import { resetJieyuDatabaseSingletonForTests } from './engine';

/** P0-2b: notes written before user_notes.textId existed must stay editable and findable per project. */
const NOW = '2026-10-01T00:00:00.000Z';

async function rawPutLegacyNote(row: Record<string, unknown>): Promise<void> {
  await db.open();
  const idb = db.backendDB();
  await new Promise<void>((resolve, reject) => {
    const tx = idb.transaction('user_notes', 'readwrite');
    tx.objectStore('user_notes').put(row);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

describe('legacy user_notes without textId (P0-2b)', () => {
  beforeEach(async () => {
    await db.open();
    await db.user_notes.clear();
  });

  it('backfills on DB open: legacy note is editable and found per project; orphan is kept', async () => {
    await rawPutLegacyNote({
      id: 'n_legacy',
      targetType: 'text',
      targetId: 't_legacy',
      content: { und: 'old' },
      createdAt: NOW,
      updatedAt: NOW,
    });
    await rawPutLegacyNote({
      id: 'n_orphan',
      targetType: 'unit',
      targetId: 'missing_unit',
      content: { und: 'x' },
      createdAt: NOW,
      updatedAt: NOW,
    });
    await resetJieyuDatabaseSingletonForTests();
    await getDb();

    expect(await db.user_notes.where('textId').equals('t_legacy').count()).toBe(1);
    await db.user_notes.update('n_legacy', { content: { und: 'edited' }, updatedAt: NOW });
    expect((await db.user_notes.get('n_legacy'))?.content).toEqual({ und: 'edited' });
    expect(await db.user_notes.get('n_orphan')).toBeDefined();
  });

  it('imports a legacy backup whose notes lack textId', async () => {
    const result = await importDatabaseFromJson(
      {
        schemaVersion: 5,
        exportedAt: NOW,
        dbName: JIEYU_DEXIE_DB_NAME,
        collections: {
          texts: [{ id: 't_backup', title: { default: 'Backup' }, createdAt: NOW, updatedAt: NOW }],
          user_notes: [
            {
              id: 'n_old',
              targetType: 'text',
              targetId: 't_backup',
              content: { und: 'old' },
              createdAt: NOW,
              updatedAt: NOW,
            },
            {
              id: 'n_lost',
              targetType: 'unit',
              targetId: 'missing_unit',
              content: { und: 'x' },
              createdAt: NOW,
              updatedAt: NOW,
            },
          ],
        },
      },
      { strategy: 'skip-existing' },
    );

    expect((await db.user_notes.get('n_old'))?.textId).toBe('t_backup');
    expect(result.skippedOrphanRows).toEqual([{ collection: 'user_notes', count: 1 }]);
  });
});
