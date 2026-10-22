import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { CatalogOwnershipMismatchError } from '../services/projectCatalogScope';
import { SourceMediaLinkError, SourceProjectNotFoundError } from '../services/sourceRecordPlan';
import { HIDDEN_DIRECTORY } from './projectFiles/fileOps';
import { StorageReadbackError } from './storageReadbackError';
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

  it('refuses to remove a recording when no project folder is open', async () => {
    const port = open();
    await expect(port.removeEmptyRecording('  ')).rejects.toSatisfy(
      (error: unknown) => recordingRemovalBlockReason(error) === 'missing',
    );
    await expect(port.removeEmptyRecording('missing-media')).rejects.toThrow(
      /has not opened a project folder/,
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
    );
    CREATE TABLE source_records (
      id TEXT PRIMARY KEY,
      text_id TEXT NOT NULL,
      original_name TEXT NOT NULL,
      display_name TEXT NOT NULL,
      format TEXT NOT NULL,
      media_id TEXT,
      byte_size INTEGER,
      sha256 TEXT,
      external_doc_id TEXT,
      imported_at TEXT,
      import_batch_id TEXT,
      stored_bytes INTEGER,
      linked_media_filename TEXT,
      updated_at TEXT
    );
    CREATE TABLE media_items (
      id TEXT PRIMARY KEY,
      text_id TEXT NOT NULL,
      filename TEXT NOT NULL,
      url TEXT,
      duration REAL,
      details_json TEXT,
      is_offline_cached INTEGER NOT NULL,
      access_rights TEXT,
      created_at TEXT NOT NULL,
      timeline_kind TEXT NOT NULL,
      byte_location TEXT NOT NULL,
      availability TEXT NOT NULL,
      content_size REAL,
      content_sha256 TEXT
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
      unit_type TEXT,
      text_id TEXT,
      start_time REAL,
      end_time REAL,
      updated_at TEXT
    );
    CREATE TABLE unit_contents (
      id TEXT PRIMARY KEY,
      unit_id TEXT NOT NULL,
      role TEXT NOT NULL,
      text TEXT NOT NULL,
      text_id TEXT,
      updated_at TEXT
    );
    CREATE TABLE anchors (
      id TEXT PRIMARY KEY,
      media_id TEXT NOT NULL,
      time REAL NOT NULL
    );
    CREATE TABLE speakers (id TEXT PRIMARY KEY, name TEXT NOT NULL);
    CREATE TABLE track_entities (
      id TEXT PRIMARY KEY,
      media_id TEXT NOT NULL,
      mode TEXT NOT NULL,
      lane_lock_json TEXT,
      text_id TEXT,
      updated_at TEXT
    );`,
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

  it('refuses a regex split when no project folder is open', async () => {
    const file = join(mkdtempSync(join(tmpdir(), 'jieyu-sqlite-port-')), 'user-data.sqlite');
    const alone = openSqliteStoragePort(file);
    await expect(
      alone.port.commitRegexSplit({ anchors: [], units: [], contents: [] }),
    ).rejects.toThrow(/has not opened a project folder/);
    alone.close();
  });

  it('reads a regex split back after the manuscript is closed and opened again', async () => {
    reset();
    const result = await handle!.port.commitRegexSplit({
      anchors: [{ id: 'anc-1', mediaId: 'm1', time: 1, createdAt: NOW }],
      units: [
        {
          id: 'u1',
          textId: TEXT_ID,
          mediaId: 'm1',
          unitType: 'unit',
          startTime: 0,
          endTime: 1,
          createdAt: NOW,
          updatedAt: NOW,
        },
      ],
      contents: [
        {
          id: 'c1',
          textId: TEXT_ID,
          unitId: 'u1',
          text: 'left',
          contentRole: 'primary_text',
          createdAt: NOW,
          updatedAt: NOW,
        },
      ],
    });
    expect(result.resizedSegmentIds).toEqual([]);
    handle!.close();
    handle = undefined;
    const manuscript = new Database(join(projectDir, 'mixed.jyd'));
    try {
      const unit: unknown = manuscript
        .prepare('SELECT end_time, text_id FROM units WHERE id = ?')
        .get('u1');
      const content: unknown = manuscript
        .prepare('SELECT text FROM unit_contents WHERE id = ?')
        .get('c1');
      const anchor: unknown = manuscript
        .prepare('SELECT time FROM anchors WHERE id = ?')
        .get('anc-1');
      expect(unit).toMatchObject({ end_time: 1, text_id: TEXT_ID });
      expect(content).toMatchObject({ text: 'left' });
      expect(anchor).toMatchObject({ time: 1 });
    } finally {
      manuscript.close();
    }
  });

  it('writes nothing when a regex split mixes two projects', async () => {
    reset();
    await expect(
      handle!.port.commitRegexSplit({
        anchors: [],
        units: [
          {
            id: 'u1',
            textId: 'a',
            startTime: 0,
            endTime: 1,
            createdAt: NOW,
            updatedAt: NOW,
          },
          {
            id: 'u2',
            textId: 'b',
            startTime: 0,
            endTime: 1,
            createdAt: NOW,
            updatedAt: NOW,
          },
        ],
        contents: [],
      }),
    ).rejects.toThrow(/belongs to project/);
    const manuscript = new Database(join(projectDir, 'mixed.jyd'));
    try {
      expect(manuscript.prepare('SELECT COUNT(*) AS n FROM units').get()).toMatchObject({ n: 0 });
    } finally {
      manuscript.close();
    }
  });

  it('writes nothing when a regex split overwrites a row stored for another project', async () => {
    reset();
    const manuscript = new Database(join(projectDir, 'mixed.jyd'));
    manuscript
      .prepare(
        'INSERT INTO units (id, text_id, unit_type, start_time, end_time, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
      )
      .run('u-other', 'project-b', 'unit', 0, 1, NOW);
    manuscript.close();
    await expect(
      handle!.port.commitRegexSplit({
        anchors: [{ id: 'anc-x', mediaId: 'm1', time: 1, createdAt: NOW }],
        units: [
          {
            id: 'u-other',
            textId: 'project-a',
            startTime: 0,
            endTime: 0.5,
            createdAt: NOW,
            updatedAt: '2026-10-16T00:00:00.000Z',
          },
        ],
        contents: [],
      }),
    ).rejects.toBeInstanceOf(CatalogOwnershipMismatchError);
    const stored = new Database(join(projectDir, 'mixed.jyd'));
    try {
      expect(
        stored.prepare('SELECT end_time, text_id FROM units WHERE id = ?').get('u-other'),
      ).toMatchObject({ end_time: 1, text_id: 'project-b' });
      expect(stored.prepare('SELECT id FROM anchors WHERE id = ?').get('anc-x')).toBeUndefined();
    } finally {
      stored.close();
    }
  });

  it('moves split-unit segments to the new bounds in the same commit', async () => {
    reset();
    const manuscript = new Database(join(projectDir, 'mixed.jyd'));
    const insert = manuscript.prepare(
      'INSERT INTO units (id, text_id, unit_type, parent_unit_id, start_time, end_time, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    );
    insert.run('seg-1', TEXT_ID, 'segment', 'u1', 0, 3, NOW);
    insert.run('seg-other', TEXT_ID, 'segment', 'u2', 3, 4, NOW);
    manuscript.close();
    const later = '2026-10-16T00:00:00.000Z';
    const { resizedSegmentIds } = await handle!.port.commitRegexSplit({
      anchors: [],
      units: [
        {
          id: 'u1',
          textId: TEXT_ID,
          unitType: 'unit',
          startTime: 0,
          endTime: 1.2,
          createdAt: NOW,
          updatedAt: later,
        },
      ],
      contents: [],
      resizeSegmentsOf: ['u1'],
    });
    expect(resizedSegmentIds).toEqual(['seg-1']);
    const stored = new Database(join(projectDir, 'mixed.jyd'));
    try {
      expect(
        stored
          .prepare('SELECT start_time, end_time, updated_at FROM units WHERE id = ?')
          .get('seg-1'),
      ).toMatchObject({ start_time: 0, end_time: 1.2, updated_at: later });
      expect(
        stored.prepare('SELECT end_time FROM units WHERE id = ?').get('seg-other'),
      ).toMatchObject({
        end_time: 4,
      });
    } finally {
      stored.close();
    }
  });

  it('refuses a track entity when no project folder is open', async () => {
    const file = join(mkdtempSync(join(tmpdir(), 'jieyu-sqlite-port-')), 'user-data.sqlite');
    const alone = openSqliteStoragePort(file);
    const doc = {
      id: 'track-1',
      textId: TEXT_ID,
      mediaId: 'm1',
      mode: 'single' as const,
      laneLockMap: {},
      updatedAt: NOW,
    };
    await expect(alone.port.putTrackEntity(doc)).rejects.toThrow(/has not opened a project folder/);
    await expect(alone.port.listTrackEntities(TEXT_ID)).rejects.toThrow(
      /has not opened a project folder/,
    );
    alone.close();
  });

  it('reads a track entity back after the manuscript is closed and opened again', async () => {
    reset();
    const doc = {
      id: 'track-1',
      textId: TEXT_ID,
      mediaId: 'm1',
      mode: 'multi-locked' as const,
      laneLockMap: { s1: 1 },
      updatedAt: NOW,
    };
    await handle!.port.putTrackEntity(doc);
    await expect(handle!.port.listTrackEntities(TEXT_ID)).resolves.toEqual([doc]);
    await expect(handle!.port.listTrackEntities('text-b')).resolves.toEqual([]);
    await expect(handle!.port.listTrackEntities('  ')).resolves.toEqual([]);
    handle!.close();
    handle = undefined;
    const reopened = openSqliteStoragePort(userData, projectDir);
    handle = reopened;
    await expect(reopened.port.listTrackEntities(TEXT_ID)).resolves.toEqual([doc]);
    const manuscript = new Database(join(projectDir, 'mixed.jyd'));
    try {
      expect(
        manuscript
          .prepare(
            'SELECT text_id, media_id, mode, lane_lock_json, updated_at FROM track_entities WHERE id = ?',
          )
          .get('track-1'),
      ).toMatchObject({
        text_id: TEXT_ID,
        media_id: 'm1',
        mode: 'multi-locked',
        lane_lock_json: '{"s1":1}',
        updated_at: NOW,
      });
    } finally {
      manuscript.close();
    }
  });

  it('writes an empty lane lock and claims a row whose project id was blank', async () => {
    reset();
    const manuscript = new Database(join(projectDir, 'mixed.jyd'));
    manuscript
      .prepare('INSERT INTO track_entities (id, media_id, mode) VALUES (?, ?, ?)')
      .run('track-blank', 'm1', 'single');
    manuscript.close();
    const doc = {
      id: 'track-blank',
      textId: TEXT_ID,
      mediaId: 'm1',
      mode: 'single' as const,
      laneLockMap: {},
      updatedAt: NOW,
    };
    await handle!.port.putTrackEntity(doc);
    await expect(handle!.port.listTrackEntities(TEXT_ID)).resolves.toEqual([doc]);
  });

  it('writes nothing when a track entity overwrites a row stored for another project', async () => {
    reset();
    const manuscript = new Database(join(projectDir, 'mixed.jyd'));
    manuscript
      .prepare(
        'INSERT INTO track_entities (id, media_id, mode, lane_lock_json, text_id, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
      )
      .run('track-other', 'm1', 'single', '{}', 'project-b', NOW);
    manuscript.close();
    await expect(
      handle!.port.putTrackEntity({
        id: 'track-other',
        textId: 'project-a',
        mediaId: 'm2',
        mode: 'multi-auto',
        laneLockMap: { s1: 2 },
        updatedAt: '2026-10-16T00:00:00.000Z',
      }),
    ).rejects.toBeInstanceOf(CatalogOwnershipMismatchError);
    const stored = new Database(join(projectDir, 'mixed.jyd'));
    try {
      expect(
        stored
          .prepare('SELECT media_id, text_id FROM track_entities WHERE id = ?')
          .get('track-other'),
      ).toMatchObject({ media_id: 'm1', text_id: 'project-b' });
    } finally {
      stored.close();
    }
  });

  it('writes nothing when a lane lock is not a map of finite numbers', async () => {
    reset();
    await expect(
      handle!.port.putTrackEntity({
        id: 'track-bad',
        textId: TEXT_ID,
        mediaId: 'm1',
        mode: 'single',
        laneLockMap: { s1: Number.NaN },
        updatedAt: NOW,
      }),
    ).rejects.toThrow(/finite numbers/);
    const manuscript = new Database(join(projectDir, 'mixed.jyd'));
    try {
      expect(manuscript.prepare('SELECT COUNT(*) AS n FROM track_entities').get()).toMatchObject({
        n: 0,
      });
    } finally {
      manuscript.close();
    }
  });

  it('writes nothing when a new track entity has more than one manuscript', async () => {
    reset();
    pragmaFile(
      join(projectDir, 'other.jyd'),
      MANUSCRIPT_APPLICATION_ID,
      `CREATE TABLE track_entities (
        id TEXT PRIMARY KEY,
        media_id TEXT NOT NULL,
        mode TEXT NOT NULL,
        lane_lock_json TEXT,
        text_id TEXT,
        updated_at TEXT
      );`,
    );
    await expect(
      handle!.port.putTrackEntity({
        id: 'track-new',
        textId: TEXT_ID,
        mediaId: 'm1',
        mode: 'single',
        laneLockMap: {},
        updatedAt: NOW,
      }),
    ).rejects.toThrow(/no manuscript/);
    const mixed = new Database(join(projectDir, 'mixed.jyd'));
    const other = new Database(join(projectDir, 'other.jyd'));
    try {
      expect(mixed.prepare('SELECT COUNT(*) AS n FROM track_entities').get()).toMatchObject({
        n: 0,
      });
      expect(other.prepare('SELECT COUNT(*) AS n FROM track_entities').get()).toMatchObject({
        n: 0,
      });
    } finally {
      mixed.close();
      other.close();
    }
  });

  const SHA_A = 'a'.repeat(64);
  const SHA_B = 'b'.repeat(64);
  const URN = 'urn:jieyu:source-record-test';

  function sourceCount(): number {
    const project = new Database(join(projectDir, 'project.sqlite'));
    try {
      const row: unknown = project.prepare('SELECT COUNT(*) AS n FROM source_records').get();
      return typeof row === 'object' && row !== null ? Number((row as { n?: unknown }).n) : 0;
    } finally {
      project.close();
    }
  }

  it('refuses a source record when no project folder is open', async () => {
    const file = join(mkdtempSync(join(tmpdir(), 'jieyu-sqlite-port-')), 'user-data.sqlite');
    const alone = openSqliteStoragePort(file);
    const input = {
      textId: TEXT_ID,
      originalName: 'notes.eaf',
      format: 'eaf',
      importBatchId: 'batch-1',
    };
    await expect(alone.port.listSourceRecords(TEXT_ID)).rejects.toThrow(
      /has not opened a project folder/,
    );
    await expect(alone.port.registerImportedSource(input)).rejects.toThrow(
      /has not opened a project folder/,
    );
    await expect(alone.port.renameSourceRecord(TEXT_ID, 'src', 'notes.eaf')).rejects.toThrow(
      /has not opened a project folder/,
    );
    await expect(alone.port.linkSourceRecordMedia(TEXT_ID, 'src', null)).rejects.toThrow(
      /has not opened a project folder/,
    );
    alone.close();
  });

  it('reads a source record back after the project library is closed and opened again', async () => {
    reset();
    insertMixedSelection(projectDir);
    const { plan, record } = await handle!.port.registerImportedSource({
      textId: TEXT_ID,
      originalName: 'Story.eaf',
      format: 'eaf',
      importBatchId: 'batch-1',
      sha256: SHA_A,
      byteSize: 12,
      linkedMediaFilename: 'story.wav',
    });
    expect(plan.kind).toBe('new');
    expect(record.displayName).toBe('Story.eaf');
    expect(record.storedBytes).toBe(false);
    expect(record.sha256).toBe(SHA_A);
    expect(record.byteSize).toBe(12);
    const again = await handle!.port.registerImportedSource({
      textId: TEXT_ID,
      originalName: 'story.eaf',
      format: 'eaf',
      importBatchId: 'batch-2',
      sha256: SHA_B,
    });
    expect(again.plan.kind).toBe('new');
    expect(again.record.displayName).toBe('story (2).eaf');
    expect(again.record.id).not.toBe(record.id);
    handle!.close();
    handle = undefined;
    const reopened = openSqliteStoragePort(userData, projectDir);
    handle = reopened;
    const listed = await reopened.port.listSourceRecords(TEXT_ID);
    expect([...listed].sort((left, right) => left.id.localeCompare(right.id))).toEqual(
      [record, again.record].sort((left, right) => left.id.localeCompare(right.id)),
    );
    await expect(reopened.port.listSourceRecords('text-b')).resolves.toEqual([]);
    await expect(reopened.port.listSourceRecords('  ')).resolves.toEqual([]);
  });

  it('keeps one row when the same content is registered again', async () => {
    reset();
    insertMixedSelection(projectDir);
    const first = await handle!.port.registerImportedSource({
      textId: TEXT_ID,
      originalName: 'a.eaf',
      format: 'eaf',
      importBatchId: 'batch-1',
      sha256: SHA_A,
    });
    const again = await handle!.port.registerImportedSource({
      textId: TEXT_ID,
      originalName: 'copy-of-a.eaf',
      format: 'eaf',
      importBatchId: 'batch-2',
      sha256: SHA_A,
    });
    expect(again.plan.kind).toBe('same-content');
    expect(again.record).toEqual(first.record);
    expect(sourceCount()).toBe(1);
  });

  it('updates the row for the same external id and keeps a renamed display name', async () => {
    reset();
    insertMixedSelection(projectDir);
    const first = await handle!.port.registerImportedSource({
      textId: TEXT_ID,
      originalName: 'story.eaf',
      format: 'eaf',
      importBatchId: 'batch-1',
      sha256: SHA_A,
      externalDocId: URN,
    });
    const renamed = await handle!.port.renameSourceRecord(
      TEXT_ID,
      first.record.id,
      'Story revised.eaf',
    );
    expect(renamed?.displayName).toBe('Story revised.eaf');
    const updated = await handle!.port.registerImportedSource({
      textId: TEXT_ID,
      originalName: 'story-final.eaf',
      format: 'textgrid',
      importBatchId: 'batch-2',
      sha256: SHA_B,
      externalDocId: URN,
    });
    expect(updated.plan.kind).toBe('update-existing');
    expect(updated.record.id).toBe(first.record.id);
    expect(updated.record.displayName).toBe('Story revised.eaf');
    expect(updated.record.originalName).toBe('story-final.eaf');
    expect(updated.record.format).toBe('textgrid');
    expect(updated.record.sha256).toBe(SHA_B);
    expect(sourceCount()).toBe(1);
    handle!.close();
    handle = undefined;
    const reopened = openSqliteStoragePort(userData, projectDir);
    handle = reopened;
    await expect(reopened.port.listSourceRecords(TEXT_ID)).resolves.toEqual([updated.record]);
  });

  it('writes nothing when the project row is missing or the recording is not stored yet', async () => {
    reset();
    await expect(
      handle!.port.registerImportedSource({
        textId: TEXT_ID,
        originalName: 'a.eaf',
        format: 'eaf',
        importBatchId: 'batch-1',
      }),
    ).rejects.toBeInstanceOf(SourceProjectNotFoundError);
    expect(sourceCount()).toBe(0);
    insertMixedSelection(projectDir);
    const { record } = await handle!.port.registerImportedSource({
      textId: TEXT_ID,
      originalName: 'a.eaf',
      format: 'eaf',
      importBatchId: 'batch-1',
    });
    await expect(
      handle!.port.registerImportedSource({
        textId: TEXT_ID,
        originalName: 'b.eaf',
        format: 'eaf',
        importBatchId: 'batch-2',
        sha256: SHA_A,
        mediaId: 'media-missing',
      }),
    ).rejects.toMatchObject({ name: 'SourceMediaLinkError', reason: 'media-missing' });
    expect(sourceCount()).toBe(1);
    await expect(
      handle!.port.linkSourceRecordMedia(TEXT_ID, record.id, 'media-missing'),
    ).rejects.toBeInstanceOf(SourceMediaLinkError);
    await expect(handle!.port.linkSourceRecordMedia(TEXT_ID, 'missing-row', null)).resolves.toBe(
      undefined,
    );
    await expect(handle!.port.renameSourceRecord(TEXT_ID, record.id, '   ')).resolves.toBe(
      undefined,
    );
    const listed = await handle!.port.listSourceRecords(TEXT_ID);
    expect(listed).toEqual([record]);
  });

  it('clears a stored recording link without deleting the source row', async () => {
    reset();
    insertMixedSelection(projectDir);
    const project = new Database(join(projectDir, 'project.sqlite'));
    project
      .prepare(
        `INSERT INTO source_records (
          id, text_id, original_name, display_name, format, media_id, imported_at, import_batch_id,
          stored_bytes, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        'src-linked',
        TEXT_ID,
        'notes.eaf',
        'notes.eaf',
        'eaf',
        'media-old',
        NOW,
        'batch-1',
        0,
        NOW,
      );
    project.close();
    const cleared = await handle!.port.linkSourceRecordMedia(TEXT_ID, 'src-linked', null);
    expect(cleared?.mediaId).toBeUndefined();
    expect(cleared?.displayName).toBe('notes.eaf');
    const stored = new Database(join(projectDir, 'project.sqlite'));
    try {
      expect(
        stored
          .prepare('SELECT media_id, display_name FROM source_records WHERE id = ?')
          .get('src-linked'),
      ).toMatchObject({ media_id: null, display_name: 'notes.eaf' });
    } finally {
      stored.close();
    }
  });

  function recording(id: string, textId: string) {
    return {
      id,
      textId,
      filename: `${id}.wav`,
      duration: 1.5,
      isOfflineCached: false,
      createdAt: NOW,
      timelineKind: 'acoustic' as const,
      byteLocation: 'none' as const,
      availability: 'missing' as const,
      details: { label: id },
    };
  }

  function mediaCount(): number {
    const project = new Database(join(projectDir, 'project.sqlite'));
    try {
      const row: unknown = project.prepare('SELECT COUNT(*) AS n FROM media_items').get();
      return typeof row === 'object' && row !== null ? Number((row as { n?: unknown }).n) : 0;
    } finally {
      project.close();
    }
  }

  it('refuses a recording row when no project folder is open', async () => {
    const file = join(mkdtempSync(join(tmpdir(), 'jieyu-sqlite-port-')), 'user-data.sqlite');
    const alone = openSqliteStoragePort(file);
    await expect(alone.port.saveMediaItem(recording('media-1', TEXT_ID))).rejects.toThrow(
      /has not opened a project folder/,
    );
    await expect(alone.port.listMediaByText(TEXT_ID)).rejects.toThrow(
      /has not opened a project folder/,
    );
    await expect(alone.port.listMediaIdsByText(TEXT_ID)).rejects.toThrow(
      /has not opened a project folder/,
    );
    alone.close();
  });

  it('reads a recording row back after the project library is closed and opened again', async () => {
    reset();
    const row = recording('media-1', TEXT_ID);
    await expect(handle!.port.saveMediaItem(row)).resolves.toBe('media-1');
    await expect(handle!.port.saveMediaItem({ ...row, filename: 'renamed.wav' })).resolves.toBe(
      'media-1',
    );
    const stored = { ...row, filename: 'renamed.wav' };
    await expect(handle!.port.listMediaByText(TEXT_ID)).resolves.toEqual([stored]);
    await expect(handle!.port.listMediaIdsByText(TEXT_ID)).resolves.toEqual(['media-1']);
    await expect(handle!.port.listMediaByText('text-b')).resolves.toEqual([]);
    await expect(handle!.port.listMediaByText('  ')).resolves.toEqual([]);
    handle!.close();
    handle = undefined;
    const reopened = openSqliteStoragePort(userData, projectDir);
    handle = reopened;
    await expect(reopened.port.listMediaByText(TEXT_ID)).resolves.toEqual([stored]);
  });

  it('writes nothing for a blank recording id or for audio bytes in the row', async () => {
    reset();
    await expect(handle!.port.saveMediaItem(recording('  ', TEXT_ID))).rejects.toBeInstanceOf(
      StorageReadbackError,
    );
    await expect(
      handle!.port.saveMediaItem({
        ...recording('media-blob', TEXT_ID),
        details: { audioBlob: new Blob(['wav']) },
      }),
    ).rejects.toThrow(/audio bytes/);
    expect(mediaCount()).toBe(0);
  });

  it('links a source to a recording in the same project and refuses one from another', async () => {
    reset();
    insertMixedSelection(projectDir);
    await handle!.port.saveMediaItem(recording('media-1', TEXT_ID));
    await handle!.port.saveMediaItem(recording('media-b', 'text-other'));
    const { record } = await handle!.port.registerImportedSource({
      textId: TEXT_ID,
      originalName: 'notes.eaf',
      format: 'eaf',
      importBatchId: 'batch-1',
      mediaId: 'media-1',
    });
    expect(record.mediaId).toBe('media-1');
    await expect(
      handle!.port.linkSourceRecordMedia(TEXT_ID, record.id, 'media-b'),
    ).rejects.toMatchObject({ reason: 'media-other-project' });
    const kept = await handle!.port.listSourceRecords(TEXT_ID);
    expect(kept).toEqual([record]);
    const linked = await handle!.port.linkSourceRecordMedia(TEXT_ID, record.id, 'media-1');
    expect(linked?.mediaId).toBe('media-1');
  });

  function insertSource(id: string, mediaId: string): void {
    const project = new Database(join(projectDir, 'project.sqlite'));
    project
      .prepare(
        `INSERT INTO source_records (
          id, text_id, original_name, display_name, format, media_id, imported_at, import_batch_id,
          stored_bytes, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(id, TEXT_ID, `${id}.eaf`, `${id}.eaf`, 'eaf', mediaId, NOW, 'batch-1', 0, NOW);
    project.close();
  }

  it('refuses a placeholder or a playable recording and writes nothing', async () => {
    reset();
    await handle!.port.saveMediaItem({
      ...recording('media-placeholder', TEXT_ID),
      timelineKind: 'placeholder',
    });
    const manuscript = new Database(join(projectDir, 'mixed.jyd'));
    manuscript
      .prepare('INSERT INTO units (id, media_id, updated_at) VALUES (?, ?, ?)')
      .run('unit-url', 'media-url', NOW);
    manuscript.close();
    await expect(handle!.port.removeEmptyRecording('media-placeholder')).rejects.toSatisfy(
      (error: unknown) => recordingRemovalBlockReason(error) === 'not-acoustic',
    );
    await expect(handle!.port.removeEmptyRecording('  ')).rejects.toSatisfy(
      (error: unknown) => recordingRemovalBlockReason(error) === 'missing',
    );
    await expect(handle!.port.removeEmptyRecording('missing-media')).rejects.toSatisfy(
      (error: unknown) => recordingRemovalBlockReason(error) === 'missing',
    );
    await handle!.port.saveMediaItem({
      ...recording('media-url', TEXT_ID),
      url: 'https://example.test/a.wav',
    });
    await expect(handle!.port.removeEmptyRecording('media-url')).rejects.toSatisfy(
      (error: unknown) => recordingRemovalBlockReason(error) === 'has-bytes',
    );
    const stored = new Database(join(projectDir, 'mixed.jyd'));
    const project = new Database(join(projectDir, 'project.sqlite'));
    try {
      expect(
        project.prepare('SELECT id FROM media_items WHERE id = ?').get('media-placeholder'),
      ).toMatchObject({
        id: 'media-placeholder',
      });
      expect(
        project.prepare('SELECT id FROM media_items WHERE id = ?').get('media-url'),
      ).toMatchObject({
        id: 'media-url',
      });
      expect(stored.prepare('SELECT media_id FROM units WHERE id = ?').get('unit-url')).toEqual({
        media_id: 'media-url',
      });
    } finally {
      stored.close();
      project.close();
    }
  });

  it('removes an empty recording, unbinds manuscripts, and leaves the file and sibling', async () => {
    reset();
    writeFileSync(join(projectDir, 'same.wav'), 'wav');
    await handle!.port.saveMediaItem({
      ...recording('media-empty', TEXT_ID),
      filename: 'same.wav',
      byteLocation: 'managed',
      availability: 'available',
    });
    await handle!.port.saveMediaItem({
      ...recording('media-sibling', TEXT_ID),
      filename: 'same.wav',
      url: 'https://example.test/sibling.wav',
    });
    insertSource('src-b', 'media-empty');
    insertSource('src-a', 'media-empty');
    insertSource('src-sib', 'media-sibling');
    const manuscript = new Database(join(projectDir, 'mixed.jyd'));
    manuscript.exec(
      'CREATE TABLE meta (id TEXT PRIMARY KEY, audio_id TEXT, source_document_id TEXT)',
    );
    manuscript
      .prepare('INSERT INTO meta (id, audio_id) VALUES (?, ?)')
      .run('meta-1', 'media-empty');
    manuscript
      .prepare('INSERT INTO units (id, media_id, updated_at) VALUES (?, ?, ?)')
      .run('unit-empty', 'media-empty', NOW);
    manuscript
      .prepare('INSERT INTO units (id, media_id, updated_at) VALUES (?, ?, ?)')
      .run('unit-sibling', 'media-sibling', NOW);
    manuscript
      .prepare('INSERT INTO anchors (id, media_id, time) VALUES (?, ?, ?)')
      .run('anchor-empty', 'media-empty', 0);
    manuscript
      .prepare(
        'INSERT INTO track_entities (id, media_id, mode, lane_lock_json, text_id, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
      )
      .run('track-empty', 'media-empty', 'single', '{}', TEXT_ID, NOW);
    manuscript
      .prepare(
        'INSERT INTO track_entities (id, media_id, mode, lane_lock_json, text_id, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
      )
      .run('track-sibling', 'media-sibling', 'single', '{}', TEXT_ID, NOW);
    manuscript.close();
    const hiddenDir = join(projectDir, HIDDEN_DIRECTORY);
    mkdirSync(hiddenDir);
    pragmaFile(
      join(hiddenDir, 'hidden.jyd'),
      MANUSCRIPT_APPLICATION_ID,
      `CREATE TABLE units (
        id TEXT PRIMARY KEY,
        media_id TEXT,
        updated_at TEXT
      );`,
    );
    const hidden = new Database(join(hiddenDir, 'hidden.jyd'));
    hidden
      .prepare('INSERT INTO units (id, media_id, updated_at) VALUES (?, ?, ?)')
      .run('unit-hidden', 'media-empty', NOW);
    hidden.close();
    pragmaFile(
      join(projectDir, 'other.jyd'),
      MANUSCRIPT_APPLICATION_ID,
      `CREATE TABLE units (
        id TEXT PRIMARY KEY,
        media_id TEXT,
        updated_at TEXT
      );
      CREATE TABLE anchors (id TEXT PRIMARY KEY, media_id TEXT NOT NULL, time REAL NOT NULL);
      CREATE TABLE track_entities (
        id TEXT PRIMARY KEY,
        media_id TEXT NOT NULL,
        mode TEXT NOT NULL,
        lane_lock_json TEXT,
        text_id TEXT,
        updated_at TEXT
      );`,
    );
    const other = new Database(join(projectDir, 'other.jyd'));
    other
      .prepare('INSERT INTO units (id, media_id, updated_at) VALUES (?, ?, ?)')
      .run('unit-other', 'media-empty', NOW);
    other.close();

    await expect(handle!.port.removeEmptyRecording('media-empty')).resolves.toEqual({
      unboundSourceIds: ['src-a', 'src-b'],
    });

    handle!.close();
    handle = undefined;
    const reopened = openSqliteStoragePort(userData, projectDir);
    handle = reopened;
    await expect(reopened.port.listMediaIdsByText(TEXT_ID)).resolves.toEqual(['media-sibling']);
    const sources = await reopened.port.listSourceRecords(TEXT_ID);
    expect(sources.map((row) => row.id).sort()).toEqual(['src-a', 'src-b', 'src-sib']);
    expect(sources.find((row) => row.id === 'src-a')?.mediaId).toBeUndefined();
    expect(sources.find((row) => row.id === 'src-sib')?.mediaId).toBe('media-sibling');

    const mixed = new Database(join(projectDir, 'mixed.jyd'));
    const again = new Database(join(projectDir, 'other.jyd'));
    const hiddenAgain = new Database(join(hiddenDir, 'hidden.jyd'));
    try {
      expect(existsSync(join(projectDir, 'same.wav'))).toBe(true);
      expect(mixed.prepare('SELECT audio_id FROM meta WHERE id = ?').get('meta-1')).toEqual({
        audio_id: 'media-empty',
      });
      expect(mixed.prepare('SELECT media_id FROM units WHERE id = ?').get('unit-empty')).toEqual({
        media_id: '__unknown_media__',
      });
      expect(
        mixed.prepare('SELECT updated_at FROM units WHERE id = ?').get('unit-empty'),
      ).not.toEqual({
        updated_at: NOW,
      });
      expect(mixed.prepare('SELECT media_id FROM units WHERE id = ?').get('unit-sibling')).toEqual({
        media_id: 'media-sibling',
      });
      expect(
        mixed.prepare('SELECT media_id FROM anchors WHERE id = ?').get('anchor-empty'),
      ).toEqual({
        media_id: '__unknown_media__',
      });
      expect(
        mixed.prepare('SELECT id FROM track_entities WHERE id = ?').get('track-empty'),
      ).toBeUndefined();
      expect(
        mixed.prepare('SELECT media_id FROM track_entities WHERE id = ?').get('track-sibling'),
      ).toEqual({
        media_id: 'media-sibling',
      });
      expect(again.prepare('SELECT media_id FROM units WHERE id = ?').get('unit-other')).toEqual({
        media_id: '__unknown_media__',
      });
      expect(
        hiddenAgain.prepare('SELECT media_id FROM units WHERE id = ?').get('unit-hidden'),
      ).toEqual({
        media_id: 'media-empty',
      });
    } finally {
      mixed.close();
      again.close();
      hiddenAgain.close();
    }
  });

  function seedManuscript(audioId: string): void {
    const manuscript = new Database(join(projectDir, 'mixed.jyd'));
    manuscript.exec(
      'CREATE TABLE IF NOT EXISTS meta (id TEXT PRIMARY KEY, audio_id TEXT, source_document_id TEXT)',
    );
    manuscript
      .prepare('INSERT INTO meta (id, audio_id, source_document_id) VALUES (?, ?, ?)')
      .run('ms-1', audioId, 'src-doc');
    manuscript
      .prepare('INSERT INTO units (id, media_id, text_id, updated_at) VALUES (?, ?, ?, ?)')
      .run('unit-audio', audioId, TEXT_ID, NOW);
    manuscript
      .prepare('INSERT INTO anchors (id, media_id, time) VALUES (?, ?, ?)')
      .run('anchor-audio', audioId, 1);
    manuscript.close();
  }

  function manuscriptAudio(): {
    audioId: string | null;
    unitMediaId: string | null;
    anchorMediaId: string;
    metaCount: number;
    sourceDocumentId: string | null;
  } {
    const manuscript = new Database(join(projectDir, 'mixed.jyd'));
    try {
      const meta = manuscript.prepare('SELECT audio_id, source_document_id FROM meta').all();
      const unit = manuscript.prepare('SELECT media_id FROM units WHERE id = ?').get('unit-audio');
      const anchor = manuscript
        .prepare('SELECT media_id FROM anchors WHERE id = ?')
        .get('anchor-audio');
      return {
        metaCount: meta.length,
        audioId:
          typeof meta[0] === 'object' && meta[0] !== null
            ? ((meta[0] as { audio_id?: string | null }).audio_id ?? null)
            : null,
        sourceDocumentId:
          typeof meta[0] === 'object' && meta[0] !== null
            ? ((meta[0] as { source_document_id?: string | null }).source_document_id ?? null)
            : null,
        unitMediaId:
          typeof unit === 'object' && unit !== null
            ? ((unit as { media_id?: string | null }).media_id ?? null)
            : null,
        anchorMediaId:
          typeof anchor === 'object' && anchor !== null
            ? String((anchor as { media_id?: unknown }).media_id)
            : '',
      };
    } finally {
      manuscript.close();
    }
  }

  it('refuses to replace a manuscript recording when no project folder is open', async () => {
    const file = join(mkdtempSync(join(tmpdir(), 'jieyu-sqlite-port-')), 'user-data.sqlite');
    const alone = openSqliteStoragePort(file);
    await expect(alone.port.replaceManuscriptAudio('ms-1', 'media-1')).rejects.toThrow(
      /has not opened a project folder/,
    );
    alone.close();
  });

  it('replaces the manuscript recording and leaves one audio after reopen', async () => {
    reset();
    await handle!.port.saveMediaItem(recording('media-a', TEXT_ID));
    await handle!.port.saveMediaItem(recording('media-b', TEXT_ID));
    seedManuscript('media-a');
    await handle!.port.replaceManuscriptAudio('ms-1', 'media-b');
    await handle!.port.replaceManuscriptAudio(' ms-1 ', 'media-a');
    expect(manuscriptAudio()).toMatchObject({
      metaCount: 1,
      audioId: 'media-a',
      unitMediaId: 'media-a',
      anchorMediaId: 'media-a',
      sourceDocumentId: 'src-doc',
    });
    await handle!.port.replaceManuscriptAudio('ms-1', 'media-b');
    handle!.close();
    handle = undefined;
    const reopened = openSqliteStoragePort(userData, projectDir);
    handle = reopened;
    const stored = new Database(join(projectDir, 'mixed.jyd'));
    try {
      expect(stored.prepare('SELECT COUNT(*) AS n FROM meta').get()).toMatchObject({ n: 1 });
      expect(stored.prepare('SELECT audio_id FROM meta').get()).toEqual({ audio_id: 'media-b' });
      expect(stored.prepare('SELECT media_id FROM units').get()).toEqual({ media_id: 'media-b' });
      expect(stored.prepare('SELECT media_id FROM anchors').get()).toEqual({ media_id: 'media-a' });
      expect(stored.prepare('SELECT source_document_id FROM meta').get()).toEqual({
        source_document_id: 'src-doc',
      });
    } finally {
      stored.close();
    }
    await reopened.port.replaceManuscriptAudio('ms-1', null);
    expect(manuscriptAudio()).toMatchObject({
      metaCount: 1,
      audioId: null,
      unitMediaId: null,
      anchorMediaId: 'media-a',
    });
  });

  it('writes nothing when the recording is missing, foreign, or the manuscript id is duplicated', async () => {
    reset();
    await handle!.port.saveMediaItem(recording('media-a', TEXT_ID));
    await handle!.port.saveMediaItem(recording('media-b', 'text-other'));
    seedManuscript('media-a');
    await expect(handle!.port.replaceManuscriptAudio('  ', 'media-a')).rejects.toThrow(
      /manuscript not found/,
    );
    await expect(handle!.port.replaceManuscriptAudio('missing-ms', 'media-a')).rejects.toThrow(
      /manuscript not found/,
    );
    await expect(handle!.port.replaceManuscriptAudio('ms-1', 'media-missing')).rejects.toThrow(
      /recording not found/,
    );
    await expect(handle!.port.replaceManuscriptAudio('ms-1', 'media-b')).rejects.toThrow(
      /another project/,
    );
    pragmaFile(
      join(projectDir, 'other.jyd'),
      MANUSCRIPT_APPLICATION_ID,
      `CREATE TABLE meta (id TEXT PRIMARY KEY, audio_id TEXT, source_document_id TEXT);
       CREATE TABLE units (
         id TEXT PRIMARY KEY,
         media_id TEXT,
         text_id TEXT,
         updated_at TEXT
       );
       CREATE TABLE anchors (id TEXT PRIMARY KEY, media_id TEXT NOT NULL, time REAL NOT NULL);`,
    );
    const other = new Database(join(projectDir, 'other.jyd'));
    other
      .prepare('INSERT INTO meta (id, audio_id, source_document_id) VALUES (?, ?, ?)')
      .run('ms-1', 'media-a', 'other-doc');
    other.close();
    await expect(handle!.port.replaceManuscriptAudio('ms-1', 'media-a')).rejects.toThrow(
      /duplicate manuscript/,
    );
    expect(manuscriptAudio()).toMatchObject({
      metaCount: 1,
      audioId: 'media-a',
      unitMediaId: 'media-a',
      anchorMediaId: 'media-a',
    });
  });
});
