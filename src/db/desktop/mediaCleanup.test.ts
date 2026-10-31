import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { callDesktopSession } from './desktopCall';
import { finishMediaCleanup } from './mediaCleanup';
import { restoreRegisteredMedia } from './mediaReregister';
import { openProject } from './openProject';
import { openDesktopSession, resetDesktopSessions } from './projectSession';

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
    expect(state(failed.db, 'op-fail')).toBe('failed');
    await expect(
      finishMediaCleanup(failed.db, failedDir, 'media-1', 'op-other', async () => 'moved'),
    ).rejects.toThrow('media cleanup is already open');
    failed.close();
    const reopened = openProject(failedDir);
    expect(state(reopened.db, 'op-fail')).toBe('failed');
    expect(count(reopened.db, 'media')).toBe(1);
    expect(existsSync(join(failedDir, 'a.wav'))).toBe(true);
    reopened.close();

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

    unknown.close();
    stayed.close();
    replaced.close();
    missing.close();
  });

  it('refuses to restore a recording while its trash call is in flight', async () => {
    const dir = folder();
    const project = openProject(dir);
    writeReady(project.db, dir, 'gone.wav', 'gone-wav');
    due(project.db);
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const cleanup = finishMediaCleanup(project.db, dir, 'media-1', 'op', async (file) => {
      await gate;
      rmSync(file);
      return 'moved';
    });
    await new Promise((resolve) => setImmediate(resolve));
    expect(() => restoreRegisteredMedia(project.db, 'media-1')).toThrow(
      'media cleanup is in progress',
    );
    release();
    await expect(cleanup).resolves.toEqual({ id: 'op', state: 'unknown' });
    expect(existsSync(join(dir, 'gone.wav'))).toBe(false);
    expect(project.db.prepare('SELECT id FROM media').all()).toEqual([{ id: 'media-1' }]);
    project.close();
    const reopened = openProject(dir);
    expect(reopened.db.prepare('SELECT id FROM media').all()).toEqual([{ id: 'media-1' }]);
    expect(state(reopened.db, 'op')).toBe('unknown');
    reopened.close();
  });

  it('refuses a second cleanup of the same recording while trash is in flight', async () => {
    const dir = folder();
    const project = openProject(dir);
    writeReady(project.db, dir, 'gone.wav', 'gone-wav');
    due(project.db);
    let calls = 0;
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const cleanup = finishMediaCleanup(project.db, dir, 'media-1', 'op', async (file) => {
      calls += 1;
      await gate;
      rmSync(file);
      return 'moved';
    });
    await new Promise((resolve) => setImmediate(resolve));
    await expect(
      finishMediaCleanup(project.db, dir, 'media-1', 'op', async () => {
        calls += 1;
        return 'moved';
      }),
    ).rejects.toThrow('media cleanup is in progress');
    release();
    await expect(cleanup).resolves.toEqual({ id: 'op', state: 'confirmed' });
    expect(calls).toBe(1);
    project.close();
  });

  it('cancels a stored cleanup intent when the recording is restored before trash', async () => {
    const dir = folder();
    const project = openProject(dir);
    writeReady(project.db, dir, 'gone.wav', 'gone-wav');
    due(project.db);
    const media = project.db
      .prepare('SELECT relpath, sha256 FROM media WHERE id = ?')
      .get('media-1') as {
      relpath: string;
      sha256: string;
    };
    project.db
      .prepare(
        `INSERT INTO media_cleanups (id, media_id, relpath, sha256, state)
         VALUES (?, ?, ?, ?, 'intent')`,
      )
      .run('op', 'media-1', media.relpath, media.sha256);
    expect(restoreRegisteredMedia(project.db, 'media-1')).toEqual({ id: 'media-1' });
    expect(count(project.db, 'media_cleanups')).toBe(0);
    let called = false;
    await expect(
      finishMediaCleanup(project.db, dir, 'media-1', 'op', async () => {
        called = true;
        return 'moved';
      }),
    ).rejects.toThrow('media is active');
    expect(called).toBe(false);
    expect(existsSync(join(dir, 'gone.wav'))).toBe(true);
    project.close();
  });

  it('does not send an unknown cleanup to the trash again', async () => {
    const dir = folder();
    const project = openProject(dir);
    writeReady(project.db, dir, 'a.wav', 'body');
    due(project.db);
    await expect(
      finishMediaCleanup(project.db, dir, 'media-1', 'op-unknown', async () => 'unknown'),
    ).resolves.toEqual({ id: 'op-unknown', state: 'unknown' });
    let called = false;
    await expect(
      finishMediaCleanup(project.db, dir, 'media-1', 'op-unknown', async () => {
        called = true;
        return 'moved';
      }),
    ).resolves.toEqual({ id: 'op-unknown', state: 'unknown' });
    expect(called).toBe(false);
    project.close();
    const reopened = openProject(dir);
    expect(state(reopened.db, 'op-unknown')).toBe('unknown');
    expect(count(reopened.db, 'media')).toBe(1);
    expect(existsSync(join(dir, 'a.wav'))).toBe(true);
    reopened.close();
  });

  it('does not confirm a cleanup whose recording identity changed during trash', async () => {
    const dir = folder();
    const project = openProject(dir);
    writeReady(project.db, dir, 'gone.wav', 'gone-wav');
    due(project.db);
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const cleanup = finishMediaCleanup(project.db, dir, 'media-1', 'op', async (file) => {
      await gate;
      project.db.prepare('UPDATE media SET sha256 = ? WHERE id = ?').run('0'.repeat(64), 'media-1');
      rmSync(file);
      return 'moved';
    });
    await new Promise((resolve) => setImmediate(resolve));
    release();
    await expect(cleanup).resolves.toEqual({ id: 'op', state: 'unknown' });
    expect(project.db.prepare('SELECT id FROM media').all()).toEqual([{ id: 'media-1' }]);
    project.close();
  });

  it('clears a recording through the desktop call and refuses a call without trash', async () => {
    const dir = folder();
    const project = openProject(dir);
    writeReady(project.db, dir, 'gone.wav', 'gone-wav');
    due(project.db);
    project.close();
    const session = openDesktopSession(dir, [dir]);
    try {
      expect(() =>
        callDesktopSession(session.sessionId, 'media.finishCleanup', {
          id: 'media-1',
          operationId: 'op-call',
        }),
      ).toThrow('media trash is missing');
      const cleared = await callDesktopSession(
        session.sessionId,
        'media.finishCleanup',
        { id: 'media-1', operationId: 'op-call' },
        async (file) => {
          rmSync(file);
          return 'moved';
        },
      );
      expect(cleared).toEqual({ id: 'op-call', state: 'confirmed' });
    } finally {
      resetDesktopSessions();
    }
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
