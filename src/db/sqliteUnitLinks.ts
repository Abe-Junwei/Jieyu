/**
 * 语段关系写在一份 `.jyd` 里（ADR-0078）。
 * 两端不在同一份文稿，或有一端找不到，就不写。
 * 一次事务，提交后再读回。读回失败不撤销。
 */
import { readdirSync } from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { MANUSCRIPT_APPLICATION_ID } from './sqliteSpeakerAssignment';
import { StorageReadbackError } from './storageReadbackError';
import type { ManuscriptRelationWrite } from './storagePort';

type SqliteDatabase = InstanceType<typeof Database>;
type RelationType = ManuscriptRelationWrite['relationType'];

const RELATION = 'putUnitRelation';
const PARENT = 'setUnitParent';
const RELATION_TYPES: readonly RelationType[] = ['aligned_to', 'derived_from', 'linked_reference'];

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

function textColumn(row: unknown, key: string): string | null {
  if (typeof row !== 'object' || row === null) return null;
  const value = (row as Record<string, unknown>)[key];
  return typeof value === 'string' ? value : null;
}

function indexIds(
  projectDir: string,
  sql: string,
  duplicate: (id: string) => string,
): Map<string, string> {
  const hits = new Map<string, string>();
  for (const file of manuscripts(projectDir)) {
    const db = openManuscript(file);
    try {
      for (const row of db.prepare(sql).all()) {
        const id = textColumn(row, 'id');
        if (id === null) continue;
        if (hits.has(id)) throw new Error(duplicate(id));
        hits.set(id, file);
      }
    } finally {
      db.close();
    }
  }
  return hits;
}

function indexUnits(projectDir: string): Map<string, string> {
  return indexIds(
    projectDir,
    'SELECT id FROM units',
    (id) => `duplicate unit ${id} in project folder`,
  );
}

function isRelationType(value: string): value is RelationType {
  return RELATION_TYPES.some((item) => item === value);
}

export function putUnitRelationInProject(
  projectDir: string,
  relation: ManuscriptRelationWrite,
): void {
  const id = relation.id.trim();
  if (id.length === 0) throw new Error('unit relation id is empty');
  if (!isRelationType(relation.relationType)) throw new Error('relation type is not recognized');
  const sourceId = relation.sourceUnitId.trim();
  const targetId = relation.targetUnitId.trim();
  const units = indexUnits(projectDir);
  const sourceFile = units.get(sourceId);
  const targetFile = units.get(targetId);
  if (
    sourceId.length === 0 ||
    targetId.length === 0 ||
    sourceFile === undefined ||
    targetFile === undefined
  ) {
    throw new Error('unit not found');
  }
  if (sourceFile !== targetFile) throw new Error('unit relation crosses manuscripts');
  const existing = indexIds(
    projectDir,
    'SELECT id FROM unit_relations',
    (relationId) => `duplicate unit relation ${relationId} in project folder`,
  ).get(id);
  if (existing !== undefined && existing !== sourceFile) {
    throw new Error('unit relation belongs to another manuscript');
  }
  const db = openManuscript(sourceFile);
  try {
    const statement = db.prepare(
      `INSERT INTO unit_relations (id, source_unit_id, target_unit_id, relation_type)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         source_unit_id = excluded.source_unit_id,
         target_unit_id = excluded.target_unit_id,
         relation_type = excluded.relation_type`,
    );
    db.transaction(() => {
      statement.run(id, sourceId, targetId, relation.relationType);
    })();
    const row: unknown = db
      .prepare(
        'SELECT source_unit_id, target_unit_id, relation_type FROM unit_relations WHERE id = ?',
      )
      .get(id);
    if (
      textColumn(row, 'source_unit_id') !== sourceId ||
      textColumn(row, 'target_unit_id') !== targetId ||
      textColumn(row, 'relation_type') !== relation.relationType
    ) {
      throw new StorageReadbackError(RELATION);
    }
  } finally {
    db.close();
  }
}

export function setUnitParentInProject(
  projectDir: string,
  unitId: string,
  parentUnitId: string | null,
): void {
  const id = unitId.trim();
  if (id.length === 0) throw new Error('unit not found');
  const parent = parentUnitId === null ? null : parentUnitId.trim();
  const next = parent !== null && parent.length === 0 ? null : parent;
  const units = indexUnits(projectDir);
  const file = units.get(id);
  if (file === undefined) throw new Error('unit not found');
  if (next !== null) {
    const parentFile = units.get(next);
    if (parentFile === undefined) throw new Error('unit not found');
    if (parentFile !== file) throw new Error('unit parent crosses manuscripts');
  }
  const now = new Date().toISOString();
  const db = openManuscript(file);
  try {
    const statement = db.prepare(
      'UPDATE units SET parent_unit_id = ?, updated_at = ? WHERE id = ?',
    );
    db.transaction(() => {
      statement.run(next, now, id);
    })();
    const row: unknown = db.prepare('SELECT parent_unit_id FROM units WHERE id = ?').get(id);
    if (textColumn(row, 'parent_unit_id') !== next) throw new StorageReadbackError(PARENT);
  } finally {
    db.close();
  }
}
