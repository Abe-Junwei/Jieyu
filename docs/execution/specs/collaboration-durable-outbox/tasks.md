---
title: collaboration-durable-outbox tasks
doc_type: execution-spec-tasks
status: active
owner: collaboration
last_reviewed: 2026-10-14
source_of_truth: collaboration-durable-outbox-spec
depends_on:
  - ./requirements.md
  - ./design.md
---

# Tasks — Collaboration durable outbox (B1a)

- [x] 每条操作独立键，ACK 只删该键；游标只增且不回写待发队列。
- [x] 旧 `jieyu:collab-client-state:v1` 与 singleton blob 只导入一次后删除。
- [x] 桥接按入队差异立即落盘；`initialOutboundPending: []` 不清除已存操作。
- [x] 业务写动作等待入队落盘。业务写与入队之间的崩溃仍属 B1b。
- [x] B1b：主库和协作状态库不能同事务。入队未完成时留下可恢复记录，并提示本地已保存、云同步未保证。崩溃发生在进入入队函数之前时，仍然没有这条记录。
- [ ] B2：云端插入幂等。不要用 `upsert` 替换现有 insert，revision 触发器会改写序号。
