import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { releaseAllProjectLocks } from '../../desktop/skeleton/projectLock';
import { callDesktopSession } from './desktopCall';
import { useDiagnosticStore } from './diagnosticDelivery';
import { openProject } from './openProject';
import { openDesktopSession, resetDesktopSessions } from './projectSession';
import type { SpeakerReading } from './speakerFields';

const roots: string[] = [];

function folder(): string {
  const root = mkdtempSync(join(tmpdir(), 'jieyu-speaker-fields-'));
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

describe('speaker field revisions', () => {
  it('merges different fields, clears one, and rejects a stale write', () => {
    const { dir, sessionId, speakerId } = seed();
    const store = folder();
    useDiagnosticStore(join(store, 'diagnostics.sqlite'));

    const dialect = patch(sessionId, {
      operationId: 'op-dialect',
      id: speakerId,
      dialect: { expectedRevision: 0, value: '木雅' },
      role: { expectedRevision: 0, value: 'speaker' },
    });
    const pseudonym = patch(sessionId, {
      operationId: 'op-pseudo',
      id: speakerId,
      pseudonym: { expectedRevision: 0, value: '甲' },
    });
    expect(dialect).toMatchObject({
      dialect: '木雅',
      role: 'speaker',
      pseudonym: null,
      revisions: { dialect: 1, role: 1, pseudonym: 0 },
      delivery: 'confirmed',
    });
    expect(pseudonym.pseudonym).toBe('甲');
    expect(pseudonym.revisions.dialect).toBe(1);

    expect(() =>
      patch(sessionId, {
        operationId: 'op-stale',
        id: speakerId,
        dialect: { expectedRevision: 0, value: '其他' },
        address: { expectedRevision: 0, value: '村' },
      }),
    ).toThrow('speaker field conflict: dialect');
    expect(read(dir, speakerId)).toMatchObject({ dialect: '木雅', address: null, pseudonym: '甲' });

    const cleared = patch(sessionId, {
      operationId: 'op-clear',
      id: speakerId,
      dialect: { expectedRevision: 1, value: null },
    });
    expect(cleared.dialect).toBeNull();
    expect(cleared.revisions.dialect).toBe(2);
    expect(cleared.role).toBe('speaker');

    expect(
      patch(sessionId, {
        operationId: 'op-same',
        id: speakerId,
        role: { expectedRevision: 1, value: 'speaker' },
      }).delivery,
    ).toBe('unchanged');
    expect(() =>
      patch(sessionId, {
        operationId: 'op-back',
        id: speakerId,
        dialect: { expectedRevision: 1, value: '木雅' },
      }),
    ).toThrow('speaker field conflict: dialect');
  });

  it('keeps notes and language ids, and rejects an unknown or invalid field', () => {
    const { dir, sessionId, speakerId } = seed();
    useDiagnosticStore(join(folder(), 'diagnostics.sqlite'));
    const saved = patch(sessionId, {
      operationId: 'op-profile',
      id: speakerId,
      birthYear: { expectedRevision: 0, value: 1954 },
      languageIds: { expectedRevision: 0, value: ['muya', 'zh'] },
      notes: { expectedRevision: 0, value: { zh: '田野', en: 'field' } },
      consentStatus: { expectedRevision: 0, value: 'restricted' },
    });
    expect(saved).toMatchObject({
      birthYear: 1954,
      languageIds: ['muya', 'zh'],
      notes: { en: 'field', zh: '田野' },
      consentStatus: 'restricted',
    });
    expect(read(dir, speakerId).notes).toEqual({ en: 'field', zh: '田野' });

    expect(() =>
      patch(sessionId, {
        operationId: 'op-x',
        id: speakerId,
        textId: { expectedRevision: 0, value: 't' },
      }),
    ).toThrow('desktop call field textId is not supported');
    expect(() =>
      patch(sessionId, {
        operationId: 'op-role',
        id: speakerId,
        role: { expectedRevision: 0, value: 'ghost' },
      }),
    ).toThrow('desktop call role.value is invalid');
    expect(() =>
      patch(sessionId, {
        operationId: 'op-langs',
        id: speakerId,
        languageIds: { expectedRevision: 1, value: ['muya', 'muya'] },
      }),
    ).toThrow('desktop call languageIds.value must be language ids');
    expect(read(dir, speakerId).languageIds).toEqual(['muya', 'zh']);
  });

  it('keeps a committed edit pending until the diagnostic receipt succeeds once', () => {
    const { dir, sessionId, speakerId } = seed();
    useDiagnosticStore(join(dir, 'missing', 'diagnostics.sqlite'));
    const pending = patch(sessionId, {
      operationId: 'op-1',
      id: speakerId,
      name: { expectedRevision: 0, value: '乙' },
    });
    expect(pending.delivery).toBe('pending');
    expect(read(dir, speakerId).name).toBe('乙');

    const file = join(folder(), 'diagnostics.sqlite');
    useDiagnosticStore(file);
    const confirmed = callDesktopSession(sessionId, 'speakers.redeliver', {
      operationId: 'op-1',
    }) as SpeakerReading;
    expect(confirmed).toMatchObject({ name: '乙', revisions: { name: 1 }, delivery: 'confirmed' });

    resetDesktopSessions();
    releaseAllProjectLocks();
    const project = openProject(dir);
    const summary = project.db
      .prepare('SELECT summary_json, status FROM diagnostic_deliveries')
      .get() as {
      summary_json: string;
      status: string;
    };
    expect(summary.status).toBe('confirmed');
    expect(summary.summary_json).not.toContain('乙');
    const columns = project.db.prepare('PRAGMA table_info(speakers)').all() as { name: string }[];
    expect(columns.map((column) => column.name)).not.toContain('manuscript_id');
    expect(() => project.db.prepare(`UPDATE speakers SET role = 'ghost'`).run()).toThrow();
    project.close();
  });

  it('rejects a version 15 library without changing its bytes', () => {
    const dir = folder();
    const created = openProject(dir);
    created.close();
    const file = join(dir, 'project.sqlite');
    const db = new Database(file);
    db.exec('PRAGMA user_version = 15');
    db.close();
    const before = readFileSync(file);
    expect(() => openProject(dir)).toThrow('project.sqlite is not a Jieyu project library');
    expect(readFileSync(file)).toEqual(before);
  });
});

function seed(): { dir: string; sessionId: string; speakerId: string } {
  const dir = folder();
  const project = openProject(dir);
  project.db
    .prepare('INSERT INTO project (id, title_json, created_at, updated_at) VALUES (?, ?, ?, ?)')
    .run('p1', '{"zh":"p"}', '2026-10-26T00:00:00.000Z', '2026-10-26T00:00:00.000Z');
  const speaker = project.speakers.create({ name: '甲' });
  project.close();
  return { dir, sessionId: openDesktopSession(dir, [dir]).sessionId, speakerId: speaker.id };
}

function patch(sessionId: string, input: Record<string, unknown>): SpeakerReading {
  return callDesktopSession(sessionId, 'speakers.patch', input) as SpeakerReading;
}

function read(
  dir: string,
  id: string,
): {
  name: string;
  dialect: string | null;
  address: string | null;
  pseudonym: string | null;
  languageIds: string[] | null;
  notes: Record<string, string> | null;
} {
  const db = new Database(join(dir, 'project.sqlite'), { readonly: true });
  try {
    const row = db
      .prepare(
        `SELECT name, dialect, address, pseudonym, language_ids_json, notes_json
         FROM speakers WHERE id = ?`,
      )
      .get(id) as {
      name: string;
      dialect: string | null;
      address: string | null;
      pseudonym: string | null;
      language_ids_json: string | null;
      notes_json: string | null;
    };
    return {
      name: row.name,
      dialect: row.dialect,
      address: row.address,
      pseudonym: row.pseudonym,
      languageIds:
        row.language_ids_json === null ? null : (JSON.parse(row.language_ids_json) as string[]),
      notes:
        row.notes_json === null ? null : (JSON.parse(row.notes_json) as Record<string, string>),
    };
  } finally {
    db.close();
  }
}
