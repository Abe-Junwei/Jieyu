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

describe('Phase 0 v28 backfill — verifyV2Completeness 验收', () => {
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

  it('v28 补全后 missingInV2 === 0（仅 V1 行存在时 BridgeService 同步已覆盖）', async () => {
    const database = await getDb();
    const utt1 = makeUtterance('utt_p0_a');
    const utt2 = makeUtterance('utt_p0_b');
    const trl1 = makeTranslation('trl_p0_1', 'utt_p0_a', 'layer_en');
    const trl2 = makeTranslation('trl_p0_2', 'utt_p0_b', 'layer_zh');

    await db.utterances.bulkPut([utt1, utt2]);
    await db.utterance_texts.bulkPut([trl1, trl2]);
    // 模拟 BridgeService 同步（正常写入路径会做双写）| Simulate normal double-write
    await syncUtteranceTextToSegmentationV2(database, utt1, trl1);
    await syncUtteranceTextToSegmentationV2(database, utt2, trl2);

    const report = await verifyV2Completeness(database);
    expect(report.missingInV2).toBe(0);
    expect(report.totalV1Rows).toBe(2);
    expect(report.totalV2Contents).toBeGreaterThanOrEqual(2);
  });

  it('已有 v22 前缀 (segv22_) 的 segment 不影响 content ID 匹配', async () => {
    const database = await getDb();
    const utt = makeUtterance('utt_v22');
    const trl = makeTranslation('trl_v22', 'utt_v22', 'layer_en');

    // 模拟 v22 迁移产生的数据（segment 用 segv22_ 前缀，content ID = translation ID）
    await db.utterances.put(utt);
    await db.utterance_texts.put(trl);
    await db.layer_segments.put({
      id: 'segv22_layer_en_utt_v22',
      textId: 'text_1',
      mediaId: 'media_1',
      layerId: 'layer_en',
      utteranceId: 'utt_v22',
      startTime: 0,
      endTime: 1,
      provenance: { actorType: 'system', method: 'migration', createdAt: NOW, updatedAt: NOW },
      createdAt: NOW,
      updatedAt: NOW,
    });
    await db.layer_segment_contents.put({
      id: 'trl_v22', // content ID === translation ID（与 V1 行匹配）
      textId: 'text_1',
      segmentId: 'segv22_layer_en_utt_v22',
      layerId: 'layer_en',
      modality: 'text',
      text: 'hello',
      sourceType: 'human',
      createdAt: NOW,
      updatedAt: NOW,
    });

    const report = await verifyV2Completeness(database);
    expect(report.missingInV2).toBe(0); // content ID 匹配
  });

  it('部分已有 V2、部分缺失的混合场景正确补全', async () => {
    const database = await getDb();
    const utt = makeUtterance('utt_mix');
    const trlSynced = makeTranslation('trl_synced', 'utt_mix', 'layer_en');
    const trlMissing = makeTranslation('trl_gap', 'utt_mix', 'layer_zh');

    await db.utterances.put(utt);
    await db.utterance_texts.bulkPut([trlSynced, trlMissing]);
    await syncUtteranceTextToSegmentationV2(database, utt, trlSynced);
    // trl_gap 未同步到 V2 | trl_gap not synced to V2

    const before = await verifyV2Completeness(database);
    expect(before.missingInV2).toBe(1);
    expect(before.missingSamples[0]?.id).toBe('trl_gap');

    // 模拟 v28 补全：手动同步缺失行 | Simulate v28 backfill
    await syncUtteranceTextToSegmentationV2(database, utt, trlMissing);

    const after = await verifyV2Completeness(database);
    expect(after.missingInV2).toBe(0);
  });

  it('幂等性：已存在的 V2 行不被重复创建', async () => {
    const database = await getDb();
    const utt = makeUtterance('utt_idem');
    const trl = makeTranslation('trl_idem', 'utt_idem');

    await db.utterances.put(utt);
    await db.utterance_texts.put(trl);
    await syncUtteranceTextToSegmentationV2(database, utt, trl);

    const countBefore = await db.layer_segment_contents.count();
    // 再次调用 sync（模拟 v28 补全重复跑）| Call sync again (simulate repeated v28 run)
    await syncUtteranceTextToSegmentationV2(database, utt, trl);
    const countAfter = await db.layer_segment_contents.count();

    expect(countAfter).toBe(countBefore); // bulkPut 是 upsert 行为，不会增加行
  });

  it('孤立 utterance_texts 在补全时被跳过', async () => {
    const database = await getDb();
    const trl = makeTranslation('trl_orphan_p0', 'utt_nonexistent');
    await db.utterance_texts.put(trl);
    // 不创建 utterance | Don't create utterance

    const report = await verifyV2Completeness(database);
    expect(report.orphanV1Rows).toBe(1);
    expect(report.missingInV2).toBe(0); // 孤立行不算缺失
  });

  it('perTextId 对账：delta = v1Count - v2Count', async () => {
    const database = await getDb();
    const utt = makeUtterance('utt_acct', 'text_acct');
    const trlA = makeTranslation('trl_acct_a', 'utt_acct', 'layer_en');
    const trlB = makeTranslation('trl_acct_b', 'utt_acct', 'layer_zh');

    await db.utterances.put(utt);
    await db.utterance_texts.bulkPut([trlA, trlB]);
    await syncUtteranceTextToSegmentationV2(database, utt, trlA);
    // trlB 未同步 | trlB not synced

    const report = await verifyV2Completeness(database);
    const entry = report.perTextId.find((e) => e.textId === 'text_acct');
    expect(entry).toBeDefined();
    expect(entry!.v1Count).toBe(2);
    expect(entry!.v2Count).toBe(1);
    expect(entry!.delta).toBe(1); // v1 - v2 = 2 - 1
  });
});
