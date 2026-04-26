---
title: ADR 0026 — propose_changes 全路径可逆：规范单元簇快照与混合时间轴删除/合并回滚
doc_type: adr
status: accepted
owner: repo
last_reviewed: 2026-04-26
source_of_truth: decision
---

# ADR 0026 — `propose_changes` 全路径可逆：规范单元簇快照与混合时间轴删除/合并回滚

## 背景

ADR-0025 将 B2 白名单回滚主要约束在「段层 split + 文本/词元」等边界；**unit 时间轴**上的 `merge_transcription_segments`（`mergeSelectedUnits`）、**非 segment 行**的 `delete_transcription_segment`，以及 **`allSegments: true`** 删除，在批处理中途失败时仍可能出现**无 `rollback`** 的半应用状态。产品选择 **全路径可逆**：在具备 `silentSegmentGraphSyncForAi` 的前提下，上述结构性子步必须能捕获快照并在逆序 `rollback` 中恢复。

## 决策

1. **规范单元簇快照**：新增 `src/services/AiCanonicalClusterRollbackSnapshot.ts`，在操作前对一组 **规范 `layer_units` 行（`unitType !== 'segment'`）** 捕获：`layer_units`（宿主）、其下 **segment 子图**（与 `deleteLayerSegmentGraphByUnitIds` 同口径的 segment id 集 + `snapshotLayerSegmentGraphBySegmentIds`）、宿主上的 `layer_unit_contents`、`unit_tokens` / `unit_morphemes`、`token_lexeme_links`、`anchors`、`user_notes`。恢复时先 `deleteLayerSegmentGraphByUnitIds` 清宿主下当前子图，再在单事务内按锚点 → 宿主 → 子图 → 内容 → 词法表 → 笔记的顺序 **bulk upsert**；最后 `invalidateUnitEmbeddings`。
2. **合并**：若 `merge_transcription_segments` 的请求 id 在 `ctx.units` 上解析为 **全 segment 行**，沿用 ADR-0025 的 **silent `splitSegment` + `silentSegmentGraphSyncForAi`** 回滚；否则走 **规范单元簇快照**（对应 `mergeSelectedUnits` 的 canonical 合并路径）。若无法建立任一回滚（例如缺少 `silentSegmentGraphSyncForAi` 或快照捕获失败），**拒绝执行**合并并返回 `transcription.aiTool.segment.cannotCaptureStructuredRollback`。
3. **删除**：`delete_transcription_segment` 的列表删除、`allSegments`、以及 **非 segment 的当前宿主删除**，统一经 **`buildCombinedTimelineSelectionDeleteRollback`**：将时间轴 id 分为 **standalone segment 行**（父宿主不在本次删除的 canonical 集合中）与 **canonical 宿主**；standalone 仍用 `snapshotLayerSegmentGraphBySegmentIds` + `reinsertLayerSegmentGraphSubset`；canonical 用簇快照。若需回滚却建快照失败，**拒绝删除**。
4. **与 ADR-0025 的关系**：0025 的段层 split 与 B2 白名单不变；0026 **扩展** 0025 中「merge/delete 不纳入 AI 补偿」的表述，在 **具备同步回调且快照完整** 时纳入补偿；**交错编辑**下的语义仍以「捕获时刻」为准（与既有 segment 子图快照一致），不在本 ADR 引入 epoch 级版本向量。

## 影响

- `useTranscriptionAiController` / ReadyWorkspace 必须继续为 AI handler 注入 `silentSegmentGraphSyncForAi`，否则结构性合并/删除在严格模式下会失败（可逆优先）。
- 防回归：`src/services/AiCanonicalClusterRollbackSnapshot.dexie.test.ts`（fake-indexedDB 上 capture→改库→restore，含超上限 `null`）；`npm run check:acceptance-1` 已纳入该文件与 `proposeBatch` 中 merge 子步逆序 rollback 用例。规模上限与 `JIEYU_AI_STRUCTURAL_ROLLBACK_MAX_SELECTION_IDS` 见 `docs/architecture/ai-propose-changes-rollback-scale.md`。`useAiToolCallHandler` 相关测试使用 **spy** 收窄对快照模块的替换范围；**生产路径** 不得依赖全模块 mock。

## 被放弃的备选方案

- **整层 `snapshotLayerSegmentGraphByLayerIds` + restoreLayerSegmentGraphSnapshot**：体量与 wipe 范围过大，易与无关编辑交错冲突。
- **禁止 merge/delete 进入 `propose_changes`**：与已选「全路径可逆」产品目标冲突。
