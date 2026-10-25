import { randomUUID } from 'node:crypto';
import { existsSync, linkSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import Database from 'better-sqlite3';
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

export function openProject(
  folder: string,
  schemaSql = DESKTOP_PROJECT_SCHEMA_SQL,
): DesktopProject {
  const target = join(folder, 'project.sqlite');
  if (!existsSync(target)) publishNewProject(folder, target, schemaSql);
  if (!existsSync(target)) throw new Error('project.sqlite was not created');
  const db = new Database(target);
  db.exec('PRAGMA foreign_keys = ON');
  db.exec('PRAGMA journal_mode = DELETE');
  return {
    db,
    close() {
      db.close();
    },
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
