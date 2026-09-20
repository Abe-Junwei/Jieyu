import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './engine';
import {
  exportProjectScopedDatabaseAsJson,
  importProjectScopedDatabaseFromJson,
} from './projectScopedSnapshot';

const NOW = '2026-09-20T00:00:00.000Z';

async function seedText(textId: string, unitId: string): Promise<void> {
  await db.texts.put({
    id: textId,
    title: { default: textId },
    createdAt: NOW,
    updatedAt: NOW,
  });
  await db.media_items.put({
    id: `media-${textId}`,
    textId,
    filename: `${textId}.wav`,
    isOfflineCached: false,
    createdAt: NOW,
  });
  await db.layer_units.put({
    id: unitId,
    textId,
    mediaId: `media-${textId}`,
    startTime: 0,
    endTime: 1,
    createdAt: NOW,
    updatedAt: NOW,
  });
}

describe('project-scoped snapshot export/import', () => {
  beforeEach(async () => {
    await db.open();
    await Promise.all(db.tables.map((table) => table.clear()));
  });

  it('export omits other texts and global lexemes; import does not wipe them', async () => {
    await seedText('text-a', 'unit-a');
    await seedText('text-b', 'unit-b');
    await db.lexemes.put({
      id: 'lex-dog',
      lemma: { default: 'dog' },
      senses: [{ gloss: { default: 'dog' } }],
      createdAt: NOW,
      updatedAt: NOW,
    });
    await db.unit_tokens.put({
      id: 'tok-a',
      textId: 'text-a',
      unitId: 'unit-a',
      form: { default: 'nga' },
      tokenIndex: 0,
      createdAt: NOW,
      updatedAt: NOW,
    });

    const snapshot = await exportProjectScopedDatabaseAsJson('text-a');
    const textIds = (snapshot.collections.texts ?? []).map((row) => (row as { id: string }).id);
    expect(textIds).toEqual(['text-a']);
    expect(snapshot.collections.lexemes).toBeUndefined();
    expect(
      (snapshot.collections.layer_units ?? []).map((row) => (row as { id: string }).id),
    ).toEqual(['unit-a']);

    await db.layer_units.put({
      id: 'unit-a-stale',
      textId: 'text-a',
      mediaId: 'media-text-a',
      startTime: 2,
      endTime: 3,
      createdAt: NOW,
      updatedAt: NOW,
    });

    await importProjectScopedDatabaseFromJson(snapshot, 'text-a');

    expect(await db.texts.get('text-b')).toBeTruthy();
    expect(await db.layer_units.get('unit-b')).toBeTruthy();
    expect(await db.lexemes.get('lex-dog')).toBeTruthy();
    expect(await db.layer_units.get('unit-a')).toBeTruthy();
    expect(await db.layer_units.get('unit-a-stale')).toBeUndefined();
    expect(await db.texts.get('text-a')).toBeTruthy();
  });
});
