---
title: collaboration-durable-outbox requirements
doc_type: execution-spec-requirements
status: active
owner: collaboration
last_reviewed: 2026-10-14
source_of_truth: collaboration-durable-outbox-spec
---

# Requirements — Collaboration durable outbox (B1a)

## 1. What & Why

- **要做什么**：已经进入出站队列的协作操作按条留下，刷新、崩溃或另一个标签页不能整包冲掉；确认发出的操作只删自己；游标不倒退。
- **为什么现在做**：出站队列在内存里，500ms 后整包写入同一个 localStorage 键。两个标签页互相覆盖，崩溃会丢掉还没落盘的操作，旧镜像还会把已经发出的操作写回来。
- **不做什么**：不保证「本地业务写成功、但还没入队」这段窗口（B1b）。不改云端 `project_changes` 插入，不做 ACK 丢失后的幂等（B2）。不把出站表放进主库 `jieyu`。

## 2. 用户场景（≤ 3 条）

1. 两个标签页各入队一条操作，刷新后两条都还在。
2. 一条操作已经发出，另一条还在；崩溃或旧镜像恢复后，发出的那条不会回来。
3. 协议禁止写云时，空的初始队列不得清掉已经落盘的操作。

## 3. 验收标准（可测）

- 同一项目两条不同 `(clientId, clientOpId)` 先后写入后都能读回；删除一条后另一条还在。
- 较小的游标写入不会覆盖较大的游标。写入游标不会改写待发操作。
- `jieyu:collab-client-state:v1` 只导入一次，之后再出现也不恢复已删除的操作。
- `initialOutboundPending: []` 启动后，存储里的待发操作还在，且不会被发送。

## 4. 范围

- 改：`CollaborationClientStateStore`、其 IndexedDB、`CollaborationSyncBridge`、`createCloudSyncedWriteActions` 等待入队落盘。
- 不改：主库 schema、Supabase SQL、冲突策略。
