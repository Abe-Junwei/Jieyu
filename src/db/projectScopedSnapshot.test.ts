import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db, getDb } from './engine';
import type { LayerDocType } from './types';
import { entryDoc } from '../utils/dmlexEntry';
import { exportDatabaseAsJson, RECOVERY_EXPORT_COLLECTIONS } from './io';
import {
  exportProjectRecoveryDatabaseAsJson,
  exportProjectScopedDatabaseAsJson,
  filterCollectionsForProject,
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
    timelineKind: 'acoustic',
    byteLocation: 'none',
    availability: 'missing',
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
    await db.lexemes.put(
      entryDoc({
        id: 'lex-dog',
        headword: 'dog',
        definition: 'dog',
        createdAt: NOW,
        updatedAt: NOW,
      }),
    );
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

  it('keeps local lexeme links for tokens the snapshot still contains', async () => {
    await seedText('text-a', 'unit-a');
    await seedText('text-b', 'unit-b');
    // 词条按项目归属（GAP-1：链接两端必须同项目）| Lexemes are per project (GAP-1)
    await db.lexemes.put(
      entryDoc({
        id: 'lex-dog-b',
        textId: 'text-b',
        headword: 'dog',
        definition: 'dog',
        createdAt: NOW,
        updatedAt: NOW,
      }),
    );
    await db.lexemes.put(
      entryDoc({
        id: 'lex-dog',
        textId: 'text-a',
        headword: 'dog',
        definition: 'dog',
        createdAt: NOW,
        updatedAt: NOW,
      }),
    );
    await db.unit_tokens.put({
      id: 'tok-a',
      textId: 'text-a',
      unitId: 'unit-a',
      form: { default: 'nga' },
      tokenIndex: 0,
      createdAt: NOW,
      updatedAt: NOW,
    });
    await db.unit_tokens.put({
      id: 'tok-b',
      textId: 'text-b',
      unitId: 'unit-b',
      form: { default: 'nu' },
      tokenIndex: 0,
      createdAt: NOW,
      updatedAt: NOW,
    });
    await db.token_lexeme_links.put({
      id: 'link-a',
      targetType: 'token',
      targetId: 'tok-a',
      lexemeId: 'lex-dog',
      createdAt: NOW,
      updatedAt: NOW,
    });
    await db.token_lexeme_links.put({
      id: 'link-b',
      targetType: 'token',
      targetId: 'tok-b',
      lexemeId: 'lex-dog-b',
      createdAt: NOW,
      updatedAt: NOW,
    });

    const snapshot = await exportProjectScopedDatabaseAsJson('text-a');
    expect(snapshot.collections.token_lexeme_links).toEqual([
      expect.objectContaining({ id: 'link-a', targetId: 'tok-a' }),
    ]);

    await db.unit_tokens.put({
      id: 'tok-stale',
      textId: 'text-a',
      unitId: 'unit-a',
      form: { default: 'stale' },
      tokenIndex: 1,
      createdAt: NOW,
      updatedAt: NOW,
    });
    await db.token_lexeme_links.put({
      id: 'link-stale',
      targetType: 'token',
      targetId: 'tok-stale',
      lexemeId: 'lex-dog',
      createdAt: NOW,
      updatedAt: NOW,
    });

    await importProjectScopedDatabaseFromJson(snapshot, 'text-a');

    expect(await db.token_lexeme_links.get('link-a')).toBeTruthy();
    expect(await db.token_lexeme_links.get('link-b')).toBeTruthy();
    expect(await db.token_lexeme_links.get('link-stale')).toBeUndefined();
    expect(await db.lexemes.get('lex-dog')).toBeTruthy();
  });

  it('N3: indexed recovery export equals the whole-DB export filtered to the project', async () => {
    const jdb = await getDb();
    for (const textId of ['text-a', 'text-b']) {
      await seedText(textId, `unit-${textId}`);
      for (const kind of ['trc', 'trl']) {
        await jdb.collections.layers.insert({
          id: `${kind}-${textId}`,
          textId,
          key: `${kind}_${textId}`,
          name: { eng: kind },
          layerType: kind === 'trc' ? 'transcription' : 'translation',
          languageId: 'eng',
          modality: 'text',
          createdAt: NOW,
          updatedAt: NOW,
        } as LayerDocType);
      }
      await db.layer_links.put({
        id: `link-${textId}`,
        transcriptionLayerKey: `trc_${textId}`,
        hostTranscriptionLayerId: `trc-${textId}`,
        layerId: `trl-${textId}`,
        linkType: 'free',
        isPreferred: true,
        createdAt: NOW,
      });
      await db.unit_tokens.put({
        id: `tok-${textId}`,
        textId,
        unitId: `unit-${textId}`,
        form: { default: 'x' },
        tokenIndex: 0,
        createdAt: NOW,
        updatedAt: NOW,
      });
      // 没有 textId 的内容行按 unitId 归属 | A content row without textId belongs via its unitId
      await db.layer_unit_contents.put({
        id: `cnt-${textId}`,
        unitId: `unit-${textId}`,
        layerId: `trl-${textId}`,
        text: 'hi',
        createdAt: NOW,
        updatedAt: NOW,
      } as never);
      await db.anchors.put({
        id: `anc-${textId}`,
        mediaId: `media-${textId}`,
        time: 1,
        createdAt: NOW,
      });
      await db.user_notes.put({
        id: `note-${textId}`,
        targetType: 'unit',
        targetId: `unit-${textId}`,
        content: { default: 'n' },
        createdAt: NOW,
        updatedAt: NOW,
      });
      await db.speakers.put({
        id: `spk-${textId}`,
        name: 'S',
        textId,
        createdAt: NOW,
        updatedAt: NOW,
      } as never);
    }

    const scoped = await exportProjectRecoveryDatabaseAsJson('text-a');
    const whole = filterCollectionsForProject((await exportDatabaseAsJson()).collections, 'text-a');
    const expected = Object.fromEntries(
      RECOVERY_EXPORT_COLLECTIONS.filter((name) => Array.isArray(whole[name])).map((name) => [
        name,
        whole[name],
      ]),
    );
    expect(scoped.collections).toEqual(expected);
    expect(scoped.collections.layer_unit_contents).toHaveLength(1);
    expect(scoped.collections.layer_links).toHaveLength(1);
    expect(scoped.collections.anchors).toHaveLength(1);
    expect(scoped.collections.user_notes).toHaveLength(1);
    expect(scoped.collections.speakers).toHaveLength(1);
  });
});
