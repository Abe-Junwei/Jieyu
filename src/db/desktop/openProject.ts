import { randomUUID } from 'node:crypto';
import { existsSync, linkSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { releaseProjectLock, tryAcquireProjectLock } from '../../desktop/skeleton/projectLock';
import { createLayer, getLayer, type Layer, type LayerCreate } from './layers';
import {
  createManuscript,
  getManuscript,
  type Manuscript,
  type ManuscriptCreate,
} from './manuscripts';
import { DESKTOP_PROJECT_APPLICATION_ID, DESKTOP_PROJECT_SCHEMA_SQL } from './schema';
import { createUnit, getUnit, type Unit, type UnitCreate } from './units';

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
  };
}

const schemaSignatures = new Map<string, string>();

export function openProject(
  folder: string,
  schemaSql = DESKTOP_PROJECT_SCHEMA_SQL,
): DesktopProject {
  const lock = tryAcquireProjectLock(folder, process.pid);
  if (!lock.ok) throw new Error('project folder is busy');
  try {
    const target = join(folder, 'project.sqlite');
    if (!existsSync(target)) publishNewProject(folder, target, schemaSql);
    else assertExistingProject(target, schemaSql);
    if (!existsSync(target)) throw new Error('project.sqlite was not created');
    const db = new Database(target);
    db.exec('PRAGMA foreign_keys = ON');
    return bindProject(db, () => {
      db.close();
      releaseProjectLock(folder, process.pid);
    });
  } catch (error) {
    releaseProjectLock(folder, process.pid);
    throw error;
  }
}

function bindProject(db: SqliteDatabase, close: () => void): DesktopProject {
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

function assertExistingProject(file: string, schemaSql: string): void {
  const db = new Database(file, { readonly: true, fileMustExist: true });
  try {
    const applicationId = pragmaValue(db, 'application_id');
    const journal = pragmaValue(db, 'journal_mode');
    const signature = schemaSignature(db);
    if (
      applicationId !== DESKTOP_PROJECT_APPLICATION_ID ||
      journal !== 'delete' ||
      signature !== expectedSignature(schemaSql)
    ) {
      throw new Error('project.sqlite is not a Jieyu project library');
    }
  } finally {
    db.close();
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
      return `${String(record.type)}:${String(record.name)}:${String(record.sql)}`;
    })
    .join('\n');
}

function pragmaValue(db: SqliteDatabase, name: string): unknown {
  const row = db.prepare(`PRAGMA ${name}`).get();
  if (typeof row !== 'object' || row === null) return undefined;
  return (row as Record<string, unknown>)[name];
}
