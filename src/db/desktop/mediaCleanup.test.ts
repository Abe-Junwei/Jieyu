import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { finishMediaCleanup } from './mediaCleanup';
import { openProject } from './openProject';

const roots: string[] = [];
const PAST = '2020-01-01T00:00:00.000Z';

function folder(): string {
  const root = mkdtempSync(join(tmpdir(), 'jieyu-media-cleanup-'));
  roots.push(root);
  return root;
}

afterEach(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
  roots.length = 0;
});

describe('media file cleanup', () => {
  it('refuses a recording that is still referenced or inside its window', async () => {
    const dir = folder();
    const project = openProject(dir);
    writeReady(project.db, dir, 'live.wav', 'live-wav');
    const calls: string[] = [];
    await expect(
      finishMediaCleanup(project.db, dir, 'media-1', 'op-1', async (file) => {
        calls.push(file);
        return 'moved';
      }),
    ).rejects.toThrow('media is active');
    project.db
      .prepare(
        'UPDATE media SET deleted_at = ?, retain_until = ?, reminder_shown_at = ? WHERE id = ?',
      )
      .run(PAST, PAST, null, 'media-1');
    await expect(
      finishMediaCleanup(project.db, dir, 'media-1', 'op-1', async () => 'moved'),
    ).rejects.toThrow('reminder has not been shown');
    project.db
      .prepare('UPDATE media SET reminder_shown_at = ? WHERE id = ?')
      .run(new Date().toISOString(), 'media-1');
    await expect(
      finishMediaCleanup(project.db, dir, 'media-1', 'op-1', async () => 'moved'),
    ).rejects.toThrow('media is inside its retention window');
    project.db.prepare('UPDATE media SET reminder_shown_at = ? WHERE id = ?').run(PAST, 'media-1');
    project.db
      .prepare(
        'INSERT INTO manuscripts (id, title_json, media_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
      )
      .run('ms-1', '{"zh":"还在"}', 'media-1', PAST, PAST);
    await expect(
      finishMediaCleanup(project.db, dir, 'media-1', 'op-1', async () => 'moved'),
    ).rejects.toThrow('media is still referenced');
    expect(calls).toEqual([]);
    expect(count(project.db, 'media_cleanups')).toBe(0);
    expect(existsSync(join(dir, 'live.wav'))).toBe(true);
    project.close();
  });

  it('clears the registration only after the matching file is moved', async () => {
    const dir = folder();
    const project = openProject(dir);
    writeReady(project.db, dir, 'gone.wav', 'gone-wav');
    project.db
      .prepare(
        'UPDATE media SET deleted_at = ?, retain_until = ?, reminder_shown_at = ? WHERE id = ?',
      )
      .run(PAST, PAST, PAST, 'media-1');
    project.db
      .prepare(
        `INSERT INTO sources (id, media_id, label, external_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run('source-1', 'media-1', '来源', 'ext-1', PAST, PAST);
    const moved = await finishMediaCleanup(project.db, dir, 'media-1', 'op-1', async (file) => {
      rmSync(file);
      return 'moved';
    });
    expect(moved).toEqual({ id: 'op-1', state: 'confirmed' });
    expect(count(project.db, 'media')).toBe(0);
    expect(project.db.prepare('SELECT media_id FROM sources WHERE id = ?').get('source-1')).toEqual(
      {
        media_id: null,
      },
    );
    expect(state(project.db, 'op-1')).toBe('confirmed');
    const again = await finishMediaCleanup(project.db, dir, 'media-1', 'op-1', async () => {
      throw new Error('called again');
    });
    expect(again.state).toBe('confirmed');
    project.close();
  });

  it('keeps the recording when trash fails, is unknown, or the file is not the one recorded', async () => {
    const failedDir = folder();
    const failed = openProject(failedDir);
    writeReady(failed.db, failedDir, 'a.wav', 'body');
    due(failed.db);
    await expect(
      finishMediaCleanup(failed.db, failedDir, 'media-1', 'op-fail', async () => {
        throw new Error('trash down');
      }),
    ).resolves.toEqual({ id: 'op-fail', state: 'failed' });
    expect(count(failed.db, 'media')).toBe(1);
    expect(existsSync(join(failedDir, 'a.wav'))).toBe(true);
    await expect(
      finishMediaCleanup(failed.db, failedDir, 'media-1', 'op-other', async () => 'moved'),
    ).rejects.toThrow('media cleanup is already open');

    const unknownDir = folder();
    const unknown = openProject(unknownDir);
    writeReady(unknown.db, unknownDir, 'a.wav', 'body');
    due(unknown.db);
    await expect(
      finishMediaCleanup(unknown.db, unknownDir, 'media-1', 'op-unknown', async () => 'unknown'),
    ).resolves.toEqual({ id: 'op-unknown', state: 'unknown' });
    expect(count(unknown.db, 'media')).toBe(1);

    const stayedDir = folder();
    const stayed = openProject(stayedDir);
    writeReady(stayed.db, stayedDir, 'a.wav', 'body');
    due(stayed.db);
    await expect(
      finishMediaCleanup(stayed.db, stayedDir, 'media-1', 'op-stayed', async () => 'moved'),
    ).resolves.toEqual({ id: 'op-stayed', state: 'unknown' });
    expect(existsSync(join(stayedDir, 'a.wav'))).toBe(true);

    const replacedDir = folder();
    const replaced = openProject(replacedDir);
    writeReady(replaced.db, replacedDir, 'a.wav', 'body');
    due(replaced.db);
    writeFileSync(join(replacedDir, 'a.wav'), Buffer.from('other-body'));
    let called = false;
    await expect(
      finishMediaCleanup(replaced.db, replacedDir, 'media-1', 'op-replaced', async () => {
        called = true;
        return 'moved';
      }),
    ).resolves.toEqual({ id: 'op-replaced', state: 'unknown' });
    expect(called).toBe(false);
    expect(count(replaced.db, 'media')).toBe(1);

    const missingDir = folder();
    const missing = openProject(missingDir);
    writeReady(missing.db, missingDir, 'a.wav', 'body');
    due(missing.db);
    rmSync(join(missingDir, 'a.wav'));
    await expect(
      finishMediaCleanup(missing.db, missingDir, 'media-1', 'op-missing', async () => 'moved'),
    ).resolves.toEqual({ id: 'op-missing', state: 'unknown' });
    expect(count(missing.db, 'media')).toBe(1);

    failed.close();
    unknown.close();
    stayed.close();
    replaced.close();
    missing.close();
  });
});

function writeReady(
  db: ReturnType<typeof openProject>['db'],
  dir: string,
  name: string,
  body: string,
): void {
  const bytes = Buffer.from(body);
  writeFileSync(join(dir, name), bytes);
  const digest = createHash('sha256').update(bytes).digest('hex');
  db.prepare(
    'INSERT INTO media (id, relpath, sha256, filename, duration, created_at) VALUES (?, ?, ?, ?, ?, ?)',
  ).run('media-1', name, digest, name, 1, PAST);
}

function due(db: ReturnType<typeof openProject>['db']): void {
  db.prepare(
    'UPDATE media SET deleted_at = ?, retain_until = ?, reminder_shown_at = ? WHERE id = ?',
  ).run(PAST, PAST, PAST, 'media-1');
}

function count(db: ReturnType<typeof openProject>['db'], table: string): number {
  const row = db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number };
  return row.n;
}

function state(db: ReturnType<typeof openProject>['db'], id: string): string {
  const row = db.prepare('SELECT state FROM media_cleanups WHERE id = ?').get(id) as {
    state: string;
  };
  return row.state;
}
