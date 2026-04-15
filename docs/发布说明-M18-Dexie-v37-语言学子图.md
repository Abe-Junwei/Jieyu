> 文档角色：发布说明文档。本文记录 M18（Dexie v37）破坏性数据迁移、整库导入约束与验证门禁；若与后续代码状态发生偏移，以 `docs/adr/`、`docs/architecture/`、执行计划与仓库代码为准。

# 发布说明 — M18（Dexie v37：语言学子图 `unitId` + `utterances` 表移除）

## 破坏性变更摘要

- **本地数据库**：升级到 **Dexie schema v37** 时，会执行 **单次** `upgradeM18LinguisticUtteranceCutover`：将遗留 **`utterances`** 行合并为 **`layer_units`（`unitType='utterance'`）+ `layer_unit_contents`**，并把 **`utterance_tokens` / `utterance_morphemes`** 的外键从 **`utteranceId` 重写为 `unitId`**，随后 **物理删除 `utterances` 表**。
- **回滚**：应用内不提供降级读旧表。请用户在升级前 **导出备份或整库快照**；若需回退，恢复备份并安装升级前构建。

## 用户与协作端

- **整库 JSON 导入**：快照须为 **当前应用导出**（`layer_units` / `layer_unit_contents`；子图行使用 **`unitId`**）。含非空顶层 **`utterances`** 或子图 **`utteranceId`** 的旧归档会被 **`importDatabaseFromJson` 拒绝**。
- **协作 / 多端**：与共享库交互的客户端应视为 **与含 v37 的构建同世代**；旧客户端对 **已升级** 的库写入可能产生不一致（与 [ADR-006](./adr/adr-006-linguistic-subgraph-unitid-utterances-retirement.md) 一致：不承诺旧端长期互通）。

## 验证与门禁

- `npm run test:m18-linguistic-subgraph`
- `npm run gate:timeline-cqrs-full-migration`（含 architecture guard 与迁移相关测试）

## 相关文档

- [M18 行动方案](./execution/plans/M18-语言学子图-unitId-统一行动方案-2026-04-15.md)  
- [ADR-006 — Linguistic subgraph + `utterances` removal](./adr/adr-006-linguistic-subgraph-unitid-utterances-retirement.md)  
- [M18 命名与边界](./architecture/m18-linguistic-nomenclature.md)
