import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { callDesktopSession } from './desktopCall';
import { openProject } from './openProject';
import { ensureProjectIdentity, getProjectIdentity } from './projectIdentity';
import { openDesktopSession, resetDesktopSessions } from './projectSession';

const roots: string[] = [];

function folder(): string {
  const root = mkdtempSync(join(tmpdir(), 'jieyu-project-identity-'));
  roots.push(root);
  writeFileSync(join(root, 'a.wav'), '');
  return root;
}

afterEach(() => {
  resetDesktopSessions();
  for (const root of roots) rmSync(root, { recursive: true, force: true });
  roots.length = 0;
});

describe('project identity', () => {
  it('keeps an existing title and refuses a second row', () => {
    const dir = folder();
    const project = openProject(dir);
    project.db
      .prepare('INSERT INTO project (id, title_json, created_at, updated_at) VALUES (?, ?, ?, ?)')
      .run('p1', '{"zh":"木雅"}', '2026-10-28T00:00:00.000Z', '2026-10-28T00:00:00.000Z');
    expect(ensureProjectIdentity(project.db, dir)).toMatchObject({
      id: 'p1',
      title: { zh: '木雅' },
    });
    project.db
      .prepare('INSERT INTO project (id, title_json, created_at, updated_at) VALUES (?, ?, ?, ?)')
      .run('p2', '{"zh":"另一"}', '2026-10-28T00:00:00.000Z', '2026-10-28T00:00:00.000Z');
    expect(() => getProjectIdentity(project.db)).toThrow('project is missing');
    project.close();
  });

  it('records the folder name once and reads it back after another open', () => {
    const dir = folder();
    const first = openDesktopSession(dir, [dir]);
    const opened = callDesktopSession(first.sessionId, 'project.get', {}) as {
      id: string;
      title: { und: string };
    };
    expect(opened.title.und).toBe(basename(dir));
    const again = openDesktopSession(dir, [dir]);
    expect(callDesktopSession(again.sessionId, 'project.get', {})).toMatchObject({
      id: opened.id,
      title: { und: basename(dir) },
    });
  });
});
