import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  closeDesktopSession,
  openDesktopSession,
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
      now: new Date('2026-10-27T18:00:00.000Z'),
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

  it('drops the session when the daily package cannot be written', () => {
    const dir = folder();
    const backupDir = folder();
    const opened = openDesktopSession(dir, [dir]);
    requireDesktopSession(opened.sessionId)
      .db.prepare(
        'INSERT INTO media (id, relpath, sha256, filename, duration, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      )
      .run('media-live', 'missing.wav', 'aa', 'missing.wav', 1, T);
    const before = readFileSync(join(dir, 'project.sqlite'));
    expect(() =>
      openDesktopSession(dir, [dir], {
        dir: backupDir,
        now: new Date('2026-10-27T12:00:00.000Z'),
      }),
    ).toThrow('media file is missing');
    expect(() => requireDesktopSession(opened.sessionId)).toThrow('project session expired');
    expect(existsSync(join(backupDir, '2026-10-27.jym'))).toBe(false);
    expect(readFileSync(join(dir, 'project.sqlite'))).toEqual(before);

    const inside = folder();
    expect(() =>
      openDesktopSession(inside, [inside], {
        dir: join(inside, 'backups'),
        now: new Date('2026-10-27T12:00:00.000Z'),
      }),
    ).toThrow('backup directory is inside the project');
    expect(existsSync(join(inside, 'backups'))).toBe(false);
  });
});
