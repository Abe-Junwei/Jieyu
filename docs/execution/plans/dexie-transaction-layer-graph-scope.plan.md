---
title: Dexie 事务列全表（转写层图）— 执行清单
doc_type: execution-plan
status: completed
owner: repo
last_reviewed: 2026-04-18
source_of_truth: execution-plan
adr: docs/adr/0006-dexie-transaction-scope-layer-graph.md
---

# Dexie 事务列全表（转写层图）— 执行清单

本文是 [ADR-0006](../../adr/0006-dexie-transaction-scope-layer-graph.md) 的 **可勾选执行计划**；审计表/基线报告完成后可移至 `docs/execution/audits/` 或在本文件保留历史勾选记录。

## 0. 前置

- [x] 阅读 ADR-0006（决策 1～2、落地阶段、验证门禁）。
- [x] 约定：以 `rg 'dexie\\.transaction'`（及必要时 `Transaction` 包装）生成 **全量打开点清单**，每个打开点维护「声明 stores ↔ 回调 callee」两行说明。

## 1. 代码库打开点（基线；实施前重新生成）

下列路径来自 2026-04-18 检索与本轮收口；**后续 schema 变更时请重新 `rg`**。

| 优先级 | 路径 |
|--------|------|
| P0 | `src/services/LinguisticService.ts` |
| P0 | `src/hooks/useTranscriptionUnitActions.ts` |
| P0 | `src/ai/chat/localContextTools.ts` |
| P1 | `src/services/LayerSegmentationV2Service.ts` |
| P1 | `src/services/LayerSegmentationTextService.ts` |
| P1 | `src/services/LayerSegmentGraphService.ts` |
| P1 | `src/services/LayerUnitService.ts` |
| P2 | `src/services/SegmentMetaService.ts` |
| P2 | `src/services/WorkspaceReadModelService.ts` |
| P2 | `src/services/LinguisticService.tiers.ts` |
| P3 | `src/services/TrackEntityStore.ts` |
| P3 | `src/db/io.ts` |
| P3+ | `src/services/LinguisticService.languageCatalog.ts` |
| P3+ | `src/services/LinguisticService.orthography.ts` |

**P3 备注**：`TrackEntityStore` 仅存 UI 轨道状态（`dexieStoresForTrackEntitiesRw`），与 layer graph 无关，仍采用同一集中声明模式。`io.ts` 的 JSON 导入使用 **单事务 + Dexie 表动态并集**（含 `tier_definitions` 与 `tableByCollection` 全部表），已在源码注释标 ADR-0006，**非窄事务缺口**。

## 2. 每个打开点的审计列（复制到表格中）

对每一行 `db.dexie.transaction(...)`：

1. **模式**：`r` / `rw`、是否 `async` 回调。  
2. **已声明 stores**：列出表名。  
3. **回调内直接访问的表**：`db.dexie.<table>`。  
4. **`await` 的本项目函数**：向下 1～2 层是否触及 `LayerSegmentQueryService` / `LayerSegmentGraphService` / `getUnitDocProjectionById` / `listUnitDocsFromCanonicalLayerUnits` / 直接 `layer_units` 等。  
5. **缺口**：若 4 触及表 ∉ 3 → **必须**扩写 3 或拆分事务（禁止长期依赖 `waitFor` 作为唯一修复）。  
6. **备注**：RxDB `db.collections.*` 与 Dexie 混用时的边界说明。

## 3. 工程任务（与 ADR 阶段对齐）

- [x] **阶段 0**：新增 store 常量模块（ADR 决策 2）——`src/db/dexieTranscriptionGraphStores.ts` 并由 `src/db/index.ts` 导出；PR 模板待补。  
- [x] **阶段 1（P0）**：`LinguisticService.deleteAudio`、`localContextTools.get_unit_linguistic_memory` 事务、`useTranscriptionUnitActions` hydrate 读事务已改为使用集中 store 列表；相关 vitest 已通过。  
- [x] **阶段 2**：完成 P1 五处审计与修改 + 单测（`LayerSegmentationV2Service`、`LayerSegmentationTextService`、`LayerSegmentGraphService`、`LayerUnitService` 使用 `dexieTranscriptionGraphStores` 集中声明；相关 vitest 已通过）。  
- [x] **阶段 3**：完成 P2 审计（`SegmentMetaService`、`WorkspaceReadModelService`、`LinguisticService.tiers` 使用 `dexieTranscriptionGraphStores` 集中声明；`rebuildForLayerMedia` 先读后写两段事务已在代码注释冻结）。  
- [x] **阶段 4**（可选）：已评估；**保留** `LayerSegmentQueryService` / `LayerSegmentGraphService` 的 `Dexie.waitFor` 分支并补充源码注释与 ADR-0006「阶段 4」结论；退役条件见 ADR。  

## 4. 验证门禁

- [x] 定向 vitest：`LayerSegment*`、`LinguisticService`（含 tier 子集）、`SegmentMetaService`、`WorkspaceReadModelService`、`LayerUnitService` 等相关用例已跑通；全量 `npm run test` 含多项 CSS/i18n 门禁，非本专项必跑。  
- [x] **窄事务 + 真实 API**：`LayerSegmentGraphService.test.ts` 中「`segment_meta` 窄事务内调用 `getUnitDocProjectionById`」用例已覆盖 ADR-0006「验证」第 2 条意图。  
- [x] `npm run check:docs-governance`。

## 5. 完成定义（Definition of Done）

- [x] 打开点均已迁移集中声明、拆事务或文档免检备注（见 §1「P3 备注」与 `io.ts` 注释）；无未记录的窄事务缺口。  
- [x] ADR-0006「后续回顾点」三项已勾选（见 ADR 正文）。
