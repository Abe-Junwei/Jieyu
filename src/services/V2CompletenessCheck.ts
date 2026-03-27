/**
 * V2 完整性盘点工具（只读）
 * V2 Completeness Verification Tool (read-only)
 *
 * Phase -1：量化 utterance_texts (V1) 与 layer_segment_contents (V2) 之间的覆盖差异，
 * 为去双写迁移提供可证明正确的基线指标。
 */
import type { JieyuDatabase, UtteranceTextDocType, LayerSegmentContentDocType } from '../db';

// ── 报告类型 | Report types ──

export interface V2CompletenessReport {
  /** V1 行总数 | Total utterance_texts rows */
  totalV1Rows: number;
  /** V2 content 总数 | Total layer_segment_contents rows */
  totalV2Contents: number;
  /** V1 中存在、V2 中缺失的行数 | Rows present in V1 but missing in V2 */
  missingInV2: number;
  /** V1 孤立行数（utteranceId 对应的 utterance 已不存在）| Orphan V1 rows (utterance deleted) */
  orphanV1Rows: number;
  /** 缺失样例（最多 20 条）| Missing samples (up to 20) */
  missingSamples: Array<{ id: string; utteranceId: string; layerId: string }>;
  /** 按 textId 分组对账 | Per-textId reconciliation */
  perTextId: Array<{ textId: string; v1Count: number; v2Count: number; delta: number }>;
}

// ── 主函数 | Main function ──

export async function verifyV2Completeness(db: JieyuDatabase): Promise<V2CompletenessReport> {
  const [v1Rows, utterances, v2Contents] = await Promise.all([
    db.dexie.utterance_texts.toArray() as Promise<UtteranceTextDocType[]>,
    db.dexie.utterances.toArray(),
    db.dexie.layer_segment_contents.toArray() as Promise<LayerSegmentContentDocType[]>,
  ]);

  const utteranceById = new Map(utterances.map((u) => [u.id, u]));

  // 建立 V2 content id 集合（用于快速判断"是否已迁移"）| Build V2 content id set
  const v2ContentIdSet = new Set(v2Contents.map((c) => c.id));

  // 按 textId 分组统计 | Group counts by textId
  const v1ByText = new Map<string, number>();
  const v2ByText = new Map<string, number>();

  let missingInV2 = 0;
  let orphanV1Rows = 0;
  const missingSamples: V2CompletenessReport['missingSamples'] = [];

  for (const row of v1Rows) {
    const utt = utteranceById.get(row.utteranceId);
    if (!utt) {
      orphanV1Rows += 1;
      continue;
    }

    const textId = utt.textId;
    v1ByText.set(textId, (v1ByText.get(textId) ?? 0) + 1);

    // V2 content ID 与 V1 translation ID 相同（buildSegmentContentId 直接用 translation.id）
    if (!v2ContentIdSet.has(row.id)) {
      missingInV2 += 1;
      if (missingSamples.length < 20) {
        missingSamples.push({ id: row.id, utteranceId: row.utteranceId, layerId: row.layerId });
      }
    }
  }

  // V2 按 textId 统计（需通过 segment 关联获取 textId）| V2 count by textId via segment
  for (const content of v2Contents) {
    const textId = content.textId;
    if (textId) {
      v2ByText.set(textId, (v2ByText.get(textId) ?? 0) + 1);
    }
  }

  // 合并 textId 集合 | Merge textId sets
  const allTextIds = new Set([...v1ByText.keys(), ...v2ByText.keys()]);
  const perTextId: V2CompletenessReport['perTextId'] = [];
  for (const textId of allTextIds) {
    const v1Count = v1ByText.get(textId) ?? 0;
    const v2Count = v2ByText.get(textId) ?? 0;
    perTextId.push({ textId, v1Count, v2Count, delta: v1Count - v2Count });
  }
  perTextId.sort((a, b) => b.delta - a.delta);

  return {
    totalV1Rows: v1Rows.length,
    totalV2Contents: v2Contents.length,
    missingInV2,
    orphanV1Rows,
    missingSamples,
    perTextId,
  };
}
