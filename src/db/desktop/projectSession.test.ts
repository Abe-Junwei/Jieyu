import { existsSync, mkdtempSync, rmSync } from 'node:fs';
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
});
