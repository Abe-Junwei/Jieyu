-- 出站重试：同一 (project_id, client_id, client_op_id) 且内容相同则返回原 revision，不占新号。
-- 内容不同拒绝。权限、协议、墓碑仍由现有 RLS 与 jieyu_gate_versioned_write 拒绝。
-- 不要把客户端 insert 换成 upsert(ignoreDuplicates)：assign_project_revision 在唯一约束之前就会占号。
-- 成员对 projects 没有 UPDATE 策略，SELECT FOR UPDATE 会被 RLS 滤掉。锁放在 security definer 里。

create or replace function public.jieyu_lock_live_project(p_project_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform 1 from public.projects where id = p_project_id for update;
  if not found then
    raise exception using errcode = 'JYNOP', message = format('JIEYU_UNKNOWN_PROJECT: %s', p_project_id);
  end if;
end;
$$;

create or replace function public.append_project_changes(p_changes jsonb)
returns table (client_op_id text, project_revision bigint)
language plpgsql
security invoker
set search_path = public
as $$
declare
  item jsonb;
  existing public.project_changes%rowtype;
  inserted bigint;
  project_uuid uuid;
begin
  if p_changes is null or jsonb_typeof(p_changes) <> 'array' then
    raise exception using errcode = '22023', message = 'JIEYU_INVALID_CHANGES';
  end if;

  for item in select value from jsonb_array_elements(p_changes)
  loop
    project_uuid := (item->>'project_id')::uuid;

    if not public.is_project_member(project_uuid) then
      raise exception using errcode = '42501', message = 'JIEYU_NOT_A_MEMBER';
    end if;
    -- 与 delete_cloud_project 的 FOR UPDATE 同一把锁，查重和占号串行。
    perform public.jieyu_lock_live_project(project_uuid);

    perform public.jieyu_assert_project_write_allowed(
      project_uuid,
      (item->>'protocol_version')::integer,
      item->>'client_app_version',
      true
    );

    select * into existing
      from public.project_changes c
     where c.project_id = project_uuid
       and c.client_id = item->>'client_id'
       and c.client_op_id = item->>'client_op_id';

    if found then
      if existing.actor_id is distinct from (item->>'actor_id')::uuid
         or existing.session_id is distinct from nullif(item->>'session_id', '')
         or existing.protocol_version is distinct from (item->>'protocol_version')::integer
         or existing.client_app_version is distinct from item->>'client_app_version'
         or existing.base_revision is distinct from coalesce((item->>'base_revision')::bigint, 0)
         or existing.entity_type is distinct from item->>'entity_type'
         or existing.entity_id is distinct from item->>'entity_id'
         or existing.op_type::text is distinct from item->>'op_type'
         or existing.payload is distinct from item->'payload'
         or existing.payload_ref_path is distinct from nullif(item->>'payload_ref_path', '')
         or existing.vector_clock is distinct from item->'vector_clock'
         or existing.source_kind::text is distinct from coalesce(item->>'source_kind', 'user')
      then
        raise exception using errcode = 'JYDUP', message = 'JIEYU_OP_CONTENT_MISMATCH';
      end if;
      client_op_id := existing.client_op_id;
      project_revision := existing.project_revision;
      return next;
      continue;
    end if;

    insert into public.project_changes (
      project_id, actor_id, client_id, client_op_id, session_id,
      protocol_version, client_app_version, project_revision, base_revision,
      entity_type, entity_id, op_type, payload, payload_ref_path, vector_clock, source_kind
    ) values (
      project_uuid,
      (item->>'actor_id')::uuid,
      item->>'client_id',
      item->>'client_op_id',
      nullif(item->>'session_id', ''),
      (item->>'protocol_version')::integer,
      item->>'client_app_version',
      0,
      coalesce((item->>'base_revision')::bigint, 0),
      item->>'entity_type',
      item->>'entity_id',
      (item->>'op_type')::public.project_change_op,
      item->'payload',
      nullif(item->>'payload_ref_path', ''),
      item->'vector_clock',
      coalesce((item->>'source_kind')::public.project_change_source_kind, 'user')
    )
    returning public.project_changes.project_revision into inserted;

    client_op_id := item->>'client_op_id';
    project_revision := inserted;
    return next;
  end loop;
end;
$$;
