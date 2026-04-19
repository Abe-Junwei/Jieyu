-- 004 — 项目 owner 自动拥有成员身份，并回填历史项目 | Ensure project owners are always project members and backfill existing rows
--
-- 目的 | Goal
-- 1. 修复仅靠 project_members 判断导致 owner 可能无法通过成员型 RLS 的问题。
-- 2. 为已有 projects 回填一条 owner membership。
-- 3. 新建/转移 owner 时自动同步 project_members。

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
          and (
            allowed_roles is null
            or 'owner'::public.collaboration_role = any(allowed_roles)
          )
        )
        or (
          pm.user_id is not null
          and (
            allowed_roles is null
            or pm.role = any(allowed_roles)
          )
        )
      )
  );
$$;

insert into public.project_members (
  project_id,
  user_id,
  role,
  invited_by,
  joined_at,
  disabled_at
)
select
  p.id,
  p.owner_id,
  'owner'::public.collaboration_role,
  p.owner_id,
  p.created_at,
  null
from public.projects p
where p.owner_id is not null
on conflict (project_id, user_id) do update
set
  role = 'owner'::public.collaboration_role,
  disabled_at = null;

create or replace function public.sync_project_owner_membership()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.project_members (
    project_id,
    user_id,
    role,
    invited_by,
    joined_at,
    disabled_at
  )
  values (
    new.id,
    new.owner_id,
    'owner'::public.collaboration_role,
    new.owner_id,
    coalesce(new.created_at, now()),
    null
  )
  on conflict (project_id, user_id) do update
  set
    role = 'owner'::public.collaboration_role,
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

drop trigger if exists trg_sync_project_owner_membership on public.projects;
create trigger trg_sync_project_owner_membership
after insert or update of owner_id on public.projects
for each row
execute function public.sync_project_owner_membership();
