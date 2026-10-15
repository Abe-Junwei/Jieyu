---
title: ADR 0054 - 出站协作留到以后的 Web 一程
doc_type: adr
status: accepted
owner: repo
last_reviewed: 2026-10-15
source_of_truth: decision-record
---

# ADR 0054：出站协作留到以后的 Web 一程

## 状态

accepted。不改 [ADR-0008](./0008-greenfield-indexeddb-export-collab-surface.md)。不把 [ADR-0046](./0046-desktop-sqlite-project-folder.md) 的存储接口当作本检出已有的实现。

## 背景

一次架构审查建议把出站持久化、重试和 ACK 收成一个运行时。试用地图把实时同步和 Supabase 云协作放在这一程之外，项目靠项目包交换，主路线图 C4 另行推进。

服务端重放同一个 `(project_id, client_id, client_op_id)` 不分配新的 `project_revision`。本地两条操作互不覆盖，ACK 只删除被确认的那一条。文件更集中并不是这些结果已经成立。

## 决策

1. 这一程不改出站协作代码，也不把它和当前的编辑或存储迁移排在同一实施顺序。
2. 以后的 Web 协作一程可以收拢出站运行时。成功标准是下面三条，不是文件职责更集中。
   - 请求在途：同一个 `clientOpId` 再发送，不产生新的修订号。
   - ACK 丢失：重启后用原来的 `clientOpId` 重放，服务器返回原来的修订号，客户端只删掉这一条。
   - 两条不同操作保持分开；确认一条不会清掉另一条。
3. 不声称 Dexie 里的项目数据和出站日记处在同一个事务里。
4. ADR-0008 的去重键 `(project_id, client_id, client_op_id)` 保持不变。

## 影响

- 架构审查不要再把出站运行时收拢排进这一程。
- 以后实施时，先用上面三条验收，再移动文件。

## 被放弃的备选方案

1. 这一程就把 hook、队列和客户端状态收成一个出站运行时。
2. 用「文件更集中」当作收拢已经完成的标准。
3. 把 Dexie 写入和出站日记写成同一个事务。
