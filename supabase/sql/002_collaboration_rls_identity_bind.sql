-- 002 — 将审计列与当前登录用户绑定（RLS insert with-check）
-- 002 — Bind audit columns to the authenticated user on INSERT (RLS with-check)
--
-- 前置：已应用 `001_collaboration_foundation.sql`。
-- Prerequisite: `001_collaboration_foundation.sql` has been applied.
--
-- 应用方式（示例）：在 Supabase SQL editor 或迁移管线中按序号执行本文件。
-- Apply via Supabase SQL editor or your migration pipeline in numeric order.

-- project_snapshots | 快照元数据
drop policy if exists "project_snapshots_insert_editor" on public.project_snapshots;

create policy "project_snapshots_insert_editor"
on public.project_snapshots
for insert
with check (
  public.is_project_member(project_id, array['owner','editor']::public.collaboration_role[])
  and created_by = auth.uid()
);

-- project_changes | 变更日志
drop policy if exists "project_changes_insert_owner_editor" on public.project_changes;

create policy "project_changes_insert_owner_editor"
on public.project_changes
for insert
with check (
  actor_id = auth.uid()
  and (
    (
      public.is_project_member(project_id, array['owner','editor']::public.collaboration_role[])
      and op_type <> 'comment_added'
    )
    or (
      public.is_project_member(project_id, array['owner','editor','commenter']::public.collaboration_role[])
      and op_type = 'comment_added'
    )
  )
);

-- project_assets | 附件索引
drop policy if exists "project_assets_insert_editor" on public.project_assets;

create policy "project_assets_insert_editor"
on public.project_assets
for insert
with check (
  public.is_project_member(project_id, array['owner','editor']::public.collaboration_role[])
  and uploaded_by = auth.uid()
);

-- project_comments | 评论（与 update 策略对称）
drop policy if exists "project_comments_insert_commenter" on public.project_comments;

create policy "project_comments_insert_commenter"
on public.project_comments
for insert
with check (
  public.is_project_member(project_id, array['owner','editor','commenter']::public.collaboration_role[])
  and author_id = auth.uid()
);
