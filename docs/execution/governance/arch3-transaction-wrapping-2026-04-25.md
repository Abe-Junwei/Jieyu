# ARCH-3：IndexedDB 多表写与事务包装 — 收口说明（**已关门：services 写路径边界**）

> **doc_type**：execution-governance  
> **对账**：`docs/remediation-plan-2026-04-24.md` §3.3、门面 `src/db/withTransaction.ts`、表集合 `src/db/dexieTranscriptionGraphStores.ts`（ADR-0006）  
> **last_updated**：2026-04-24

## 1. 关门边界

- **本次关门范围**：`src/services/**` 下生产写路径（排除 `*.test.*`），以主业务 `Dexie` 写链为准。
- **验收标准**：凡涉及**多表写**或**同一业务动作的跨表级联写**，要么落在 `withTransaction` / `withWriteTransaction` 边界内，要么明确委托给已带事务的下层 helper。
- **不纳入本次边界**：
	- `src/services/SnapshotService.ts` 这类独立恢复库（`jieyu_recovery`）的单表写。
	- `src/services/**` 内仅单表写的路径。
	- `src/hooks/**`、`src/utils/**`、`src/ai/**` 中的读事务或非服务层工具代码；这些不再作为 **ARCH-3** 关门阻塞，而由常规代码评审与后续 feature 守卫处理。

以上边界已人工审计完成；因此 **ARCH-3** 以“services 写路径边界”口径关门。后续新增跨表写若进入 `src/services/**`，按同一标准纳入常规变更审查，不再保留为当前未落地项。

## 2. 已落地的部分（可复用、免重复造轮子）

- **原则**：不追求无意义的外层再包 `withTransaction`（已有外层事务时内层用直接 `bulkPut` / 子调用即可）；见 `remediation` §3.3 对 `restoreLayerSegmentGraphSnapshot` 等路径的说明。
- **门面**：`withTransaction` / `withReadTransaction` / `withWriteTransaction`（`src/db/withTransaction.ts`），异常附加 `label` 前缀。
- **转录图主线**：`deleteLayerUnitGraphByRecordIds`、无外层时的 `bulkUpsertLayerSegmentGraph` / `upsertSegmentGraph`、`deleteLayerSegmentGraphBySegmentIds`、`removeUnitTextFromSegmentationV2` 等 — 与 `remediation` §3.3 逐条一致。
- **canonical unit 双表写**：`upsertUnitLayerUnit` / `bulkUpsertUnitLayerUnits` 现已用 `withTransaction(...layer_units + layer_unit_contents...)` 收口，避免 `saveUnit` / `saveUnitsBatch` 中途只落一张表。
- **音频首次绑定链路**：`LinguisticService.importAudio` 的占位晋升 / 重映射 / `texts` 元数据更新现包进单个 `rw` 事务；`remapLayerUnitsAndAnchorsForFirstAcousticImport` 去掉内部显式事务以复用外层原子边界。
- **tier definition CRUD**：`saveTierDefinition` / `removeTierDefinition` 已补 `tier_definitions + tier_annotations + anchors + audit_logs` 的事务边界，修复定义行、级联删除与审计日志的原子性。
- **其它 services 域**：语言目录、正字法桥、音轨实体、读模型等多表写路径已核对为“已包事务”或“单表写可接受”。

## 3. 单测与可测性

- `src/db/withTransaction.test.ts`：门面基础行为。  
- `src/services/LayerUnitSegmentWriteService.test.ts`：`deleteLayerUnitGraphByRecordIds`、`upsertSegmentGraph` 单 rw 事务（标注 ARCH-3）。  
- `src/services/LayerSegmentGraphService.test.ts`：`deleteLayerSegmentGraphBySegmentIds` 原子性（ARCH-3）。
- `src/services/LinguisticService.test.ts`：`saveUnit`、`saveUnitsBatch`、`importAudio` 的事务回滚回归（ARCH-3）。
- `src/services/LinguisticService.test.ts`：`saveTierDefinition`、`removeTierDefinition` 的事务回滚回归（ARCH-3）。

## 4. 工程守卫（非 CI 必跑项时可作本地/PR 用）

- `scripts/check-db-transaction-facade.mjs`：鼓励用 `withTransaction` 替代裸 `db.dexie.transaction`（见脚本说明）。  
- `scripts/check-segmentation-storage-boundary.mjs`：segment 层存储边界与事务相关模式约束。

## 5. 后续治理约束

1. `src/services/**` 新增多表写时，默认使用 `withTransaction` + 明确 `label`。
2. 能复用的 store 集合继续沉到 `src/db/dexieTranscriptionGraphStores.ts`。
3. `scripts/check-db-transaction-facade.mjs` 继续约束 services 层不得直接写裸 `db.dexie.transaction(...)`。

## 6. 变更记录

| 日期 | 说明 |
| --- | --- |
| 2026-04-24 | 按 `src/services/**` 生产写路径为显式审计边界完成收口，**ARCH-3 关门**。 |
| 2026-04-24 | canonical unit 双表写与 `importAudio` 首次绑定链路补齐事务边界，并补 `LinguisticService.test.ts` 回滚用例。 |
| 2026-04-24 | `saveTierDefinition` / `removeTierDefinition` 补齐事务边界，并补 `LinguisticService.test.ts` 回滚用例。 |
