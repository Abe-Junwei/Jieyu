---
title: derived-table-reconciliation requirements
doc_type: execution-spec-requirements
status: active
owner: repo
last_reviewed: 2026-06-01
source_of_truth: derived-table-reconciliation-spec
---

# Requirements — derived-table-reconciliation

## 1. What & Why

- **要做什么**：`segment_meta` 派生表同步失败可观测；读路径对账并在漂移时 rebuild。
- **为什么现在做**：13 处 `.catch(()=>{})` 静默吞错，读方信任派生表不回查主表。
- **不做什么**：不改 `SegmentMetaService` 投影算法语义。

## 2. 用户场景

1. 写路径 sync 失败时在日志/遥测可见（`log.warn`）。
2. 侧栏/AI 读 segment 列表时，若派生表行数与主表不一致则自动 rebuild。

## 3. 验收标准

- [ ] 无裸 `SegmentMetaService.syncForUnitIds(...).catch(()=>{})`
- [ ] `scheduleSegmentMetaSyncForUnitIds` 统一 best-effort + warn
- [ ] `detectSegmentMetaDrift` / `ensureSegmentMetaFreshForLayerMedia` + vitest
- [ ] `check:segment-meta-sync-governance` 通过

## 4. 受影响代码地图

| 类别 | 文件 | 改动 |
| --- | --- | --- |
| Best-effort | `segmentMetaSyncBestEffort.ts` | warn 包装 |
| Reconcile | `segmentMetaReconcile.ts` | 读路径对账 |
| 读门面 | `segmentReadQueries.ts` | 对账替代无条件 rebuild |
| 守卫 | `check-segment-meta-sync-governance.mjs` | 禁裸吞 |
