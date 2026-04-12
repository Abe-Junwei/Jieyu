import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db, exportDatabaseAsJson, importDatabaseFromJson } from './index';

const NOW = '2026-04-12T00:00:00.000Z';

function stableSortValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    const normalized = value.map((item) => stableSortValue(item));
    return normalized.sort((left, right) => {
      const leftId = typeof left === 'object' && left !== null ? String((left as { id?: unknown }).id ?? '') : '';
      const rightId = typeof right === 'object' && right !== null ? String((right as { id?: unknown }).id ?? '') : '';
      if (leftId && rightId && leftId !== rightId) return leftId.localeCompare(rightId);
      return JSON.stringify(left).localeCompare(JSON.stringify(right));
    });
  }

  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entryValue]) => [key, stableSortValue(entryValue)]);
    return Object.fromEntries(entries);
  }

  return value;
}

// allowlist 方式：仅保留可比较的确定性字段，忽略 exportedAt 等易变字段
// Allowlist approach: keep only deterministic fields, ignore volatile fields like exportedAt
function canonicalizeSnapshot(snapshot: {
  schemaVersion: number;
  exportedAt?: string;
  dbName: string;
  collections: Record<string, unknown[]>;
  [key: string]: unknown;
}): unknown {
  return stableSortValue({
    schemaVersion: snapshot.schemaVersion,
    dbName: snapshot.dbName,
    collections: snapshot.collections,
  });
}

async function clearAllTables(): Promise<void> {
  await Promise.all(db.tables.map((table) => table.clear()));
}

describe('import/export round-trip idempotency', () => {
  beforeEach(async () => {
    await db.open();
    await clearAllTables();
  });

  it('keeps canonical snapshot stable across repeated upsert imports', async () => {
    await db.texts.put({
      id: 'text_roundtrip',
      title: { default: 'RoundTrip Sample' },
      createdAt: NOW,
      updatedAt: NOW,
    });

    await db.media_items.put({
      id: 'media_roundtrip',
      textId: 'text_roundtrip',
      filename: 'roundtrip.wav',
      isOfflineCached: false,
      details: { mimeType: 'audio/wav' },
      createdAt: NOW,
    });

    await db.utterances.put({
      id: 'utt_roundtrip',
      textId: 'text_roundtrip',
      mediaId: 'media_roundtrip',
      startTime: 0,
      endTime: 1,
      createdAt: NOW,
      updatedAt: NOW,
    });

    await db.layer_units.put({
      id: 'seg_roundtrip',
      textId: 'text_roundtrip',
      mediaId: 'media_roundtrip',
      layerId: 'trc_roundtrip',
      unitType: 'segment',
      parentUnitId: 'utt_roundtrip',
      rootUnitId: 'utt_roundtrip',
      startTime: 0,
      endTime: 1,
      createdAt: NOW,
      updatedAt: NOW,
      provenance: {
        actorType: 'human',
        method: 'manual',
        createdAt: NOW,
      },
    });

    await db.layer_unit_contents.put({
      id: 'cnt_roundtrip',
      textId: 'text_roundtrip',
      unitId: 'seg_roundtrip',
      layerId: 'trc_roundtrip',
      contentRole: 'primary_text',
      modality: 'text',
      text: 'hello roundtrip',
      sourceType: 'human',
      createdAt: NOW,
      updatedAt: NOW,
      provenance: {
        actorType: 'human',
        method: 'manual',
        createdAt: NOW,
      },
    });

    const snapshot = await exportDatabaseAsJson();

    await clearAllTables();
    await importDatabaseFromJson(snapshot, { strategy: 'upsert' });
    const firstExport = await exportDatabaseAsJson();

    await importDatabaseFromJson(snapshot, { strategy: 'upsert' });
    const secondExport = await exportDatabaseAsJson();

    expect(canonicalizeSnapshot(firstExport)).toEqual(canonicalizeSnapshot(secondExport));
  });

  it('keeps existing data unchanged when invalid snapshot is imported repeatedly', async () => {
    await db.texts.put({
      id: 'text_existing',
      title: { default: 'Existing' },
      createdAt: NOW,
      updatedAt: NOW,
    });

    const invalidSnapshot = {
      schemaVersion: 3,
      exportedAt: NOW,
      dbName: 'jieyudb',
      collections: {
        layer_units: [
          {
            id: 'seg_invalid',
            textId: 'text_existing',
            mediaId: 'media_missing',
            layerId: 'trc_invalid',
            unitType: 'segment',
            startTime: 0,
            endTime: 1,
            createdAt: NOW,
            updatedAt: NOW,
          },
        ],
        layer_unit_contents: [
          {
            id: '',
            textId: 'text_existing',
            unitId: 'seg_invalid',
            layerId: 'trc_invalid',
            contentRole: 'primary_text',
            modality: 'text',
            text: 'broken',
            sourceType: 'human',
            createdAt: NOW,
            updatedAt: NOW,
          },
        ],
      },
    };

    await expect(importDatabaseFromJson(invalidSnapshot, { strategy: 'replace-all' })).rejects.toThrow(
      'Invalid doc in layer_unit_contents: missing non-empty id',
    );
    await expect(importDatabaseFromJson(invalidSnapshot, { strategy: 'replace-all' })).rejects.toThrow(
      'Invalid doc in layer_unit_contents: missing non-empty id',
    );

    const texts = await db.texts.toArray();
    expect(texts.map((item) => item.id)).toEqual(['text_existing']);
  });
});