---
title: collaboration-durable-outbox design
doc_type: execution-spec-design
status: active
owner: collaboration
last_reviewed: 2026-10-14
source_of_truth: collaboration-durable-outbox-spec
depends_on:
  - ./requirements.md
---

# Design — Collaboration durable outbox (B1a)

## 1. 成熟方案扫描 / Research

- 仓库既有最相似的模式：`jieyu_collab_client_state` 已是出站状态的 IndexedDB 镜像；主库 `jieyu` 在 `src/db/engine.ts` 冻结为 `version(1)`，新表要改 `JIEYU_BASELINE_STORES` 并牵动导入导出。
- 同类产品 / 标杆实现：Replicache、PowerSync 把待发变更做成按条 outbox，确认后按 id 删除，而不是整表重写。
- 业内 best practice / 事实标准 / 规范：IndexedDB 事务只覆盖同一个数据库；localStorage 的整键 read-modify-write 在多标签页会丢更新。
- 公认不可行 / 反模式 / 已弃用方案：继续把整个待发数组放进一个 JSON 键。`beforeunload` 不能当作落盘保证。
- 潜在的坑：localStorage 的「读到再写更大游标」仍有标签页竞态；IndexedDB 游标事务才是跨标签页的单调更新。配额溢出时同步读看不到只在 IndexedDB 里的操作。
- 决定：**适配** 现有 `jieyu_collab_client_state`，按操作加行。主库同一事务留到 B1b，本阶段做不到，因为两个 IndexedDB 不能共事务。

## 2. 架构选择

- 落位类别：`state`（每条操作一个键）与 `actions`（入队后等待该条落盘）。
- 关键 trade-off：
  - 沿用现有协作状态库并升级到 version 2，保留原来的 blob 表给一次性迁移。
  - 拒绝把表加进主库 `jieyu`：基线冻结，而且协作状态本来就不进项目包。

## 3. 落位清单

| 文件 | 职责（一句话） | 复杂度估计（行 / hooks） |
| --- | --- | --- |
| `src/collaboration/cloud/CollaborationClientStateStore.ts` | 每条操作一个 localStorage 键，游标单独只增 | < 400 / 0 hooks |
| `src/collaboration/cloud/CollaborationClientStateStore.idb.ts` | 同库按条镜像，游标事务只增 | < 150 |
| `src/collaboration/cloud/CollaborationSyncBridge.ts` | 入队差异立即落盘，空初始队列不删已存操作 | < 30 行增量 |

约束自查：

- 编排层没有新业务。`createCloudSyncedWriteActions` 只是等待已有入队调用。
- B1b 若要和业务行同事务，必须先把 outbox 移进主库，或对用户说明云同步未保证。
