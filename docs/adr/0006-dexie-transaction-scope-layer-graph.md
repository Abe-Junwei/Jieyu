---
title: ADR-0006 Dexie 事务作用域与转写层图（layer graph）访问规范
doc_type: adr
status: accepted
owner: repo
last_reviewed: 2026-04-18
source_of_truth: decision-record
---

# ADR-0006 Dexie 事务作用域与转写层图（layer graph）访问规范

## Status

Accepted（规范目标：**第一层**——在 `db.dexie.transaction` 声明中列全回调体内会访问的 object store；实现按本文「落地阶段」渐进完成。2026-04-18 起主要调用方已迁移至 `dexieTranscriptionGraphStores`；`storeNames` 检测 + `Dexie.waitFor` 仍保留为兼容窄事务的读取安全网，见「阶段 4」结论。）

## Context

IndexedDB 要求：在某一 `IDBTransaction` 上只能打开其 **scope 内** 的 object store。Dexie 将其暴露为 `Table … not part of transaction`，并在异步事务与并行访问组合不当时出现 `PrematureCommitError` 等次生问题。

解语转写层以 **`layer_units` / `layer_unit_contents` / `unit_relations` / `speakers`**（及派生读模型 **`segment_meta`** 等）构成「canonical layer graph」相关数据面。业务代码常在 **较窄** 的 `db.dexie.transaction('rw', db.dexie.segment_meta, …)` 等事务内，通过 service 间接访问未声明的表；在 Safari 等环境下易触发作用域错误。

**易错实现（不作为长期规范）**：用 `Transaction.table(name)` 判断「当前事务是否包含某表」——Dexie 实现中该路径依赖整库 schema，**不能**等价于「当前 IDB transaction 的 object store 列表」，会导致误判。

## 决策 1（规范）：事务声明必须覆盖回调内的全部 Dexie 访问

1. **凡** `db.dexie.transaction(mode, …stores, async () => { … })`（或等价的 `Dexie.transaction`）的 **回调体及其 `await` 到的本项目代码**，只要会访问某张 Dexie 表（含 hook、下游 service），该表 **必须** 出现在该次事务的 **store 列表**中（`r` / `rw` 与实际写操作一致）。
2. **禁止**依赖「未声明表 + 运行时魔法补救」作为**唯一**正确性手段；库内 `Dexie.waitFor` / `ignoreTransaction` 仅可作为 **过渡期安全网** 或 **极少数** Dexie 文档明确场景，且须在代码注释中标注依据与退役条件。
3. **判断「当前事务是否已包含某 store」**时，以 Dexie `Transaction.storeNames`（及运行时的 `DOMStringList` / 数组形态）为准，**不得**用 `transaction.table(name)` 的存在性代替 IDB scope 判断。

## 决策 2（工程）：集中定义「转写层图」相关 store 常量

在 `src/` 内增加 **仅表名 / 表引用常量** 的模块（具体路径实现时选定），按场景拆分，例如：

| 常量（示例名） | 典型用途 |
|----------------|----------|
| 只读投影：`layer_units` + `layer_unit_contents` + `speakers` | 与 `getUnitDocProjectionById` 等读模型一致 |
| 写转写图：`layer_units` + `layer_unit_contents` + `unit_relations`（按需扩展） | segment 级联、split/merge 等 |
| 段元数据重建读：`layer_units` + `layer_unit_contents` + `user_notes` + `speakers`（以 `SegmentMetaService.rebuildForLayerMedia` 为准） | 与现有读路径对齐 |

**目的**：减少 PR 中「漏写一张表」；变更读模型时单点更新。

## 被放弃的备选方案（不作为规范终点）

- **仅第二层**：`storeNames` 检测 + `Dexie.waitFor` / `ignoreTransaction` 自动跨表读。  
  - 与 Dexie **主文档**表述一致：官方首推仍是 **声明全表**；`waitFor` 为补充工具。  
  - 语义上接近「并行读」，与「单事务读写一致」不完全等价。

## 影响

- **正面**：消除或显著收敛 `Table … not part of transaction`、误用并行读导致的 `PrematureCommitError`、跨浏览器 `Dexie.currentTransaction` 时序差异类问题；事务边界即文档，利于 code review。  
- **成本**：需对现有 `db.dexie.transaction` 做 **静态审计**；部分路径可能扩大 store 列表或拆分「读阶段 / 写阶段」事务，需评估持锁时间。  
- **测试**：在「窄事务包裹真实 API」的用例下回归；见下文「验证」。

## 落地阶段（执行顺序建议）

以下阶段可在 `docs/execution/plans/` 另建里程碑 checklist；本 ADR 只固定顺序与范围。

### 阶段 0 — 约定与常量

- 新增 store 常量模块（见决策 2）；PR 规范：**改事务回调必须同步更新 store 列表或常量引用**。
- 团队对齐：禁止在「仅声明 A 表」的事务内 `await` 可能访问未声明表的 service（除非已扩表或已拆出事务）。

### 阶段 1 — 高风险路径优先

优先处理 **「异步事务 + 窄 store 列表 + 可能调用转写层 service」** 的组合，例如（以当前仓库检索为基线，实施时重新 `rg` 核对）：

- `src/services/LinguisticService.ts`
- `src/hooks/useTranscriptionUnitActions.ts`
- `src/ai/chat/localContextTools.ts`

### 阶段 2 — 转写专用服务扫尾

- `src/services/LayerSegmentationV2Service.ts`
- `src/services/LayerSegmentationTextService.ts`
- `src/services/LayerSegmentGraphService.ts`
- `src/services/LayerUnitService.ts`

### 阶段 3 — 读模型与段元数据

- `src/services/SegmentMetaService.ts`（若未来在 **仅** `segment_meta` 的写事务内直接读 `layer_units`，须合并为同一 `rw` 并扩表；或保持「写前已在别的事务读完」并在注释中冻结该约定）
- `src/services/WorkspaceReadModelService.ts`
- `src/services/LinguisticService.tiers.ts`（Dexie 事务与 `db.collections.*` 混用时单独标注 scope）

### 阶段 4 — 安全网退役（可选）

- 全量审计通过后：评估删除或弱化 `LayerSegmentQueryService` / `LayerSegmentGraphService` 中的 `Dexie.waitFor` 分支，仅保留「无外层事务时的直读」路径。

**结论（2026-04-18）**：在调用方事务已系统性扩表的前提下，仍保留 `waitFor` 分支作为 **兼容遗留窄事务与第三方回调** 的读取安全网；避免误删后在边缘组合下回归 Safari `Table … not part of transaction`。退役条件：代码库内已无外层窄事务依赖 graph 读 API 的路径、且定向回归（含 `LayerSegmentGraphService` 窄事务用例）全绿后，再开 ADR 修订移除。

## 验证（门禁）

1. 现有相关单测：`LayerSegment*`、`LinguisticService`、`SegmentMetaService`、`LayerSegmentationTextService` 等保持通过。  
2. **定向用例**：在「调用方 `db.dexie.transaction` 仅声明部分表」的场景下调用会触及 `layer_units` 等的真实 API，断言不再出现 `Table … not part of transaction`（实现上应通过 **扩写调用方事务** 满足，而非依赖安全网）。  
3. 文档治理：新增或修改本 ADR 后执行 `npm run check:docs-governance`。

## 后续回顾点

- [x] 常量模块已落地且调用方已迁移引用（`src/db/dexieTranscriptionGraphStores.ts` + `src/db/index.ts`）。  
- [x] `rg "dexie\\.transaction"` 打开点已收口到执行计划表与集中声明；细粒度 callee 矩阵见 `docs/execution/plans/dexie-transaction-layer-graph-scope.plan.md`。  
- [x] 安全网（`waitFor`）：**现阶段保留**（见「阶段 4」结论）；若未来移除，须新 ADR 或修订本 ADR 并补充回归说明。  

## 参考（Dexie 官方）

- 事务 API：<https://dexie.org/docs/Dexie/Dexie.transaction()>
- `PrematureCommitError`：<https://dexie.org/docs/DexieErrors/Dexie.PrematureCommitError>
- Safari / IndexedDB 说明：<https://dexie.org/docs/IndexedDB-on-Safari>
