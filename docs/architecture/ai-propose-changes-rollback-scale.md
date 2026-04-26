---
title: AI 结构性变更回滚 — 选择规模与上限
doc_type: architecture-spec
status: active
owner: repo
last_reviewed: 2026-04-26
source_of_truth: ai-structural-rollback-scale
---

# AI 结构性变更回滚 — 选择规模与上限

本文档说明 `propose_changes` 路径上 **合并 / 删除转写句段** 等结构性工具在捕获 Dexie 快照时的 **目标数量上限**，与运行时环境变量。规范决策见 **ADR-0026**（`docs/adr/0026-ai-propose-changes-canonical-cluster-rollback.md`）。

## 默认行为

- 单次操作涉及的 **时间轴 id 列表**（合并去重后的 `segmentIds`、删除批次的 id、`allSegments` 展开后的全部 unit id）若超过上限，**不执行**该工具步，并返回 i18n key `transcription.aiTool.segment.structuralRollbackTooManyTargets`（含 `{count}` 与 `{max}`）。
- **默认上限**：`4000`（在 `getAiStructuralRollbackMaxSelectionIds()` 中定义，与 `captureAiCanonicalClusterRollbackSnapshot` 在 ids 过长时返回 `null` 的门闸一致）。

## 环境变量

- **`JIEYU_AI_STRUCTURAL_ROLLBACK_MAX_SELECTION_IDS`**：正整数字符串；无效或未设置时使用默认值 `4000`。供大型语料库或压测环境按需上调；下调可用于本地或 CI 中验证「超上限拒绝」分支（Vitest `vi.stubEnv`）。

## 实现位置（代码为准）

- `src/services/AiCanonicalClusterRollbackSnapshot.ts` — `getAiStructuralRollbackMaxSelectionIds`、`captureAiCanonicalClusterRollbackSnapshot` 早退。
- `src/hooks/useAiToolCallHandler.segmentAdapter.ts` — `merge_transcription_segments`、`delete_transcription_segment`（含 `allSegments`）在调用合并/删除执行器前校验；`buildCombinedTimelineSelectionDeleteRollback` / `buildSegmentDeleteGraphRollback` 与快照模块对齐。

## 验收与 CI

- `npm run check:acceptance-1` 聚合若干 Vitest 用例（含 `AiCanonicalClusterRollbackSnapshot.dexie.test.ts` 与 propose batch merge rollback）。GitHub Actions `quality` job 在完整 `npm test` 前执行该脚本，作为结构性回滚回归的快速门闸。
