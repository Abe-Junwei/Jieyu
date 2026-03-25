import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { featureFlags } from '../ai/config/featureFlags';
import { db, getDb, type UtteranceDocType, type UtteranceTextDocType } from '../db';
import {
  cleanupOrphanSegments,
  getAllUtteranceTextsPreferV2,
  getSegmentationV2Ids,
  removeUtteranceCascadeFromSegmentationV2,
  removeUtteranceTextFromSegmentationV2,
  syncUtteranceTextToSegmentationV2,
} from './LayerSegmentationV2BridgeService';

const NOW = '2026-03-25T00:00:00.000Z';

describe('LayerSegmentationV2BridgeService', () => {
  beforeEach(async () => {
    await db.open();
    (featureFlags as { segmentBoundaryV2Enabled: boolean }).segmentBoundaryV2Enabled = true;
    await Promise.all([
      db.layer_segments.clear(),
      db.layer_segment_contents.clear(),
      db.segment_links.clear(),
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
      tierId: 'layer_trl_en',
      modality: 'text',
      text: 'hello',
      sourceType: 'human',
      createdAt: NOW,
      updatedAt: NOW,
    };

    await syncUtteranceTextToSegmentationV2(database, utterance, translation);

    const ids = getSegmentationV2Ids(translation.tierId, utterance.id, translation.id);
    const segment = await db.layer_segments.get(ids.segmentId);
    const content = await db.layer_segment_contents.get(ids.segmentContentId);

    expect(segment?.layerId).toBe('layer_trl_en');
    expect(segment?.mediaId).toBe('media_1');
    expect(content?.segmentId).toBe(ids.segmentId);
    expect(content?.text).toBe('hello');
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
      tierId: 'layer_trl_en',
      modality: 'text',
      text: 'world',
      sourceType: 'human',
      createdAt: NOW,
      updatedAt: NOW,
    };

    await syncUtteranceTextToSegmentationV2(database, utterance, translation);
    await removeUtteranceTextFromSegmentationV2(database, translation);

    const ids = getSegmentationV2Ids(translation.tierId, utterance.id, translation.id);
    expect(await db.layer_segment_contents.get(ids.segmentContentId)).toBeUndefined();
    expect(await db.layer_segments.get(ids.segmentId)).toBeUndefined();
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
      tierId: 'layer_trl_en',
      modality: 'text',
      text: 'world-a',
      sourceType: 'human',
      createdAt: NOW,
      updatedAt: NOW,
    };
    const translationB: UtteranceTextDocType = {
      id: 'utr_2b_b',
      utteranceId: 'utt_2b',
      tierId: 'layer_trl_en',
      modality: 'mixed',
      text: 'world-b',
      sourceType: 'human',
      createdAt: NOW,
      updatedAt: NOW,
    };

    await syncUtteranceTextToSegmentationV2(database, utterance, translationA);
    await syncUtteranceTextToSegmentationV2(database, utterance, translationB);

    const idsA = getSegmentationV2Ids(translationA.tierId, utterance.id, translationA.id);
    const idsB = getSegmentationV2Ids(translationB.tierId, utterance.id, translationB.id);
    expect(idsA.segmentId).toBe(idsB.segmentId);

    await removeUtteranceTextFromSegmentationV2(database, translationA);

    expect(await db.layer_segment_contents.get(idsA.segmentContentId)).toBeUndefined();
    expect(await db.layer_segment_contents.get(idsB.segmentContentId)).toBeTruthy();
    expect(await db.layer_segments.get(idsA.segmentId)).toBeTruthy();
  });

  it('returns legacy utterance_text rows when flag is disabled', async () => {
    const database = await getDb();
    (featureFlags as { segmentBoundaryV2Enabled: boolean }).segmentBoundaryV2Enabled = false;

    await db.utterance_texts.put({
      id: 'legacy_1',
      utteranceId: 'utt_legacy',
      tierId: 'layer_legacy',
      modality: 'text',
      text: 'legacy-text',
      sourceType: 'human',
      createdAt: NOW,
      updatedAt: NOW,
    });

    const rows = await getAllUtteranceTextsPreferV2(database);
    expect(rows.some((row) => row.id === 'legacy_1' && row.text === 'legacy-text')).toBe(true);
  });

  it('keeps imported legacy rows readable after toggling flag off -> on', async () => {
    const database = await getDb();
    (featureFlags as { segmentBoundaryV2Enabled: boolean }).segmentBoundaryV2Enabled = false;

    await db.utterance_texts.put({
      id: 'legacy_import_1',
      utteranceId: 'utt_import_1',
      tierId: 'layer_import_1',
      modality: 'text',
      text: 'imported-legacy-text',
      sourceType: 'human',
      createdAt: NOW,
      updatedAt: NOW,
    });

    // 模拟“关闭 v2 导入后再开启 v2”路径 | Simulate import with v2 off, then turn v2 on.
    (featureFlags as { segmentBoundaryV2Enabled: boolean }).segmentBoundaryV2Enabled = true;

    const rows = await getAllUtteranceTextsPreferV2(database);
    expect(rows.some((row) => row.id === 'legacy_import_1' && row.text === 'imported-legacy-text')).toBe(true);
    expect(await db.layer_segment_contents.count()).toBe(0);
  });

  it('returns v2 rows when flag is enabled even without legacy rows', async () => {
    const database = await getDb();
    (featureFlags as { segmentBoundaryV2Enabled: boolean }).segmentBoundaryV2Enabled = true;

    await db.layer_segments.put({
      id: 'segv2_layerA_utt_v2',
      textId: 'text_1',
      mediaId: 'media_1',
      layerId: 'layerA',
      startTime: 0,
      endTime: 1,
      createdAt: NOW,
      updatedAt: NOW,
    });
    await db.layer_segment_contents.put({
      id: 'utr_v2',
      textId: 'text_1',
      segmentId: 'segv2_layerA_utt_v2',
      layerId: 'layerA',
      modality: 'text',
      text: 'v2-text',
      sourceType: 'human',
      createdAt: NOW,
      updatedAt: NOW,
    });

    const rows = await getAllUtteranceTextsPreferV2(database);
    expect(rows.some((row) => row.id === 'utr_v2' && row.utteranceId === 'utt_v2' && row.text === 'v2-text')).toBe(true);
  });

  it('prefers v2 row when same id exists in legacy table', async () => {
    const database = await getDb();
    (featureFlags as { segmentBoundaryV2Enabled: boolean }).segmentBoundaryV2Enabled = true;

    await db.utterance_texts.put({
      id: 'dup_id',
      utteranceId: 'utt_dup',
      tierId: 'layer_old',
      modality: 'text',
      text: 'legacy-dup',
      sourceType: 'human',
      createdAt: NOW,
      updatedAt: NOW,
    });

    await db.layer_segments.put({
      id: 'segv2_layer_new_utt_dup',
      textId: 'text_1',
      mediaId: 'media_1',
      layerId: 'layer_new',
      startTime: 0,
      endTime: 1,
      createdAt: NOW,
      updatedAt: NOW,
    });
    await db.layer_segment_contents.put({
      id: 'dup_id',
      textId: 'text_1',
      segmentId: 'segv2_layer_new_utt_dup',
      layerId: 'layer_new',
      modality: 'text',
      text: 'v2-dup',
      sourceType: 'human',
      createdAt: NOW,
      updatedAt: NOW,
    });

    const rows = await getAllUtteranceTextsPreferV2(database);
    const row = rows.find((item) => item.id === 'dup_id');
    expect(row?.text).toBe('v2-dup');
    expect(row?.tierId).toBe('layer_new');
  });

  it('removes v2 segment graph for utterance cascade delete helper', async () => {
    const database = await getDb();
    (featureFlags as { segmentBoundaryV2Enabled: boolean }).segmentBoundaryV2Enabled = true;

    await db.layer_segments.put({
      id: 'segv2_layerX_utt_cascade',
      textId: 'text_1',
      mediaId: 'media_1',
      layerId: 'layerX',
      startTime: 0,
      endTime: 1,
      createdAt: NOW,
      updatedAt: NOW,
    });
    await db.layer_segment_contents.put({
      id: 'cnt_cascade',
      textId: 'text_1',
      segmentId: 'segv2_layerX_utt_cascade',
      layerId: 'layerX',
      modality: 'text',
      text: 'to-remove',
      sourceType: 'human',
      createdAt: NOW,
      updatedAt: NOW,
    });
    await db.segment_links.put({
      id: 'lnk_cascade',
      textId: 'text_1',
      sourceSegmentId: 'segv2_layerX_utt_cascade',
      targetSegmentId: 'segv2_layerX_utt_cascade',
      sourceLayerId: 'layerX',
      targetLayerId: 'layerX',
      utteranceId: 'utt_cascade',
      linkType: 'bridge',
      createdAt: NOW,
      updatedAt: NOW,
    });

    await removeUtteranceCascadeFromSegmentationV2(database, 'utt_cascade');

    expect(await db.layer_segment_contents.get('cnt_cascade')).toBeUndefined();
    expect(await db.layer_segments.get('segv2_layerX_utt_cascade')).toBeUndefined();
    expect(await db.segment_links.get('lnk_cascade')).toBeUndefined();
  });

  it('removes legacy prefixed content ids when deleting utterance_text', async () => {
    const database = await getDb();
    (featureFlags as { segmentBoundaryV2Enabled: boolean }).segmentBoundaryV2Enabled = true;

    await db.layer_segment_contents.put({
      id: 'segcv2_utr_legacy',
      textId: 'text_1',
      segmentId: 'segv2_layerL_utt_legacy',
      layerId: 'layerL',
      modality: 'text',
      text: 'legacy-prefixed',
      sourceType: 'human',
      createdAt: NOW,
      updatedAt: NOW,
    });
    await db.layer_segment_contents.put({
      id: 'segcv22_utr_legacy',
      textId: 'text_1',
      segmentId: 'segv2_layerL_utt_legacy',
      layerId: 'layerL',
      modality: 'text',
      text: 'legacy-prefixed-v22',
      sourceType: 'human',
      createdAt: NOW,
      updatedAt: NOW,
    });

    await removeUtteranceTextFromSegmentationV2(database, { id: 'utr_legacy' });

    expect(await db.layer_segment_contents.get('segcv2_utr_legacy')).toBeUndefined();
    expect(await db.layer_segment_contents.get('segcv22_utr_legacy')).toBeUndefined();
  });

  it('cleanupOrphanSegments removes orphan segments and dangling links', async () => {
    const database = await getDb();
    (featureFlags as { segmentBoundaryV2Enabled: boolean }).segmentBoundaryV2Enabled = true;

    await db.layer_segments.bulkPut([
      {
        id: 'seg_orphan',
        textId: 'text_1',
        mediaId: 'media_1',
        layerId: 'layer_a',
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
        startTime: 1,
        endTime: 2,
        createdAt: NOW,
        updatedAt: NOW,
      },
    ]);
    await db.layer_segment_contents.put({
      id: 'cnt_live',
      textId: 'text_1',
      segmentId: 'seg_live',
      layerId: 'layer_a',
      modality: 'text',
      text: 'live',
      sourceType: 'human',
      createdAt: NOW,
      updatedAt: NOW,
    });
    await db.segment_links.put({
      id: 'lnk_orphan',
      textId: 'text_1',
      sourceSegmentId: 'seg_orphan',
      targetSegmentId: 'seg_live',
      linkType: 'bridge',
      createdAt: NOW,
      updatedAt: NOW,
    });

    const cleaned = await cleanupOrphanSegments(database, ['seg_orphan', 'seg_live']);

    expect(cleaned).toEqual(['seg_orphan']);
    expect(await db.layer_segments.get('seg_orphan')).toBeUndefined();
    expect(await db.layer_segments.get('seg_live')).toBeTruthy();
    expect(await db.segment_links.get('lnk_orphan')).toBeUndefined();
  });
});
