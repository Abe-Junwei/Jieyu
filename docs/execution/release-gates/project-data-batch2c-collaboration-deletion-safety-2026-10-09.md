---
title: 项目数据第 2C 批（协作删除安全）验证记录
doc_type: release-gate
status: active
owner: repo
last_reviewed: 2026-10-09
source_of_truth: supabase/sql/001_collaboration_baseline.sql
---

# 项目数据第 2C 批（协作删除安全）验证记录（2026-10-09）

对应方案：[项目、资料与持久化架构改进方案（修订五）](../plans/project-data-architecture-improvement-2026-10-08.md) 第 9 节、10.0 的 2C 行（T23–T27、T49、T52），以及评审项 JY-06、JY-20。

前提：2026-10-09 确认**没有任何云端 Supabase 实例**。本批只交付仓库里的 SQL 文件和测试，没有连接或迁移任何真实云端；D12 的“清空前数据检查”不适用。

## 范围

- **云端基线（T49、D12）**：`supabase/sql/001_collaboration_baseline.sql` 取代原来的 001–004。新增项目墓碑（`projects.deleted_at`、`project_tombstones`）、owner 专用的 `delete_cloud_project` RPC、删除后拒绝一切写入（JYDEL）、写入时检查 `protocol_version`（JYPRT）和客户端版本不低于 `app_min_version`（JYVER）、快照/附件/评论的不可变列（JYIMM）、`latest_revision` 只能由触发器修改，以及 JY-20（停用成员不能删除评论）。`app_min_version` 默认 `1.1.0`（认识墓碑的版本）。
- **D6 判定与 clientId（T27、9.4）**：每个安装实例一个 clientId（`jieyu:collab-client-id:v1`）；本机协作记录 `jieyu:collab-local-projects:v1`；`assessProjectCollaborationHistory` 只有在能确认“从未协作”时才返回 never-collaborated，读不出记录按协作过处理。
- **仅从本机移除（T24、T26，9.1）**：从未协作的项目照常删除；协作过的项目只从本机移除，写一条永不上传的“已移除”记录，阻止自动同步；首页“已从本机移除的云端项目”列表只能手动重新下载。清理是持久化任务（`jieyu:project-cleanup-jobs:v1`），覆盖协同状态、项目记忆库、轨道显示状态和主库，启动时续做。
- **云端删除与墓碑（T23，9.2）**：owner 在协同面板“云项目与成员”里两次确认后删除；任何客户端看到墓碑（启动时、推送前、轮询/获得焦点时，或服务器返回 JYDEL）后，停止桥接、出站队列作废（`cancelled_by_delete`，记日志和条数）、执行本地清理任务。
- **旧标签页与旧客户端（T52，9.3）**：每次推送前重新读取项目行；JYPRT/JYVER 拒绝后本页面进入只读直到刷新，并提示刷新；BroadcastChannel `jieyu-collab-lifecycle` 通知其他标签页（本机移除、云端删除、协议变化）；Service Worker 换成新版本时提示刷新。
- **JY-06**：备注归属改为 `Record<NoteTargetType, resolver>`，新增目标类型不补解析器会编译失败，并有逐类型测试。

## 自动化验证

| 项 | 命令 / 测试 | 结果 |
| --- | --- | --- |
| 类型检查 | `npx tsc --noEmit` | 通过 |
| 架构守卫 | `npm run check:architecture-guard` | 通过 |
| T49 / T25 / T52b / JY-20（服务器端） | `src/collaboration/cloud/supabaseBaseline.pglite.test.ts`（PGlite 运行真实 Postgres，模拟 Supabase 的 `auth.uid()`、`storage.objects`） | 19 项通过；去掉任一关卡触发器的变异检查会让对应测试失败 |
| T27 | `src/collaboration/cloud/projectCollaborationHistory.test.ts` | 通过 |
| T24 / T26（本机部分） | `src/services/projectRemoval.test.ts`、`src/app/projectRemovalFlow.test.ts` | 通过 |
| T23（客户端） | `src/services/projectCloudTombstone.test.ts`、`useTranscriptionCollaborationBridge.test.tsx`（启动时墓碑、推送前墓碑、JYDEL） | 通过 |
| T52a（客户端） | `useTranscriptionCollaborationBridge.test.tsx`（JYPRT 只读、推送前重读、其他标签页移除）、`CollaborationLifecycleNotices.test.tsx`、`collaborationServerRejection.test.ts` | 通过 |
| JY-06 | `src/db/noteOwnership.test.ts` | 通过 |
| 2C e2e | `npx playwright test --project=chromium tests/e2e/batch2cProjectRemoval.spec.ts --repeat-each=3` | 3/3 通过 |
| 全量单元测试 | `npm run test:vitest:dot` | 857 文件通过、2 跳过；6013 用例通过、57 跳过 |
| Chromium 全量 e2e | `npx playwright test --project=chromium --retries=0` | 54 通过（与全量单元测试同一轮，含 2C e2e）|

## 需要真实云端才能完成的部分

以下测试按方案要求“真实 Supabase（隔离环境）”，目前没有实例，只能用 PGlite 和 mock 代替：

- T25、T49：在隔离的 Supabase 项目上执行 `001_collaboration_baseline.sql`，确认 PostgREST 把 JY* SQLSTATE 原样返回到 `error.code`，Realtime 订阅与 Storage 策略在真实服务里生效。
- T23：一个客户端有待发操作时 owner 删除项目，另一客户端离线编辑后重新上线，项目不复活。
- T26：成员仅从本机移除后重新登录，其他成员照常读写，服务器上没有墓碑。
- T52：两个真实客户端分别带着过旧的 `protocol_version` 和过低的版本推送。

## 偏差与决定

- 有未同步修改时，界面给“取消（先同步再移除）”或“放弃这些修改”两个选择，没有做“自动同步完成后再移除”。
- 被服务器拒绝后的“只读”是：云端写入全部停止并提示刷新；本地编辑不锁定（不会再上传）。
- 看到墓碑后自动清理本机副本（方案 9.2 原文要求）；这一步会丢弃本机没上传的修改。
- 本机清理不包含语音会话、行为日志（私人日志，按 8.1 保留）和声学缓存（派生数据，按容量自动淘汰）。
- 运行环境完全没有 localStorage（非浏览器）时判定为从未协作；浏览器里 localStorage 读失败仍按“判定不了”处理，只从本机移除，且写不进记录就不删除。
- 开发构建上报的版本是 `0.0.0-dev`，低于基线默认的 `app_min_version` 1.1.0，连真实云端时会被 JYVER 拒绝；需要时在开发项目里调低 `app_min_version`。
