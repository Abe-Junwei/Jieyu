---
title: collaboration-project-snapshot-scope design
doc_type: execution-spec-design
status: active
owner: collaboration
last_reviewed: 2026-09-20
source_of_truth: collaboration-project-snapshot-scope-spec
depends_on:
  - ./requirements.md
---

# Design — Collaboration Project Snapshot Scope

## 1. 成熟方案扫描 / Research

- 仓库既有：`exportDatabaseAsJson` / `importDatabaseFromJson`（ADR-0008 整库备份）；`exportRecoveryDatabaseAsJson` 已按集合白名单裁剪；`deleteProjectCascade` 按 `textId` 删转写图；hydration 与 15 分钟自动快照误用整库 replace-all。
- 同类产品：FLEx 项目包与 LIFT 词库分文件；ELAN `.eaf` 不含本机其它转录；WeSay 词库独立。协作快照应对齐「一个项目文件」，不是本机 IndexedDB 全倾倒。
- 业内：CouchDB/PouchDB selector 复制、Firebase 按文档 ACL，都禁止用整库 dump 当项目副本。`navigator.storage.persist()` 是 Chrome/Firefox/Safari 对 IndexedDB 的标准保活请求（MDN StorageManager；失败/不支持则 false）。
- 公认不可行：Yjs/CRDT 第二写链（词典路线图与拍板禁止）；先 fail-close 快照却不给首台加入替代；把 DMLex/RO-Crate/Activity ledger 塞进热修；本地 tombstone 打脸 B3d 硬删。
- 潜在的坑：`layers` 的 import 非 replace-all 走 `insert`，必须先 prune 该 `textId` 的 `tier_definitions`；词条无 `textId`，若塞进快照会在 restore 时污染全局词库。
- 决定：**适配** 既有 schemaVersion 4 JSON + recovery 白名单思路 + cascade prune；**自研** 仅 `filterCollectionsForProject` / `importProjectScoped*`。词库口径 A（项目快照不含 lexeme）。不新增依赖。

## 2. 架构选择

- 落位：`actions`（export/import/prune）+ 既有 hook 换调用；`effect` 仅 persist() 启动。
- 选 A：prune 本项目行 + `importDatabaseFromJson` upsert，保留首台加入。
- 拒绝：整库 fail-close；新 AnnotationReadModel；给词条加 `projectId`（口径 C，另切片）。

## 3. 落位清单

| 文件 | 职责 | 复杂度 |
| --- | --- | --- |
| `src/db/projectScopedSnapshot.ts` | 过滤、prune、export/import | < 250 |
| `linguisticServiceDatabaseIo.ts` | 门面 | 薄 |
| `collaborationCloudHydration.ts` 等 | 换入口 | 数行 |
| `useTranscriptionCollaborationBridge.ts` | apply 后再 cursor | 数行 |
| `requestPersistentStorage.ts` | persist 特性检测 | < 30 |

约束自查：无 `src/features/`；无新 controller；编排层不写库。

## 4. ADR 引用

- 新 ADR-0034：协作项目快照不含全局目录（词库/语言资产）。
- ADR-0008 仍管用户整库备份（继续省略音频 blob）。

## 5. Feature flag

- 无新 flag。协作表面仍受 `collaborationCloudEnabled` + Supabase 配置门控。

## 6. 失败模式 / 兼容性

- 旧整库云快照：过滤后只写入当前 `textId`；词库行丢弃。
- persist() 不支持或拒绝：静默继续（易失风险仍在，不挡启动）。
- 回滚：revert PR；云上已上传的项目级快照仍可被过滤导入。

## 7. 验证矩阵

| 验证类型 | 命令 | 期望 |
| --- | --- | --- |
| typecheck | `npm run typecheck` | 0 errors |
| 持久化 | `npx vitest run src/db/projectScopedSnapshot.test.ts` 等 | pass |
| 守卫 | architecture-guard / docs-governance | OK |
