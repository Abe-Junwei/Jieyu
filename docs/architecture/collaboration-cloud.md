---
title: 托管协作云（Supabase）现状基线
doc_type: architecture-current-state
status: active
owner: collaboration-cloud
last_reviewed: 2026-09-20
source_of_truth: current-state
---

# 托管协作云（Supabase）现状基线

> 文档角色：长期有效的当前现状文档。最后更新：2026-09-20。

## 数据流（摘要）

1. **本地编辑**：`useTranscriptionData` → `useTranscriptionCloudSyncActions`（包装 `wrappedActions`）→ `useTranscriptionCollaborationBridge.enqueueMutation` → `CollaborationSyncBridge` 出站队列 → `project_changes` insert。
2. **入站**：Realtime INSERT → `CollaborationSyncBridge` → `CollaborationInboundApplier` → `onApplyRemoteChange`（**先 apply，成功后再** `commitLatestRevision`）→ `applyRemoteChangeToLocal`（冲突治理 + Dexie 写回）。
3. **Presence**：`CollaborationPresenceService`（Realtime track）+ `upsertCollaborationPresenceRecord` → `project_presence`。
4. **目录**：`CollaborationDirectoryService` → `projects` / `project_members`（供侧栏 `CollaborationCloudPanel.directory`）。
5. **协议守卫**：`evaluateCollaborationProtocolGuard`（`projects.app_min_version`）→ 禁写时 UI：`CollaborationCloudReadOnlyBanner` + `CollaborationSyncBadge`。
6. **项目快照**（ADR-0034）：自动上传与 restore/首台水合走 `exportProjectScopedDatabaseAsJson` / `importProjectScopedFromJSON`。范围是当前 `textId` 转写图；**不含**词库、语言资产、AI/MCP 表。Restore 对该项目 prune + upsert，**禁止**整库 `replace-all`。用户整库 JSON 备份仍走 ADR-0008。
7. **持久化配额**：应用启动时特性检测调用 `navigator.storage.persist()`；不支持或拒绝则 no-op。

## 工程约束

- **云端基线**：[`../../supabase/sql/001_collaboration_baseline.sql`](../../supabase/sql/001_collaboration_baseline.sql) 是唯一的基线脚本（rev5 第 2C 批把原 001–004 合并，D12）。INSERT 时 `project_snapshots.created_by`、`project_changes.actor_id`、`project_assets.uploaded_by`、`project_comments.author_id` 必须等于 `auth.uid()`；转写页桥接 [`../../src/hooks/transcription/useTranscriptionCollaborationBridge.ts`](../../src/hooks/transcription/useTranscriptionCollaborationBridge.ts) 对 `registerProjectAsset` / `createProjectSnapshot` **强制**使用 `getSupabaseUserId()` 写入对应字段。去重键为 `(project_id, client_id, client_op_id)`。
- **删除安全（rev5 第 9 节）**：项目墓碑只能由 owner 通过 `delete_cloud_project` 写入，之后对该项目的任何写入都被拒绝（`JYDEL`）；`project_changes`、`project_snapshots`、`project_assets` 写入时服务器检查 `protocol_version` 与 `client_app_version`（`JYPRT` / `JYVER`）；快照、附件的审计列与存储位置不可改，`latest_revision` 只能由触发器修改（JY-20）。规则由 [`../../src/collaboration/cloud/supabaseBaseline.pglite.test.ts`](../../src/collaboration/cloud/supabaseBaseline.pglite.test.ts) 在 PGlite 上验证。
- `**src/hooks/`** 禁止**直接 `import … from '…/integrations/supabase/…'`；统一经 `[collaborationSupabaseFacade.ts](../../src/collaboration/cloud/collaborationSupabaseFacade.ts)` 或 `cloud/*Service`。
- **Realtime subscribe**：`[realtimeSubscription.ts](../../src/collaboration/cloud/realtimeSubscription.ts)` 共用 `subscribeRealtimeChannel`（变更频道与 presence 频道）。
- **门禁**：`npm run gate:collaboration-cloud`；CI job `collaboration-cloud-gate`；`gate:m14-collaboration-promotion` 在 `gate:m13-transaction-sync` 之后串联 cloud gate。
- **无真实 Supabase 时的客户端验收**：`npm run gate:greenfield-local`（含 `check:collaboration-cloud-foundation` 与 `test:collaboration-supabase-contract`，均为本地脚本 + Vitest mock，**不**连接托管库）。完整 cloud gate 仍用 `gate:collaboration-cloud`。

## 观测

- 自动冲突解决：`resolveCollaborationConflicts` 发射 `business.collaboration.conflict_resolved_count`，并在 `ResolveConflictResult.resolutionTraceId` 与 `CollaborationOperationLog.traceId` 上保留关联 id。

## 延伸阅读

- [协作 Runtime 角色地图](./collaboration-runtime-map.md)
- [仓库现状与代码地图](./仓库现状与代码地图.md)（全局地图）