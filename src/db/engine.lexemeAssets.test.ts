import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { exportDatabaseAsJson } from './io';
import {
  getDb,
  JIEYU_DEXIE_TARGET_SCHEMA_VERSION,
  resetJieyuDatabaseSingletonForTests,
} from './engine';

describe('lexeme_assets Dexie tables (v53+)', () => {
  beforeEach(async () => {
    await resetJieyuDatabaseSingletonForTests();
  });

  it('schema version is 54 and persists an attachment blob', async () => {
    const jieyuDb = await getDb();
    expect(JIEYU_DEXIE_TARGET_SCHEMA_VERSION).toBe(54);
    expect(jieyuDb.dexie.verno).toBeGreaterThanOrEqual(54);

    const blob = new Blob(['png-bytes'], { type: 'image/png' });
    await jieyuDb.collections.lexeme_assets.insert({
      id: 'la_test_1',
      kind: 'image',
      mimeType: 'image/png',
      displayName: 'dog.png',
      byteSize: blob.size,
      refCount: 1,
      blob,
      createdAt: '2026-09-05T00:00:00.000Z',
      updatedAt: '2026-09-05T00:00:00.000Z',
    });
    await jieyuDb.collections.lexeme_asset_links.insert({
      id: 'll_test_1',
      lexemeId: 'lex-dog',
      assetId: 'la_test_1',
      createdAt: '2026-09-05T00:00:00.000Z',
    });

    const retrieved = await jieyuDb.collections.lexeme_assets
      .findOne({ selector: { id: 'la_test_1' } })
      .exec();
    const stored = retrieved?.toJSON();
    expect(stored?.displayName).toBe('dog.png');
    expect(stored?.blob).toBeInstanceOf(Blob);
    expect(await stored?.blob?.text()).toBe('png-bytes');
  });

  it('JSON export strips lexeme asset blobs', async () => {
    const jieyuDb = await getDb();
    const blob = new Blob(['keep-local'], { type: 'audio/wav' });
    await jieyuDb.collections.lexeme_assets.insert({
      id: 'la_export_1',
      kind: 'audio',
      mimeType: 'audio/wav',
      displayName: 'clip.wav',
      byteSize: blob.size,
      refCount: 1,
      blob,
      createdAt: '2026-09-05T00:00:00.000Z',
      updatedAt: '2026-09-05T00:00:00.000Z',
    });

    const snapshot = await exportDatabaseAsJson();
    const rows = snapshot.collections['lexeme_assets'] as Array<Record<string, unknown>>;
    const row = rows.find((item) => item['id'] === 'la_export_1');
    expect(row?.['blob']).toBeUndefined();
    expect(row?.['blobExportOmitted']).toBe(true);
    expect(row?.['displayName']).toBe('clip.wav');
  });
});
