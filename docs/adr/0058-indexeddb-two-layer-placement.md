---
title: ADR 0058 - 八个 IndexedDB 库归到项目文件夹、userData，或桌面版不要
doc_type: adr
status: accepted
owner: repo
last_reviewed: 2026-10-15
source_of_truth: decision-record
---

# ADR 0058：八个 IndexedDB 库归到项目文件夹、userData，或桌面版不要

## 状态

accepted。落实 [ADR-0046](./0046-desktop-sqlite-project-folder.md) 第 4 条和 [ADR-0047](./0047-desktop-build-strips-collab-keys-telemetry.md)。项目文件夹里的行再分到项目库和卡片文件，见 [ADR-0060](./0060-card-file-ownership-and-operations.md)；下面的决策正文不改。表名以代码里的 `JIEYU_MAIN_TABLE_REGISTRY` 为准，本篇不另抄一份表清单。

## 背景

浏览器里项目数据在 IndexedDB。桌面版改成项目文件夹 `project.sqlite` + `media/`，偏好和可重建数据放 Electron `userData`。#279 要求把点名的 8 个库逐库归层，并核对 ADR-0044 里曾经全局的覆盖行。localStorage 键同样归层。

现行主库名是 `jieyu`（`JIEYU_DEXIE_DB_NAME`）。`jieyudb_v2` 不再打开，只作为旧数据提示的删除标记。

## 决策

1. 点名的 8 个库这样归：

| 库 | 对象库 | 归层 |
| --- | --- | --- |
| `jieyudb_v2` | 现行代码不再定义。只作删除标记 | 桌面版不要 |
| `jieyu_pre_migration_backups` | 现行代码不再定义。只作删除标记 | 桌面版不要 |
| `jieyu-project-memory` | `projectMemory`（键是 `projectId`：已确认术语、短语、说话人摘要、领域词） | 项目文件夹 |
| `jieyu-voice-sessions` | `sessions` | userData |
| `jieyu-user-behavior` | `actionRecords`、`userBehaviorProfiles`、`taskPhaseRecords`、`difficultSegments` | userData |
| `jieyu_recovery` | `snapshots` | userData 的 `backups/` |
| `jieyu-acoustic-analysis` | `entries` | userData |
| `jieyu_collab_client_state` | `blobs`、`ops`、`cursors` | 桌面版不要 |

2. 主库 `jieyu` 的每一张表按 `JIEYU_MAIN_TABLE_REGISTRY` 的 `dataClass` 归层：

| dataClass | 归层 |
| --- | --- |
| `project_content`、`project_catalog`、`project_ai` | 项目文件夹 |
| `derived`、`audit_log`、`private_log`、`user_preference`、`recovery` | userData |
| `credential` | 桌面版进系统钥匙串，不进项目文件，也不进 localStorage |
| `collab_state` | 桌面版不要 |

3. 登记表里另有两个恢复库，和 `jieyu_recovery` 同一层：`jieyu_migration_snapshots`、`jieyu_overwrite_snapshots` 放 userData 的 `backups/`。
4. 别人传来的 JYM / JYT 仍丢弃 `project_ai`、凭据和审计。项目文件夹里可以有本机的项目 AI；复制文件夹会把它一起带走。这不改变导入丢弃规则。
5. 行为库和语音会话留在本机 userData，不上传。ADR-0047 的同意框只约束崩溃上报。
6. ADR-0044 点过的三类覆盖行都已经按项目归属，没有跨项目共用的一行：
   - 语言覆盖和自定义语言在 `languages`（及显示名、别名、历史），`textId` 为归属。自定义 id 形如 `user:`。内置语言代码在代码里，不是库中的全局行。
   - 内置正字法的覆盖行在 `orthographies`，保留内置 id，并写入当前项目的 `textId`。内置种子在代码里。
   - LIFT / 词条在 `lexemes`，`textId` 为归属。
7. localStorage：`USER_PREFERENCE_KEYS`（`src/services/userPreferencesBackup.ts`）是用户偏好，归 userData。带密钥的键（声学外部 apiKey、商业语音、`jieyu.aiChat.settings.secure`）归钥匙串。协作键（`jieyu:collab-` 前缀）和旧迁移标记（`jieyu.backup.preMigrationSnapshot:`、`jieyu.backup.preMigrationSnapshotFailure:`）桌面版不要。其余缓存和私有日志归 userData，不进项目文件夹。

## 影响

- #275 建 `project.sqlite` 时只纳入第 2 条的项目文件夹类，外加 `model_runs`（[ADR-0057](./0057-model-interface-transcribe.md)）。
- #276 不打包协作库，不把密钥写进偏好文件。
- #280 迁模块时，读写落点跟本篇的层，不跟现在的 IndexedDB 文件名。

## 被放弃的备选方案

1. 把 `jieyu-project-memory` 放进 userData。术语表是项目知识，跟项目走。
2. 把行为库当成遥测删掉。它只留在本机。
3. 在本篇按表名再抄一份主库清单。登记表改了，抄本会对不上。
