---
title: collaboration-project-snapshot-scope requirements
doc_type: execution-spec-requirements
status: active
owner: collaboration
last_reviewed: 2026-09-20
source_of_truth: collaboration-project-snapshot-scope-spec
---

# Requirements — Collaboration Project Snapshot Scope (C4 hot-fix)

## 1. What & Why

- **要做什么**：协作云项目快照只含当前 `textId` 的转写图；restore / 首台水合按项目 upsert+prune，禁止整库 `replace-all`；入站 apply 成功后再推进 cursor。
- **为什么现在做**：15 分钟自动快照走 `exportDatabaseAsJson()`，空库水合与面板 restore 走 `importFromJSON(..., 'replace-all')`，会把其它本地项目和全局词库卷进云端或冲掉。
- **不做什么**：不改用户整库备份 `downloadDatabaseAsJson`；不把 `lexemes` / 语言资产 / MCP 表纳入项目快照（口径 A）；不做 Yjs、tombstone、RO-Crate、DMLex；不把 `gate:collaboration-cloud` 接回 PR；不开语料/MCP/附件 flag。

## 2. 用户场景（≤ 3 条）

1. 本机已有项目 B 与词条 dog，加入/恢复项目 A 的云快照后，B 与 dog 仍在，A 的语段与快照一致。
2. 空库首台加入：只导入该项目转写图，不 `table.clear()` 全局表。
3. 远端 apply 抛错时，本地 last-seen revision 不前进。

## 3. 验收标准（可测）

- [ ] 项目快照 collections 不含 `lexemes` / `token_lexeme_links` / 其它项目的 `texts` / `layer_units`
- [ ] import 后其它 `textId` 行与 `lexemes` readback 仍在
- [ ] 快照中已删除的本项目 unit 在本地被 prune
- [ ] apply 失败不调用 `saveProjectLastSeenRevision` 到该 revision
- [ ] 启动路径特性检测调用 `navigator.storage.persist`（不支持则 no-op）
- [ ] 无新 feature flag

## 4. 受影响代码地图

| 类别 | 文件 / 目录 | 改动性质 |
| --- | --- | --- |
| Helper | `src/db/projectScopedSnapshot.ts` | 新增 filter / prune / export / import |
| Service 门面 | `linguisticServiceDatabaseIo.ts` | 包装 |
| Hook | `useCloudSyncAutoSnapshot.ts` / hydration / restore / bridge | 改调用 |
| Boot | `src/main.tsx` + `requestPersistentStorage.ts` | persist() |
| 测试 | `projectScopedSnapshot.test.ts` 等 | 新增 |

## 5. 已知风险与依赖

- 旧云端整库快照仍可 restore：导入前再按 `textId` 过滤，忽略词库与其它项目行。
- 词条不同步是显式口径，不是遗漏；与 B3d 硬删、无 `ProjectEntityType.lexeme` 一致。
- 不触编排层业务；hydration 仍在既有 cloud helper。
