---
title: 协作 Runtime 角色地图
doc_type: architecture-current-state
status: active
owner: collaboration
last_reviewed: 2026-04-18
source_of_truth: current-state
---

# 协作 Runtime 角色地图

> 说明各 `src/collaboration/*Runtime.ts` 与 `src/collaboration/cloud/*` 的职责边界，避免「幽灵模块」误用。

## 生产路径（转写 + Supabase 云）


| 模块                                                                                                         | 角色                                                                                                       |
| ---------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `[collaborationConflictRuntime.ts](../../src/collaboration/collaborationConflictRuntime.ts)`               | 入站变更冲突检测、LWW/人工仲裁策略、`createConflictResolutionLog`、M5 指标 `business.collaboration.conflict_resolved_count` |
| `[collaborationRulesRuntime.ts](../../src/collaboration/collaborationRulesRuntime.ts)`                     | 仲裁票据、`appendOperationLog`、与 `collaborationOpLog` 配合                                                      |
| `[collaborationOpLog.ts](../../src/collaboration/collaborationOpLog.ts)`                                   | 协作域操作日志结构（含 `conflict_resolved` 的 `traceId` 审计字段）                                                        |
| `[cloud/CollaborationSyncBridge.ts](../../src/collaboration/cloud/CollaborationSyncBridge.ts)`             | Realtime `project_changes`、出站队列、资产/快照/审计查询                                                               |
| `[cloud/CollaborationPresenceService.ts](../../src/collaboration/cloud/CollaborationPresenceService.ts)`   | Presence 频道 + `upsertCollaborationPresenceRecord` 落 `project_presence`                                   |
| `[cloud/CollaborationDirectoryService.ts](../../src/collaboration/cloud/CollaborationDirectoryService.ts)` | `projects` / `project_members` 目录只读查询                                                                    |
| `[cloud/collaborationSupabaseFacade.ts](../../src/collaboration/cloud/collaborationSupabaseFacade.ts)`     | 对 `integrations/supabase` 的单一 re-export，供 hooks 与 cloud 层使用                                              |


## 门禁 / 契约测试（非云生产主路径）


| 模块                                       | 角色                                           |
| ---------------------------------------- | -------------------------------------------- |
| `collaborationBetaRuntime.ts`            | M10 beta 契约与 gate 报告                         |
| `collaborationCrossDeviceRuntime.ts`     | M11 跨设备 gate                                 |
| `collaborationMultiReplicaRuntime.ts`    | M12 多副本 gate                                 |
| `collaborationTransactionSyncRuntime.ts` | M13 事务同步 gate                                |
| `collaborationPromotionRuntime.ts`       | M14 汇总 gate（现已串联 `gate:collaboration-cloud`） |


上述 Runtime **不**被 `useTranscriptionCloudSyncActions` 直接 import；其价值在 **Vitest + `gate:m8`–`gate:m14` 脚本链** 中的回归契约。

## 相关执行方案

- [协作云桥接审查改进方案-2026-04-18.md](../execution/plans/协作云桥接审查改进方案-2026-04-18.md)
- [托管实时协同-Supabase完整落地方案-2026-04-17.md](../execution/plans/托管实时协同-Supabase完整落地方案-2026-04-17.md)