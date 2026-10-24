/**
 * Foreign layers in top-level .jyd files (ADR-0082).
 * Project id is the nullable layers.text_id column. Migration does not read it.
 * No ALTER. A matched row with an empty project id is refused.
 */
import { readdirSync } from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { MANUSCRIPT_APPLICATION_ID } from './sqliteSpeakerAssignment';

type SqliteDatabase = InstanceType<typeof Database>;

function applicationId(db: SqliteDatabase): number {
  const row: unknown = db.prepare('PRAGMA application_id').get();
  if (typeof row !== 'object' || row === null) return 0;
  const value = (row as { application_id?: unknown }).application_id;
  return typeof value === 'number' ? value : 0;
}

function manuscripts(projectDir: string): string[] {
  return readdirSync(projectDir)
    .filter((name) => name.endsWith('.jyd'))
    .sort()
    .map((name) => path.join(projectDir, name));
}

function openManuscript(file: string): SqliteDatabase {
  const db = new Database(file);
  db.exec('PRAGMA journal_mode = DELETE');
  if (applicationId(db) !== MANUSCRIPT_APPLICATION_ID) {
    db.close();
    throw new Error(`${path.basename(file)} application_id is not a Jieyu manuscript`);
  }
  return db;
}

function hasTextId(db: SqliteDatabase): boolean {
  for (const row of db.prepare('PRAGMA table_info(layers)').all()) {
    if (typeof row === 'object' && row !== null && (row as { name?: unknown }).name === 'text_id') {
      return true;
    }
  }
  return false;
}

function layerId(value: unknown): string {
  if (typeof value !== 'object' || value === null) throw new Error('layer row is incomplete');
  const id = (value as { id?: unknown }).id;
  if (typeof id !== 'string' || id.length === 0) throw new Error('layer row is incomplete');
  return id;
}

function ownerText(value: unknown): string {
  if (typeof value !== 'object' || value === null) throw new Error('layer row is incomplete');
  const textId = (value as { text_id?: unknown }).text_id;
  if (typeof textId !== 'string') throw new Error('layer row is incomplete');
  const trimmed = textId.trim();
  if (trimmed.length === 0) throw new Error('layer row is incomplete');
  return trimmed;
}

export function listForeignOwnedLayersInProject(
  projectDir: string,
  layerIds: Iterable<string>,
  textId: string,
): { id: string; textId: string }[] {
  const ids = [...new Set([...layerIds].map((id) => id.trim()).filter((id) => id.length > 0))];
  if (ids.length === 0) return [];
  const wanted = new Set(ids);
  const found = new Map<string, string>();
  for (const file of manuscripts(projectDir)) {
    const db = openManuscript(file);
    try {
      if (!hasTextId(db)) throw new Error('layer row is incomplete');
      for (const row of db.prepare('SELECT id, text_id FROM layers').all()) {
        const id = layerId(row);
        if (!wanted.has(id)) continue;
        if (found.has(id)) throw new Error(`duplicate layer ${id} in project folder`);
        found.set(id, ownerText(row));
      }
    } finally {
      db.close();
    }
  }
  const foreign: { id: string; textId: string }[] = [];
  for (const id of ids) {
    const owner = found.get(id);
    if (owner === undefined || owner === textId) continue;
    foreign.push({ id, textId: owner });
  }
  return foreign;
}

export function layerForeignMethods(projectDir: string | undefined) {
  function folder(): string {
    if (projectDir === undefined) {
      throw new Error('sqlite storage port has not opened a project folder');
    }
    return projectDir;
  }
  return {
    async listForeignOwnedLayers(layerIds: Iterable<string>, textId: string) {
      return listForeignOwnedLayersInProject(folder(), layerIds, textId);
    },
  };
}
