import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { openProject } from './openProject';
import { DESKTOP_PROJECT_APPLICATION_ID } from './schema';

const roots: string[] = [];
const T = '2026-10-25T00:00:00.000Z';

function pragma(db: { prepare(source: string): { get(): unknown } }, name: string): unknown {
  const row = db.prepare(`PRAGMA ${name}`).get();
  if (typeof row !== 'object' || row === null) return undefined;
  return (row as Record<string, unknown>)[name];
}

function folder(): string {
  const root = mkdtempSync(join(tmpdir(), 'jieyu-desktop-project-'));
  roots.push(root);
  return root;
}

afterEach(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
  roots.length = 0;
});

describe('openProject', () => {
  it('publishes a new library, reopens it, and drops the temp file', () => {
    const dir = folder();
    const created = openProject(dir);
    expect(pragma(created.db, 'foreign_keys')).toBe(1);
    expect(pragma(created.db, 'journal_mode')).toBe('delete');
    expect(pragma(created.db, 'application_id')).toBe(DESKTOP_PROJECT_APPLICATION_ID);
    created.db
      .prepare(
        'INSERT INTO media (id, relpath, sha256, filename, duration, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      )
      .run('m1', 'a.wav', 'aa', 'a.wav', 1.5, T);
    created.close();

    const reopened = openProject(dir);
    const media = reopened.db.prepare('SELECT relpath, duration FROM media WHERE id = ?').get('m1');
    expect(pragma(reopened.db, 'foreign_keys')).toBe(1);
    expect(pragma(reopened.db, 'journal_mode')).toBe('delete');
    reopened.close();

    expect(media).toEqual({ relpath: 'a.wav', duration: 1.5 });
    expect(readdirSync(dir)).toEqual(['project.sqlite']);
  });

  it('leaves an existing file unchanged when initialization fails', () => {
    const dir = folder();
    const target = join(dir, 'project.sqlite');
    writeFileSync(target, 'keep');
    const before = readFileSync(target);

    expect(() => openProject(dir)).toThrow();
    expect(readFileSync(target)).toEqual(before);
    expect(readdirSync(dir)).toEqual(['project.sqlite']);
  });

  it('removes the temp file when schema initialization fails', () => {
    const dir = folder();
    expect(() => openProject(dir, 'NOT SQL')).toThrow();
    expect(readdirSync(dir)).toEqual([]);
  });
});
