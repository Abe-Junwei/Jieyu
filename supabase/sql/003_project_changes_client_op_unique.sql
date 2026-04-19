-- 003 — project_changes 去重键纳入 client_id（与 001 之后执行）
-- 003 — Include client_id in project_changes dedupe key (apply after 001)
--
-- 前置：已应用 `001_collaboration_foundation.sql`；若已应用 `002_collaboration_rls_identity_bind.sql`，顺序不变。
-- Prerequisite: `001_collaboration_foundation.sql` applied; `002_*.sql` may already be applied.

-- Postgres 默认唯一约束名（两列 unique(project_id, client_op_id)）| Default PG unique constraint name
alter table public.project_changes
  drop constraint if exists project_changes_project_id_client_op_id_key;

alter table public.project_changes
  add constraint project_changes_project_client_client_op_key
  unique (project_id, client_id, client_op_id);
