import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { releaseAllProjectLocks } from '../../desktop/skeleton/projectLock';
import { callDesktopSession } from './desktopCall';
import { receiveDiagnostic, useDiagnosticStore } from './diagnosticDelivery';
import { openProject } from './openProject';
import { openDesktopSession, requireDesktopSession, resetDesktopSessions } from './projectSession';
import type { SourceReading } from './sourceFields';

const roots: string[] = [];
const T = '2026-10-26T00:00:00.000Z';

function folder(): string {
  const root = mkdtempSync(join(tmpdir(), 'jieyu-source-fields-'));
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

describe('source field revisions', () => {
  it('merges different fields and rejects a stale or repeated value', () => {
    const { dir, sessionId } = seed();
    const store = folder();
    useDiagnosticStore(join(store, 'diagnostics.sqlite'));

    expect(
      patch(sessionId, {
        operationId: 'op-same',
        id: 's1',
        label: { expectedRevision: 0, value: 'tape' },
      }),
    ).toMatchObject({ delivery: 'unchanged', revisions: { label: 0, externalId: 0 } });

    const label = patch(sessionId, {
      operationId: 'op-label',
      id: 's1',
      label: { expectedRevision: 0, value: 'tape-b' },
    });
    const externalId = patch(sessionId, {
      operationId: 'op-external',
      id: 's1',
      externalId: { expectedRevision: 0, value: 'ext-b' },
    });
    expect(label).toMatchObject({
      label: 'tape-b',
      externalId: 'ext',
      revisions: { label: 1, externalId: 0 },
      delivery: 'confirmed',
    });
    expect(externalId).toMatchObject({
      label: 'tape-b',
      externalId: 'ext-b',
      revisions: { label: 1, externalId: 1 },
    });

    expect(() =>
      patch(sessionId, {
        operationId: 'op-stale',
        id: 's1',
        label: { expectedRevision: 0, value: 'tape-c' },
        externalId: { expectedRevision: 1, value: 'ext-c' },
      }),
    ).toThrow('source field conflict: label');
    expect(
      patch(sessionId, {
        operationId: 'op-label',
        id: 's1',
        label: { expectedRevision: 0, value: 'tape-b' },
      }),
    ).toMatchObject({
      revisions: { label: 1, externalId: 1 },
      externalId: 'ext-b',
    });

    const back = patch(sessionId, {
      operationId: 'op-back',
      id: 's1',
      label: { expectedRevision: 1, value: 'tape' },
    });
    expect(back.revisions).toEqual({ label: 2, externalId: 1 });
    expect(() =>
      patch(sessionId, {
        operationId: 'op-aba',
        id: 's1',
        label: { expectedRevision: 0, value: 'tape' },
      }),
    ).toThrow('source field conflict: label');
    expect(read(dir, 's1')).toMatchObject({
      label: 'tape',
      externalId: 'ext-b',
      revisions: { label: 2, externalId: 1 },
    });

    expect(() =>
      patch(sessionId, {
        operationId: 'op-label',
        id: 's1',
        label: { expectedRevision: 2, value: 'other' },
      }),
    ).toThrow('diagnostic delivery conflict');
    expect(read(dir, 's1').label).toBe('tape');
  });

  it('keeps a committed edit pending until the diagnostic receipt succeeds once', () => {
    const { dir, sessionId } = seed();
    useDiagnosticStore(join(dir, 'missing', 'diagnostics.sqlite'));
    const pending = patch(sessionId, {
      operationId: 'op-1',
      id: 's1',
      label: { expectedRevision: 0, value: 'tape-b' },
    });
    expect(pending.delivery).toBe('pending');
    expect(read(dir, 's1').label).toBe('tape-b');

    const store = folder();
    const file = join(store, 'diagnostics.sqlite');
    useDiagnosticStore(file);
    const confirmed = callDesktopSession(sessionId, 'sources.redeliver', {
      operationId: 'op-1',
    }) as SourceReading;
    expect(confirmed).toMatchObject({
      label: 'tape-b',
      revisions: { label: 1, externalId: 0 },
      delivery: 'confirmed',
    });
    callDesktopSession(sessionId, 'sources.redeliver', { operationId: 'op-1' });
    const receipts = new Database(file);
    expect(receipts.prepare('SELECT payload_hash FROM diagnostic_receipts').all()).toHaveLength(1);
    expect(
      receipts.prepare("SELECT name FROM sqlite_master WHERE name = 'audit_logs'").get(),
    ).toBeUndefined();
    receipts.close();

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
    expect(summary.summary_json).not.toContain('tape-b');
    project.close();
  });

  it('rolls back a failed write, then confirms a saved receipt after reopen', () => {
    const { dir, sessionId } = seed();
    const db = requireDesktopSession(sessionId).db;
    db.exec(
      `CREATE TEMP TRIGGER abort_source_write BEFORE UPDATE ON sources
       BEGIN SELECT RAISE(ABORT, 'injected'); END`,
    );
    expect(() =>
      patch(sessionId, {
        operationId: 'op-abort',
        id: 's1',
        label: { expectedRevision: 0, value: 'tape-b' },
        externalId: { expectedRevision: 0, value: 'ext-b' },
      }),
    ).toThrow('injected');
    expect(read(dir, 's1')).toMatchObject({
      label: 'tape',
      externalId: 'ext',
      revisions: { label: 0, externalId: 0 },
    });
    expect(db.prepare('SELECT COUNT(*) AS n FROM diagnostic_deliveries').get()).toEqual({ n: 0 });
    db.exec('DROP TRIGGER abort_source_write');

    useDiagnosticStore(join(dir, 'missing', 'diagnostics.sqlite'));
    expect(
      patch(sessionId, {
        operationId: 'op-1',
        id: 's1',
        label: { expectedRevision: 0, value: 'tape-b' },
      }).delivery,
    ).toBe('pending');
    const store = folder();
    const file = join(store, 'diagnostics.sqlite');
    useDiagnosticStore(file);
    db.exec(
      `CREATE TEMP TRIGGER abort_delivery_confirm BEFORE UPDATE ON diagnostic_deliveries
       BEGIN SELECT RAISE(ABORT, 'confirm failed'); END`,
    );
    expect(() =>
      callDesktopSession(sessionId, 'sources.redeliver', { operationId: 'op-1' }),
    ).toThrow('confirm failed');
    const receipts = new Database(file, { readonly: true });
    expect(receipts.prepare('SELECT COUNT(*) AS n FROM diagnostic_receipts').get()).toEqual({
      n: 1,
    });
    receipts.close();
    expect(db.prepare('SELECT status FROM diagnostic_deliveries').get()).toEqual({
      status: 'pending',
    });
    expect(read(dir, 's1')).toMatchObject({
      label: 'tape-b',
      revisions: { label: 1, externalId: 0 },
    });
    db.exec('DROP TRIGGER abort_delivery_confirm');

    resetDesktopSessions();
    releaseAllProjectLocks();
    const again = openDesktopSession(dir, [dir]).sessionId;
    expect(callDesktopSession(again, 'sources.redeliver', { operationId: 'op-1' })).toMatchObject({
      label: 'tape-b',
      revisions: { label: 1, externalId: 0 },
      delivery: 'confirmed',
    });
    callDesktopSession(again, 'sources.redeliver', { operationId: 'op-1' });
    const after = new Database(file, { readonly: true });
    expect(after.prepare('SELECT COUNT(*) AS n FROM diagnostic_receipts').get()).toEqual({ n: 1 });
    after.close();
    expect(read(dir, 's1')).toMatchObject({
      label: 'tape-b',
      revisions: { label: 1, externalId: 0 },
    });
  });

  it('leaves the first diagnostic hash in place', () => {
    const file = join(folder(), 'diagnostics.sqlite');
    const receipt = {
      originProjectId: 'p1',
      operationId: 'op-1',
      eventSeq: 0,
      payloadHash: 'hash-a',
    };
    receiveDiagnostic(file, receipt);
    receiveDiagnostic(file, receipt);
    expect(() => receiveDiagnostic(file, { ...receipt, payloadHash: 'hash-b' })).toThrow(
      'diagnostic payload conflict',
    );
    const db = new Database(file);
    expect(db.prepare('SELECT payload_hash FROM diagnostic_receipts').all()).toEqual([
      { payload_hash: 'hash-a' },
    ]);
    db.close();
  });

  it('rejects a version 12 library without changing its bytes', () => {
    const dir = folder();
    const created = openProject(dir);
    created.close();
    const file = join(dir, 'project.sqlite');
    const db = new Database(file);
    db.exec('PRAGMA user_version = 12');
    db.close();
    const before = readFileSync(file);
    expect(() => openProject(dir)).toThrow('project.sqlite is not a Jieyu project library');
    expect(readFileSync(file)).toEqual(before);
  });
});

function seed(): { dir: string; sessionId: string } {
  const dir = folder();
  const project = openProject(dir);
  project.db
    .prepare('INSERT INTO project (id, title_json, created_at, updated_at) VALUES (?, ?, ?, ?)')
    .run('p1', '{"zh":"p"}', T, T);
  project.db
    .prepare(
      'INSERT INTO media (id, relpath, sha256, filename, duration, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    )
    .run('m1', 'a.wav', 'aa', 'a.wav', 3, T);
  project.db
    .prepare(
      `INSERT INTO sources (id, media_id, label, external_id, created_at, updated_at)
       VALUES ('s1', 'm1', 'tape', 'ext', ?, ?)`,
    )
    .run(T, T);
  project.close();
  return { dir, sessionId: openDesktopSession(dir, [dir]).sessionId };
}

function patch(sessionId: string, input: Record<string, unknown>): SourceReading {
  return callDesktopSession(sessionId, 'sources.patch', input) as SourceReading;
}

function read(
  dir: string,
  id: string,
): { label: string; externalId: string; revisions: { label: number; externalId: number } } {
  const db = new Database(join(dir, 'project.sqlite'), { readonly: true });
  try {
    const row = db
      .prepare('SELECT label, external_id, field_revisions_json FROM sources WHERE id = ?')
      .get(id) as { label: string; external_id: string; field_revisions_json: string };
    return {
      label: row.label,
      externalId: row.external_id,
      revisions: JSON.parse(row.field_revisions_json) as { label: number; externalId: number },
    };
  } finally {
    db.close();
  }
}
