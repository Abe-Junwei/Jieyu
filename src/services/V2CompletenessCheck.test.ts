import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db, getDb, type UtteranceDocType, type UtteranceTextDocType } from '../db';
import { syncUtteranceTextToSegmentationV2 } from './LayerSegmentationV2BridgeService';
import { verifyV2Completeness } from './V2CompletenessCheck';

const NOW = '2026-03-27T00:00:00.000Z';

function makeUtterance(id: string, textId = 'text_1'): UtteranceDocType {
  return { id, textId, mediaId: 'media_1', startTime: 0, endTime: 1, createdAt: NOW, updatedAt: NOW };
}

function makeTranslation(id: string, utteranceId: string, layerId = 'layer_trl'): UtteranceTextDocType {
  return { id, utteranceId, layerId, modality: 'text', text: 'hello', sourceType: 'human', createdAt: NOW, updatedAt: NOW };
}

describe('V2CompletenessCheck', () => {
  beforeEach(async () => {
    await db.open();
    await Promise.all([
      db.utterances.clear(),
      db.utterance_texts.clear(),
      db.layer_segments.clear(),
      db.layer_segment_contents.clear(),
      db.segment_links.clear(),
    ]);
  });

  it('空 DB 返回全零报告 | returns all-zero report for empty DB', async () => {
    const database = await getDb();
    const report = await verifyV2Completeness(database);

    expect(report.totalV1Rows).toBe(0);
    expect(report.totalV2Contents).toBe(0);
    expect(report.missingInV2).toBe(0);
    expect(report.orphanV1Rows).toBe(0);
    expect(report.missingSamples).toEqual([]);
    expect(report.perTextId).toEqual([]);
  });

  it('V1 有 / V2 缺 → missingInV2 > 0', async () => {
    const database = await getDb();
    const utt = makeUtterance('utt_1');
    const trl = makeTranslation('trl_1', 'utt_1');

    await db.utterances.put(utt);
    await db.utterance_texts.put(trl);
    // 不写 V2 — 模拟未同步场景 | Don't write V2 — simulate unsynced scenario

    const report = await verifyV2Completeness(database);

    expect(report.totalV1Rows).toBe(1);
    expect(report.totalV2Contents).toBe(0);
    expect(report.missingInV2).toBe(1);
    expect(report.missingSamples).toHaveLength(1);
    expect(report.missingSamples[0]).toEqual({ id: 'trl_1', utteranceId: 'utt_1', layerId: 'layer_trl' });
    expect(report.perTextId).toEqual([{ textId: 'text_1', v1Count: 1, v2Count: 0, delta: 1 }]);
  });

  it('V1 与 V2 完全同步 → missingInV2 === 0', async () => {
    const database = await getDb();
    const utt = makeUtterance('utt_2');
    const trl = makeTranslation('trl_2', 'utt_2');

    await db.utterances.put(utt);
    await db.utterance_texts.put(trl);
    await syncUtteranceTextToSegmentationV2(database, utt, trl);

    const report = await verifyV2Completeness(database);

    expect(report.totalV1Rows).toBe(1);
    expect(report.totalV2Contents).toBe(1);
    expect(report.missingInV2).toBe(0);
    expect(report.missingSamples).toEqual([]);
    expect(report.perTextId[0]?.delta).toBe(0);
  });

  it('孤立 V1 行（utterance 已删）→ orphanV1Rows 递增', async () => {
    const database = await getDb();
    const trl = makeTranslation('trl_orphan', 'utt_deleted');
    await db.utterance_texts.put(trl);
    // utterance 不存在 | utterance does not exist

    const report = await verifyV2Completeness(database);

    expect(report.orphanV1Rows).toBe(1);
    expect(report.missingInV2).toBe(0); // 孤立行不算"缺失" | orphan rows are not counted as missing
    expect(report.totalV1Rows).toBe(1);
  });

  it('perTextId 按 delta 降序、每行 delta = v1Count - v2Count', async () => {
    const database = await getDb();
    const utt1 = makeUtterance('utt_a', 'text_A');
    const utt2 = makeUtterance('utt_b', 'text_B');
    const trlA1 = makeTranslation('trl_a1', 'utt_a', 'layer_en');
    const trlA2 = makeTranslation('trl_a2', 'utt_a', 'layer_zh');
    const trlB1 = makeTranslation('trl_b1', 'utt_b', 'layer_en');

    await db.utterances.bulkPut([utt1, utt2]);
    await db.utterance_texts.bulkPut([trlA1, trlA2, trlB1]);
    // 只同步 text_B 的 | Only sync text_B's
    await syncUtteranceTextToSegmentationV2(database, utt2, trlB1);

    const report = await verifyV2Completeness(database);

    expect(report.missingInV2).toBe(2); // trl_a1, trl_a2
    expect(report.perTextId.length).toBe(2);
    // text_A 缺 2 应排第一 | text_A missing 2 should be first
    expect(report.perTextId[0]).toEqual({ textId: 'text_A', v1Count: 2, v2Count: 0, delta: 2 });
    expect(report.perTextId[1]).toEqual({ textId: 'text_B', v1Count: 1, v2Count: 1, delta: 0 });
  });

  it('多条 V1 行混合场景（部分同步、部分缺失、部分孤立）', async () => {
    const database = await getDb();
    const utt1 = makeUtterance('utt_mix1');
    const trlSynced = makeTranslation('trl_synced', 'utt_mix1', 'layer_en');
    const trlMissing = makeTranslation('trl_missing', 'utt_mix1', 'layer_zh');
    const trlOrphan = makeTranslation('trl_orphan2', 'utt_gone');

    await db.utterances.put(utt1);
    await db.utterance_texts.bulkPut([trlSynced, trlMissing, trlOrphan]);
    await syncUtteranceTextToSegmentationV2(database, utt1, trlSynced);

    const report = await verifyV2Completeness(database);

    expect(report.totalV1Rows).toBe(3);
    expect(report.missingInV2).toBe(1); // trl_missing
    expect(report.orphanV1Rows).toBe(1); // trl_orphan2
    expect(report.missingSamples).toEqual([{ id: 'trl_missing', utteranceId: 'utt_mix1', layerId: 'layer_zh' }]);
  });
});
