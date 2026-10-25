import { randomUUID } from 'node:crypto';
import {
  closeSync,
  copyFileSync,
  existsSync,
  linkSync,
  openSync,
  readSync,
  realpathSync,
  rmSync,
  statSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import Database from 'better-sqlite3';
import { releaseProjectLock, tryAcquireProjectLock } from '../../desktop/skeleton/projectLock';
import { createLayer, getLayer, type Layer, type LayerCreate } from './layers';
import { createMedia, getMedia, type Media, type MediaCreate } from './media';
import {
  createManuscript,
  getManuscript,
  type Manuscript,
  type ManuscriptCreate,
} from './manuscripts';
import {
  DESKTOP_PROJECT_APPLICATION_ID,
  DESKTOP_PROJECT_SCHEMA_SQL,
  DESKTOP_PROJECT_USER_VERSION,
} from './schema';
import { getSettings, replaceSettings } from './settings';
import { createSpeaker, getSpeaker, type Speaker, type SpeakerCreate } from './speakers';
import {
  createUnit,
  getUnit,
  listUnits,
  updateBoundary,
  type Unit,
  type UnitCreate,
} from './units';

type SqliteDatabase = InstanceType<typeof Database>;

export interface DesktopProject {
  readonly db: SqliteDatabase;
  close(): void;
  manuscripts: {
    create(input: ManuscriptCreate): Manuscript;
    get(id: string): Manuscript | null;
  };
  layers: {
    create(input: LayerCreate): Layer;
    get(id: string): Layer | null;
  };
  units: {
    create(input: UnitCreate): Unit;
    get(id: string): Unit | null;
    list(layerId: string): Unit[];
    updateBoundary(input: { leftId: string; rightId: string; time: number }): {
      left: Unit;
      right: Unit;
    };
  };
  media: {
    create(input: MediaCreate): Media;
    get(id: string): Media | null;
  };
  speakers: {
    create(input: SpeakerCreate): Speaker;
    get(id: string): Speaker | null;
  };
  settings: {
    get(projectId: string): Record<string, unknown> | null;
    replace(projectId: string, settings: Record<string, unknown>): Record<string, unknown>;
  };
}

const schemaSignatures = new Map<string, string>();

export function openProject(
  folder: string,
  schemaSql = DESKTOP_PROJECT_SCHEMA_SQL,
): DesktopProject {
  const lock = tryAcquireProjectLock(folder);
  if (!lock.ok) throw new Error('project folder is busy');
  try {
    const target = join(folder, 'project.sqlite');
    if (!existsSync(target)) publishNewProject(folder, target, schemaSql);
    else {
      assertDatabaseInsideFolder(folder, target);
      assertExistingProject(target, schemaSql);
    }
    if (!existsSync(target)) throw new Error('project.sqlite was not created');
    const db = new Database(target);
    db.exec('PRAGMA foreign_keys = ON');
    db.exec('PRAGMA busy_timeout = 5000');
    return bindProject(db, folder, () => {
      db.close();
      releaseProjectLock(folder);
    });
  } catch (error) {
    releaseProjectLock(folder);
    throw error;
  }
}

function bindProject(db: SqliteDatabase, folder: string, close: () => void): DesktopProject {
  return {
    db,
    close,
    manuscripts: {
      create: (input) => createManuscript(db, input),
      get: (id) => getManuscript(db, id),
    },
    layers: {
      create: (input) => createLayer(db, input),
      get: (id) => getLayer(db, id),
    },
    units: {
      create: (input) => createUnit(db, input),
      get: (id) => getUnit(db, id),
      list: (layerId) => listUnits(db, layerId),
      updateBoundary: (input) => updateBoundary(db, input),
    },
    media: {
      create: (input) => createMedia(db, folder, input),
      get: (id) => getMedia(db, id),
    },
    speakers: {
      create: (input) => createSpeaker(db, input),
      get: (id) => getSpeaker(db, id),
    },
    settings: {
      get: (projectId) => getSettings(db, projectId),
      replace: (projectId, settings) => replaceSettings(db, projectId, settings),
    },
  };
}

function publishNewProject(folder: string, target: string, schemaSql: string): void {
  const temp = join(folder, `.${randomUUID()}.project.sqlite.tmp`);
  let db: SqliteDatabase | undefined;
  try {
    db = new Database(temp);
    db.exec('PRAGMA journal_mode = DELETE');
    db.exec(`PRAGMA application_id = ${DESKTOP_PROJECT_APPLICATION_ID}`);
    db.exec(`PRAGMA user_version = ${DESKTOP_PROJECT_USER_VERSION}`);
    db.exec(schemaSql);
    db.close();
    db = undefined;
    linkSync(temp, target);
  } catch (error) {
    try {
      db?.close();
    } catch {
      // already closed, or the file never opened
    }
    rmSync(temp, { force: true });
    throw error;
  }
  rmSync(temp, { force: true });
}

const SQLITE_MAGIC = Buffer.from('SQLite format 3\0', 'utf8');
const JOURNAL_MAGIC = Buffer.from('d9d505f920a163d7', 'hex');

function assertDatabaseInsideFolder(folder: string, target: string): void {
  const realFolder = realpathSync(folder);
  if (realpathSync(target) !== join(realFolder, 'project.sqlite')) {
    throw new Error('project.sqlite points outside the project folder');
  }
  if (statSync(target).nlink > 1) {
    throw new Error('project.sqlite has multiple hard links');
  }
}

function assertExistingProject(file: string, schemaSql: string): void {
  assertProjectHeader(file);
  if (journalIsHot(file)) {
    assertRecoverableSchema(file, schemaSql);
    replayJournal(file);
  }
  const db = new Database(file, { readonly: true, fileMustExist: true });
  try {
    if (!acceptedSchema(db, schemaSql)) {
      throw new Error('project.sqlite is not a Jieyu project library');
    }
  } finally {
    db.close();
  }
  if (existsSync(`${file}-journal`) && !journalIsHot(file)) rmSync(`${file}-journal`);
}

function journalIsHot(file: string): boolean {
  const journal = `${file}-journal`;
  if (!existsSync(journal)) return false;
  const header = Buffer.alloc(8);
  const fd = openSync(journal, 'r');
  try {
    return readSync(fd, header, 0, 8, 0) === 8 && header.equals(JOURNAL_MAGIC);
  } finally {
    closeSync(fd);
  }
}

// Copy first: replaying a hot journal writes. An incompatible file must stay byte-for-byte.
function assertRecoverableSchema(file: string, schemaSql: string): void {
  const temp = join(dirname(file), `.${randomUUID()}.recover.sqlite`);
  try {
    copyFileSync(file, temp);
    copyFileSync(`${file}-journal`, `${temp}-journal`);
    replayJournal(temp);
    const db = new Database(temp, { readonly: true, fileMustExist: true });
    try {
      if (!acceptedSchema(db, schemaSql)) {
        throw new Error('project.sqlite is not a Jieyu project library');
      }
    } finally {
      db.close();
    }
  } finally {
    rmSync(temp, { force: true });
    rmSync(`${temp}-journal`, { force: true });
  }
}

function replayJournal(file: string): void {
  const db = new Database(file, { fileMustExist: true });
  try {
    // Opening alone is lazy; reading the schema triggers SQLite's hot-journal recovery.
    db.prepare('SELECT COUNT(*) FROM sqlite_master').get();
  } finally {
    db.close();
  }
}

function acceptedSchema(db: SqliteDatabase, schemaSql: string): boolean {
  return (
    pragmaValue(db, 'journal_mode') === 'delete' &&
    schemaSignature(db) === expectedSignature(schemaSql)
  );
}

function assertProjectHeader(file: string): void {
  const header = Buffer.alloc(100);
  const fd = openSync(file, 'r');
  let read = 0;
  try {
    read = readSync(fd, header, 0, 100, 0);
  } finally {
    closeSync(fd);
  }
  const magic = header.subarray(0, 16);
  const rollbackJournal = header.readUInt8(18) === 1;
  const userVersion = header.readUInt32BE(60) === DESKTOP_PROJECT_USER_VERSION;
  const applicationId = header.readUInt32BE(68) === DESKTOP_PROJECT_APPLICATION_ID;
  if (
    read < 100 ||
    !magic.equals(SQLITE_MAGIC) ||
    !rollbackJournal ||
    !userVersion ||
    !applicationId
  ) {
    throw new Error('project.sqlite is not a Jieyu project library');
  }
}

function expectedSignature(schemaSql: string): string {
  const cached = schemaSignatures.get(schemaSql);
  if (cached !== undefined) return cached;
  const db = new Database(':memory:');
  try {
    db.exec(schemaSql);
    const signature = schemaSignature(db);
    schemaSignatures.set(schemaSql, signature);
    return signature;
  } finally {
    db.close();
  }
}

function schemaSignature(db: SqliteDatabase): string {
  return db
    .prepare(
      `SELECT type, name, sql FROM sqlite_master
       WHERE sql IS NOT NULL
       ORDER BY type, name`,
    )
    .all()
    .map((row) => {
      const record = row as { type?: unknown; name?: unknown; sql?: unknown };
      const sql = String(record.sql).replace(/\s+/g, ' ').trim();
      return `${String(record.type)}:${String(record.name)}:${sql}`;
    })
    .join('\n');
}

function pragmaValue(db: SqliteDatabase, name: string): unknown {
  const row = db.prepare(`PRAGMA ${name}`).get();
  if (typeof row !== 'object' || row === null) return undefined;
  return (row as Record<string, unknown>)[name];
}
