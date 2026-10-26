import { spawn } from 'node:child_process';
import {
  existsSync,
  linkSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import {
  PROJECT_LOCK_NAME,
  PROJECT_LOCK_STALE_MS,
  releaseAllProjectLocks,
} from '../../desktop/skeleton/projectLock';
import { writeProbeAndReadBack } from '../../desktop/skeleton/probeStore';
import { openProject } from './openProject';
import { DESKTOP_PROJECT_APPLICATION_ID, DESKTOP_PROJECT_USER_VERSION } from './schema';

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
  releaseAllProjectLocks();
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
    expect(pragma(created.db, 'user_version')).toBe(DESKTOP_PROJECT_USER_VERSION);
    expect(created.db.prepare('PRAGMA busy_timeout').get()).toEqual({ timeout: 5000 });
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

  it('rejects a wrong application id, version, column, journal, or probe without changing bytes', () => {
    const wrongId = folder();
    openProject(wrongId).close();
    expect(
      unchanged(wrongId, (file) => {
        const db = new Database(file);
        db.exec('PRAGMA application_id = 1');
        db.close();
      }),
    ).toThrow('project.sqlite is not a Jieyu project library');

    const wrongVersion = folder();
    openProject(wrongVersion).close();
    expect(
      unchanged(wrongVersion, (file) => {
        const db = new Database(file);
        db.exec('PRAGMA user_version = 15');
        db.close();
      }),
    ).toThrow('project.sqlite is not a Jieyu project library');

    const wrongColumn = folder();
    openProject(wrongColumn).close();
    expect(
      unchanged(wrongColumn, (file) => {
        const db = new Database(file);
        db.exec('ALTER TABLE notes ADD COLUMN extra TEXT');
        db.close();
      }),
    ).toThrow('project.sqlite is not a Jieyu project library');

    const wal = folder();
    openProject(wal).close();
    expect(
      unchanged(wal, (file) => {
        const db = new Database(file);
        db.exec('PRAGMA journal_mode = WAL');
        db.close();
      }),
    ).toThrow('project.sqlite is not a Jieyu project library');

    const probe = folder();
    const probeFile = join(probe, 'project.sqlite');
    writeProbeAndReadBack(probeFile, 'skeleton');
    const before = readFileSync(probeFile);
    expect(() => openProject(probe)).toThrow('project.sqlite is not a Jieyu project library');
    expect(readFileSync(probeFile)).toEqual(before);
    expect(readdirSync(probe).includes(PROJECT_LOCK_NAME)).toBe(false);
  });

  it('blocks a second opener until the holder closes', () => {
    const dir = folder();
    const held = openProject(dir);
    expect(readdirSync(dir)).toContain(PROJECT_LOCK_NAME);
    expect(() => openProject(dir)).toThrow('project folder is busy');
    held.db
      .prepare(
        'INSERT INTO media (id, relpath, sha256, filename, duration, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      )
      .run('m-held', 'held.wav', 'hh', 'held.wav', 1, T);
    held.close();

    const stale = join(dir, PROJECT_LOCK_NAME);
    mkdirSync(stale);
    const old = new Date(Date.now() - PROJECT_LOCK_STALE_MS - 1000);
    utimesSync(stale, old, old);
    const next = openProject(dir);
    expect(next.db.prepare('SELECT id FROM media WHERE id = ?').get('m-held')).toEqual({
      id: 'm-held',
    });
    next.close();
    expect(readdirSync(dir).includes(PROJECT_LOCK_NAME)).toBe(false);
  });

  it('reopens a library whose writer died inside a transaction', async () => {
    const dir = folder();
    const created = openProject(dir);
    created.db
      .prepare(
        'INSERT INTO media (id, relpath, sha256, filename, duration, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      )
      .run('m1', 'a.wav', 'aa', 'a.wav', 1.5, T);
    created.close();
    const file = join(dir, 'project.sqlite');
    await killDuringTransaction(file, 'm1');
    expect(existsSync(`${file}-journal`)).toBe(true);
    expect(readFileSync(`${file}-journal`).subarray(0, 8).toString('hex')).toBe('d9d505f920a163d7');

    const reopened = openProject(dir);
    expect(reopened.db.prepare('SELECT duration FROM media WHERE id = ?').get('m1')).toEqual({
      duration: 1.5,
    });
    expect(reopened.db.prepare('SELECT COUNT(*) AS n FROM media').get()).toEqual({ n: 1 });
    reopened.close();
    const again = openProject(dir);
    expect(again.db.prepare('SELECT duration FROM media WHERE id = ?').get('m1')).toEqual({
      duration: 1.5,
    });
    again.close();
    expect(existsSync(`${file}-journal`)).toBe(false);
    expect(readdirSync(dir).some((name) => name.includes('recover'))).toBe(false);
  }, 15000);

  it('does not rewrite an incompatible library that still has a hot journal', async () => {
    const dir = folder();
    const created = openProject(dir);
    created.db
      .prepare(
        'INSERT INTO media (id, relpath, sha256, filename, duration, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      )
      .run('m1', 'a.wav', 'aa', 'a.wav', 1.5, T);
    created.close();
    const file = join(dir, 'project.sqlite');
    const altered = new Database(file);
    altered.exec('ALTER TABLE notes ADD COLUMN extra TEXT');
    altered.close();
    await killDuringTransaction(file, 'm1');
    const before = readFileSync(file);
    const journal = readFileSync(`${file}-journal`);
    expect(journal.subarray(0, 8).toString('hex')).toBe('d9d505f920a163d7');

    expect(() => openProject(dir)).toThrow('project.sqlite is not a Jieyu project library');
    expect(readFileSync(file)).toEqual(before);
    expect(readFileSync(`${file}-journal`)).toEqual(journal);
    expect(readdirSync(dir).includes(PROJECT_LOCK_NAME)).toBe(false);
    expect(readdirSync(dir).some((name) => name.includes('recover'))).toBe(false);
  }, 15000);

  it('rejects a hard-linked library while its original is open without changing bytes', () => {
    const source = folder();
    const alias = folder();
    const held = openProject(source);
    try {
      const file = join(source, 'project.sqlite');
      const before = readFileSync(file);
      linkSync(file, join(alias, 'project.sqlite'));
      let opened: ReturnType<typeof openProject> | undefined;
      try {
        expect(() => {
          opened = openProject(alias);
        }).toThrow('project.sqlite has multiple hard links');
      } finally {
        opened?.close();
      }
      expect(readFileSync(file)).toEqual(before);
      expect(readdirSync(alias).includes(PROJECT_LOCK_NAME)).toBe(false);
      expect(held.db.prepare('SELECT COUNT(*) AS n FROM media').get()).toEqual({ n: 0 });
    } finally {
      held.close();
    }
  });

  it('rejects a database symlink that points outside the folder', () => {
    const source = folder();
    const alias = folder();
    const created = openProject(source);
    created.db
      .prepare(
        'INSERT INTO media (id, relpath, sha256, filename, duration, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      )
      .run('m1', 'a.wav', 'aa', 'a.wav', 1.5, T);
    created.close();
    const file = join(source, 'project.sqlite');
    const before = readFileSync(file);
    symlinkSync(file, join(alias, 'project.sqlite'));

    expect(() => openProject(alias)).toThrow('project.sqlite points outside the project folder');
    expect(readFileSync(file)).toEqual(before);
    expect(readdirSync(alias).includes(PROJECT_LOCK_NAME)).toBe(false);
    const held = openProject(source);
    expect(held.db.prepare('SELECT id FROM media WHERE id = ?').get('m1')).toEqual({ id: 'm1' });
    held.close();
  });
});

function killDuringTransaction(file: string, mediaId: string): Promise<void> {
  const script = join(
    process.cwd(),
    `.jieyu-crash-${process.pid}-${Math.random().toString(16).slice(2)}.mjs`,
  );
  roots.push(script);
  writeFileSync(
    script,
    [
      "import Database from 'better-sqlite3';",
      'const db = new Database(process.argv[2]);',
      "db.exec('PRAGMA cache_size = 5; BEGIN');",
      "db.prepare('UPDATE media SET duration = 99 WHERE id = ?').run(process.argv[3]);",
      "const insert = db.prepare('INSERT INTO media (id, relpath, sha256, filename, duration, created_at) VALUES (?, ?, ?, ?, ?, ?)');",
      'for (let i = 0; i < 2000; i += 1) {',
      "  insert.run('crash-' + i, 'crash-' + i + '.wav', 'bb', 'x'.repeat(1000), 3, '2026-10-25T00:00:00.000Z');",
      '}',
      "process.kill(process.pid, 'SIGKILL');",
      '',
    ].join('\n'),
  );
  const child = spawn(process.execPath, [script, file, mediaId], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return new Promise((resolve, reject) => {
    let stderr = '';
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`crash helper timed out: ${stderr}`));
    }, 8000);
    child.on('exit', (code, signal) => {
      clearTimeout(timer);
      if (signal === 'SIGKILL') resolve();
      else reject(new Error(`crash helper exited ${code} ${signal}: ${stderr}`));
    });
  });
}

function unchanged(dir: string, mutate: (file: string) => void): () => void {
  const file = join(dir, 'project.sqlite');
  mutate(file);
  const before = readFileSync(file);
  return () => {
    try {
      openProject(dir);
    } finally {
      expect(readFileSync(file)).toEqual(before);
      expect(readdirSync(dir).includes(PROJECT_LOCK_NAME)).toBe(false);
    }
  };
}
