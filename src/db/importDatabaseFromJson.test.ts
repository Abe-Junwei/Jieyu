import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db, getDb, importDatabaseFromJson, JIEYU_DEXIE_DB_NAME } from './index';

const NOW = '2026-04-02T00:00:00.000Z';

describe('importDatabaseFromJson', () => {
  beforeEach(async () => {
    await db.open();
    await Promise.all([
      db.texts.clear(),
      db.media_items.clear(),
      db.layer_units.clear(),
      db.layer_unit_contents.clear(),
      db.unit_relations.clear(),
      db.tier_definitions.clear(),
      db.user_notes.clear(),
    ]);
  });

  it('keeps existing data intact when replace-all import fails validation', async () => {
    await db.texts.put({
      id: 'text_existing',
      title: { default: 'Existing text' },
      createdAt: NOW,
      updatedAt: NOW,
    });

    const snapshot = {
      schemaVersion: 4,
      exportedAt: NOW,
      dbName: JIEYU_DEXIE_DB_NAME,
      collections: {
        texts: [
          {
            id: 'text_new',
            title: { default: 'Imported text' },
            createdAt: NOW,
            updatedAt: NOW,
          },
        ],
        tier_definitions: [
          {
            id: 'tier_import_test',
            textId: 'text_new',
            key: 'bridge_trc_import',
            name: { default: 'Transcription' },
            tierType: 'time-aligned',
            contentType: 'transcription',
            languageId: 'eng',
            createdAt: NOW,
            updatedAt: NOW,
          },
        ],
        layer_units: [
          {
            textId: 'text_new',
            mediaId: 'media_new',
            layerId: 'tier_import_test',
            unitType: 'unit',
            startTime: 0,
            endTime: 1,
            createdAt: NOW,
            updatedAt: NOW,
          },
        ],
        layer_unit_contents: [],
      },
    };

    await expect(importDatabaseFromJson(snapshot, { strategy: 'replace-all' })).rejects.toThrow(
      'Invalid doc in layer_units: missing non-empty id',
    );

    const remainingTexts = await db.texts.toArray();
    expect(remainingTexts.map((item) => item.id)).toEqual(['text_existing']);
  });

  it('rejects non-data audioDataUrl imports before mutating media_items', async () => {
    await db.media_items.put({
      id: 'media_existing',
      textId: 'text_existing',
      filename: 'existing.wav',
      isOfflineCached: false,
      details: {
        mimeType: 'audio/wav',
      },
      createdAt: NOW,
    });

    const snapshot = {
      schemaVersion: 4,
      exportedAt: NOW,
      dbName: JIEYU_DEXIE_DB_NAME,
      collections: {
        media_items: [
          {
            id: 'media_new',
            textId: 'text_existing',
            filename: 'imported.wav',
            isOfflineCached: false,
            details: {
              mimeType: 'audio/wav',
              audioDataUrl: 'http://127.0.0.1:9999/audio.wav',
            },
            createdAt: NOW,
          },
        ],
        layer_units: [],
        layer_unit_contents: [],
      },
    };

    await expect(importDatabaseFromJson(snapshot, { strategy: 'replace-all' })).rejects.toThrow(
      'only data URLs are supported during import',
    );

    const remainingMediaItems = await db.media_items.toArray();
    expect(remainingMediaItems.map((item) => item.id)).toEqual(['media_existing']);
  });

  it('ignores removed transformId compatibility fields during snapshot import', async () => {
    const snapshot = {
      schemaVersion: 4,
      exportedAt: NOW,
      dbName: JIEYU_DEXIE_DB_NAME,
      collections: {
        tier_definitions: [
          {
            id: 'layer_legacy',
            textId: 'text_legacy',
            key: 'bridge_trc_legacy',
            name: { default: 'Legacy Tier' },
            tierType: 'time-aligned',
            contentType: 'transcription',
            languageId: 'ara',
            orthographyId: 'ortho-ar',
            transformId: 'xf-legacy',
            createdAt: NOW,
            updatedAt: NOW,
          },
        ],
        layer_units: [],
        layer_unit_contents: [],
      },
    };

    await importDatabaseFromJson(snapshot, { strategy: 'replace-all' });

    const database = await getDb();
    const importedLayer = await database.collections.layers.findOne({ selector: { textId: 'text_legacy', key: 'trc_legacy' } }).exec();
    expect(importedLayer?.toJSON().bridgeId).toBeUndefined();

    const importedTiers = await db.tier_definitions.toArray();
    expect(importedTiers.find((item) => item.id === 'layer_legacy')?.bridgeId).toBeUndefined();
  });

  it('rejects snapshot when schemaVersion is not the current export version', async () => {
    await expect(
      importDatabaseFromJson(
        {
          schemaVersion: 3,
          exportedAt: NOW,
          dbName: JIEYU_DEXIE_DB_NAME,
          collections: {
            layer_units: [],
            layer_unit_contents: [],
          },
        },
        { strategy: 'replace-all' },
      ),
    ).rejects.toThrow(/Unsupported snapshot schemaVersion=3/);
  });

  it('rejects snapshots that still include a non-empty legacy units collection', async () => {
    const snapshot = {
      schemaVersion: 4,
      exportedAt: NOW,
      dbName: JIEYU_DEXIE_DB_NAME,
      collections: {
        texts: [],
        tier_definitions: [],
        layer_units: [],
        layer_unit_contents: [],
        units: [{ id: 'u1', textId: 't1', mediaId: 'm1', startTime: 0, endTime: 1, createdAt: NOW, updatedAt: NOW }],
      },
    };

    await expect(importDatabaseFromJson(snapshot, { strategy: 'replace-all' })).rejects.toThrow(
      /Legacy snapshot key "units"/,
    );
  });
});
