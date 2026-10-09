// @vitest-environment node
/**
 * 云端基线脚本在真实 Postgres（PGlite，进程内 WASM）上执行（rev5 T49、T25、T52(b)、JY-20）。
 * The cloud baseline runs on a real Postgres (PGlite, in-process WASM) — rev5 T49, T25, T52(b), JY-20.
 *
 * 没有 Supabase 实例（2026-10-09），所以这里用最小的 Supabase 外壳（auth.uid()、storage.objects、
 * authenticated 角色）代替“隔离的 Supabase 项目”。RLS、触发器、错误码都是 Postgres 自己执行的。
 * There is no Supabase instance, so a minimal Supabase shell (auth.uid(), storage.objects, the
 * authenticated role) stands in for an isolated project. RLS, triggers and error codes are real.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const BASELINE_SQL = readFileSync(
  resolve(__dirname, '../../../supabase/sql/001_collaboration_baseline.sql'),
  'utf8',
);

const SUPABASE_SHELL_SQL = `
create schema auth;
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
create schema storage;
create table storage.objects (id bigserial primary key, bucket_id text not null, name text not null);
create function storage.foldername(name text) returns text[] language sql immutable as $$
  select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1]
$$;
alter table storage.objects enable row level security;
create role authenticated nologin;
`;

const GRANTS_SQL = `
grant usage on schema public, auth, storage to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant select, insert, update, delete on storage.objects to authenticated;
grant usage on all sequences in schema storage to authenticated;
grant execute on all functions in schema public to authenticated;
`;

const OWNER = '00000000-0000-4000-8000-000000000001';
const EDITOR = '00000000-0000-4000-8000-000000000002';
const COMMENTER = '00000000-0000-4000-8000-000000000003';
const OUTSIDER = '00000000-0000-4000-8000-000000000004';
const PROJECT = '10000000-0000-4000-8000-000000000001';
const CLIENT_VERSION = '1.1.0';

let db: PGlite;

async function asUser<T>(userId: string, run: () => Promise<T>): Promise<T> {
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [userId]);
  await db.exec('set role authenticated');
  try {
    return await run();
  } finally {
    await db.exec('reset role');
    await db.query(`select set_config('request.jwt.claim.sub', '', false)`);
  }
}

async function expectSqlState(run: () => Promise<unknown>, code: string): Promise<void> {
  let caught: unknown = null;
  try {
    await run();
  } catch (error) {
    caught = error;
  }
  expect(caught, `expected SQLSTATE ${code}`).not.toBeNull();
  expect((caught as { code?: string }).code).toBe(code);
}

let opCounter = 0;
function insertChange(
  userId: string,
  overrides: {
    protocolVersion?: number;
    clientAppVersion?: string;
    clientId?: string;
    clientOpId?: string;
    opType?: string;
  } = {},
) {
  opCounter += 1;
  return asUser(userId, () =>
    db.query(
      `insert into public.project_changes
         (project_id, actor_id, client_id, client_op_id, protocol_version, client_app_version,
          project_revision, entity_type, entity_id, op_type, payload)
       values ($1, $2, $3, $4, $5, $6, 0, 'layer_unit', 'u1', $7::public.project_change_op, '{}'::jsonb)
       returning project_revision`,
      [
        PROJECT,
        userId,
        overrides.clientId ?? 'web-client-a',
        overrides.clientOpId ?? `op-${opCounter}`,
        overrides.protocolVersion ?? 1,
        overrides.clientAppVersion ?? CLIENT_VERSION,
        overrides.opType ?? 'upsert_unit',
      ],
    ),
  );
}

function insertSnapshot(userId: string, version: number, clientAppVersion = CLIENT_VERSION) {
  return asUser(userId, () =>
    db.query(
      `insert into public.project_snapshots
         (project_id, version, schema_version, protocol_version, client_app_version, created_by,
          snapshot_storage_bucket, snapshot_storage_path, checksum, size_bytes, change_cursor)
       values ($1, $2, 1, 1, $3, $4, 'project-exports', $5, 'abc', 10, 0)
       returning id`,
      [PROJECT, version, clientAppVersion, userId, `${PROJECT}/snap-${version}.json`],
    ),
  );
}

function insertAsset(userId: string, path: string) {
  return asUser(userId, () =>
    db.query(
      `insert into public.project_assets
         (project_id, asset_type, storage_bucket, storage_path, size_bytes, protocol_version, client_app_version, uploaded_by)
       values ($1, 'audio', 'project-audio', $2, 1, 1, $3, $4)
       returning id`,
      [PROJECT, path, CLIENT_VERSION, userId],
    ),
  );
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(SUPABASE_SHELL_SQL);
  await db.exec(BASELINE_SQL);
  await db.exec(GRANTS_SQL);
}, 120_000);

afterAll(async () => {
  await db?.close();
});

beforeEach(async () => {
  // 每个用例一个新项目：先以超级用户清掉上一个（含墓碑）| Fresh project per case (superuser cleanup)
  await db.exec(`
    delete from public.project_tombstones;
    alter table public.projects disable trigger user;
    alter table public.project_members disable trigger user;
    alter table public.project_changes disable trigger user;
    alter table public.project_snapshots disable trigger user;
    alter table public.project_assets disable trigger user;
    alter table public.project_presence disable trigger user;
    alter table public.project_comments disable trigger user;
    delete from public.projects;
    alter table public.projects enable trigger user;
    alter table public.project_members enable trigger user;
    alter table public.project_changes enable trigger user;
    alter table public.project_snapshots enable trigger user;
    alter table public.project_assets enable trigger user;
    alter table public.project_presence enable trigger user;
    alter table public.project_comments enable trigger user;
    delete from storage.objects;
  `);
  await asUser(OWNER, () =>
    db.query(`insert into public.projects (id, name, owner_id) values ($1, 'P', $2)`, [
      PROJECT,
      OWNER,
    ]),
  );
  await asUser(OWNER, () =>
    db.query(
      `insert into public.project_members (project_id, user_id, role, invited_by)
       values ($1, $2, 'editor', $4), ($1, $3, 'commenter', $4)`,
      [PROJECT, EDITOR, COMMENTER, OWNER],
    ),
  );
});

describe('T49 baseline equals former 001–004 plus section 9', () => {
  it('creates every table with RLS on', async () => {
    const { rows } = await db.query<{ relname: string; relrowsecurity: boolean }>(
      `select c.relname, c.relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind = 'r' order by c.relname`,
    );
    expect(rows.map((row) => row.relname)).toEqual([
      'project_assets',
      'project_changes',
      'project_comments',
      'project_members',
      'project_presence',
      'project_snapshots',
      'project_tombstones',
      'projects',
    ]);
    expect(rows.every((row) => row.relrowsecurity)).toBe(true);
  });

  it('004: the owner is a member automatically and passes member checks', async () => {
    const { rows } = await db.query<{ role: string }>(
      `select role from public.project_members where project_id = $1 and user_id = $2`,
      [PROJECT, OWNER],
    );
    expect(rows).toEqual([{ role: 'owner' }]);
    const visible = await asUser(OWNER, () => db.query(`select id from public.projects`));
    expect(visible.rows).toHaveLength(1);
    const hidden = await asUser(OUTSIDER, () => db.query(`select id from public.projects`));
    expect(hidden.rows).toHaveLength(0);
  });

  it('001: revisions are allocated in order and latest_revision follows', async () => {
    const first = await insertChange(EDITOR);
    const second = await insertChange(OWNER);
    expect(first.rows[0]).toEqual({ project_revision: 1 });
    expect(second.rows[0]).toEqual({ project_revision: 2 });
    const { rows } = await db.query<{ latest_revision: number }>(
      `select latest_revision from public.projects where id = $1`,
      [PROJECT],
    );
    expect(Number(rows[0]!.latest_revision)).toBe(2);
  });

  it('002: audit columns must equal auth.uid() on insert', async () => {
    await expectSqlState(
      () =>
        asUser(EDITOR, () =>
          db.query(
            `insert into public.project_changes
               (project_id, actor_id, client_id, client_op_id, protocol_version, client_app_version,
                project_revision, entity_type, entity_id, op_type, payload)
             values ($1, $2, 'c', 'spoof', 1, '1.1.0', 0, 'layer_unit', 'u', 'upsert_unit', '{}')`,
            [PROJECT, OWNER],
          ),
        ),
      '42501',
    );
    await expectSqlState(
      () => insertSnapshot(OWNER, 1).then(() => insertSnapshotAs(EDITOR, OWNER)),
      '42501',
    );
  });

  it('003: the dedupe key includes client_id', async () => {
    await insertChange(EDITOR, { clientId: 'web-a', clientOpId: 'same' });
    await insertChange(EDITOR, { clientId: 'web-b', clientOpId: 'same' });
    await expectSqlState(
      () => insertChange(EDITOR, { clientId: 'web-a', clientOpId: 'same' }),
      '23505',
    );
  });

  it('001: commenters may only add comment changes; outsiders nothing', async () => {
    await expectSqlState(() => insertChange(COMMENTER), '42501');
    await insertChange(COMMENTER, { opType: 'comment_added' });
    await expectSqlState(() => insertChange(OUTSIDER), '42501');
  });

  it('the change log stays immutable', async () => {
    await insertChange(EDITOR);
    const updated = await asUser(OWNER, () =>
      db.query(`update public.project_changes set entity_id = 'x' returning id`),
    );
    expect(updated.rows).toHaveLength(0);
    const deleted = await asUser(OWNER, () =>
      db.query(`delete from public.project_changes returning id`),
    );
    expect(deleted.rows).toHaveLength(0);
  });
});

async function insertSnapshotAs(actor: string, claimedCreator: string) {
  return asUser(actor, () =>
    db.query(
      `insert into public.project_snapshots
         (project_id, version, schema_version, protocol_version, client_app_version, created_by,
          snapshot_storage_bucket, snapshot_storage_path, checksum, size_bytes, change_cursor)
       values ($1, 99, 1, 1, '1.1.0', $2, 'project-exports', $3, 'abc', 1, 0)`,
      [PROJECT, claimedCreator, `${PROJECT}/spoof.json`],
    ),
  );
}

async function deleteProject(userId = OWNER) {
  return asUser(userId, () =>
    db.query<{ delete_cloud_project: string }>(`select public.delete_cloud_project($1)`, [PROJECT]),
  );
}

describe('9.2 tombstone (T25, T23 server side)', () => {
  it('only the owner can delete; the call is idempotent and writes a tombstone', async () => {
    await expectSqlState(() => deleteProject(EDITOR), 'JYOWN');
    const first = await deleteProject();
    const second = await deleteProject();
    expect(second.rows[0]!.delete_cloud_project).toEqual(first.rows[0]!.delete_cloud_project);
    const tombstones = await asUser(EDITOR, () =>
      db.query<{ project_id: string; deleted_by: string }>(
        `select project_id, deleted_by from public.project_tombstones`,
      ),
    );
    expect(tombstones.rows).toEqual([{ project_id: PROJECT, deleted_by: OWNER }]);
    // 成员仍能读到墓碑 | Members still see the tombstone
    const row = await asUser(EDITOR, () =>
      db.query<{ deleted_at: string | null }>(
        `select deleted_at from public.projects where id = $1`,
        [PROJECT],
      ),
    );
    expect(row.rows[0]!.deleted_at).not.toBeNull();
  });

  it('rejects every write after the delete (an offline client coming back online)', async () => {
    await insertChange(EDITOR);
    await deleteProject();
    await expectSqlState(() => insertChange(EDITOR), 'JYDEL');
    await expectSqlState(() => insertSnapshot(EDITOR, 5), 'JYDEL');
    await expectSqlState(() => insertAsset(EDITOR, `${PROJECT}/a.wav`), 'JYDEL');
    await expectSqlState(
      () =>
        asUser(EDITOR, () =>
          db.query(`insert into public.project_presence (project_id, user_id) values ($1, $2)`, [
            PROJECT,
            EDITOR,
          ]),
        ),
      'JYDEL',
    );
    await expectSqlState(
      () =>
        asUser(COMMENTER, () =>
          db.query(
            `insert into public.project_comments (project_id, author_id, content) values ($1, $2, 'hi')`,
            [PROJECT, COMMENTER],
          ),
        ),
      'JYDEL',
    );
    await expectSqlState(
      () =>
        asUser(OWNER, () =>
          db.query(`update public.projects set name = 'again' where id = $1`, [PROJECT]),
        ),
      'JYDEL',
    );
    await expectSqlState(
      () =>
        asUser(OWNER, () =>
          db.query(
            `insert into public.project_members (project_id, user_id, role) values ($1, $2, 'viewer')`,
            [PROJECT, OUTSIDER],
          ),
        ),
      'JYDEL',
    );
    await expectSqlState(
      () =>
        asUser(EDITOR, () =>
          db.query(`insert into storage.objects (bucket_id, name) values ('project-audio', $1)`, [
            `${PROJECT}/x.wav`,
          ]),
        ),
      '42501',
    );
  });

  it('a deleted project cannot come back: no physical delete, no id reuse, no clearing deleted_at', async () => {
    await deleteProject();
    const removed = await asUser(OWNER, () => db.query(`delete from public.projects returning id`));
    expect(removed.rows).toHaveLength(0);
    // 管理员物理删除后，墓碑表仍然阻止同 id 重建 | After an admin purge, tombstones still block id reuse
    await db.exec(
      `alter table public.projects disable trigger user; delete from public.projects; alter table public.projects enable trigger user;`,
    );
    await expectSqlState(
      () =>
        asUser(OWNER, () =>
          db.query(`insert into public.projects (id, name, owner_id) values ($1, 'P', $2)`, [
            PROJECT,
            OWNER,
          ]),
        ),
      'JYDEL',
    );
  });

  it('owners cannot write the tombstone columns directly', async () => {
    await expectSqlState(
      () =>
        asUser(OWNER, () =>
          db.query(`update public.projects set deleted_at = now() where id = $1`, [PROJECT]),
        ),
      'JYIMM',
    );
    await expectSqlState(
      () =>
        asUser(OWNER, () =>
          db.query(
            `insert into public.projects (id, name, owner_id, deleted_at) values (gen_random_uuid(), 'Q', $1, now())`,
            [OWNER],
          ),
        ),
      'JYIMM',
    );
  });
});

describe('9.3 server-side protocol and client version checks (T52 b)', () => {
  it('rejects a mismatched protocol_version', async () => {
    await expectSqlState(() => insertChange(EDITOR, { protocolVersion: 2 }), 'JYPRT');
    await expectSqlState(() => insertChange(EDITOR, { protocolVersion: 0 }), 'JYPRT');
  });

  it('rejects clients below app_min_version or with an unparsable version', async () => {
    await expectSqlState(() => insertChange(EDITOR, { clientAppVersion: '1.0.9' }), 'JYVER');
    await expectSqlState(() => insertChange(EDITOR, { clientAppVersion: 'dev' }), 'JYVER');
    await expectSqlState(() => insertSnapshot(EDITOR, 3, '0.9.0'), 'JYVER');
    await insertChange(EDITOR, { clientAppVersion: '1.1.0-beta.1' });
    await insertChange(EDITOR, { clientAppVersion: '1.10.0' });
  });

  it('raising app_min_version locks out older clients', async () => {
    await insertChange(EDITOR, { clientAppVersion: '1.1.0' });
    await asUser(OWNER, () =>
      db.query(`update public.projects set app_min_version = '1.2.0' where id = $1`, [PROJECT]),
    );
    await expectSqlState(() => insertChange(EDITOR, { clientAppVersion: '1.1.0' }), 'JYVER');
    await insertChange(EDITOR, { clientAppVersion: '1.2.0' });
  });
});

describe('JY-20 immutable audit columns and revision counter', () => {
  it('snapshots: only the note can change', async () => {
    const { rows } = await insertSnapshot(OWNER, 1);
    const id = (rows[0] as { id: string }).id;
    await expectSqlState(
      () =>
        asUser(EDITOR, () =>
          db.query(
            `update public.project_snapshots set snapshot_storage_path = 'evil', checksum = 'x' where id = $1`,
            [id],
          ),
        ),
      'JYIMM',
    );
    await expectSqlState(
      () =>
        asUser(EDITOR, () =>
          db.query(`update public.project_snapshots set created_by = $2 where id = $1`, [
            id,
            EDITOR,
          ]),
        ),
      'JYIMM',
    );
    const ok = await asUser(EDITOR, () =>
      db.query(
        `update public.project_snapshots set note = 'checked' where id = $1 returning note`,
        [id],
      ),
    );
    expect(ok.rows).toEqual([{ note: 'checked' }]);
  });

  it('assets: uploader, path and checksum cannot change', async () => {
    const { rows } = await insertAsset(OWNER, `${PROJECT}/a.wav`);
    const id = (rows[0] as { id: string }).id;
    await expectSqlState(
      () =>
        asUser(EDITOR, () =>
          db.query(`update public.project_assets set uploaded_by = $2 where id = $1`, [id, EDITOR]),
        ),
      'JYIMM',
    );
    await expectSqlState(
      () =>
        asUser(EDITOR, () =>
          db.query(`update public.project_assets set storage_path = 'x' where id = $1`, [id]),
        ),
      'JYIMM',
    );
  });

  it('owners cannot move latest_revision by hand', async () => {
    await expectSqlState(
      () =>
        asUser(OWNER, () =>
          db.query(`update public.projects set latest_revision = 0 + 41 where id = $1`, [PROJECT]),
        ),
      'JYIMM',
    );
    await insertChange(EDITOR);
    const { rows } = await db.query<{ latest_revision: number }>(
      `select latest_revision from public.projects`,
    );
    expect(Number(rows[0]!.latest_revision)).toBe(1);
  });

  it('disabled members cannot delete their own comments; active authors can', async () => {
    const inserted = await asUser(COMMENTER, () =>
      db.query<{ id: string }>(
        `insert into public.project_comments (project_id, author_id, content) values ($1, $2, 'a'), ($1, $2, 'b') returning id`,
        [PROJECT, COMMENTER],
      ),
    );
    const [first, second] = inserted.rows.map((row) => row.id);
    const own = await asUser(COMMENTER, () =>
      db.query(`delete from public.project_comments where id = $1 returning id`, [first]),
    );
    expect(own.rows).toHaveLength(1);
    await asUser(OWNER, () =>
      db.query(
        `update public.project_members set disabled_at = now() where project_id = $1 and user_id = $2`,
        [PROJECT, COMMENTER],
      ),
    );
    const blocked = await asUser(COMMENTER, () =>
      db.query(`delete from public.project_comments where id = $1 returning id`, [second]),
    );
    expect(blocked.rows).toHaveLength(0);
  });

  it('comment author and project cannot be reassigned', async () => {
    const inserted = await asUser(COMMENTER, () =>
      db.query<{ id: string }>(
        `insert into public.project_comments (project_id, author_id, content) values ($1, $2, 'a') returning id`,
        [PROJECT, COMMENTER],
      ),
    );
    await expectSqlState(
      () =>
        asUser(COMMENTER, () =>
          db.query(
            `update public.project_comments set created_at = now() - interval '1 day' where id = $1`,
            [inserted.rows[0]!.id],
          ),
        ),
      'JYIMM',
    );
  });
});
