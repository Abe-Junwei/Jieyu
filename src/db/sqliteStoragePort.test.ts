import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { CatalogOwnershipMismatchError } from '../services/projectCatalogScope';
import { recordingRemovalBlockReason, type StoragePort } from './storagePort';
import { describeStoragePortContract } from './storagePortContract';
import { MANUSCRIPT_APPLICATION_ID, PROJECT_APPLICATION_ID } from './sqliteSpeakerAssignment';
import { openSqliteStoragePort } from './sqliteStoragePort';

const NOW = '2026-10-22T00:00:00.000Z';

function turn(conversationId: string, expiresAt: number) {
  return { conversationId, createdAt: 1, expiresAt, messages: [{ role: 'user', content: 'hi' }] };
}

describe('sqlite storage port userData slice', () => {
  const opened: { close: () => void }[] = [];

  afterEach(() => {
    for (const port of opened) port.close();
    opened.length = 0;
  });

  function open(): StoragePort {
    const file = join(mkdtempSync(join(tmpdir(), 'jieyu-sqlite-port-')), 'user-data.sqlite');
    const handle = openSqliteStoragePort(file);
    opened.push(handle);
    return handle.port;
  }

  it('reads a turn back after the file is closed and opened again', async () => {
    const file = join(mkdtempSync(join(tmpdir(), 'jieyu-sqlite-port-')), 'user-data.sqlite');
    const first = openSqliteStoragePort(file);
    await first.port.turns.putTurn(turn('c1', 70));
    first.close();
    const second = openSqliteStoragePort(file);
    opened.push(second);
    await expect(second.port.turns.getTurn('c1')).resolves.toEqual(turn('c1', 70));
  });

  it('lets the second turn write win, then deletes it', async () => {
    const port = open();
    await port.turns.putTurn(turn('c1', 50));
    await port.turns.putTurn(turn('c1', 70));
    await expect(port.turns.getTurn('c1')).resolves.toMatchObject({ expiresAt: 70 });
    await port.turns.deleteTurn('c1');
    await port.turns.deleteTurn('absent');
    await expect(port.turns.getTurn('c1')).resolves.toBeUndefined();
  });

  it('sweeps expired turns and keeps live ones', async () => {
    const port = open();
    await port.turns.putTurn(turn('old', 10));
    await port.turns.putTurn(turn('live', 80));
    await port.turns.sweepExpiredTurns(20);
    await expect(port.turns.getTurn('old')).resolves.toBeUndefined();
    await expect(port.turns.getTurn('live')).resolves.toMatchObject({ conversationId: 'live' });
  });

  it('reads an audit row back after inserting it', async () => {
    const port = open();
    await port.audit.insertAuditLog({
      id: 'audit-1',
      collection: 'ai_messages',
      documentId: 'doc-1',
      action: 'update',
      source: 'ai',
      timestamp: NOW,
      requestId: 'req-audit-1',
    });
    await expect(port.audit.getAuditLog('audit-1')).resolves.toMatchObject({
      id: 'audit-1',
      requestId: 'req-audit-1',
      timestamp: NOW,
    });
  });

  it('has no fingerprint until project rows are stored here', async () => {
    const port = open();
    await expect(port.fingerprintTarget('missing')).resolves.toBeUndefined();
  });

  it('refuses to remove a recording this slice does not store', async () => {
    const port = open();
    await expect(port.removeEmptyRecording('missing-media')).rejects.toSatisfy(
      (error: unknown) => recordingRemovalBlockReason(error) === 'missing',
    );
  });

  it('refuses a project-folder operation', async () => {
    const port = open();
    await expect(port.readProject('p-1')).rejects.toThrow(/has not implemented readProject/);
  });

  it('refuses speaker assignment when no project folder is open', async () => {
    const port = open();
    await expect(
      port.assignSpeakerToMixedSelection({
        textId: 'p-1',
        segmentIds: [],
        unitIds: ['u-1'],
        createSpeaker: { name: 'Speaker', textId: 'p-1' },
      }),
    ).rejects.toThrow(/has not opened a project folder/);
  });
});

const TEXT_ID = 'text-mixed-contract';
const SEGMENT_ID = 'segment-mixed-contract';
const UNIT_ID = 'unit-mixed-contract';

function pragmaFile(file: string, applicationId: number, schema: string): void {
  const db = new Database(file);
  db.exec('PRAGMA journal_mode = DELETE');
  db.exec(`PRAGMA application_id = ${applicationId}`);
  db.exec('PRAGMA user_version = 1');
  db.exec(schema);
  db.close();
}

function createProjectFixture(projectDir: string): void {
  mkdirSync(projectDir, { recursive: true });
  pragmaFile(
    join(projectDir, 'project.sqlite'),
    PROJECT_APPLICATION_ID,
    `CREATE TABLE project (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      speaker_ids_json TEXT
    );
    CREATE TABLE speakers (
      id TEXT PRIMARY KEY,
      text_id TEXT NOT NULL,
      name TEXT NOT NULL,
      created_at TEXT,
      updated_at TEXT
    );`,
  );
  pragmaFile(
    join(projectDir, 'mixed.jyd'),
    MANUSCRIPT_APPLICATION_ID,
    `CREATE TABLE units (
      id TEXT PRIMARY KEY,
      layer_id TEXT,
      media_id TEXT,
      parent_unit_id TEXT,
      speaker_id TEXT,
      start_anchor_id TEXT,
      end_anchor_id TEXT,
      unit_type TEXT
    );
    CREATE TABLE speakers (id TEXT PRIMARY KEY, name TEXT NOT NULL);`,
  );
}

function insertMixedSelection(projectDir: string): void {
  const project = new Database(join(projectDir, 'project.sqlite'));
  project.prepare('INSERT INTO project (id, name) VALUES (?, ?)').run(TEXT_ID, 'Mixed');
  project.close();
  const manuscript = new Database(join(projectDir, 'mixed.jyd'));
  const insert = manuscript.prepare('INSERT INTO units (id, layer_id, unit_type) VALUES (?, ?, ?)');
  insert.run(SEGMENT_ID, 'layer-mixed-contract', 'segment');
  insert.run(UNIT_ID, 'layer-mixed-contract', 'unit');
  manuscript.close();
}

function readAssignment(projectDir: string, speakerId: string) {
  const project = new Database(join(projectDir, 'project.sqlite'));
  const manuscript = new Database(join(projectDir, 'mixed.jyd'));
  try {
    const speaker: unknown = project.prepare('SELECT id FROM speakers WHERE id = ?').get(speakerId);
    const segment: unknown = manuscript
      .prepare('SELECT speaker_id FROM units WHERE id = ?')
      .get(SEGMENT_ID);
    const unit: unknown = manuscript
      .prepare('SELECT speaker_id FROM units WHERE id = ?')
      .get(UNIT_ID);
    const roster: unknown = project
      .prepare('SELECT speaker_ids_json FROM project WHERE id = ?')
      .get(TEXT_ID);
    const copy: unknown = manuscript
      .prepare('SELECT name FROM speakers WHERE id = ?')
      .get(speakerId);
    const rosterJson =
      typeof roster === 'object' && roster !== null
        ? (roster as { speaker_ids_json?: unknown }).speaker_ids_json
        : undefined;
    const column = (row: unknown): string | undefined => {
      if (typeof row !== 'object' || row === null) return undefined;
      const id = (row as { speaker_id?: unknown }).speaker_id;
      return typeof id === 'string' ? id : undefined;
    };
    return {
      speakerId: typeof speaker === 'object' && speaker !== null ? speakerId : undefined,
      segmentSpeakerId: column(segment),
      unitSpeakerId: column(unit),
      projectSpeakerIds:
        typeof rosterJson === 'string' ? (JSON.parse(rosterJson) as string[]) : undefined,
      copyName:
        typeof copy === 'object' && copy !== null ? (copy as { name?: unknown }).name : undefined,
    };
  } finally {
    project.close();
    manuscript.close();
  }
}

describe('sqlite storage port project folder', () => {
  let projectDir = '';
  let userData = '';
  let handle: { port: StoragePort; close: () => void } | undefined;

  function reset(): void {
    handle?.close();
    handle = undefined;
    const root = mkdtempSync(join(tmpdir(), 'jieyu-sqlite-project-'));
    projectDir = join(root, 'project');
    userData = join(root, 'user-data.sqlite');
    createProjectFixture(projectDir);
    handle = openSqliteStoragePort(userData, projectDir);
  }

  afterEach(() => {
    handle?.close();
    handle = undefined;
  });

  describeStoragePortContract(
    'sqlite',
    () => {
      if (handle === undefined) throw new Error('port is not open');
      return handle.port;
    },
    async () => {
      reset();
    },
    async () => {
      insertMixedSelection(projectDir);
      return {
        textId: TEXT_ID,
        segmentId: SEGMENT_ID,
        unitId: UNIT_ID,
        readback: async (speakerId: string) => {
          const stored = readAssignment(projectDir, speakerId);
          return {
            speakerId: stored.speakerId,
            segmentSpeakerId: stored.segmentSpeakerId,
            unitSpeakerId: stored.unitSpeakerId,
            projectSpeakerIds: stored.projectSpeakerIds,
          };
        },
      };
    },
  );

  it('reads the assignment and the definition copy after the folder is closed and opened again', async () => {
    reset();
    insertMixedSelection(projectDir);
    const write = {
      textId: TEXT_ID,
      segmentIds: [SEGMENT_ID],
      unitIds: [UNIT_ID],
      createSpeaker: { name: 'Speaker', textId: TEXT_ID },
    };
    const result = await handle!.port.assignSpeakerToMixedSelection(write);
    const speakerId = result.speaker?.id;
    expect(speakerId).toBeTruthy();
    handle!.close();
    handle = undefined;
    const reopened = openSqliteStoragePort(userData, projectDir);
    handle = reopened;
    const repeated = await reopened.port.assignSpeakerToMixedSelection(write);
    expect(repeated.speaker?.id).toBe(speakerId);
    expect(repeated.created).toBeUndefined();
    expect(readAssignment(projectDir, speakerId!)).toMatchObject({
      speakerId,
      segmentSpeakerId: speakerId,
      unitSpeakerId: speakerId,
      projectSpeakerIds: [speakerId],
      copyName: 'Speaker',
    });
  });

  it('rejects a speaker from another project before writing the manuscript', async () => {
    reset();
    insertMixedSelection(projectDir);
    const project = new Database(join(projectDir, 'project.sqlite'));
    project
      .prepare('INSERT INTO speakers (id, text_id, name) VALUES (?, ?, ?)')
      .run('speaker-other', 'text-other', 'Foreign');
    project.close();
    await expect(
      handle!.port.assignSpeakerToMixedSelection({
        textId: TEXT_ID,
        segmentIds: [],
        unitIds: [UNIT_ID],
        speakerId: 'speaker-other',
      }),
    ).rejects.toBeInstanceOf(CatalogOwnershipMismatchError);
    expect(readAssignment(projectDir, 'speaker-other').unitSpeakerId).toBeUndefined();
  });
});
