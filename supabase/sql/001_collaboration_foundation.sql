-- 托管协同基础表与权限初稿 | Managed collaboration foundation schema and RLS draft
-- 适用：Supabase Postgres + Auth + Realtime + Storage | Target: Supabase Postgres + Auth + Realtime + Storage

create extension if not exists pgcrypto;

-- 角色枚举 | Role enum
create type public.collaboration_role as enum (
  'owner',
  'editor',
  'commenter',
  'viewer'
);

-- 可见性枚举 | Visibility enum
create type public.project_visibility as enum (
  'private',
  'team',
  'public_read'
);

-- 变更操作枚举 | Change operation enum
create type public.project_change_op as enum (
  'upsert_text',
  'upsert_layer',
  'upsert_unit',
  'upsert_unit_content',
  'upsert_relation',
  'delete_entity',
  'batch_patch',
  'asset_attached',
  'comment_added'
);

-- 变更来源枚举 | Change source enum
create type public.project_change_source_kind as enum (
  'user',
  'sync',
  'migration'
);

-- 当前用户是否属于项目成员 | Check whether current user is a project member
create or replace function public.is_project_member(
  p_project_id uuid,
  allowed_roles public.collaboration_role[] default null
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.project_members pm
    where pm.project_id = p_project_id
      and pm.user_id = auth.uid()
      and pm.disabled_at is null
      and (
        allowed_roles is null
        or pm.role = any(allowed_roles)
      )
  );
$$;

-- 项目主表 | Project root table
create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) > 0),
  owner_id uuid not null,
  visibility public.project_visibility not null default 'private',
  protocol_version integer not null default 1,
  schema_version integer not null default 1,
  app_min_version text not null default '0.1.0',
  latest_snapshot_id uuid,
  latest_revision bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

create index if not exists idx_projects_owner_id on public.projects(owner_id);
create index if not exists idx_projects_updated_at on public.projects(updated_at desc);

-- 项目成员表 | Project members table
create table if not exists public.project_members (
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null,
  role public.collaboration_role not null,
  invited_by uuid,
  joined_at timestamptz not null default now(),
  disabled_at timestamptz,
  primary key (project_id, user_id)
);

create index if not exists idx_project_members_user_id on public.project_members(user_id);
create index if not exists idx_project_members_role on public.project_members(project_id, role);

-- 项目快照表（正文进入 Storage） | Project snapshots table (body stored in Storage)
create table if not exists public.project_snapshots (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  version integer not null,
  schema_version integer not null,
  created_by uuid not null,
  snapshot_storage_bucket text not null,
  snapshot_storage_path text not null,
  checksum text not null,
  size_bytes bigint not null check (size_bytes >= 0),
  change_cursor bigint not null,
  note text,
  created_at timestamptz not null default now(),
  unique (project_id, version),
  unique (project_id, snapshot_storage_path)
);

create index if not exists idx_project_snapshots_project_created on public.project_snapshots(project_id, created_at desc);

-- 项目增量变更表 | Project incremental change log
create table if not exists public.project_changes (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  actor_id uuid not null,
  client_id text not null,
  client_op_id text not null,
  session_id text,
  protocol_version integer not null,
  project_revision bigint not null,
  base_revision bigint not null default 0,
  entity_type text not null check (entity_type in ('text','layer','layer_unit','layer_unit_content','unit_relation','asset','comment')),
  entity_id text not null,
  op_type public.project_change_op not null,
  payload jsonb,
  payload_ref_path text,
  vector_clock jsonb,
  source_kind public.project_change_source_kind not null default 'user',
  created_at timestamptz not null default now(),
  unique (project_id, client_op_id),
  unique (project_id, project_revision)
);

create index if not exists idx_project_changes_project_revision on public.project_changes(project_id, project_revision asc);
create index if not exists idx_project_changes_entity on public.project_changes(project_id, entity_type, entity_id);
create index if not exists idx_project_changes_created_at on public.project_changes(project_id, created_at desc);

alter table public.project_changes
  add constraint project_changes_payload_or_ref_check
  check (payload is not null or payload_ref_path is not null);

-- 在线状态表（低频持久层） | Presence table (low-frequency persisted state)
create table if not exists public.project_presence (
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null,
  display_name text,
  state text not null default 'online' check (state in ('online','idle','offline')),
  focused_entity_type text,
  focused_entity_id text,
  cursor_payload jsonb,
  last_seen_at timestamptz not null default now(),
  primary key (project_id, user_id)
);

create index if not exists idx_project_presence_seen on public.project_presence(project_id, last_seen_at desc);

-- 附件索引表 | Asset index table
create table if not exists public.project_assets (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  asset_type text not null check (asset_type in ('audio','export','attachment')),
  storage_bucket text not null,
  storage_path text not null,
  mime_type text,
  size_bytes bigint not null default 0 check (size_bytes >= 0),
  checksum text,
  uploaded_by uuid not null,
  created_at timestamptz not null default now(),
  unique (project_id, storage_path)
);

create index if not exists idx_project_assets_project_created on public.project_assets(project_id, created_at desc);

-- 评论表（如果后续不想让 commenter 写 project_changes，可切换到独立评论流） | Comment table fallback for commenter-specific writes
create table if not exists public.project_comments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  entity_type text,
  entity_id text,
  author_id uuid not null,
  content text not null check (char_length(trim(content)) > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_project_comments_project_created on public.project_comments(project_id, created_at desc);

-- 分配项目内单调 revision | Allocate monotonic per-project revision
create or replace function public.assign_project_revision()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  next_revision bigint;
begin
  select p.latest_revision + 1
    into next_revision
  from public.projects p
  where p.id = new.project_id
  for update;

  if next_revision is null then
    raise exception 'Unknown project: %', new.project_id;
  end if;

  new.project_revision := next_revision;

  update public.projects
     set latest_revision = next_revision,
         updated_at = now()
   where id = new.project_id;

  return new;
end;
$$;

drop trigger if exists trg_assign_project_revision on public.project_changes;
create trigger trg_assign_project_revision
before insert on public.project_changes
for each row
execute function public.assign_project_revision();

-- 自动维护更新时间 | Keep updated_at fresh
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_touch_projects_updated_at on public.projects;
create trigger trg_touch_projects_updated_at
before update on public.projects
for each row
execute function public.touch_updated_at();

drop trigger if exists trg_touch_project_comments_updated_at on public.project_comments;
create trigger trg_touch_project_comments_updated_at
before update on public.project_comments
for each row
execute function public.touch_updated_at();

-- RLS 开启 | Enable RLS
alter table public.projects enable row level security;
alter table public.project_members enable row level security;
alter table public.project_snapshots enable row level security;
alter table public.project_changes enable row level security;
alter table public.project_presence enable row level security;
alter table public.project_assets enable row level security;
alter table public.project_comments enable row level security;

-- projects policies | 项目访问策略
create policy "projects_select_members"
on public.projects
for select
using (
  public.is_project_member(id)
  or owner_id = auth.uid()
  or visibility = 'public_read'
);

create policy "projects_insert_owner"
on public.projects
for insert
with check (owner_id = auth.uid());

create policy "projects_update_owner"
on public.projects
for update
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

create policy "projects_delete_owner"
on public.projects
for delete
using (owner_id = auth.uid());

-- project_members policies | 成员访问策略
create policy "project_members_select_members"
on public.project_members
for select
using (public.is_project_member(project_id));

create policy "project_members_manage_owner"
on public.project_members
for all
using (
  exists (
    select 1 from public.projects p
    where p.id = project_id
      and p.owner_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.projects p
    where p.id = project_id
      and p.owner_id = auth.uid()
  )
);

-- project_snapshots policies | 快照访问策略
create policy "project_snapshots_select_members"
on public.project_snapshots
for select
using (public.is_project_member(project_id));

create policy "project_snapshots_insert_editor"
on public.project_snapshots
for insert
with check (public.is_project_member(project_id, array['owner','editor']::public.collaboration_role[]));

create policy "project_snapshots_update_editor"
on public.project_snapshots
for update
using (public.is_project_member(project_id, array['owner','editor']::public.collaboration_role[]))
with check (public.is_project_member(project_id, array['owner','editor']::public.collaboration_role[]));

create policy "project_snapshots_delete_owner"
on public.project_snapshots
for delete
using (public.is_project_member(project_id, array['owner']::public.collaboration_role[]));

-- project_changes policies | 变更日志访问策略
create policy "project_changes_select_members"
on public.project_changes
for select
using (public.is_project_member(project_id));

create policy "project_changes_insert_owner_editor"
on public.project_changes
for insert
with check (
  (
    public.is_project_member(project_id, array['owner','editor']::public.collaboration_role[])
    and op_type <> 'comment_added'
  )
  or (
    public.is_project_member(project_id, array['owner','editor','commenter']::public.collaboration_role[])
    and op_type = 'comment_added'
  )
);

-- 变更日志默认不允许普通成员修改/删除 | Block member-side updates/deletes on immutable change log
create policy "project_changes_block_update"
on public.project_changes
for update
using (false)
with check (false);

create policy "project_changes_block_delete"
on public.project_changes
for delete
using (false);

-- project_presence policies | 在线状态策略
create policy "project_presence_select_members"
on public.project_presence
for select
using (public.is_project_member(project_id));

create policy "project_presence_upsert_self"
on public.project_presence
for insert
with check (
  user_id = auth.uid()
  and public.is_project_member(project_id)
);

create policy "project_presence_update_self"
on public.project_presence
for update
using (
  user_id = auth.uid()
  and public.is_project_member(project_id)
)
with check (
  user_id = auth.uid()
  and public.is_project_member(project_id)
);

create policy "project_presence_delete_self"
on public.project_presence
for delete
using (
  user_id = auth.uid()
  and public.is_project_member(project_id)
);

-- project_assets policies | 附件索引策略
create policy "project_assets_select_members"
on public.project_assets
for select
using (public.is_project_member(project_id));

create policy "project_assets_insert_editor"
on public.project_assets
for insert
with check (public.is_project_member(project_id, array['owner','editor']::public.collaboration_role[]));

create policy "project_assets_update_editor"
on public.project_assets
for update
using (public.is_project_member(project_id, array['owner','editor']::public.collaboration_role[]))
with check (public.is_project_member(project_id, array['owner','editor']::public.collaboration_role[]));

create policy "project_assets_delete_editor"
on public.project_assets
for delete
using (public.is_project_member(project_id, array['owner','editor']::public.collaboration_role[]));

-- project_comments policies | 评论策略
create policy "project_comments_select_members"
on public.project_comments
for select
using (public.is_project_member(project_id));

create policy "project_comments_insert_commenter"
on public.project_comments
for insert
with check (public.is_project_member(project_id, array['owner','editor','commenter']::public.collaboration_role[]));

create policy "project_comments_update_author"
on public.project_comments
for update
using (author_id = auth.uid() and public.is_project_member(project_id, array['owner','editor','commenter']::public.collaboration_role[]))
with check (author_id = auth.uid() and public.is_project_member(project_id, array['owner','editor','commenter']::public.collaboration_role[]));

create policy "project_comments_delete_author_or_owner"
on public.project_comments
for delete
using (
  author_id = auth.uid()
  or public.is_project_member(project_id, array['owner']::public.collaboration_role[])
);

-- Storage 策略示例 | Example storage policies
-- 说明：以下策略假定 bucket 路径第一层即 project_id。
-- Note: These policies assume the first folder segment equals project_id.

create policy "storage_select_project_assets"
on storage.objects
for select
using (
  bucket_id in ('project-audio', 'project-exports', 'project-attachments')
  and public.is_project_member((storage.foldername(name))[1]::uuid)
);

create policy "storage_insert_project_assets"
on storage.objects
for insert
with check (
  bucket_id in ('project-audio', 'project-exports', 'project-attachments')
  and public.is_project_member((storage.foldername(name))[1]::uuid, array['owner','editor']::public.collaboration_role[])
);

create policy "storage_update_project_assets"
on storage.objects
for update
using (
  bucket_id in ('project-audio', 'project-exports', 'project-attachments')
  and public.is_project_member((storage.foldername(name))[1]::uuid, array['owner','editor']::public.collaboration_role[])
)
with check (
  bucket_id in ('project-audio', 'project-exports', 'project-attachments')
  and public.is_project_member((storage.foldername(name))[1]::uuid, array['owner','editor']::public.collaboration_role[])
);

create policy "storage_delete_project_assets"
on storage.objects
for delete
using (
  bucket_id in ('project-audio', 'project-exports', 'project-attachments')
  and public.is_project_member((storage.foldername(name))[1]::uuid, array['owner','editor']::public.collaboration_role[])
);
