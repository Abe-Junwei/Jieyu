---
title: '0008 — 绿场 IndexedDB 命名、导出表面与协同 RLS 收口'
doc_type: adr
status: accepted
owner: repo
last_reviewed: 2026-10-14
source_of_truth: decision
---

# 0008 — 绿场 IndexedDB 命名、导出表面与协同 RLS 收口

> 桌面规范存储是 [ADR-0046](./0046-desktop-sqlite-project-folder.md) 的 `project.sqlite`。下面的 IndexedDB 条款只约束浏览器构建里的 Dexie。协作代码在桌面构建中剔除（ADR-0047）。

## 背景

- 产品阶段以 **无存量历史库、不要求旧版快照兼容** 为前提推进工程收口。
- 全库 JSON 导出曾将 `media_items.details.audioBlob` 转为 data URL，**大项目内存与 JSON 体积**不可接受。
- 轨道显示状态曾 **LocalStorage 与 Dexie 双写**，且旧主键策略在边界条件下会混淆。
- 托管协同 SQL 初稿中，审计列未与 `auth.uid()` 强绑定，**身份可伪造**。

## 决策

1. **浏览器构建的 Dexie 物理名**：使用导出常量 `JIEYU_DEXIE_DB_NAME`（当前 `jieyudb_v2`），旧名 `jieyudb` 不再由应用打开；需要时再抬升后缀做「磁盘级」绿场重置。桌面项目文件夹不以这个库名为真源。
2. **整库 JSON 导入**：`schemaVersion` **必须**等于 `SNAPSHOT_SCHEMA_VERSION`（`src/db/io.ts`）；不接受旧版数字或缺省。
3. **整库 JSON 导出**：**不**内嵌音频字节；从 `details` 中删除 `audioBlob`，并置 `audioExportOmitted: true`。导入路径仍支持 `audioDataUrl` → Blob，用于受控灌回。
4. **轨道状态**：运行时 **仅写 Dexie**（`track_entities`）；主键 `te:${textId}:${trackKey}`（`trackEntityDocumentId`）；移除对 `jieyu:track-entity-state:v1` 的 **产品路径** 写入（LocalStorage API 仍保留供单测/调试类调用方）。
5. **Dexie v26**：`track_entities` 表仍在本版本 **声明**；**upgrade 为 no-op**，不再从 `jieyu:track-entity-state:v1` 读入并写入 IndexedDB。
6. **Dexie v30–v40**：不在代码中删除版本块（Dexie 单调版本约束）；在 `engine.ts` 用 **集中注释** 说明 v32 空窗与 v40 恢复的历史语义，避免维护者误读。
7. **恢复快照**：`saveRecoverySnapshot` 对序列化 UTF-8 总大小设默认上限（8MiB），超限跳过写入；可选参数仅用于测试。
8. **Supabase 身份绑定**：现行基线是 `supabase/sql/001_collaboration_baseline.sql`。INSERT 时 `created_by` / `actor_id` / `uploaded_by` / `author_id` 必须等于 `auth.uid()`。不要再找已合并掉的 `002_collaboration_rls_identity_bind.sql`。
9. **`project_changes` 去重键**：同一基线里的唯一约束是 `(project_id, client_id, client_op_id)`。`supabase/sql/002_append_project_changes.sql` 是出站重试函数，不是另一份身份绑定脚本。
10. **协作桥接**：`useTranscriptionCollaborationBridge` 在调用底层桥前对 `registerProjectAsset` / `createProjectSnapshot` **覆写** `uploadedBy` / `createdBy` 为当前会话 `getSupabaseUserId()`，避免调用方误传 UUID 导致 RLS 拒绝或伪造身份。

## 影响

- 依赖「导出 JSON 自带整段音频」的旧流程 **不再成立**；备份音频需依赖原始文件、对象存储或单独管线。
- 旧版导出（`schemaVersion` ≠ 当前）将 **无法导入**。
- 浏览器中遗留的 `jieyudb` 与 `jieyu:track-entity-state:v1` 键可能成为 **孤儿数据**，需用户或运维按需清理；**v26 不再**把后者迁入 `track_entities`。

## 被放弃的备选方案

- **导出继续 base64 内嵌**：简单但与大体量、内存峰值目标冲突。
- **保留轨道 LocalStorage 双写**：增加一致性与隐私面；绿场下无迁移价值。
- **直接改写已发布的 `001` SQL**：当时改为追加迁移。那些追加脚本后来并进 `001_collaboration_baseline.sql`，不要再按已删除的文件名去找。

## 后续回顾点

- 若面向「有历史用户」发版：需另立 ADR 定义 **升级路径**（数据迁移、导入兼容窗口、库名策略）。
- 导出是否提供 **显式「含音频 sidecar」** 开关，由产品与存储成本决定。

## 相关实现与文档

- 桌面版存储以 ADR-0046、ADR-0047 为准。旧的单轨化执行计划已不在工作区。
- SQL：`supabase/sql/001_collaboration_baseline.sql`（rev5 第 2C 批把原 001–004 合并为唯一基线，含审计列绑定与 `(project_id, client_id, client_op_id)` 去重键）
- **无云端验收**：`npm run gate:greenfield-local`（文档治理 + 架构守卫 + Dexie/导入/轨道/恢复快照单测 + 协作云 **mock 契约**；不连真实 Supabase）
