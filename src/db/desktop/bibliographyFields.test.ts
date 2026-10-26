import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { releaseAllProjectLocks } from '../../desktop/skeleton/projectLock';
import { createBibliographyEntry } from './bibliography';
import { callDesktopSession } from './desktopCall';
import { useDiagnosticStore } from './diagnosticDelivery';
import { openProject } from './openProject';
import { openDesktopSession, resetDesktopSessions } from './projectSession';
import type { BibliographyReading } from './bibliographyFields';

const roots: string[] = [];

function folder(): string {
  const root = mkdtempSync(join(tmpdir(), 'jieyu-bibliography-'));
  roots.push(root);
  return root;
}

afterEach(() => {
  useDiagnosticStore(null);
  resetDesktopSessions();
  releaseAllProjectLocks();
  for (const root of roots) rmSync(root, { recursive: true, force: true });
  roots.length = 0;
});

describe('bibliography field revisions', () => {
  it('merges fields, clears one, and rejects a stale write', () => {
    const { dir, sessionId, entryId } = seed();
    useDiagnosticStore(join(folder(), 'diagnostics.sqlite'));
    const year = patch(sessionId, {
      operationId: 'op-year',
      id: entryId,
      year: { expectedRevision: 0, value: 2019 },
      sourceType: { expectedRevision: 0, value: 'book' },
    });
    const authors = patch(sessionId, {
      operationId: 'op-authors',
      id: entryId,
      authors: { expectedRevision: 0, value: ['甲', '乙'] },
    });
    expect(year).toMatchObject({
      year: 2019,
      sourceType: 'book',
      authors: null,
      revisions: { year: 1, sourceType: 1, authors: 0 },
      delivery: 'confirmed',
    });
    expect(authors.authors).toEqual(['甲', '乙']);
    expect(authors.revisions.year).toBe(1);

    expect(() =>
      patch(sessionId, {
        operationId: 'op-stale',
        id: entryId,
        year: { expectedRevision: 0, value: 2020 },
        doi: { expectedRevision: 0, value: '10.1/abc' },
      }),
    ).toThrow('bibliography field conflict: year');
    expect(read(dir, entryId)).toMatchObject({ year: 2019, doi: null, authors: '["甲","乙"]' });

    const cleared = patch(sessionId, {
      operationId: 'op-clear',
      id: entryId,
      year: { expectedRevision: 1, value: null },
    });
    expect(cleared.year).toBeNull();
    expect(cleared.sourceType).toBe('book');
    expect(cleared.authors).toEqual(['甲', '乙']);
  });

  it('keeps notes and rejects an unknown or invalid field', () => {
    const { dir, sessionId, entryId } = seed();
    const saved = patch(sessionId, {
      operationId: 'op-notes',
      id: entryId,
      notes: { expectedRevision: 0, value: { zh: '语法', en: 'grammar' } },
      accessRights: { expectedRevision: 0, value: 'restricted' },
    });
    expect(saved.notes).toEqual({ en: 'grammar', zh: '语法' });
    expect(saved.accessRights).toBe('restricted');
    expect(read(dir, entryId).notes).toBe('{"en":"grammar","zh":"语法"}');

    expect(() =>
      patch(sessionId, {
        operationId: 'op-text',
        id: entryId,
        textId: { expectedRevision: 0, value: 't' },
      }),
    ).toThrow('desktop call field textId is not supported');
    expect(() =>
      patch(sessionId, {
        operationId: 'op-kind',
        id: entryId,
        sourceType: { expectedRevision: 0, value: 'website' },
      }),
    ).toThrow('desktop call sourceType.value is invalid');
  });

  it('keeps a committed edit pending until the diagnostic receipt succeeds once', () => {
    const { dir, sessionId, entryId } = seed();
    useDiagnosticStore(join(dir, 'missing', 'diagnostics.sqlite'));
    const pending = patch(sessionId, {
      operationId: 'op-1',
      id: entryId,
      title: { expectedRevision: 0, value: '改题' },
    });
    expect(pending.delivery).toBe('pending');
    expect(read(dir, entryId).title).toBe('改题');

    useDiagnosticStore(join(folder(), 'diagnostics.sqlite'));
    const confirmed = callDesktopSession(sessionId, 'bibliography.redeliver', {
      operationId: 'op-1',
    }) as BibliographyReading;
    expect(confirmed).toMatchObject({
      title: '改题',
      revisions: { title: 1 },
      delivery: 'confirmed',
    });

    resetDesktopSessions();
    releaseAllProjectLocks();
    const project = openProject(dir);
    const summary = project.db
      .prepare('SELECT summary_json, status FROM diagnostic_deliveries')
      .get() as { summary_json: string; status: string };
    expect(summary.status).toBe('confirmed');
    expect(summary.summary_json).not.toContain('改题');
    const columns = project.db.prepare('PRAGMA table_info(bibliography)').all() as {
      name: string;
    }[];
    expect(columns.map((column) => column.name)).not.toContain('text_id');
    project.close();
  });

  it('rejects a version 17 library without changing its bytes', () => {
    const dir = folder();
    openProject(dir).close();
    const file = join(dir, 'project.sqlite');
    const db = new Database(file);
    db.exec('PRAGMA user_version = 17');
    db.close();
    const before = readFileSync(file);
    expect(() => openProject(dir)).toThrow('project.sqlite is not a Jieyu project library');
    expect(readFileSync(file)).toEqual(before);
  });
});

function seed(): { dir: string; sessionId: string; entryId: string } {
  const dir = folder();
  const project = openProject(dir);
  project.db
    .prepare('INSERT INTO project (id, title_json, created_at, updated_at) VALUES (?, ?, ?, ?)')
    .run('p1', '{"zh":"p"}', '2026-10-26T00:00:00.000Z', '2026-10-26T00:00:00.000Z');
  const entry = createBibliographyEntry(project.db, '原题');
  project.close();
  return { dir, sessionId: openDesktopSession(dir, [dir]).sessionId, entryId: entry.id };
}

function patch(sessionId: string, input: Record<string, unknown>): BibliographyReading {
  return callDesktopSession(sessionId, 'bibliography.patch', input) as BibliographyReading;
}

function read(
  dir: string,
  id: string,
): {
  title: string;
  year: number | null;
  doi: string | null;
  authors: string | null;
  notes: string | null;
} {
  const db = new Database(join(dir, 'project.sqlite'), { readonly: true });
  try {
    return db
      .prepare(
        'SELECT title, year, doi, authors_json AS authors, notes_json AS notes FROM bibliography WHERE id = ?',
      )
      .get(id) as {
      title: string;
      year: number | null;
      doi: string | null;
      authors: string | null;
      notes: string | null;
    };
  } finally {
    db.close();
  }
}
