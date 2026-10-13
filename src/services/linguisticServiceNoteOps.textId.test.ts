// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { db } from '../db';
import { saveUserNote } from './linguisticServiceNoteOps';
import { entryDoc } from '../utils/dmlexEntry';

/** P0-2b：user_notes 写入时带上所属项目 | Notes are stored with their owning textId. */
const NOW = '2026-10-12T00:00:00.000Z';

async function clear(): Promise<void> {
  await Promise.all([db.user_notes.clear(), db.lexemes.clear(), db.tier_definitions.clear()]);
}

function draft(
  id: string,
  targetType: 'sense' | 'tier_annotation',
  targetId: string,
  parentTargetId?: string,
) {
  return {
    id,
    targetType,
    targetId,
    ...(parentTargetId ? { parentTargetId } : {}),
    content: { default: id },
    createdAt: NOW,
    updatedAt: NOW,
  };
}

describe('saveUserNote textId (P0-2b)', () => {
  beforeEach(async () => {
    await db.open();
    await clear();
  });
  afterEach(clear);

  it('resolves textId for sense and tier_annotation cell notes and indexes it', async () => {
    await db.lexemes.put(
      entryDoc({ id: 'lex_1', textId: 'proj_a', headword: 'x', createdAt: NOW, updatedAt: NOW }),
    );
    await db.tier_definitions.put({
      id: 'layer_1',
      textId: 'proj_a',
      key: 'k',
      name: { default: 'k' },
      tierType: 'time-aligned',
      contentType: 'transcription',
      createdAt: NOW,
      updatedAt: NOW,
    } as never);

    await saveUserNote(draft('n_sense', 'sense', 'sense_1', 'lex_1'));
    await saveUserNote(draft('n_cell', 'tier_annotation', 'missing_unit::layer_1'));

    const rows = await db.user_notes.where('textId').equals('proj_a').toArray();
    expect(rows.map((row) => row.id).sort()).toEqual(['n_cell', 'n_sense']);
  });

  it('refuses a note whose project cannot be resolved', async () => {
    await expect(saveUserNote(draft('n_orphan', 'sense', 'sense_x', 'no_lex'))).rejects.toThrow(
      /textId/,
    );
    expect(await db.user_notes.get('n_orphan')).toBeUndefined();
  });
});
