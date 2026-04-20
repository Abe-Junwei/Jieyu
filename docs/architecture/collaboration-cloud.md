---
title: 托管协作云（Supabase）现状基线
doc_type: architecture-current-state
status: active
owner: collaboration-cloud
last_reviewed: 2026-04-19
source_of_truth: current-state
---

# 托管协作云（Supabase）现状基线

## 数据流（摘要）

1. **本地编辑**：`useTranscriptionData` → `useTranscriptionCloudSyncActions`（包装 `wrappedActions`）→ `useTranscriptionCollaborationBridge.enqueueMutation` → `CollaborationSyncBridge` 出站队列 → `project_changes` insert。
2. **入站**：Realtime INSERT → `CollaborationSyncBridge` → `CollaborationInboundApplier` → `onApplyRemoteChange` → `applyRemoteChangeToLocal`（冲突治理 + Dexie 写回）。
3. **Presence**：`CollaborationPresenceService`（Realtime track）+ `upsertCollaborationPresenceRecord` → `project_presence`。
4. **目录**：`CollaborationDirectoryService` → `projects` / `project_members`（供侧栏 `CollaborationCloudPanel.directory`）。
5. **协议守卫**：`evaluateCollaborationProtocolGuard`（`projects.app_min_version`）→ 禁写时 UI：`CollaborationCloudReadOnlyBanner` + `CollaborationSyncBadge`。

## 工程约束

- **RLS 身份绑定**：部署时在 `001_collaboration_foundation.sql` 之后应用 [`../../supabase/sql/002_collaboration_rls_identity_bind.sql`](../../supabase/sql/002_collaboration_rls_identity_bind.sql)，使 `project_snapshots.created_by`、`project_changes.actor_id`、`project_assets.uploaded_by`、`project_comments.author_id` 在 INSERT 时与 `auth.uid()` 一致。客户端插入仍传这些列，但值必须与当前会话用户 UUID 相同。转写页桥接 [`../../src/hooks/useTranscriptionCollaborationBridge.ts`](../../src/hooks/useTranscriptionCollaborationBridge.ts) 对 `registerProjectAsset` / `createProjectSnapshot` **强制**使用 `getSupabaseUserId()` 写入 `uploaded_by` / `created_by` 对应字段，与 RLS 对齐。
- **变更去重（可选）**：若需跨 `client_id` 区分同一 `client_op_id`，在 `001`/`002` 之后应用 [`../../supabase/sql/003_project_changes_client_op_unique.sql`](../../supabase/sql/003_project_changes_client_op_unique.sql)（破坏性：替换 `project_changes` 上旧的两列唯一约束）。
- `**src/hooks/`** 禁止**直接 `import … from '…/integrations/supabase/…'`；统一经 `[collaborationSupabaseFacade.ts](../../src/collaboration/cloud/collaborationSupabaseFacade.ts)` 或 `cloud/*Service`。
- **Realtime subscribe**：`[realtimeSubscription.ts](../../src/collaboration/cloud/realtimeSubscription.ts)` 共用 `subscribeRealtimeChannel`（变更频道与 presence 频道）。
- **门禁**：`npm run gate:collaboration-cloud`；CI job `collaboration-cloud-gate`；`gate:m14-collaboration-promotion` 在 `gate:m13-transaction-sync` 之后串联 cloud gate。
- **无真实 Supabase 时的客户端验收**：`npm run gate:greenfield-local`（含 `check:collaboration-cloud-foundation` 与 `test:collaboration-supabase-contract`，均为本地脚本 + Vitest mock，**不**连接托管库）。完整 cloud gate 仍用 `gate:collaboration-cloud`。

## 观测

- 自动冲突解决：`resolveCollaborationConflicts` 发射 `business.collaboration.conflict_resolved_count`，并在 `ResolveConflictResult.resolutionTraceId` 与 `CollaborationOperationLog.traceId` 上保留关联 id。

## 延伸阅读

- [协作 Runtime 角色地图](./collaboration-runtime-map.md)
- [仓库现状与代码地图](./仓库现状与代码地图.md)（全局地图）