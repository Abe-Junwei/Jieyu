-- 001 — 协同云端基线（rev5 第 2C 批，D12）| Collaboration cloud baseline (rev5 batch 2C, D12)
--
-- 这是唯一的基线脚本：原来的 001–004 叠加后的结果，再加上第 9 节的规则。
-- This is the single baseline script: the net result of the former 001–004 plus the section-9 rules.
--   · 原 001：表、枚举、成员函数、revision 分配、RLS、Storage 策略
--   · 原 002：INSERT 时审计列绑定 auth.uid()
--   · 原 003：project_changes 去重键为 (project_id, client_id, client_op_id)
--   · 原 004：owner 一定是成员（is_project_member 认 owner；owner 成员行由触发器维护）
--   · 9.2：项目墓碑（projects.deleted_at + project_tombstones），只能由 owner 通过 delete_cloud_project 写入；
--         删除后对该项目的任何写入都被拒绝，冲突时删除优先
--   · 9.3：project_changes / project_snapshots / project_assets 写入时由服务器检查 protocol_version 与客户端版本
--   · JY-20：快照、附件的审计列与存储位置不可改；latest_revision 只能由触发器修改；停用成员不能删评论
--
-- 云端从未部署过（2026-10-09 确认没有 Supabase 实例），所以没有“先清空再执行”的步骤；
-- 在新的空项目上按原样执行即可。撤销第 9 节规则时，另写一个新的 SQL 文件（rev5 10.0 回滚条件）。
-- No cloud instance has ever been deployed (confirmed 2026-10-09), so there is no wipe step; run this
-- file as-is on a fresh project. Revert section-9 rules with a new SQL file (rev5 10.0 rollback rule).
--
-- 错误码（客户端按 code 判断，见 collaborationServerRejection.ts）| Error codes (see collaborationServerRejection.ts)
--   JYDEL  项目已删除（墓碑）| project is tombstoned
--   JYPRT  protocol_version 与项目不一致 | protocol_version does not match the project
--   JYVER  客户端版本低于 app_min_version，或版本无法解析 | client version below app_min_version / unparsable
--   JYIMM  修改了不可变的列 | an immutable column was changed
--   JYOWN  只有 owner 可以执行 | owner only
--   JYNOP  项目不存在 | unknown project

-- ── 枚举 | enums ─────────────────────────────────────────────────────────────

create type public.collaboration_role as enum ('owner', 'editor', 'commenter', 'viewer');

create type public.project_visibility as enum ('private', 'team', 'public_read');

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

create type public.project_change_source_kind as enum ('user', 'sync', 'migration');

-- ── 表 | tables ──────────────────────────────────────────────────────────────

-- 项目主表；deleted_at 非空即为墓碑 | Project root; non-null deleted_at = tombstone
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) > 0),
  owner_id uuid not null,
  visibility public.project_visibility not null default 'private',
  protocol_version integer not null default 1,
  schema_version integer not null default 1,
  -- 9.3：引入墓碑语义的客户端版本；更旧的客户端不认识墓碑，不能写入
  -- 9.3: first client version that understands tombstones; older clients cannot write
  app_min_version text not null default '1.1.0',
  latest_snapshot_id uuid,
  latest_revision bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  deleted_at timestamptz,
  deleted_by uuid
);

create index idx_projects_owner_id on public.projects(owner_id);
create index idx_projects_updated_at on public.projects(updated_at desc);

-- 墓碑表：长期保留，即使项目行被管理员物理删除也还在 | Tombstones outlive the project row
create table public.project_tombstones (
  project_id uuid primary key,
  deleted_by uuid not null,
  deleted_at timestamptz not null default now(),
  project_name text
);

create table public.project_members (
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null,
  role public.collaboration_role not null,
  invited_by uuid,
  joined_at timestamptz not null default now(),
  disabled_at timestamptz,
  primary key (project_id, user_id)
);

create index idx_project_members_user_id on public.project_members(user_id);
create index idx_project_members_role on public.project_members(project_id, role);

-- 快照元数据（正文在 Storage）| Snapshot metadata (body in Storage)
create table public.project_snapshots (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  version integer not null,
  schema_version integer not null,
  protocol_version integer not null,
  client_app_version text not null,
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

create index idx_project_snapshots_project_created on public.project_snapshots(project_id, created_at desc);

-- 增量变更（不可改、不可删）| Incremental change log (immutable)
create table public.project_changes (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  actor_id uuid not null,
  client_id text not null,
  client_op_id text not null,
  session_id text,
  protocol_version integer not null,
  client_app_version text not null,
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
  constraint project_changes_project_client_client_op_key unique (project_id, client_id, client_op_id),
  unique (project_id, project_revision),
  constraint project_changes_payload_or_ref_check check (payload is not null or payload_ref_path is not null)
);

create index idx_project_changes_project_revision on public.project_changes(project_id, project_revision asc);
create index idx_project_changes_entity on public.project_changes(project_id, entity_type, entity_id);
create index idx_project_changes_created_at on public.project_changes(project_id, created_at desc);

create table public.project_presence (
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

create index idx_project_presence_seen on public.project_presence(project_id, last_seen_at desc);

create table public.project_assets (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  asset_type text not null check (asset_type in ('audio','export','attachment')),
  storage_bucket text not null,
  storage_path text not null,
  mime_type text,
  size_bytes bigint not null default 0 check (size_bytes >= 0),
  checksum text,
  protocol_version integer not null,
  client_app_version text not null,
  uploaded_by uuid not null,
  created_at timestamptz not null default now(),
  unique (project_id, storage_path)
);

create index idx_project_assets_project_created on public.project_assets(project_id, created_at desc);

create table public.project_comments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  entity_type text,
  entity_id text,
  author_id uuid not null,
  content text not null check (char_length(trim(content)) > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_project_comments_project_created on public.project_comments(project_id, created_at desc);

-- ── 成员判断（原 004）| membership (former 004) ───────────────────────────────

-- owner 一定算成员；停用的成员不算 | Owners always count; disabled members never do
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
    from public.projects p
    left join public.project_members pm
      on pm.project_id = p.id
     and pm.user_id = auth.uid()
     and pm.disabled_at is null
    where p.id = p_project_id
      and (
        (
          p.owner_id = auth.uid()
          and (allowed_roles is null or 'owner'::public.collaboration_role = any(allowed_roles))
        )
        or (
          pm.user_id is not null
          and (allowed_roles is null or pm.role = any(allowed_roles))
        )
      )
  );
$$;

-- 项目存在且没有墓碑 | Project exists and is not tombstoned
create or replace function public.project_is_live(p_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.projects p where p.id = p_project_id and p.deleted_at is null
  )
  and not exists (
    select 1 from public.project_tombstones t where t.project_id = p_project_id
  );
$$;

create or replace function public.sync_project_owner_membership()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.project_members (project_id, user_id, role, invited_by, joined_at, disabled_at)
  values (new.id, new.owner_id, 'owner'::public.collaboration_role, new.owner_id, coalesce(new.created_at, now()), null)
  on conflict (project_id, user_id) do update
  set role = 'owner'::public.collaboration_role,
      disabled_at = null;

  if tg_op = 'UPDATE' and old.owner_id is distinct from new.owner_id then
    update public.project_members
       set disabled_at = now()
     where project_id = new.id
       and user_id = old.owner_id
       and role = 'owner'::public.collaboration_role;
  end if;

  return new;
end;
$$;

-- ── 版本比较与写入闸门（9.3）| version compare & write gate (9.3) ──────────────

-- semver 核心三段（忽略 prerelease / build）；无法解析返回 null
-- semver core triple (prerelease / build ignored); null when unparsable
create or replace function public.jieyu_semver_core(p_version text)
returns integer[]
language plpgsql
immutable
as $$
declare
  core text;
  parts text[];
  result integer[] := array[]::integer[];
  segment text;
  i integer;
begin
  if p_version is null then
    return null;
  end if;
  core := split_part(split_part(trim(p_version), '-', 1), '+', 1);
  if core = '' then
    return null;
  end if;
  parts := string_to_array(core, '.');
  for i in 1..3 loop
    segment := coalesce(parts[i], '0');
    if segment !~ '^\d+' then
      return null;
    end if;
    result := result || substring(segment from '^\d+')::integer;
  end loop;
  return result;
end;
$$;

-- 客户端版本是否不低于最低版本；任一侧无法解析即为否 | Unparsable on either side = false
create or replace function public.jieyu_client_meets_min_version(p_client text, p_min text)
returns boolean
language sql
immutable
as $$
  select case
    when public.jieyu_semver_core(p_client) is null or public.jieyu_semver_core(p_min) is null then false
    else public.jieyu_semver_core(p_client) >= public.jieyu_semver_core(p_min)
  end;
$$;

-- 共享状态写入闸门：项目存在、没有墓碑、协议版本相同、客户端版本够新
-- Shared-state write gate: project exists, not tombstoned, same protocol, client new enough
create or replace function public.jieyu_assert_project_write_allowed(
  p_project_id uuid,
  p_protocol_version integer,
  p_client_app_version text,
  p_check_client boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  proj record;
begin
  if exists (select 1 from public.project_tombstones t where t.project_id = p_project_id) then
    raise exception using errcode = 'JYDEL', message = format('JIEYU_PROJECT_DELETED: %s', p_project_id);
  end if;

  -- 共享锁与 delete_cloud_project 的 for update 互斥：删除和写入按顺序执行，删除之后的写入一定被拒
  -- Share lock serialises against delete_cloud_project's FOR UPDATE: writes after a delete always fail
  select p.deleted_at, p.protocol_version, p.app_min_version
    into proj
  from public.projects p
  where p.id = p_project_id
  for share;

  if not found then
    raise exception using errcode = 'JYNOP', message = format('JIEYU_UNKNOWN_PROJECT: %s', p_project_id);
  end if;

  if proj.deleted_at is not null then
    raise exception using errcode = 'JYDEL', message = format('JIEYU_PROJECT_DELETED: %s', p_project_id);
  end if;

  if not p_check_client then
    return;
  end if;

  if p_protocol_version is distinct from proj.protocol_version then
    raise exception using
      errcode = 'JYPRT',
      message = format('JIEYU_PROTOCOL_MISMATCH: client %s, project %s', p_protocol_version, proj.protocol_version);
  end if;

  if not public.jieyu_client_meets_min_version(p_client_app_version, proj.app_min_version) then
    raise exception using
      errcode = 'JYVER',
      message = format('JIEYU_CLIENT_TOO_OLD: client %s, required %s', coalesce(p_client_app_version, '<null>'), proj.app_min_version);
  end if;
end;
$$;

-- 带协议与版本列的表（changes / snapshots / assets）| Tables carrying protocol + client version
create or replace function public.jieyu_gate_versioned_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    if exists (select 1 from public.projects p where p.id = old.project_id) then
      perform public.jieyu_assert_project_write_allowed(old.project_id, null, null, false);
    end if;
    return old;
  end if;
  -- 只有新写入的行检查协议与版本；改已有行（例如快照备注）只检查墓碑
  -- Only inserted rows are checked for protocol/version; updating an existing row only checks the tombstone
  perform public.jieyu_assert_project_write_allowed(
    new.project_id, new.protocol_version, new.client_app_version, tg_op = 'INSERT'
  );
  return new;
end;
$$;

-- 其他子表（成员、在线状态、评论）只检查墓碑 | Other child tables only check the tombstone
create or replace function public.jieyu_gate_child_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    -- 项目行已经物理删除（级联）时放行 | Allow cascades after the project row is physically removed
    if exists (select 1 from public.projects p where p.id = old.project_id) then
      perform public.jieyu_assert_project_write_allowed(old.project_id, null, null, false);
    end if;
    return old;
  end if;
  perform public.jieyu_assert_project_write_allowed(new.project_id, null, null, false);
  return new;
end;
$$;

-- ── revision 分配（原 001）| revision allocation (former 001) ─────────────────

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
    raise exception using errcode = 'JYNOP', message = format('JIEYU_UNKNOWN_PROJECT: %s', new.project_id);
  end if;

  new.project_revision := next_revision;

  -- 只有在这里（触发器内）可以改 latest_revision（JY-20）| Only this trigger may move latest_revision (JY-20)
  perform set_config('jieyu.revision_bump', 'on', true);
  update public.projects
     set latest_revision = next_revision,
         updated_at = now()
   where id = new.project_id;
  perform set_config('jieyu.revision_bump', 'off', true);

  return new;
end;
$$;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ── 不可变列（JY-20）| immutable columns (JY-20) ───────────────────────────────

-- 项目行：墓碑之后不能再改；latest_revision 只能由 revision 触发器改；墓碑列只能由 delete_cloud_project 写
-- Projects: frozen after tombstone; latest_revision only via the revision trigger; tombstone columns only via the RPC
create or replace function public.jieyu_guard_project_update()
returns trigger
language plpgsql
as $$
begin
  if old.deleted_at is not null then
    raise exception using errcode = 'JYDEL', message = format('JIEYU_PROJECT_DELETED: %s', old.id);
  end if;
  if new.id is distinct from old.id or new.created_at is distinct from old.created_at then
    raise exception using errcode = 'JYIMM', message = 'JIEYU_IMMUTABLE_COLUMN: projects.id/created_at';
  end if;
  if new.latest_revision is distinct from old.latest_revision
     and coalesce(current_setting('jieyu.revision_bump', true), 'off') <> 'on' then
    raise exception using errcode = 'JYIMM', message = 'JIEYU_IMMUTABLE_COLUMN: projects.latest_revision';
  end if;
  if (new.deleted_at is distinct from old.deleted_at or new.deleted_by is distinct from old.deleted_by)
     and coalesce(current_setting('jieyu.tombstone_write', true), 'off') <> 'on' then
    raise exception using errcode = 'JYIMM', message = 'JIEYU_IMMUTABLE_COLUMN: projects.deleted_at';
  end if;
  return new;
end;
$$;

-- 新项目不能带墓碑，也不能复用已删除项目的 id | New projects cannot carry a tombstone or reuse a deleted id
create or replace function public.jieyu_guard_project_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.deleted_at is not null or new.deleted_by is not null then
    raise exception using errcode = 'JYIMM', message = 'JIEYU_IMMUTABLE_COLUMN: projects.deleted_at';
  end if;
  if new.latest_revision <> 0 then
    raise exception using errcode = 'JYIMM', message = 'JIEYU_IMMUTABLE_COLUMN: projects.latest_revision';
  end if;
  if exists (select 1 from public.project_tombstones t where t.project_id = new.id) then
    raise exception using errcode = 'JYDEL', message = format('JIEYU_PROJECT_DELETED: %s', new.id);
  end if;
  return new;
end;
$$;

-- 快照：只有 note 可以改 | Snapshots: only `note` may change
create or replace function public.jieyu_guard_snapshot_update()
returns trigger
language plpgsql
as $$
begin
  if (new.id, new.project_id, new.version, new.schema_version, new.protocol_version, new.client_app_version,
      new.created_by, new.snapshot_storage_bucket, new.snapshot_storage_path, new.checksum,
      new.size_bytes, new.change_cursor, new.created_at)
     is distinct from
     (old.id, old.project_id, old.version, old.schema_version, old.protocol_version, old.client_app_version,
      old.created_by, old.snapshot_storage_bucket, old.snapshot_storage_path, old.checksum,
      old.size_bytes, old.change_cursor, old.created_at) then
    raise exception using errcode = 'JYIMM', message = 'JIEYU_IMMUTABLE_COLUMN: project_snapshots';
  end if;
  return new;
end;
$$;

-- 附件：只有 mime_type 可以改 | Assets: only `mime_type` may change
create or replace function public.jieyu_guard_asset_update()
returns trigger
language plpgsql
as $$
begin
  if (new.id, new.project_id, new.asset_type, new.storage_bucket, new.storage_path, new.size_bytes,
      new.checksum, new.protocol_version, new.client_app_version, new.uploaded_by, new.created_at)
     is distinct from
     (old.id, old.project_id, old.asset_type, old.storage_bucket, old.storage_path, old.size_bytes,
      old.checksum, old.protocol_version, old.client_app_version, old.uploaded_by, old.created_at) then
    raise exception using errcode = 'JYIMM', message = 'JIEYU_IMMUTABLE_COLUMN: project_assets';
  end if;
  return new;
end;
$$;

-- 评论：作者、项目、创建时间不可改 | Comments: author, project and created_at are immutable
create or replace function public.jieyu_guard_comment_update()
returns trigger
language plpgsql
as $$
begin
  if (new.id, new.project_id, new.author_id, new.created_at)
     is distinct from (old.id, old.project_id, old.author_id, old.created_at) then
    raise exception using errcode = 'JYIMM', message = 'JIEYU_IMMUTABLE_COLUMN: project_comments';
  end if;
  return new;
end;
$$;

-- ── 删除云端项目（9.2）| delete a cloud project (9.2) ──────────────────────────

-- 只有 owner 可以执行；幂等；返回墓碑时间 | Owner only; idempotent; returns the tombstone time
create or replace function public.delete_cloud_project(p_project_id uuid)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  proj record;
  stamp timestamptz;
begin
  select p.id, p.owner_id, p.name, p.deleted_at
    into proj
  from public.projects p
  where p.id = p_project_id
  for update;

  if not found then
    select t.deleted_at into stamp from public.project_tombstones t where t.project_id = p_project_id;
    if stamp is not null then
      return stamp;
    end if;
    raise exception using errcode = 'JYNOP', message = format('JIEYU_UNKNOWN_PROJECT: %s', p_project_id);
  end if;

  if proj.owner_id is distinct from auth.uid() then
    raise exception using errcode = 'JYOWN', message = 'JIEYU_OWNER_ONLY: delete_cloud_project';
  end if;

  if proj.deleted_at is not null then
    return proj.deleted_at;
  end if;

  stamp := now();
  perform set_config('jieyu.tombstone_write', 'on', true);
  update public.projects
     set deleted_at = stamp,
         deleted_by = auth.uid()
   where id = p_project_id;
  perform set_config('jieyu.tombstone_write', 'off', true);

  insert into public.project_tombstones (project_id, deleted_by, deleted_at, project_name)
  values (p_project_id, auth.uid(), stamp, proj.name)
  on conflict (project_id) do nothing;

  return stamp;
end;
$$;

-- ── 触发器 | triggers ────────────────────────────────────────────────────────

create trigger trg_guard_project_insert
before insert on public.projects
for each row execute function public.jieyu_guard_project_insert();

create trigger trg_guard_project_update
before update on public.projects
for each row execute function public.jieyu_guard_project_update();

create trigger trg_touch_projects_updated_at
before update on public.projects
for each row execute function public.touch_updated_at();

create trigger trg_sync_project_owner_membership
after insert or update of owner_id on public.projects
for each row execute function public.sync_project_owner_membership();

-- 闸门在 revision 分配之前执行（触发器按名字排序）| Gate runs before revision allocation (name order)
create trigger trg_a_gate_project_changes
before insert on public.project_changes
for each row execute function public.jieyu_gate_versioned_write();

create trigger trg_b_assign_project_revision
before insert on public.project_changes
for each row execute function public.assign_project_revision();

create trigger trg_gate_project_snapshots
before insert or update or delete on public.project_snapshots
for each row execute function public.jieyu_gate_versioned_write();

create trigger trg_guard_project_snapshots_update
before update on public.project_snapshots
for each row execute function public.jieyu_guard_snapshot_update();

create trigger trg_gate_project_assets
before insert or update or delete on public.project_assets
for each row execute function public.jieyu_gate_versioned_write();

create trigger trg_guard_project_assets_update
before update on public.project_assets
for each row execute function public.jieyu_guard_asset_update();

create trigger trg_gate_project_members
before insert or update or delete on public.project_members
for each row execute function public.jieyu_gate_child_write();

create trigger trg_gate_project_presence
before insert or update or delete on public.project_presence
for each row execute function public.jieyu_gate_child_write();

create trigger trg_gate_project_comments
before insert or update or delete on public.project_comments
for each row execute function public.jieyu_gate_child_write();

create trigger trg_guard_project_comments_update
before update on public.project_comments
for each row execute function public.jieyu_guard_comment_update();

create trigger trg_touch_project_comments_updated_at
before update on public.project_comments
for each row execute function public.touch_updated_at();

-- ── RLS ─────────────────────────────────────────────────────────────────────

alter table public.projects enable row level security;
alter table public.project_tombstones enable row level security;
alter table public.project_members enable row level security;
alter table public.project_snapshots enable row level security;
alter table public.project_changes enable row level security;
alter table public.project_presence enable row level security;
alter table public.project_assets enable row level security;
alter table public.project_comments enable row level security;

-- projects：成员可以读到墓碑；不能物理删除（只能走 delete_cloud_project）
-- projects: members can read tombstones; no physical delete (only delete_cloud_project)
create policy "projects_select_members"
on public.projects for select
using (public.is_project_member(id) or owner_id = auth.uid() or visibility = 'public_read');

create policy "projects_insert_owner"
on public.projects for insert
with check (owner_id = auth.uid());

create policy "projects_update_owner"
on public.projects for update
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

-- project_tombstones：只读；写入只来自 delete_cloud_project | read-only; written by delete_cloud_project only
create policy "project_tombstones_select"
on public.project_tombstones for select
using (deleted_by = auth.uid() or public.is_project_member(project_id));

create policy "project_members_select_members"
on public.project_members for select
using (public.is_project_member(project_id));

create policy "project_members_manage_owner"
on public.project_members for all
using (exists (select 1 from public.projects p where p.id = project_id and p.owner_id = auth.uid()))
with check (exists (select 1 from public.projects p where p.id = project_id and p.owner_id = auth.uid()));

create policy "project_snapshots_select_members"
on public.project_snapshots for select
using (public.is_project_member(project_id));

create policy "project_snapshots_insert_editor"
on public.project_snapshots for insert
with check (
  public.is_project_member(project_id, array['owner','editor']::public.collaboration_role[])
  and created_by = auth.uid()
);

create policy "project_snapshots_update_editor"
on public.project_snapshots for update
using (public.is_project_member(project_id, array['owner','editor']::public.collaboration_role[]))
with check (public.is_project_member(project_id, array['owner','editor']::public.collaboration_role[]));

create policy "project_snapshots_delete_owner"
on public.project_snapshots for delete
using (public.is_project_member(project_id, array['owner']::public.collaboration_role[]));

create policy "project_changes_select_members"
on public.project_changes for select
using (public.is_project_member(project_id));

create policy "project_changes_insert_owner_editor"
on public.project_changes for insert
with check (
  actor_id = auth.uid()
  and (
    (public.is_project_member(project_id, array['owner','editor']::public.collaboration_role[]) and op_type <> 'comment_added')
    or (public.is_project_member(project_id, array['owner','editor','commenter']::public.collaboration_role[]) and op_type = 'comment_added')
  )
);

create policy "project_changes_block_update"
on public.project_changes for update
using (false)
with check (false);

create policy "project_changes_block_delete"
on public.project_changes for delete
using (false);

create policy "project_presence_select_members"
on public.project_presence for select
using (public.is_project_member(project_id));

create policy "project_presence_upsert_self"
on public.project_presence for insert
with check (user_id = auth.uid() and public.is_project_member(project_id));

create policy "project_presence_update_self"
on public.project_presence for update
using (user_id = auth.uid() and public.is_project_member(project_id))
with check (user_id = auth.uid() and public.is_project_member(project_id));

create policy "project_presence_delete_self"
on public.project_presence for delete
using (user_id = auth.uid() and public.is_project_member(project_id));

create policy "project_assets_select_members"
on public.project_assets for select
using (public.is_project_member(project_id));

create policy "project_assets_insert_editor"
on public.project_assets for insert
with check (
  public.is_project_member(project_id, array['owner','editor']::public.collaboration_role[])
  and uploaded_by = auth.uid()
);

create policy "project_assets_update_editor"
on public.project_assets for update
using (public.is_project_member(project_id, array['owner','editor']::public.collaboration_role[]))
with check (public.is_project_member(project_id, array['owner','editor']::public.collaboration_role[]));

create policy "project_assets_delete_editor"
on public.project_assets for delete
using (public.is_project_member(project_id, array['owner','editor']::public.collaboration_role[]));

create policy "project_comments_select_members"
on public.project_comments for select
using (public.is_project_member(project_id));

create policy "project_comments_insert_commenter"
on public.project_comments for insert
with check (
  public.is_project_member(project_id, array['owner','editor','commenter']::public.collaboration_role[])
  and author_id = auth.uid()
);

create policy "project_comments_update_author"
on public.project_comments for update
using (author_id = auth.uid() and public.is_project_member(project_id, array['owner','editor','commenter']::public.collaboration_role[]))
with check (author_id = auth.uid() and public.is_project_member(project_id, array['owner','editor','commenter']::public.collaboration_role[]));

-- JY-20：作者删除自己的评论也要求仍是有效成员 | Authors must still be active members to delete
create policy "project_comments_delete_author_or_owner"
on public.project_comments for delete
using (
  (author_id = auth.uid() and public.is_project_member(project_id, array['owner','editor','commenter']::public.collaboration_role[]))
  or public.is_project_member(project_id, array['owner']::public.collaboration_role[])
);

-- ── Storage（路径第一段是 project_id）| Storage (first path segment = project_id) ──

create policy "storage_select_project_assets"
on storage.objects for select
using (
  bucket_id in ('project-audio', 'project-exports', 'project-attachments')
  and public.is_project_member((storage.foldername(name))[1]::uuid)
);

create policy "storage_insert_project_assets"
on storage.objects for insert
with check (
  bucket_id in ('project-audio', 'project-exports', 'project-attachments')
  and public.is_project_member((storage.foldername(name))[1]::uuid, array['owner','editor']::public.collaboration_role[])
  and public.project_is_live((storage.foldername(name))[1]::uuid)
);

create policy "storage_update_project_assets"
on storage.objects for update
using (
  bucket_id in ('project-audio', 'project-exports', 'project-attachments')
  and public.is_project_member((storage.foldername(name))[1]::uuid, array['owner','editor']::public.collaboration_role[])
  and public.project_is_live((storage.foldername(name))[1]::uuid)
)
with check (
  bucket_id in ('project-audio', 'project-exports', 'project-attachments')
  and public.is_project_member((storage.foldername(name))[1]::uuid, array['owner','editor']::public.collaboration_role[])
  and public.project_is_live((storage.foldername(name))[1]::uuid)
);

create policy "storage_delete_project_assets"
on storage.objects for delete
using (
  bucket_id in ('project-audio', 'project-exports', 'project-attachments')
  and public.is_project_member((storage.foldername(name))[1]::uuid, array['owner','editor']::public.collaboration_role[])
  and public.project_is_live((storage.foldername(name))[1]::uuid)
);
