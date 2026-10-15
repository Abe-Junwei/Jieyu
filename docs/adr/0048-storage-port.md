---
title: ADR 0048 - 存储接口只暴露业务操作
doc_type: adr
status: accepted
owner: repo
last_reviewed: 2026-10-15
source_of_truth: decision-record
---

# ADR 0048：存储接口只暴露业务操作

## 状态

accepted。落实 [ADR-0046](./0046-desktop-sqlite-project-folder.md) 第 3 条。不改 [ADR-0006](./0006-dexie-transaction-scope-layer-graph.md) 对浏览器 Dexie 事务的约束。

## 背景

桌面真源是项目文件夹里的 `project.sqlite` 加 `media/`，浏览器构建用 Dexie。#274 还要定四件事：事务怎么表达、归属校验在哪一侧、IPC 一次调用做多少、方法是同步还是异步。已有的 AI 回合存储按业务操作暴露，但指纹用调用方能换成任意字符串的表名去查。审计写入还走旧的 collections 封装。

## 决策

1. 一次业务操作是一次事务，也是一次 IPC。接口上的每个方法返回 Promise。调用方不接收 begin/commit，也不传入事务回调。需要一起提交的多表写入写成这一个操作，由实现在内部开事务：浏览器里是一次 Dexie transaction，表清单遵守 ADR-0006；桌面里是主进程 better-sqlite3 的一次同步 BEGIN/COMMIT，包在这一次 IPC 里。渲染进程不跨多次 IPC 持有事务。批量是这个操作的数组参数。
2. 项目归属在持有数据库的那一侧检查。浏览器是 Dexie 实现；桌面是主进程，在执行 SQL 之前。渲染进程可以先检查以便提示，写入仍以实现侧的结果为准。对不上时抛出已有的 `CatalogOwnershipMismatchError`。没有项目归属的本机行（AI 回合、审计）不接收项目 id。
3. 方法名是业务操作，例如 `putTurn`、`insertAuditLog`、`fingerprintTarget`。不提供 `query(table, …)`，也不接受调用方传入的表名。指纹只在实现内部按固定种类查找：句段、层定义、句段内容、项目、词例。句段指纹的字符串保持 `layer_units:updatedAt` 并带上内容行，已经保存的审批指纹仍能比对。
4. 写入之后在同一次操作里读回。读回对不上抛出 `StorageReadbackError`。事务此时已经提交，调用方不得把这个错误当成「没写上」再去撤销。SQLite 实现（#275）必须通过同一组读回检查。本检出的实现是 Dexie，落在 `src/db/storagePort.ts`。既有直连数据库的模块由 #280 分批迁移。
5. `media/` 里的文件不进这条事务。文件的暂存和恢复由 #275 另定。

## 影响

- 新的存储操作加在这个接口上，并带 Dexie 的写入后读回测试。调用方经 `storagePort()` 取当前实现，桌面壳用 `installStoragePort` 换掉。合同测试在 `src/db/storagePortContract.ts`，只经接口写入和读回；#275 的 SQLite 实现跑同一个函数。
- Dexie 实现在事务里不得 await 非 Dexie 的 Promise（例如 `getDb()`）。那样会丢掉当前事务，后面的读写各自提交，外层事务最后报 `PrematureCommitError`。事务内调用的辅助函数接收 `db` 参数。
- 跨表样例：删除说话人（并入另一个说话人，或清空句段上的说话人）在一次 Dexie 事务里改句段行、删说话人行、改项目说话人名单，同项目检查也在事务里。名单写失败时整次回滚。这个操作还没挪到接口上，挪的时候跟 #275 一起。
- 主路线图 §2.1 的双实现读回，从 SQLite 实现存在之后，对走该接口的写路径生效。
- 审计插入和回合指纹走该接口。其余仍直接写 `audit_logs` 的调用留给 #280。

## 被放弃的备选方案

1. 渲染进程跨多次 IPC 持有事务。better-sqlite3 的事务是同步的，挂起等待下一次 IPC 会锁住主进程。
2. 用 `node:sqlite`。2026-10-14 已定 better-sqlite3。
3. 在本篇里迁移现有直连模块。那是 #280。
4. 指纹接受任意表名。SQLite 侧会变成按字符串拼查询。
