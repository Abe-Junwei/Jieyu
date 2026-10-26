import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { releaseAllProjectLocks } from '../../desktop/skeleton/projectLock';
import { createConversation } from './conversations';
import { callDesktopSession } from './desktopCall';
import { useDiagnosticStore } from './diagnosticDelivery';
import { openProject } from './openProject';
import { openDesktopSession, resetDesktopSessions } from './projectSession';
import type { ConversationReading } from './conversationFields';

const roots: string[] = [];
const T = '2026-10-26T00:00:00.000Z';

function folder(): string {
  const root = mkdtempSync(join(tmpdir(), 'jieyu-conversation-fields-'));
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

describe('conversation field revisions', () => {
  it('merges fields, keeps false distinct from empty, and rejects a stale write', () => {
    const { dir, sessionId, conversationId } = seed();
    useDiagnosticStore(join(folder(), 'diagnostics.sqlite'));
    const mode = patch(sessionId, {
      operationId: 'op-mode',
      id: conversationId,
      mode: { expectedRevision: 0, value: 'analysis' },
      model: { expectedRevision: 0, value: 'qwen' },
    });
    const archived = patch(sessionId, {
      operationId: 'op-arch',
      id: conversationId,
      archived: { expectedRevision: 0, value: false },
    });
    expect(mode).toMatchObject({
      mode: 'analysis',
      model: 'qwen',
      archived: null,
      revisions: { mode: 1, model: 1, archived: 0 },
      delivery: 'confirmed',
    });
    expect(archived.archived).toBe(false);
    expect(archived.revisions.mode).toBe(1);

    expect(() =>
      patch(sessionId, {
        operationId: 'op-stale',
        id: conversationId,
        mode: { expectedRevision: 0, value: 'review' },
        clearedAt: { expectedRevision: 0, value: T },
      }),
    ).toThrow('conversation field conflict: mode');
    expect(read(dir, conversationId)).toMatchObject({
      mode: 'analysis',
      clearedAt: null,
      archived: 0,
    });

    const cleared = patch(sessionId, {
      operationId: 'op-clear',
      id: conversationId,
      model: { expectedRevision: 1, value: null },
    });
    expect(cleared.model).toBeNull();
    expect(cleared.mode).toBe('analysis');
    expect(cleared.archived).toBe(false);
  });

  it('rejects an unknown field and a bad mode', () => {
    const { sessionId, conversationId } = seed();
    expect(() =>
      patch(sessionId, {
        operationId: 'op-text',
        id: conversationId,
        textId: { expectedRevision: 0, value: 't' },
      }),
    ).toThrow('desktop call field textId is not supported');
    expect(() =>
      patch(sessionId, {
        operationId: 'op-mode',
        id: conversationId,
        mode: { expectedRevision: 0, value: 'chat' },
      }),
    ).toThrow('desktop call mode.value is invalid');
  });

  it('keeps a committed edit pending until the diagnostic receipt succeeds once', () => {
    const { dir, sessionId, conversationId } = seed();
    useDiagnosticStore(join(dir, 'missing', 'diagnostics.sqlite'));
    const pending = patch(sessionId, {
      operationId: 'op-1',
      id: conversationId,
      title: { expectedRevision: 0, value: '改题' },
    });
    expect(pending.delivery).toBe('pending');
    expect(read(dir, conversationId).title).toBe('改题');

    useDiagnosticStore(join(folder(), 'diagnostics.sqlite'));
    const confirmed = callDesktopSession(sessionId, 'conversations.redeliver', {
      operationId: 'op-1',
    }) as ConversationReading;
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
      .get() as {
      summary_json: string;
      status: string;
    };
    expect(summary.status).toBe('confirmed');
    expect(summary.summary_json).not.toContain('改题');
    const columns = project.db.prepare('PRAGMA table_info(conversations)').all() as {
      name: string;
    }[];
    expect(columns.map((column) => column.name)).not.toContain('text_id');
    project.close();
  });

  it('rejects a version 16 library without changing its bytes', () => {
    const dir = folder();
    openProject(dir).close();
    const file = join(dir, 'project.sqlite');
    const db = new Database(file);
    db.exec('PRAGMA user_version = 16');
    db.close();
    const before = readFileSync(file);
    expect(() => openProject(dir)).toThrow('project.sqlite is not a Jieyu project library');
    expect(readFileSync(file)).toEqual(before);
  });
});

function seed(): { dir: string; sessionId: string; conversationId: string } {
  const dir = folder();
  const project = openProject(dir);
  project.db
    .prepare('INSERT INTO project (id, title_json, created_at, updated_at) VALUES (?, ?, ?, ?)')
    .run('p1', '{"zh":"p"}', T, T);
  const conversation = createConversation(project.db, { title: '原题' });
  project.close();
  return {
    dir,
    sessionId: openDesktopSession(dir, [dir]).sessionId,
    conversationId: conversation.id,
  };
}

function patch(sessionId: string, input: Record<string, unknown>): ConversationReading {
  return callDesktopSession(sessionId, 'conversations.patch', input) as ConversationReading;
}

function read(
  dir: string,
  id: string,
): { title: string; mode: string | null; clearedAt: string | null; archived: number | null } {
  const db = new Database(join(dir, 'project.sqlite'), { readonly: true });
  try {
    return db
      .prepare(
        'SELECT title, mode, cleared_at AS clearedAt, archived FROM conversations WHERE id = ?',
      )
      .get(id) as {
      title: string;
      mode: string | null;
      clearedAt: string | null;
      archived: number | null;
    };
  } finally {
    db.close();
  }
}
