/**
 * Real IndexedDB (fake-indexeddb) round-trip for ADR-0026 canonical cluster snapshot / restore.
 */
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db, getDb, type LayerUnitContentDocType, type LayerUnitDocType, type UnitTokenDocType } from '../db';
import {
  captureAiCanonicalClusterRollbackSnapshot,
  restoreAiCanonicalClusterRollbackSnapshot,
} from './AiCanonicalClusterRollbackSnapshot';

const NOW = '2026-04-26T12:00:00.000Z';

describe('AiCanonicalClusterRollbackSnapshot (Dexie)', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  beforeEach(async () => {
    await db.open();
    await Promise.all([
      db.layer_units.clear(),
      db.layer_unit_contents.clear(),
      db.unit_relations.clear(),
      db.unit_tokens.clear(),
      db.unit_morphemes.clear(),
      db.token_lexeme_links.clear(),
      db.user_notes.clear(),
      db.anchors.clear(),
      db.embeddings.clear(),
    ]);
  });

  it('capture → mutate host transcription → restore round-trips on layer_units', async () => {
    const unit: LayerUnitDocType = {
      id: 'utt_rb_host',
      textId: 'text_rb',
      mediaId: 'media_rb',
      layerId: 'layer_rb',
      unitType: 'unit',
      startTime: 0,
      endTime: 10,
      transcription: { default: 'alpha' },
      createdAt: NOW,
      updatedAt: NOW,
    };
    await db.layer_units.put(unit);

    const database = await getDb();
    const snap = await captureAiCanonicalClusterRollbackSnapshot(database, ['utt_rb_host']);
    expect(snap).not.toBeNull();
    expect(snap!.canonicalUnits[0]?.transcription).toEqual({ default: 'alpha' });

    await db.layer_units.update('utt_rb_host', {
      transcription: { default: 'beta' },
      updatedAt: NOW,
    });

    await restoreAiCanonicalClusterRollbackSnapshot(database, snap!);

    const row = await db.layer_units.get('utt_rb_host');
    expect(row?.transcription).toEqual({ default: 'alpha' });
  });

  it('restores unit_tokens removed after capture', async () => {
    const unit: LayerUnitDocType = {
      id: 'utt_rb_tok',
      textId: 'text_rb2',
      mediaId: 'media_rb2',
      layerId: 'layer_rb2',
      unitType: 'unit',
      startTime: 0,
      endTime: 3,
      transcription: {},
      createdAt: NOW,
      updatedAt: NOW,
    };
    const token: UnitTokenDocType = {
      id: 'tok_rb_1',
      textId: 'text_rb2',
      unitId: 'utt_rb_tok',
      form: { default: 'w' },
      tokenIndex: 0,
      createdAt: NOW,
      updatedAt: NOW,
    };
    await db.layer_units.put(unit);
    await db.unit_tokens.put(token);

    const database = await getDb();
    const snap = await captureAiCanonicalClusterRollbackSnapshot(database, ['utt_rb_tok']);
    expect(snap).not.toBeNull();

    await db.unit_tokens.delete('tok_rb_1');

    await restoreAiCanonicalClusterRollbackSnapshot(database, snap!);

    const restored = await db.unit_tokens.get('tok_rb_1');
    expect(restored?.form).toEqual({ default: 'w' });
  });

  it('restores canonical layer_unit_contents after host text row is replaced', async () => {
    const unit: LayerUnitDocType = {
      id: 'utt_rb_cnt',
      textId: 'text_rb3',
      mediaId: 'media_rb3',
      layerId: 'layer_rb3',
      unitType: 'unit',
      startTime: 0,
      endTime: 2,
      transcription: {},
      createdAt: NOW,
      updatedAt: NOW,
    };
    const content: LayerUnitContentDocType = {
      id: 'cnt_rb_1',
      unitId: 'utt_rb_cnt',
      textId: 'text_rb3',
      layerId: 'layer_rb3',
      modality: 'text',
      contentRole: 'primary_text',
      text: 'hello',
      sourceType: 'human',
      createdAt: NOW,
      updatedAt: NOW,
    };
    await db.layer_units.put(unit);
    await db.layer_unit_contents.put(content);

    const database = await getDb();
    const snap = await captureAiCanonicalClusterRollbackSnapshot(database, ['utt_rb_cnt']);
    expect(snap?.canonicalContents).toHaveLength(1);

    await db.layer_unit_contents.delete('cnt_rb_1');
    await db.layer_unit_contents.put({
      ...content,
      id: 'cnt_rb_intruder',
      text: 'gone',
      updatedAt: NOW,
    });

    await restoreAiCanonicalClusterRollbackSnapshot(database, snap!);

    const rows = await db.layer_unit_contents.where('unitId').equals('utt_rb_cnt').toArray();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.id).toBe('cnt_rb_1');
    expect(rows[0]?.text).toBe('hello');
  });

  it('returns null from capture when selection count exceeds JIEYU_AI_STRUCTURAL_ROLLBACK_MAX_SELECTION_IDS', async () => {
    vi.stubEnv('JIEYU_AI_STRUCTURAL_ROLLBACK_MAX_SELECTION_IDS', '1');
    const u1: LayerUnitDocType = {
      id: 'utt_rb_cap_max_a',
      textId: 'text_rb_cap',
      mediaId: 'media_rb_cap',
      layerId: 'layer_rb_cap',
      unitType: 'unit',
      startTime: 0,
      endTime: 1,
      transcription: { default: 'a' },
      createdAt: NOW,
      updatedAt: NOW,
    };
    const u2: LayerUnitDocType = { ...u1, id: 'utt_rb_cap_max_b', startTime: 1, endTime: 2 };
    await db.layer_units.bulkPut([u1, u2]);

    const database = await getDb();
    const snap = await captureAiCanonicalClusterRollbackSnapshot(database, ['utt_rb_cap_max_a', 'utt_rb_cap_max_b']);
    expect(snap).toBeNull();
  });
});
