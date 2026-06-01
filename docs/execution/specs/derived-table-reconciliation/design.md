---
title: derived-table-reconciliation design
doc_type: execution-spec-design
status: active
owner: repo
last_reviewed: 2026-06-01
source_of_truth: derived-table-reconciliation-spec
depends_on:
  - ./requirements.md
---

# Design — derived-table-reconciliation

## 1. 写路径（best-effort）

`scheduleSegmentMetaSyncForUnitIds(unitIds, context)` → `SegmentMetaService.syncForUnitIds` → 失败 `log.warn`（不阻塞主写）。

## 2. 读路径（对账）

```text
detectSegmentMetaDrift(layerId, mediaId)
  expected = layer_units(segment|unit) count
  stored   = segment_meta count
  drifted  = expected !== stored

ensureSegmentMetaFreshForLayerMedia → drift 时 rebuildForLayerMedia + warn
```

## 3. 集成点

- `listSegmentSummaries`：scoped read 前 `ensureSegmentMetaFreshForLayerMedia`
- `SidePaneSidebarSegmentList`：hydration 补建时用 reconcile（非裸 catch）

## 4. 验证

- `vitest run src/services/segmentMetaReconcile.test.ts`
- `npm run check:segment-meta-sync-governance`
