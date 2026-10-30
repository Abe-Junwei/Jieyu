import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  closeDesktopSession,
  openDesktopSession,
  openPreparedDesktopSession,
  reopenDesktopSession,
  requireDesktopSession,
  resetDesktopSessions,
} from './projectSession';

const roots: string[] = [];
const T = '2026-10-25T00:00:00.000Z';

function folder(): string {
  const root = mkdtempSync(join(tmpdir(), 'jieyu-desktop-session-'));
  roots.push(root);
  return root;
}

afterEach(() => {
  resetDesktopSessions();
  for (const root of roots) rmSync(root, { recursive: true, force: true });
  roots.length = 0;
});

describe('desktop project session', () => {
  it('refuses a folder main did not grant and leaves no library', () => {
    const dir = folder();
    expect(() => openDesktopSession(dir, [])).toThrow('project folder refused');
    expect(existsSync(join(dir, 'project.sqlite'))).toBe(false);
  });

  it('expires the previous session on switch and does not write through it', () => {
    const firstDir = folder();
    const secondDir = folder();
    const allowed = [firstDir, secondDir];
    const first = openDesktopSession(firstDir, allowed);
    requireDesktopSession(first.sessionId)
      .db.prepare(
        'INSERT INTO media (id, relpath, sha256, filename, duration, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      )
      .run('m1', 'a.wav', 'aa', 'a.wav', 1, T);

    const second = openDesktopSession(secondDir, allowed);
    expect(() =>
      requireDesktopSession(first.sessionId)
        .db.prepare(
          'INSERT INTO media (id, relpath, sha256, filename, duration, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        )
        .run('m2', 'b.wav', 'bb', 'b.wav', 1, T),
    ).toThrow('project session expired');

    closeDesktopSession(second.sessionId);
    const reopened = openDesktopSession(firstDir, allowed);
    const rows = requireDesktopSession(reopened.sessionId).db.prepare('SELECT id FROM media').all();
    expect(rows).toEqual([{ id: 'm1' }]);
  });

  it('writes a daily package outside the project when the session opens', () => {
    const dir = folder();
    const backupDir = folder();
    writeFileSync(join(backupDir, 'upgrade.jym'), Buffer.from('keep'));
    const days = ['2026-10-24', '2026-10-25', '2026-10-26', '2026-10-27'];
    let sessionId = '';
    for (const day of days) {
      sessionId = openDesktopSession(dir, [dir], {
        dir: backupDir,
        now: new Date(`${day}T12:00:00.000Z`),
      }).sessionId;
    }
    const again = openDesktopSession(dir, [dir], {
      dir: backupDir,
      now: new Date(2026, 9, 27, 18, 0, 0),
    });
    expect(again.sessionId).not.toBe(sessionId);
    expect(() => requireDesktopSession(sessionId)).toThrow('project session expired');
    expect(requireDesktopSession(again.sessionId).db).toBeDefined();
    expect(existsSync(join(backupDir, '2026-10-24.jym'))).toBe(false);
    expect(
      readdirSync(backupDir)
        .filter((name) => name.endsWith('.jym'))
        .sort(),
    ).toEqual(['2026-10-25.jym', '2026-10-26.jym', '2026-10-27.jym', 'upgrade.jym']);
    expect(readFileSync(join(backupDir, 'upgrade.jym'))).toEqual(Buffer.from('keep'));
    expect(existsSync(join(dir, '2026-10-27.jym'))).toBe(false);

    const plain = folder();
    openDesktopSession(plain, [plain]);
    expect(existsSync(join(plain, '2026-10-27.jym'))).toBe(false);
  });

  it('still opens when the daily package cannot be written (#405)', () => {
    const dir = folder();
    const backupDir = folder();
    const opened = openDesktopSession(dir, [dir]);
    requireDesktopSession(opened.sessionId)
      .db.prepare(
        'INSERT INTO media (id, relpath, sha256, filename, duration, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      )
      .run('media-live', 'missing.wav', 'aa', 'missing.wav', 1, T);
    const before = readFileSync(join(dir, 'project.sqlite'));
    const again = openDesktopSession(dir, [dir], {
      dir: backupDir,
      now: new Date('2026-10-27T12:00:00.000Z'),
    });
    expect(again.backupSkipped).toMatch(/media file is missing/);
    expect(() => requireDesktopSession(opened.sessionId)).toThrow('project session expired');
    expect(requireDesktopSession(again.sessionId).db).toBeDefined();
    expect(existsSync(join(backupDir, '2026-10-27.jym'))).toBe(false);
    expect(readFileSync(join(dir, 'project.sqlite'))).toEqual(before);

    const inside = folder();
    const insideOpen = openDesktopSession(inside, [inside], {
      dir: join(inside, 'backups'),
      now: new Date('2026-10-27T12:00:00.000Z'),
    });
    expect(insideOpen.backupSkipped).toMatch(/backup directory is inside the project/);
    expect(requireDesktopSession(insideOpen.sessionId).db).toBeDefined();
    expect(existsSync(join(inside, 'backups'))).toBe(false);
  });

  it('does not write another daily package while the session stays open', () => {
    const dir = folder();
    const backupDir = folder();
    const opened = openDesktopSession(dir, [dir], {
      dir: backupDir,
      now: new Date('2026-10-27T12:00:00.000Z'),
    });
    const day = join(backupDir, '2026-10-27.jym');
    const packed = readFileSync(day);
    requireDesktopSession(opened.sessionId)
      .db.prepare(
        'INSERT INTO media (id, relpath, sha256, filename, duration, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      )
      .run('media-live', 'live.wav', 'aa', 'live.wav', 1, T);
    reopenDesktopSession(opened.sessionId);
    expect(
      requireDesktopSession(opened.sessionId).db.prepare('SELECT id FROM media').all(),
    ).toEqual([{ id: 'media-live' }]);
    expect(
      readdirSync(backupDir)
        .filter((name) => name.endsWith('.jym'))
        .sort(),
    ).toEqual(['2026-10-27.jym']);
    expect(readFileSync(day)).toEqual(packed);
    expect(existsSync(join(backupDir, '2026-10-28.jym'))).toBe(false);
  });

  it('opens a project whose daily JYM would exceed the package limit (#405)', () => {
    const dir = folder();
    const backupDir = folder();
    const opened = openDesktopSession(dir, [dir]);
    const big = Buffer.alloc(33 * 1024 * 1024, 1);
    writeFileSync(join(dir, 'big.wav'), big);
    const digest = createHash('sha256').update(big).digest('hex');
    requireDesktopSession(opened.sessionId)
      .db.prepare(
        'INSERT INTO media (id, relpath, sha256, filename, duration, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      )
      .run('media-big', 'big.wav', digest, 'big.wav', 1, T);

    const again = openDesktopSession(dir, [dir], {
      dir: backupDir,
      now: new Date('2026-10-28T12:00:00.000Z'),
    });
    expect(again.backupSkipped).toMatch(/too large/);
    expect(requireDesktopSession(again.sessionId).db).toBeDefined();
    expect(existsSync(join(backupDir, '2026-10-28.jym'))).toBe(false);
    expect(
      requireDesktopSession(again.sessionId)
        .db.prepare('SELECT id FROM media WHERE id = ?')
        .get('media-big'),
    ).toEqual({ id: 'media-big' });
  });

  it('keeps the live session when the restored folder cannot be prepared', () => {
    const liveDir = folder();
    const badDir = folder();
    const opened = openDesktopSession(liveDir, [liveDir, badDir]);
    const before = createHash('sha256')
      .update(readFileSync(join(liveDir, 'project.sqlite')))
      .digest('hex');
    writeFileSync(join(badDir, 'project.sqlite'), 'not a library');
    expect(() => openPreparedDesktopSession(badDir, [liveDir, badDir])).toThrow(
      'project.sqlite is not a Jieyu project library',
    );
    const row = requireDesktopSession(opened.sessionId)
      .db.prepare('SELECT id FROM project')
      .get() as { id: string };
    expect(row.id.length).toBeGreaterThan(0);
    expect(
      createHash('sha256')
        .update(readFileSync(join(liveDir, 'project.sqlite')))
        .digest('hex'),
    ).toBe(before);
  });

  it('switches only after the next project is prepared', () => {
    const liveDir = folder();
    const nextDir = folder();
    const opened = openDesktopSession(liveDir, [liveDir, nextDir]);
    const before = readFileSync(join(liveDir, 'project.sqlite'));
    const next = openPreparedDesktopSession(nextDir, [liveDir, nextDir]);
    expect(next.sessionId).not.toBe(opened.sessionId);
    expect(() => requireDesktopSession(opened.sessionId)).toThrow('project session expired');
    expect(
      requireDesktopSession(next.sessionId).db.prepare('SELECT COUNT(*) AS n FROM project').get(),
    ).toEqual({ n: 1 });
    expect(readFileSync(join(liveDir, 'project.sqlite'))).toEqual(before);
  });
});
