---
title: sqlite-storage-port requirements
doc_type: execution-spec-requirements
status: draft
owner: repo
last_reviewed: 2026-10-24
source_of_truth: sqlite-storage-port-spec
---

# Requirements — sqlite-storage-port

## 1. What & Why

- **要做什么**：给存储接口加一个 better-sqlite3 实现。先覆盖本机 userData 里的回合和审计，再覆盖跨文件的说话人分配、一份文稿里的正则拆分、一份文稿里的轨道行、项目库里的来源记录、项目库里的录音行、去掉一条空录音，以及文稿改挂录音和同一份文稿里的语段关系，还有项目库里的会话和消息。桌面壳在开关打开时经一次 IPC 换上这个实现。
- **为什么现在做**：#275 的列形状和定义副本已经定完。ADR-0048 要求桌面写入走这个接口，并用同一组读回。
- **不做什么**：默认仍不安装。不把音频字节写进库，不删磁盘上的音频文件，不保存来源原件字节，不迁 #280 的直连调用。跨文稿关系拒绝写入，不另找地方存放。不打开文件选择器，不送系统垃圾箱。

## 2. 用户场景

1. 桌面进程把一轮 AI 回合写入本机库，关掉再打开，读到的是最后一次写入。开关打开时，这条写入从渲染进程走一次 IPC，主进程关掉再打开后仍能读回。
2. 审计行写入后能按 id 读回。说话人分配写进项目库和 `.jyd`，正则拆分和轨道行各写进一份 `.jyd`，来源记录和录音行写进项目库，去掉一条空录音先改文稿再改项目库，文稿改挂录音只替换这一份文稿上的那一条，语段关系和父子链接只写在同一份文稿里，会话和消息写在项目库里，锚点按已有的 `media_id` 计数，词按语段已有的 `text_id` 计数，审计列表读 userData 里已有的 `payload_json`，产物的创建时间写在项目库可空的 `created_at` 上，关掉再打开仍在。其余项目文件夹操作还没接到这个实现上，调用会失败而不是写进错误的库。

## 3. 验收标准

- [x] 回合写入、覆盖、删除、过期清理，关掉再打开读回。
- [x] 审计行写入后读回 id 和时间。
- [x] 说话人分配走这个接口。项目库和每一份 `.jyd` 各一次事务，提交后读回。
- [x] 正则拆分走这个接口。一份 `.jyd` 一次事务，提交后读回。
- [x] 轨道行走这个接口。一份 `.jyd` 一次事务，提交后读回。
- [x] 来源记录走这个接口。项目库一次事务，提交后读回。
- [x] 录音行走这个接口。项目库一次事务，提交后读回。音频字节不进这一行。
- [x] 另一项目的录音走这个接口。用已有的 `text_id` 辨认，不另加列。
- [x] 去掉一条空录音走这个接口。先改碰到的 `.jyd`，再改项目库，提交后读回。不删音频文件，不改 `meta.audio_id`。
- [x] 文稿改挂录音走这个接口。一份 `.jyd` 一次事务，提交后读回。再挂一条仍只剩这一条。
- [x] 语段关系和父子链接走这个接口。同一份 `.jyd` 一次事务，提交后读回。跨文稿不写。
- [x] 会话和消息走这个接口。项目库一次事务，提交后读回。引用和推理正文不进消息行。
- [x] 语段编号走这个接口。用 `.jyd` 里已有的 `id` 和 `text_id`，不读整份语段文档。
- [x] 另一项目的语段走这个接口。空的 `text_id` 不算另一项目。
- [x] 锚点计数走这个接口。用 `.jyd` 里已有的 `media_id`，不另加列。
- [x] 词计数走这个接口。连语段已有的 `text_id`，不另加列，不读整行。
- [x] 审计列表走这个接口。用已有的 `payload_json`，不另加列。
- [x] 产物走这个接口。项目库另加可空的 `created_at`，迁移不读这列，旧库不加列。空的创建时间拒绝读取。写入先提交产物，再提交审计；审计失败时产物留下。
- [ ] 其余项目库和 `.jyd` 上的业务操作走这个接口，一次操作一次事务，提交后读回。草稿在 [存储接口剩余方法](../../plans/sqlite-storage-port-remainder-2026-10-24.md)。接受前须核对基线，还没接受。
- [x] 桌面壳用 `installStoragePort` 换上这个实现。开关默认关，浏览器不安装。冒烟写入一条回合，关掉再打开读回。

## 4. 受影响代码地图

| 类别        | 文件 / 目录                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | 改动性质 |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| Schema / DB | `src/db/sqliteStoragePort.ts`、`src/db/sqliteSpeakerAssignment.ts`、`src/db/sqliteRegexSplit.ts`、`src/db/sqliteTrackEntity.ts`、`src/db/sqliteSourceRecords.ts`、`src/db/sqliteMediaItems.ts`、`src/db/sqliteRemoveEmptyRecording.ts`、`src/db/sqliteManuscriptAudio.ts`、`src/db/sqliteUnitLinks.ts`、`src/db/sqliteAiConversations.ts`、`src/db/sqliteLayerUnitIds.ts`、`src/db/sqliteAnchors.ts`、`src/db/sqliteUnitTokens.ts`、`src/db/sqliteAuditLogs.ts`、`src/db/sqliteAgentArtifacts.ts` | 新增     |
| 测试        | `src/db/sqliteStoragePort.test.ts`、`src/db/sqliteAiConversations.test.ts`、`src/db/sqliteLayerUnitIds.test.ts`、`src/db/sqliteAnchors.test.ts`、`src/db/sqliteUnitTokens.test.ts`、`src/db/sqliteAuditLogs.test.ts`、`src/db/sqliteAgentArtifacts.test.ts`、`src/db/ipcStoragePort.test.ts`、`src/desktop/skeleton/sqliteStorageHost.test.ts`                                                                                                                                                    | 新增     |

## 5. 已知风险与依赖

- 说话人分配同时改项目库里的说话人和 `.jyd` 里的语段，不是一个 SQLite 事务。顺序和列见 ADR-0071。
- 上游是 ADR-0048、ADR-0058、ADR-0061。
