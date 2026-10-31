import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { callDesktopSession } from './desktopCall';
import { reregisterMedia, restoreRegisteredMedia } from './mediaReregister';
import { openProject } from './openProject';
import { openDesktopSession, requireDesktopSession, resetDesktopSessions } from './projectSession';

const roots: string[] = [];
const PAST = '2020-01-01T00:00:00.000Z';

function folder(): string {
  const root = mkdtempSync(join(tmpdir(), 'jieyu-media-reregister-'));
  roots.push(root);
  return root;
}

afterEach(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
  roots.length = 0;
});

describe('media reregistration', () => {
  it('creates a new id and does not restore a source or a purged manuscript', () => {
    const dir = folder();
    const project = openProject(dir);
    const bytes = Buffer.from('fresh-wav');
    writeFileSync(join(dir, 'fresh.wav'), bytes);
    const created = reregisterMedia(project.db, dir, { relpath: 'fresh.wav', duration: 1 });
    expect(created.status).toBe('created');
    if (created.status !== 'created') return;
    const row = project.db
      .prepare('SELECT relpath, sha256, deleted_at FROM media WHERE id = ?')
      .get(created.id) as { relpath: string; sha256: string; deleted_at: string | null };
    expect(row).toEqual({
      relpath: 'fresh.wav',
      sha256: createHash('sha256').update(bytes).digest('hex'),
      deleted_at: null,
    });
    expect(count(project.db, 'sources')).toBe(0);
    expect(count(project.db, 'manuscripts')).toBe(0);
    project.close();
  });

  it('asks for a choice when the hash matches a deleted recording and restores only that recording', () => {
    const dir = folder();
    const project = openProject(dir);
    const bytes = Buffer.from('same-wav');
    writeFileSync(join(dir, 'same.wav'), bytes);
    const digest = createHash('sha256').update(bytes).digest('hex');
    insertDeleted(project.db, 'media-a', 'old-a.wav', digest);
    insertDeleted(project.db, 'media-b', 'old-b.wav', digest);
    project.db
      .prepare(
        'INSERT INTO manuscripts (id, title_json, media_id, deleted_at, retain_until, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      )
      .run('ms-1', '{"zh":"已删"}', 'media-a', PAST, PAST, PAST, PAST);
    project.db.prepare('UPDATE sources SET media_id = NULL WHERE id = ?').run('source-a');
    const choice = reregisterMedia(project.db, dir, { relpath: 'same.wav', duration: 1 });
    expect(choice).toEqual({ status: 'choose', ids: ['media-a', 'media-b'] });
    expect(count(project.db, 'media')).toBe(2);
    expect(restoreRegisteredMedia(project.db, 'media-a')).toEqual({ id: 'media-a' });
    expect(project.db.prepare('SELECT deleted_at FROM media WHERE id = ?').get('media-a')).toEqual({
      deleted_at: null,
    });
    expect(project.db.prepare('SELECT deleted_at FROM media WHERE id = ?').get('media-b')).toEqual({
      deleted_at: PAST,
    });
    expect(
      project.db.prepare('SELECT deleted_at FROM manuscripts WHERE id = ?').get('ms-1'),
    ).toEqual({ deleted_at: PAST });
    expect(project.db.prepare('SELECT media_id FROM sources WHERE id = ?').get('source-a')).toEqual(
      {
        media_id: null,
      },
    );
    project.close();
  });

  it('refuses a hash that is already an active recording', () => {
    const dir = folder();
    const project = openProject(dir);
    const bytes = Buffer.from('live-wav');
    writeFileSync(join(dir, 'live.wav'), bytes);
    const digest = createHash('sha256').update(bytes).digest('hex');
    project.db
      .prepare(
        'INSERT INTO media (id, relpath, sha256, filename, duration, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      )
      .run('media-live', 'live.wav', digest, 'live.wav', 1, PAST);
    writeFileSync(join(dir, 'copy.wav'), bytes);
    expect(() => reregisterMedia(project.db, dir, { relpath: 'copy.wav', duration: 1 })).toThrow(
      'media hash is already registered',
    );
    expect(count(project.db, 'media')).toBe(1);
    project.close();
  });

  it('reregisters and restores through the desktop call', () => {
    const dir = folder();
    writeFileSync(join(dir, 'fresh.wav'), Buffer.from('fresh-wav'));
    const session = openDesktopSession(dir, [dir]);
    try {
      const created = callDesktopSession(session.sessionId, 'media.reregister', {
        relpath: 'fresh.wav',
        duration: 1,
      });
      expect(created).toMatchObject({ status: 'created' });
      const id = (created as { id: string }).id;
      const db = requireDesktopSession(session.sessionId).db;
      db.prepare('UPDATE media SET deleted_at = ?, retain_until = ? WHERE id = ?').run(
        PAST,
        PAST,
        id,
      );
      expect(callDesktopSession(session.sessionId, 'media.restoreRegistered', { id })).toEqual({
        id,
      });
      expect(db.prepare('SELECT deleted_at FROM media WHERE id = ?').get(id)).toEqual({
        deleted_at: null,
      });
    } finally {
      resetDesktopSessions();
    }
  });

  it('refuses a new manuscript on a deleted recording', () => {
    const dir = folder();
    writeFileSync(join(dir, 'a.wav'), '');
    const session = openDesktopSession(dir, [dir]);
    try {
      const media = callDesktopSession(session.sessionId, 'media.create', {
        relpath: 'a.wav',
        sha256: 'aa',
        duration: 4,
      }) as { id: string };
      callDesktopSession(session.sessionId, 'media.delete', { id: media.id });
      expect(() =>
        callDesktopSession(session.sessionId, 'manuscripts.create', {
          mediaId: media.id,
          title: { und: 'new' },
        }),
      ).toThrow();
    } finally {
      resetDesktopSessions();
    }
  });
});

function insertDeleted(
  db: ReturnType<typeof openProject>['db'],
  id: string,
  name: string,
  digest: string,
): void {
  db.prepare(
    `INSERT INTO media (id, relpath, sha256, filename, duration, created_at, deleted_at, retain_until)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, name, digest, name, 1, PAST, PAST, PAST);
  db.prepare(
    `INSERT INTO sources (id, media_id, label, external_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(`source-${id.slice(-1)}`, id, '来源', `ext-${id}`, PAST, PAST);
}

function count(db: ReturnType<typeof openProject>['db'], table: string): number {
  const row = db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number };
  return row.n;
}
