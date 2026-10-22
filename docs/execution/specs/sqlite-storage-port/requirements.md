---
title: sqlite-storage-port requirements
doc_type: execution-spec-requirements
status: draft
owner: repo
last_reviewed: 2026-10-22
source_of_truth: sqlite-storage-port-spec
---

# Requirements — sqlite-storage-port

## 1. What & Why

- **要做什么**：给存储接口加一个 better-sqlite3 实现。先覆盖本机 userData 里的回合和审计，再覆盖跨文件的说话人分配、一份文稿里的正则拆分、一份文稿里的轨道行，以及项目库里的来源记录。
- **为什么现在做**：#275 的列形状和定义副本已经定完。ADR-0048 要求桌面写入走这个接口，并用同一组读回。
- **不做什么**：这一轮不安装成默认实现，不写录音这些还没接上的操作，不保存来源原件字节，不迁 #280 的直连调用。

## 2. 用户场景

1. 桌面进程把一轮 AI 回合写入本机库，关掉再打开，读到的是最后一次写入。
2. 审计行写入后能按 id 读回。说话人分配写进项目库和 `.jyd`，正则拆分和轨道行各写进一份 `.jyd`，来源记录写进项目库，关掉再打开仍在。其余项目文件夹操作还没接到这个实现上，调用会失败而不是写进错误的库。

## 3. 验收标准

- [x] 回合写入、覆盖、删除、过期清理，关掉再打开读回。
- [x] 审计行写入后读回 id 和时间。
- [x] 说话人分配走这个接口。项目库和每一份 `.jyd` 各一次事务，提交后读回。
- [x] 正则拆分走这个接口。一份 `.jyd` 一次事务，提交后读回。
- [x] 轨道行走这个接口。一份 `.jyd` 一次事务，提交后读回。
- [x] 来源记录走这个接口。项目库一次事务，提交后读回。
- [ ] 其余项目库和 `.jyd` 上的业务操作走这个接口，一次操作一次事务，提交后读回。
- [ ] 桌面壳用 `installStoragePort` 换上这个实现。

## 4. 受影响代码地图

| 类别        | 文件 / 目录                                                                                                                                                      | 改动性质 |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| Schema / DB | `src/db/sqliteStoragePort.ts`、`src/db/sqliteSpeakerAssignment.ts`、`src/db/sqliteRegexSplit.ts`、`src/db/sqliteTrackEntity.ts`、`src/db/sqliteSourceRecords.ts` | 新增     |
| 测试        | `src/db/sqliteStoragePort.test.ts`                                                                                                                               | 新增     |

## 5. 已知风险与依赖

- 说话人分配同时改项目库里的说话人和 `.jyd` 里的语段，不是一个 SQLite 事务。顺序和列见 ADR-0071。
- 上游是 ADR-0048、ADR-0058、ADR-0061。
