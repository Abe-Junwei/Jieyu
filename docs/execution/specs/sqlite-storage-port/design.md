---
title: sqlite-storage-port design
doc_type: execution-spec-design
status: draft
owner: repo
last_reviewed: 2026-10-22
source_of_truth: sqlite-storage-port-spec
depends_on:
  - ./requirements.md
---

# Design — sqlite-storage-port

## 1. 成熟方案扫描 / Research

- 仓库既有最相似的模式：`src/desktop/skeleton/probeStore.ts` 用 better-sqlite3 的 `transaction` 做一次 BEGIN/COMMIT，提交后读回。迁移脚本用 `node:sqlite`，那是文件原型，不是这个接口。
- 同类产品 / 标杆实现：SQLite 作者和 better-sqlite3 都把一次事务写成同步函数，不把事务挂在多次 IPC 上。
- 业内 best practice / 事实标准 / 规范：SQLite 一个连接上的事务只覆盖那一个库文件。两份文稿、文件位置或系统垃圾箱用 ADR-0060 第 4 条的操作记录。说话人分配改的是项目库和一份文稿，各提交一次，见 ADR-0071。
- 公认不可行 / 反模式 / 已弃用方案：ADR-0048 已放弃 `node:sqlite` 和跨多次 IPC 持有事务。
- 潜在的坑：better-sqlite3 是原生模块，要跟 Electron 的 ABI 一起编译。userData 库不是 `.jyd`，不占用文稿的 `application_id`。
- 决定：**复用** better-sqlite3 的同步事务和现有 `StoragePort` 合同。userData 文件和项目文件夹由调用方传入。说话人分配不装成一个跨文件事务。正则拆分落在一份 `.jyd` 里，见 ADR-0072。轨道行也落在一份 `.jyd` 里，见 ADR-0073。来源记录落在项目库，见 ADR-0074。

## 2. 架构选择

- 落位类别：effect。写入在 `src/db/sqliteStoragePort.ts`，不进页面。
- 关键 trade-off：回合和审计属于一个库。说话人分配跨项目库和 `.jyd`，按 ADR-0071 分成多次提交，提交后读回。
- 拒绝的方案：把语段先写进 userData，迁就合同测试。那会和 ADR-0061 的文件分工相反。把两个库 ATTACH 成一个事务也不可用。

## 3. 落位清单

| 文件                                | 职责                                                                                                     | 复杂度估计 |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------- | ---------- |
| `src/db/sqliteStoragePort.ts`       | 打开 userData 库和可选的项目文件夹，转给回合、审计、说话人分配、正则拆分、轨道行和来源记录，其余方法拒绝 | < 240 行   |
| `src/db/sqliteSpeakerAssignment.ts` | 项目库和 `.jyd` 上的说话人分配                                                                           | < 360 行   |
| `src/db/sqliteRegexSplit.ts`        | 一份 `.jyd` 上的正则拆分                                                                                 | < 360 行   |
| `src/db/sqliteTrackEntity.ts`       | 一份 `.jyd` 上的轨道行写入和按项目列出                                                                   | < 280 行   |
| `src/db/sqliteSourceRecords.ts`     | 项目库上的来源记录登记、改名和关联                                                                       | < 320 行   |
| `src/db/sqliteStoragePort.test.ts`  | 关掉再打开读回，合同测试的种子是项目文件夹                                                               | 测试       |

约束自查：

- [x] 不新增 hook
- [x] 编排层不写库
- [x] 不引入 `src/features/…`
- [x] 不涉及面板

## 4. ADR 引用

- 相关 ADR：ADR-0048、ADR-0058、ADR-0060、ADR-0061、ADR-0069、ADR-0070、ADR-0071、ADR-0072、ADR-0073、ADR-0074
- 是否需要新建 ADR：说话人名单和语段种类见 ADR-0071。正则拆分的列和单文件事务见 ADR-0072。轨道行的项目编号、更新时间和单文件事务见 ADR-0073。来源记录的列和项目库事务见 ADR-0074。车道锁定表沿用 ADR-0069。来源不进定义副本，沿用 ADR-0070。库的分工沿用 ADR-0060 和 ADR-0061。

## 5. Feature flag

- 不换默认实现，所以不加 flag。桌面壳接上时再套。

## 6. 失败模式 / 兼容性

- 旧用户路径：浏览器仍用 Dexie。这个实现没有被 `installStoragePort` 装上。
- 读回失败抛 `StorageReadbackError`，不在提交后撤销。
