import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db, getDb, type UtteranceDocType, type UtteranceTextDocType } from '../db';
import {
  cleanupOrphanSegments,
  enforceTimeSubdivisionParentBounds,
  listUtteranceTextsFromSegmentation,
  getSegmentationV2Ids,
  listUtteranceTextsByUtterances,
  removeUtteranceCascadeFromSegmentationV2,
  removeUtteranceTextFromSegmentationV2,
  syncUtteranceTextToSegmentationV2,
} from './LayerSegmentationTextService';

const NOW = '2026-03-25T00:00:00.000Z';

describe('LayerSegmentationTextService', () => {
  beforeEach(async () => {
    await db.open();
    await Promise.all([
      db.layer_units.clear(),
      db.layer_unit_contents.clear(),
      db.unit_relations.clear(),
    ]);
  });

  it('syncs utterance_text into v2 segment tables', async () => {
    const database = await getDb();
    const utterance: UtteranceDocType = {
      id: 'utt_1',
      textId: 'text_1',
      mediaId: 'media_1',
      startTime: 1,
      endTime: 2,
      createdAt: NOW,
      updatedAt: NOW,
    };
    const translation: UtteranceTextDocType = {
      id: 'utr_1',
      utteranceId: 'utt_1',
      layerId: 'layer_trl_en',
      modality: 'text',
      text: 'hello',
      sourceType: 'human',
      createdAt: NOW,
      updatedAt: NOW,
    };

    await syncUtteranceTextToSegmentationV2(database, utterance, translation);

    const ids = getSegmentationV2Ids(translation.layerId, utterance.id, translation.id);
    const segment = await db.layer_units.get(ids.segmentId);
    const content = await db.layer_unit_contents.get(ids.segmentContentId);

    expect(segment?.layerId).toBe('layer_trl_en');
    expect(segment?.mediaId).toBe('media_1');
    expect(content?.unitId).toBe(ids.segmentId);
    expect(content?.text).toBe('hello');
  });

  it('supports utterance_text projection through canonical graph', async () => {
    const database = await getDb();

    const utterance: UtteranceDocType = {
      id: 'utt_flag_sync_1',
      textId: 'text_flag_sync',
      mediaId: 'media_flag_sync',
      startTime: 3,
      endTime: 4,
      createdAt: NOW,
      updatedAt: NOW,
    };
    const translation: UtteranceTextDocType = {
      id: 'utr_flag_sync_1',
      utteranceId: 'utt_flag_sync_1',
      layerId: 'layer_trl_flag',
      modality: 'text',
      text: 'layerunit-only projection',
      sourceType: 'human',
      createdAt: NOW,
      updatedAt: NOW,
    };

    await syncUtteranceTextToSegmentationV2(database, utterance, translation);

    const ids = getSegmentationV2Ids(translation.layerId, utterance.id, translation.id);
    const rows = await listUtteranceTextsFromSegmentation(database);

    expect(await db.layer_units.get(ids.segmentId)).toBeTruthy();
    expect(await db.layer_unit_contents.get(ids.segmentContentId)).toEqual(expect.objectContaining({
      unitId: ids.segmentId,
      text: 'layerunit-only projection',
    }));
    expect(rows).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: translation.id,
        utteranceId: utterance.id,
        text: 'layerunit-only projection',
      }),
    ]));
  });

  it('keeps sync atomic when content write fails', async () => {
    const database = await getDb();
    const utterance: UtteranceDocType = {
      id: 'utt_txn_1',
      textId: 'text_1',
      mediaId: 'media_1',
      startTime: 1,
      endTime: 2,
      createdAt: NOW,
      updatedAt: NOW,
    };
    const translation: UtteranceTextDocType = {
      id: 'utr_txn_1',
      utteranceId: 'utt_txn_1',
      layerId: 'layer_trl_en',
      modality: 'text',
      text: 'atomic',
      sourceType: 'human',
      createdAt: NOW,
      updatedAt: NOW,
    };

    const ids = getSegmentationV2Ids(translation.layerId, utterance.id, translation.id);
    const bulkPutSpy = vi.spyOn(db.layer_unit_contents, 'bulkPut').mockRejectedValueOnce(new Error('force put failure'));

    try {
      await expect(syncUtteranceTextToSegmentationV2(database, utterance, translation)).rejects.toThrow('force put failure');

      expect(await db.layer_units.get(ids.segmentId)).toBeUndefined();
      expect(await db.layer_unit_contents.get(ids.segmentContentId)).toBeUndefined();
    } finally {
      bulkPutSpy.mockRestore();
    }
  });

  it('validates layer_units.parentUnitId as non-empty string when provided', async () => {
    const database = await getDb();
    await expect(database.collections.layer_units.insert({
      id: 'seg_invalid_uttid',
      textId: 'text_1',
      mediaId: 'media_1',
      layerId: 'layer_trl_en',
      unitType: 'segment',
      parentUnitId: '',
      startTime: 0,
      endTime: 1,
      createdAt: NOW,
      updatedAt: NOW,
    } as never)).rejects.toThrow();
  });

  it('removes orphan segment when its last synced content is deleted', async () => {
    const database = await getDb();
    const utterance: UtteranceDocType = {
      id: 'utt_2',
      textId: 'text_1',
      mediaId: 'media_1',
      startTime: 2,
      endTime: 3,
      createdAt: NOW,
      updatedAt: NOW,
    };
    const translation: UtteranceTextDocType = {
      id: 'utr_2',
      utteranceId: 'utt_2',
      layerId: 'layer_trl_en',
      modality: 'text',
      text: 'world',
      sourceType: 'human',
      createdAt: NOW,
      updatedAt: NOW,
    };

    await syncUtteranceTextToSegmentationV2(database, utterance, translation);
    await removeUtteranceTextFromSegmentationV2(database, translation);

    const ids = getSegmentationV2Ids(translation.layerId, utterance.id, translation.id);
    expect(await db.layer_unit_contents.get(ids.segmentContentId)).toBeUndefined();
    expect(await db.layer_units.get(ids.segmentId)).toBeUndefined();
  });

  it('keeps segment when another content still references it', async () => {
    const database = await getDb();
    const utterance: UtteranceDocType = {
      id: 'utt_2b',
      textId: 'text_1',
      mediaId: 'media_1',
      startTime: 2,
      endTime: 3,
      createdAt: NOW,
      updatedAt: NOW,
    };
    const translationA: UtteranceTextDocType = {
      id: 'utr_2b_a',
      utteranceId: 'utt_2b',
      layerId: 'layer_trl_en',
      modality: 'text',
      text: 'world-a',
      sourceType: 'human',
      createdAt: NOW,
      updatedAt: NOW,
    };
    const translationB: UtteranceTextDocType = {
      id: 'utr_2b_b',
      utteranceId: 'utt_2b',
      layerId: 'layer_trl_en',
      modality: 'mixed',
      text: 'world-b',
      sourceType: 'human',
      createdAt: NOW,
      updatedAt: NOW,
    };

    await syncUtteranceTextToSegmentationV2(database, utterance, translationA);
    await syncUtteranceTextToSegmentationV2(database, utterance, translationB);

    const idsA = getSegmentationV2Ids(translationA.layerId, utterance.id, translationA.id);
    const idsB = getSegmentationV2Ids(translationB.layerId, utterance.id, translationB.id);
    expect(idsA.segmentId).toBe(idsB.segmentId);

    await removeUtteranceTextFromSegmentationV2(database, translationA);

    expect(await db.layer_unit_contents.get(idsA.segmentContentId)).toBeUndefined();
    expect(await db.layer_unit_contents.get(idsB.segmentContentId)).toBeTruthy();
    expect(await db.layer_units.get(idsA.segmentId)).toBeTruthy();
  });

  it('returns v2 rows even without legacy rows', async () => {
    const database = await getDb();

    await db.layer_units.put({
      id: 'segv2_layerA_utt_v2',
      textId: 'text_1',
      mediaId: 'media_1',
      layerId: 'layerA',
      unitType: 'segment',
      parentUnitId: 'utt_v2',
      rootUnitId: 'utt_v2',
      startTime: 0,
      endTime: 1,
      createdAt: NOW,
      updatedAt: NOW,
    });
    await db.layer_unit_contents.put({
      id: 'utr_v2',
      textId: 'text_1',
      unitId: 'segv2_layerA_utt_v2',
      layerId: 'layerA',
      contentRole: 'primary_text',
      modality: 'text',
      text: 'v2-text',
      sourceType: 'human',
      createdAt: NOW,
      updatedAt: NOW,
    });

    const rows = await listUtteranceTextsFromSegmentation(database);
    expect(rows.some((row) => row.id === 'utr_v2' && row.utteranceId === 'utt_v2' && row.text === 'v2-text')).toBe(true);
  });

  it('returns canonical v2 row by content id', async () => {
    const database = await getDb();

    await db.layer_units.put({
      id: 'segv2_layer_new_utt_dup',
      textId: 'text_1',
      mediaId: 'media_1',
      layerId: 'layer_new',
      unitType: 'segment',
      parentUnitId: 'utt_dup',
      rootUnitId: 'utt_dup',
      startTime: 0,
      endTime: 1,
      createdAt: NOW,
      updatedAt: NOW,
    });
    await db.layer_unit_contents.put({
      id: 'dup_id',
      textId: 'text_1',
      unitId: 'segv2_layer_new_utt_dup',
      layerId: 'layer_new',
      contentRole: 'primary_text',
      modality: 'text',
      text: 'v2-dup',
      sourceType: 'human',
      createdAt: NOW,
      updatedAt: NOW,
    });

    const rows = await listUtteranceTextsFromSegmentation(database);
    const row = rows.find((item) => item.id === 'dup_id');
    expect(row?.text).toBe('v2-dup');
    expect(row?.layerId).toBe('layer_new');
  });

  it('returns rows from LayerUnit-only segmentation data', async () => {
    const database = await getDb();

    await db.layer_units.put({
      id: 'seg_unit_only_1',
      textId: 'text_1',
      mediaId: 'media_1',
      layerId: 'layer_unit',
      unitType: 'segment',
      parentUnitId: 'utt_unit_only_1',
      rootUnitId: 'utt_unit_only_1',
      startTime: 0,
      endTime: 1,
      createdAt: NOW,
      updatedAt: NOW,
    });
    await db.layer_unit_contents.put({
      id: 'utr_unit_only_1',
      textId: 'text_1',
      unitId: 'seg_unit_only_1',
      layerId: 'layer_unit',
      contentRole: 'primary_text',
      modality: 'text',
      text: 'layer-unit-text',
      sourceType: 'human',
      createdAt: NOW,
      updatedAt: NOW,
    });

    const rows = await listUtteranceTextsFromSegmentation(database);
    expect(rows.some((row) => row.id === 'utr_unit_only_1' && row.utteranceId === 'utt_unit_only_1' && row.text === 'layer-unit-text')).toBe(true);
  });

  it('gets utterance texts for multiple utterances from v2 in one batch', async () => {
    const database = await getDb();

    await db.layer_units.bulkPut([
      {
        id: 'segv2_layerA_utt_a',
        textId: 'text_1',
        mediaId: 'media_1',
        layerId: 'layerA',
        unitType: 'segment',
        parentUnitId: 'utt_a',
        rootUnitId: 'utt_a',
        startTime: 0,
        endTime: 1,
        createdAt: NOW,
        updatedAt: NOW,
      },
      {
        id: 'segv2_layerA_utt_b',
        textId: 'text_1',
        mediaId: 'media_1',
        layerId: 'layerA',
        unitType: 'segment',
        parentUnitId: 'utt_b',
        rootUnitId: 'utt_b',
        startTime: 1,
        endTime: 2,
        createdAt: NOW,
        updatedAt: NOW,
      },
    ]);
    await db.layer_unit_contents.bulkPut([
      {
        id: 'utr_a',
        textId: 'text_1',
        unitId: 'segv2_layerA_utt_a',
        layerId: 'layerA',
        contentRole: 'primary_text',
        modality: 'text',
        text: 'alpha',
        sourceType: 'human',
        createdAt: NOW,
        updatedAt: NOW,
      },
      {
        id: 'utr_b',
        textId: 'text_1',
        unitId: 'segv2_layerA_utt_b',
        layerId: 'layerA',
        contentRole: 'primary_text',
        modality: 'text',
        text: 'beta',
        sourceType: 'human',
        createdAt: NOW,
        updatedAt: NOW,
      },
    ]);

    const rows = await listUtteranceTextsByUtterances(database, ['utt_a', 'utt_b']);
    expect(rows.map((row) => row.text)).toEqual(expect.arrayContaining(['alpha', 'beta']));
  });

  it('gets utterance texts for multiple utterances from LayerUnit-only rows', async () => {
    const database = await getDb();

    await db.layer_units.bulkPut([
      {
        id: 'seg_unit_batch_a',
        textId: 'text_1',
        mediaId: 'media_1',
        layerId: 'layer_unit',
        unitType: 'segment',
        parentUnitId: 'utt_unit_a',
        rootUnitId: 'utt_unit_a',
        startTime: 0,
        endTime: 1,
        createdAt: NOW,
        updatedAt: NOW,
      },
      {
        id: 'seg_unit_batch_b',
        textId: 'text_1',
        mediaId: 'media_1',
        layerId: 'layer_unit',
        unitType: 'segment',
        parentUnitId: 'utt_unit_b',
        rootUnitId: 'utt_unit_b',
        startTime: 1,
        endTime: 2,
        createdAt: NOW,
        updatedAt: NOW,
      },
    ]);
    await db.layer_unit_contents.bulkPut([
      {
        id: 'utr_unit_a',
        textId: 'text_1',
        unitId: 'seg_unit_batch_a',
        layerId: 'layer_unit',
        contentRole: 'primary_text',
        modality: 'text',
        text: 'unit-alpha',
        sourceType: 'human',
        createdAt: NOW,
        updatedAt: NOW,
      },
      {
        id: 'utr_unit_b',
        textId: 'text_1',
        unitId: 'seg_unit_batch_b',
        layerId: 'layer_unit',
        contentRole: 'primary_text',
        modality: 'text',
        text: 'unit-beta',
        sourceType: 'human',
        createdAt: NOW,
        updatedAt: NOW,
      },
    ]);

    const rows = await listUtteranceTextsByUtterances(database, ['utt_unit_a', 'utt_unit_b']);
    expect(rows.map((row) => row.text)).toEqual(expect.arrayContaining(['unit-alpha', 'unit-beta']));
  });

  it('removes v2 segment graph for utterance cascade delete helper', async () => {
    const database = await getDb();

    await db.layer_units.put({
      id: 'segv2_layerX_utt_cascade',
      textId: 'text_1',
      mediaId: 'media_1',
      layerId: 'layerX',
      unitType: 'segment',
      parentUnitId: 'utt_cascade',
      rootUnitId: 'utt_cascade',
      startTime: 0,
      endTime: 1,
      createdAt: NOW,
      updatedAt: NOW,
    });
    await db.layer_unit_contents.put({
      id: 'cnt_cascade',
      textId: 'text_1',
      unitId: 'segv2_layerX_utt_cascade',
      layerId: 'layerX',
      contentRole: 'primary_text',
      modality: 'text',
      text: 'to-remove',
      sourceType: 'human',
      createdAt: NOW,
      updatedAt: NOW,
    });
    await db.unit_relations.put({
      id: 'lnk_cascade',
      textId: 'text_1',
      sourceUnitId: 'segv2_layerX_utt_cascade',
      targetUnitId: 'utt_cascade',
      relationType: 'aligned_to',
      createdAt: NOW,
      updatedAt: NOW,
    });

    await removeUtteranceCascadeFromSegmentationV2(database, 'utt_cascade');

    expect(await db.layer_unit_contents.get('cnt_cascade')).toBeUndefined();
    expect(await db.layer_units.get('segv2_layerX_utt_cascade')).toBeUndefined();
    expect(await db.unit_relations.get('lnk_cascade')).toBeUndefined();
  });

  it('keeps cascade delete atomic when segment delete fails', async () => {
    const database = await getDb();

    await db.layer_units.put({
      id: 'segv2_layerX_utt_txn',
      textId: 'text_1',
      mediaId: 'media_1',
      layerId: 'layerX',
      unitType: 'segment',
      parentUnitId: 'utt_txn',
      rootUnitId: 'utt_txn',
      startTime: 0,
      endTime: 1,
      createdAt: NOW,
      updatedAt: NOW,
    });
    await db.layer_unit_contents.put({
      id: 'cnt_txn',
      textId: 'text_1',
      unitId: 'segv2_layerX_utt_txn',
      layerId: 'layerX',
      contentRole: 'primary_text',
      modality: 'text',
      text: 'txn',
      sourceType: 'human',
      createdAt: NOW,
      updatedAt: NOW,
    });
    await db.unit_relations.put({
      id: 'lnk_txn',
      textId: 'text_1',
      sourceUnitId: 'segv2_layerX_utt_txn',
      targetUnitId: 'utt_txn',
      relationType: 'aligned_to',
      createdAt: NOW,
      updatedAt: NOW,
    });

    const segDeleteSpy = vi.spyOn(db.layer_units, 'bulkDelete').mockRejectedValueOnce(new Error('force cascade failure'));

    await expect(removeUtteranceCascadeFromSegmentationV2(database, 'utt_txn')).rejects.toThrow('force cascade failure');

    // Transaction rollback keeps previous state intact.
    expect(await db.layer_unit_contents.get('cnt_txn')).toBeTruthy();
    expect(await db.layer_units.get('segv2_layerX_utt_txn')).toBeTruthy();
    expect(await db.unit_relations.get('lnk_txn')).toBeTruthy();

    segDeleteSpy.mockRestore();
  });

  it('removes time_subdivision child segments when parent utterance is deleted', async () => {
    const database = await getDb();

    await db.layer_units.put({
      id: 'seg_child_sub_1',
      textId: 'text_1',
      mediaId: 'media_1',
      layerId: 'layer_sub',
      unitType: 'segment',
      startTime: 1,
      endTime: 2,
      createdAt: NOW,
      updatedAt: NOW,
    });
    await db.layer_unit_contents.put({
      id: 'cnt_child_sub_1',
      textId: 'text_1',
      unitId: 'seg_child_sub_1',
      layerId: 'layer_sub',
      contentRole: 'primary_text',
      modality: 'text',
      text: 'child-sub',
      sourceType: 'human',
      createdAt: NOW,
      updatedAt: NOW,
    });
    await db.unit_relations.put({
      id: 'lnk_sub_parent_1',
      textId: 'text_1',
      sourceUnitId: 'seg_child_sub_1',
      targetUnitId: 'utt_parent_sub_1',
      relationType: 'derived_from',
      createdAt: NOW,
      updatedAt: NOW,
    });

    await removeUtteranceCascadeFromSegmentationV2(database, 'utt_parent_sub_1');

    expect(await db.layer_unit_contents.get('cnt_child_sub_1')).toBeUndefined();
    expect(await db.layer_units.get('seg_child_sub_1')).toBeUndefined();
    expect(await db.unit_relations.get('lnk_sub_parent_1')).toBeUndefined();
  });

  it('removes legacy prefixed content ids when deleting utterance_text', async () => {
    const database = await getDb();

    await db.layer_unit_contents.put({
      id: 'segcv2_utr_legacy',
      textId: 'text_1',
      unitId: 'segv2_layerL_utt_legacy',
      layerId: 'layerL',
      contentRole: 'primary_text',
      modality: 'text',
      text: 'legacy-prefixed',
      sourceType: 'human',
      createdAt: NOW,
      updatedAt: NOW,
    });
    await db.layer_unit_contents.put({
      id: 'segcv22_utr_legacy',
      textId: 'text_1',
      unitId: 'segv2_layerL_utt_legacy',
      layerId: 'layerL',
      contentRole: 'primary_text',
      modality: 'text',
      text: 'legacy-prefixed-v22',
      sourceType: 'human',
      createdAt: NOW,
      updatedAt: NOW,
    });

    await removeUtteranceTextFromSegmentationV2(database, { id: 'utr_legacy' });

    expect(await db.layer_unit_contents.get('segcv2_utr_legacy')).toBeUndefined();
    expect(await db.layer_unit_contents.get('segcv22_utr_legacy')).toBeUndefined();
  });

  it('removes LayerUnit-only orphan segment when deleting utterance_text', async () => {
    const database = await getDb();

    await db.layer_units.put({
      id: 'seg_unit_delete_1',
      textId: 'text_1',
      mediaId: 'media_1',
      layerId: 'layer_unit_delete',
      unitType: 'segment',
      parentUnitId: 'utt_unit_delete_1',
      rootUnitId: 'utt_unit_delete_1',
      startTime: 0,
      endTime: 1,
      createdAt: NOW,
      updatedAt: NOW,
    });
    await db.layer_unit_contents.put({
      id: 'utr_unit_delete_1',
      textId: 'text_1',
      unitId: 'seg_unit_delete_1',
      layerId: 'layer_unit_delete',
      contentRole: 'primary_text',
      modality: 'text',
      text: 'unit-delete',
      sourceType: 'human',
      createdAt: NOW,
      updatedAt: NOW,
    });

    await removeUtteranceTextFromSegmentationV2(database, { id: 'utr_unit_delete_1' });

    expect(await db.layer_unit_contents.get('utr_unit_delete_1')).toBeUndefined();
    expect(await db.layer_units.get('seg_unit_delete_1')).toBeUndefined();
  });

  it('cleanupOrphanSegments removes orphan segments and dangling links', async () => {
    const database = await getDb();

    await db.layer_units.bulkPut([
      {
        id: 'seg_orphan',
        textId: 'text_1',
        mediaId: 'media_1',
        layerId: 'layer_a',
        unitType: 'segment',
        startTime: 0,
        endTime: 1,
        createdAt: NOW,
        updatedAt: NOW,
      },
      {
        id: 'seg_live',
        textId: 'text_1',
        mediaId: 'media_1',
        layerId: 'layer_a',
        unitType: 'segment',
        startTime: 1,
        endTime: 2,
        createdAt: NOW,
        updatedAt: NOW,
      },
    ]);
    await db.layer_unit_contents.put({
      id: 'cnt_live',
      textId: 'text_1',
      unitId: 'seg_live',
      layerId: 'layer_a',
      contentRole: 'primary_text',
      modality: 'text',
      text: 'live',
      sourceType: 'human',
      createdAt: NOW,
      updatedAt: NOW,
    });
    await db.unit_relations.put({
      id: 'lnk_orphan',
      textId: 'text_1',
      sourceUnitId: 'seg_orphan',
      targetUnitId: 'seg_live',
      relationType: 'aligned_to',
      createdAt: NOW,
      updatedAt: NOW,
    });

    const cleaned = await cleanupOrphanSegments(database, ['seg_orphan', 'seg_live']);

    expect(cleaned).toEqual(['seg_orphan']);
    expect(await db.layer_units.get('seg_orphan')).toBeUndefined();
    expect(await db.layer_units.get('seg_live')).toBeTruthy();
    expect(await db.unit_relations.get('lnk_orphan')).toBeUndefined();
  });

  it('removes LayerUnit-only child segments when parent utterance is deleted', async () => {
    const database = await getDb();

    await db.layer_units.put({
      id: 'seg_unit_cascade_1',
      textId: 'text_1',
      mediaId: 'media_1',
      layerId: 'layer_unit_cascade',
      unitType: 'segment',
      parentUnitId: 'utt_unit_cascade_1',
      rootUnitId: 'utt_unit_cascade_1',
      startTime: 0,
      endTime: 1,
      createdAt: NOW,
      updatedAt: NOW,
    });
    await db.layer_unit_contents.put({
      id: 'cnt_unit_cascade_1',
      textId: 'text_1',
      unitId: 'seg_unit_cascade_1',
      layerId: 'layer_unit_cascade',
      contentRole: 'primary_text',
      modality: 'text',
      text: 'unit-cascade',
      sourceType: 'human',
      createdAt: NOW,
      updatedAt: NOW,
    });

    await removeUtteranceCascadeFromSegmentationV2(database, 'utt_unit_cascade_1');

    expect(await db.layer_unit_contents.get('cnt_unit_cascade_1')).toBeUndefined();
    expect(await db.layer_units.get('seg_unit_cascade_1')).toBeUndefined();
  });

  it('removes LayerUnit-only time_subdivision child segments when parent utterance is deleted', async () => {
    const database = await getDb();

    await db.layer_units.put({
      id: 'seg_unit_rel_cascade_1',
      textId: 'text_1',
      mediaId: 'media_1',
      layerId: 'layer_unit_rel',
      unitType: 'segment',
      startTime: 0,
      endTime: 1,
      createdAt: NOW,
      updatedAt: NOW,
    });
    await db.layer_unit_contents.put({
      id: 'cnt_unit_rel_cascade_1',
      textId: 'text_1',
      unitId: 'seg_unit_rel_cascade_1',
      layerId: 'layer_unit_rel',
      contentRole: 'primary_text',
      modality: 'text',
      text: 'unit-rel-cascade',
      sourceType: 'human',
      createdAt: NOW,
      updatedAt: NOW,
    });
    await db.unit_relations.put({
      id: 'rel_unit_cascade_1',
      textId: 'text_1',
      sourceUnitId: 'seg_unit_rel_cascade_1',
      targetUnitId: 'utt_unit_rel_parent_1',
      relationType: 'derived_from',
      createdAt: NOW,
      updatedAt: NOW,
    });

    await removeUtteranceCascadeFromSegmentationV2(database, 'utt_unit_rel_parent_1');

    expect(await db.layer_unit_contents.get('cnt_unit_rel_cascade_1')).toBeUndefined();
    expect(await db.layer_units.get('seg_unit_rel_cascade_1')).toBeUndefined();
    expect(await db.unit_relations.get('rel_unit_cascade_1')).toBeUndefined();
  });

  it('clips time_subdivision child segments to parent range', async () => {
    const database = await getDb();

    await db.layer_units.put({
      id: 'seg_sub_clip_1',
      textId: 'text_1',
      mediaId: 'media_1',
      layerId: 'layer_sub',
      unitType: 'segment',
      startTime: 0.8,
      endTime: 2.3,
      createdAt: NOW,
      updatedAt: NOW,
    });
    await db.unit_relations.put({
      id: 'lnk_sub_clip_1',
      textId: 'text_1',
      sourceUnitId: 'seg_sub_clip_1',
      targetUnitId: 'utt_parent_clip_1',
      relationType: 'derived_from',
      createdAt: NOW,
      updatedAt: NOW,
    });

    const result = await enforceTimeSubdivisionParentBounds(
      database,
      'utt_parent_clip_1',
      1.0,
      2.0,
    );

    expect(result.clippedCount).toBe(1);
    expect(result.deletedCount).toBe(0);
    const seg = await db.layer_units.get('seg_sub_clip_1');
    expect(seg?.startTime).toBe(1.0);
    expect(seg?.endTime).toBe(2.0);
  });

  it('deletes time_subdivision child segment when clipped span is too short', async () => {
    const database = await getDb();

    await db.layer_units.put({
      id: 'seg_sub_short_1',
      textId: 'text_1',
      mediaId: 'media_1',
      layerId: 'layer_sub',
      unitType: 'segment',
      startTime: 1.94,
      endTime: 2.06,
      createdAt: NOW,
      updatedAt: NOW,
    });
    await db.layer_unit_contents.put({
      id: 'cnt_sub_short_1',
      textId: 'text_1',
      unitId: 'seg_sub_short_1',
      layerId: 'layer_sub',
      contentRole: 'primary_text',
      modality: 'text',
      text: 'short-child',
      sourceType: 'human',
      createdAt: NOW,
      updatedAt: NOW,
    });
    await db.unit_relations.put({
      id: 'lnk_sub_short_1',
      textId: 'text_1',
      sourceUnitId: 'seg_sub_short_1',
      targetUnitId: 'utt_parent_short_1',
      relationType: 'derived_from',
      createdAt: NOW,
      updatedAt: NOW,
    });

    const result = await enforceTimeSubdivisionParentBounds(
      database,
      'utt_parent_short_1',
      1.99,
      2.01,
      0.05,
    );

    expect(result.clippedCount).toBe(0);
    expect(result.deletedCount).toBe(1);
    expect(await db.layer_units.get('seg_sub_short_1')).toBeUndefined();
    expect(await db.layer_unit_contents.get('cnt_sub_short_1')).toBeUndefined();
    expect(await db.unit_relations.get('lnk_sub_short_1')).toBeUndefined();
  });

  it('clips LayerUnit-only time_subdivision child segments to parent range', async () => {
    const database = await getDb();

    await db.layer_units.put({
      id: 'seg_unit_rel_clip_1',
      textId: 'text_1',
      mediaId: 'media_1',
      layerId: 'layer_unit_rel',
      unitType: 'segment',
      startTime: 0.8,
      endTime: 2.3,
      createdAt: NOW,
      updatedAt: NOW,
    });
    await db.unit_relations.put({
      id: 'rel_unit_clip_1',
      textId: 'text_1',
      sourceUnitId: 'seg_unit_rel_clip_1',
      targetUnitId: 'utt_unit_rel_parent_clip_1',
      relationType: 'derived_from',
      createdAt: NOW,
      updatedAt: NOW,
    });

    const result = await enforceTimeSubdivisionParentBounds(
      database,
      'utt_unit_rel_parent_clip_1',
      1.0,
      2.0,
    );

    expect(result.clippedCount).toBe(1);
    expect(result.deletedCount).toBe(0);
    const seg = await db.layer_units.get('seg_unit_rel_clip_1');
    expect(seg?.startTime).toBe(1.0);
    expect(seg?.endTime).toBe(2.0);
  });
});
