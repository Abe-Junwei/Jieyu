// @vitest-environment node
/**
 * AI 工具 Golden Snapshot 批量回归测试 | AI Tool Golden Snapshot Batch Regression Tests
 *
 * tests/golden/ai-decisions/*.json 里的每个文件都是从 UI 重放面板导出的 golden snapshot。
 * Each file in tests/golden/ai-decisions/*.json is a golden snapshot exported from the AI replay panel.
 *
 * 本测试套件自动验证：| This suite automatically validates:
 *   (a) 文件符合 AiToolGoldenSnapshot schema（schemaVersion、必填字段、类型）
 *       File matches AiToolGoldenSnapshot schema (schemaVersion, required fields, types)
 *   (b) 从快照数据重新构造 bundle，再调用 buildAiToolGoldenSnapshot，关键字段要与原始快照一致
 *       Key fields of rebuilt snapshot match original after rehydrating bundle from snapshot data
 *   (c) diffAiToolSnapshot 对自身重建的 bundle 报告 matches: true
 *       diffAiToolSnapshot reports matches: true when diffing against a bundle rehydrated from the same snapshot
 *
 * 使用方式：| Usage:
 *   1. 从 AI 工具回放面板点"导出快照"下载 .json | Click "Export Snapshot" in the replay panel
 *   2. 将文件放入 tests/golden/ai-decisions/ | Place the file in tests/golden/ai-decisions/
 *   3. 运行 npm test — 本套件会自动覆盖 | Run npm test — this suite auto-includes it
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { buildAiToolGoldenSnapshot, diffAiToolSnapshot, type AiToolGoldenSnapshot, type AiToolReplayBundle, type AiToolReplayDecision } from '../../src/ai/auditReplay';

const SNAPSHOT_DIR = join(__dirname, 'ai-decisions');

function readSnapshot(filename: string): AiToolGoldenSnapshot {
  const raw = readFileSync(join(SNAPSHOT_DIR, filename), 'utf-8');
  return JSON.parse(raw) as AiToolGoldenSnapshot;
}

/**
 * 从 golden snapshot 反向重建一个 AiToolReplayBundle，用于重跑 buildAiToolGoldenSnapshot
 * Rehydrate an AiToolReplayBundle from a golden snapshot to re-run buildAiToolGoldenSnapshot
 */
function rehydrateBundleFromSnapshot(snapshot: AiToolGoldenSnapshot): AiToolReplayBundle {
  const decisions: AiToolReplayDecision[] = snapshot.decisions.map((d, idx) => ({
    id: `rehydrated-${idx}`,
    toolName: snapshot.toolName,
    decision: d.decision,
    timestamp: d.timestamp,
    source: d.source,
    ...(d.reason ? { reason: d.reason } : {}),
    ...(typeof d.executed === 'boolean' ? { executed: d.executed } : {}),
    ...(d.message ? { message: d.message } : {}),
  }));

  const latestDecision: AiToolReplayDecision | undefined = snapshot.latestDecision
    ? {
        id: 'rehydrated-latest',
        toolName: snapshot.toolName,
        decision: snapshot.latestDecision.decision,
        timestamp: snapshot.latestDecision.timestamp,
        source: snapshot.latestDecision.source,
        ...(snapshot.latestDecision.reason ? { reason: snapshot.latestDecision.reason } : {}),
        ...(typeof snapshot.latestDecision.executed === 'boolean' ? { executed: snapshot.latestDecision.executed } : {}),
        ...(snapshot.latestDecision.message ? { message: snapshot.latestDecision.message } : {}),
      }
    : undefined;

  return {
    requestId: snapshot.requestId,
    toolName: snapshot.toolName,
    replayable: snapshot.replayable,
    ...(snapshot.toolCall ? { toolCall: snapshot.toolCall } : {}),
    ...(snapshot.context ? { context: snapshot.context } : {}),
    ...(snapshot.assistantMessageId ? { assistantMessageId: snapshot.assistantMessageId } : {}),
    ...(snapshot.intentAssessment ? { intentAssessment: snapshot.intentAssessment } : {}),
    decisions,
    ...(latestDecision ? { latestDecision } : {}),
  };
}

// 读取所有快照文件 | Collect all snapshot files
const snapshotFiles = readdirSync(SNAPSHOT_DIR).filter((f) => f.endsWith('.json'));

describe('Golden AI Snapshot: schema + stability regression', () => {
  it('ai-decisions/ 目录中存在至少一个快照文件 | at least one snapshot file exists', () => {
    expect(snapshotFiles.length).toBeGreaterThan(0);
  });

  for (const filename of snapshotFiles) {
    describe(`snapshot: ${filename}`, () => {
      const snapshot = readSnapshot(filename);

      // ── (a) Schema validation ───────────────────────────────────────────────

      it('schemaVersion 为 1 | schemaVersion is 1', () => {
        expect(snapshot.schemaVersion).toBe(1);
      });

      it('必填字段存在且类型正确 | required fields present with correct types', () => {
        expect(typeof snapshot.requestId).toBe('string');
        expect(snapshot.requestId.trim().length).toBeGreaterThan(0);
        expect(typeof snapshot.toolName).toBe('string');
        expect(typeof snapshot.replayable).toBe('boolean');
        expect(typeof snapshot.exportedAt).toBe('string');
        expect(Array.isArray(snapshot.decisions)).toBe(true);
      });

      it('每条 decision 有 decision + source + timestamp 字段 | each decision has decision, source, timestamp', () => {
        for (const d of snapshot.decisions) {
          expect(typeof d.decision).toBe('string');
          expect(typeof d.source).toBe('string');
          expect(typeof d.timestamp).toBe('string');
        }
      });

      if (snapshot.latestDecision) {
        it('latestDecision 字段类型正确 | latestDecision fields are typed correctly', () => {
          expect(typeof snapshot.latestDecision!.decision).toBe('string');
          expect(typeof snapshot.latestDecision!.source).toBe('string');
          expect(typeof snapshot.latestDecision!.timestamp).toBe('string');
        });
      }

      // ── (b) Stability: rebuild and compare key fields ───────────────────────

      it('从快照重建 bundle 后 buildAiToolGoldenSnapshot 关键字段不变 | rebuilt snapshot key fields match original', () => {
        const bundle = rehydrateBundleFromSnapshot(snapshot);
        const rebuilt = buildAiToolGoldenSnapshot(bundle);

        expect(rebuilt.schemaVersion).toBe(snapshot.schemaVersion);
        expect(rebuilt.requestId).toBe(snapshot.requestId);
        expect(rebuilt.toolName).toBe(snapshot.toolName);
        expect(rebuilt.replayable).toBe(snapshot.replayable);
        expect(rebuilt.decisions.length).toBe(snapshot.decisions.length);

        if (snapshot.latestDecision) {
          expect(rebuilt.latestDecision?.decision).toBe(snapshot.latestDecision.decision);
          expect(rebuilt.latestDecision?.executed).toBe(snapshot.latestDecision.executed);
          expect(rebuilt.latestDecision?.source).toBe(snapshot.latestDecision.source);
        }

        if (snapshot.toolCall) {
          expect(rebuilt.toolCall?.name).toBe(snapshot.toolCall.name);
          expect(rebuilt.toolCall?.arguments).toEqual(snapshot.toolCall.arguments);
        }
      });

      // ── (c) diffAiToolSnapshot self-consistency ─────────────────────────────

      it('diffAiToolSnapshot 对自身重建的 bundle 报告 matches: true | diff against rehydrated bundle is clean', () => {
        const bundle = rehydrateBundleFromSnapshot(snapshot);
        const diff = diffAiToolSnapshot(snapshot, bundle);
        // 所有字段应当一致；若有失败说明序列化或重建逻辑有漂移 | All fields should match; any failure signals serialization drift
        const changedFields = diff.fields.filter((f) => f.changed);
        expect(changedFields, `Changed fields: ${changedFields.map((f) => f.label).join(', ')}`).toHaveLength(0);
        expect(diff.matches).toBe(true);
      });
    });
  }
});
