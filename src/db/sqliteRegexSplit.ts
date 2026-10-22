/**
 * 正则拆分写在一份 `.jyd` 里（ADR-0072）。
 * 锚点、语段和正文是一次事务，提交后再读回。读回失败不撤销。
 */
import { readdirSync } from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { CatalogOwnershipMismatchError } from '../services/projectCatalogScope';
import { StorageReadbackError } from './storageReadbackError';
import { MANUSCRIPT_APPLICATION_ID } from './sqliteSpeakerAssignment';
import type { RegexSplitCommit } from './storagePort';
import type { AnchorDocType, LayerUnitContentDocType, LayerUnitDocType } from './types';

type SqliteDatabase = InstanceType<typeof Database>;

const OPERATION = 'commitRegexSplit';

interface Hit {
  file: string;
  textId: string | null;
}

interface ManuscriptIndex {
  files: string[];
  units: Map<string, Hit>;
  contents: Map<string, Hit>;
  anchors: Map<string, string>;
  segments: { id: string; parentId: string; file: string }[];
}

interface ResizedSegment {
  id: string;
  startTime: number;
  endTime: number;
  updatedAt: string;
}

function applicationId(db: SqliteDatabase): number {
  const row: unknown = db.prepare('PRAGMA application_id').get();
  if (typeof row !== 'object' || row === null) return 0;
  const value = (row as { application_id?: unknown }).application_id;
  return typeof value === 'number' ? value : 0;
}

function textIdsOf(write: RegexSplitCommit): string[] {
  const ids = new Set<string>();
  for (const row of [...write.units, ...write.contents]) {
    const textId = row.textId?.trim() ?? '';
    if (textId.length > 0) ids.add(textId);
  }
  return [...ids];
}

function textIdOf(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function indexManuscripts(projectDir: string): ManuscriptIndex {
  const index: ManuscriptIndex = {
    files: readdirSync(projectDir)
      .filter((name) => name.endsWith('.jyd'))
      .sort()
      .map((name) => path.join(projectDir, name)),
    units: new Map(),
    contents: new Map(),
    anchors: new Map(),
    segments: [],
  };
  for (const file of index.files) {
    const db = new Database(file);
    try {
      db.exec('PRAGMA journal_mode = DELETE');
      if (applicationId(db) !== MANUSCRIPT_APPLICATION_ID) {
        throw new Error(`${path.basename(file)} application_id is not a Jieyu manuscript`);
      }
      for (const value of db
        .prepare('SELECT id, text_id, unit_type, parent_unit_id FROM units')
        .all()) {
        if (typeof value !== 'object' || value === null) continue;
        const row = value as {
          id?: unknown;
          text_id?: unknown;
          unit_type?: unknown;
          parent_unit_id?: unknown;
        };
        if (typeof row.id !== 'string') continue;
        if (index.units.has(row.id)) throw new Error(`duplicate unit ${row.id} in project folder`);
        index.units.set(row.id, { file, textId: textIdOf(row.text_id) });
        if (row.unit_type === 'segment' && typeof row.parent_unit_id === 'string') {
          index.segments.push({ id: row.id, parentId: row.parent_unit_id, file });
        }
      }
      for (const value of db.prepare('SELECT id, text_id FROM unit_contents').all()) {
        if (typeof value !== 'object' || value === null) continue;
        const row = value as { id?: unknown; text_id?: unknown };
        if (typeof row.id !== 'string') continue;
        if (index.contents.has(row.id))
          throw new Error(`duplicate content ${row.id} in project folder`);
        index.contents.set(row.id, { file, textId: textIdOf(row.text_id) });
      }
      for (const value of db.prepare('SELECT id FROM anchors').all()) {
        if (typeof value !== 'object' || value === null) continue;
        const id = (value as { id?: unknown }).id;
        if (typeof id !== 'string') continue;
        if (index.anchors.has(id)) throw new Error(`duplicate anchor ${id} in project folder`);
        index.anchors.set(id, file);
      }
    } finally {
      db.close();
    }
  }
  return index;
}

function assertOwnership(
  projectId: string | undefined,
  index: ManuscriptIndex,
  write: RegexSplitCommit,
): void {
  if (projectId === undefined) return;
  for (const unit of write.units) {
    const owner = index.units.get(unit.id)?.textId?.trim() ?? '';
    if (owner.length > 0 && owner !== projectId) {
      throw new CatalogOwnershipMismatchError('layer_units', unit.id, owner, projectId);
    }
  }
  for (const content of write.contents) {
    const owner = index.contents.get(content.id)?.textId?.trim() ?? '';
    if (owner.length > 0 && owner !== projectId) {
      throw new CatalogOwnershipMismatchError('layer_units', content.id, owner, projectId);
    }
  }
}

function targetFile(
  index: ManuscriptIndex,
  write: RegexSplitCommit,
  ownerIds: ReadonlySet<string>,
): string {
  const files = new Set<string>();
  for (const unit of write.units) {
    const hit = index.units.get(unit.id);
    if (hit) files.add(hit.file);
  }
  for (const content of write.contents) {
    const hit = index.contents.get(content.id);
    if (hit) files.add(hit.file);
  }
  for (const anchor of write.anchors) {
    const file = index.anchors.get(anchor.id);
    if (file !== undefined) files.add(file);
  }
  for (const segment of index.segments) {
    if (ownerIds.has(segment.parentId)) files.add(segment.file);
  }
  if (files.size > 1) throw new Error('regex split crosses manuscripts');
  if (files.size === 1) return [...files][0]!;
  if (index.files.length === 1) return index.files[0]!;
  throw new Error('regex split has no manuscript');
}

function optionalString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function resizeSegments(
  db: SqliteDatabase,
  owners: ReadonlyMap<string, LayerUnitDocType>,
): ResizedSegment[] {
  if (owners.size === 0) return [];
  const ids = [...owners.keys()];
  const placeholders = ids.map(() => '?').join(', ');
  const rows = db
    .prepare(
      `SELECT id, parent_unit_id FROM units WHERE unit_type = 'segment' AND parent_unit_id IN (${placeholders}) ORDER BY id`,
    )
    .all(...ids);
  const update = db.prepare(
    'UPDATE units SET start_time = ?, end_time = ?, updated_at = ? WHERE id = ?',
  );
  const resized: ResizedSegment[] = [];
  for (const value of rows) {
    if (typeof value !== 'object' || value === null) continue;
    const row = value as { id?: unknown; parent_unit_id?: unknown };
    if (typeof row.id !== 'string' || typeof row.parent_unit_id !== 'string') continue;
    const owner = owners.get(row.parent_unit_id);
    if (owner === undefined) continue;
    update.run(owner.startTime, owner.endTime, owner.updatedAt, row.id);
    resized.push({
      id: row.id,
      startTime: owner.startTime,
      endTime: owner.endTime,
      updatedAt: owner.updatedAt,
    });
  }
  return resized;
}

function upsertAnchors(db: SqliteDatabase, anchors: readonly AnchorDocType[]): void {
  const statement = db.prepare(
    `INSERT INTO anchors (id, media_id, time) VALUES (?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET media_id = excluded.media_id, time = excluded.time`,
  );
  for (const anchor of anchors) statement.run(anchor.id, anchor.mediaId, anchor.time);
}

function upsertUnits(db: SqliteDatabase, units: readonly LayerUnitDocType[]): void {
  const statement = db.prepare(
    `INSERT INTO units (
       id, layer_id, media_id, parent_unit_id, speaker_id, start_anchor_id, end_anchor_id,
       unit_type, text_id, start_time, end_time, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       layer_id = excluded.layer_id,
       media_id = excluded.media_id,
       parent_unit_id = excluded.parent_unit_id,
       speaker_id = excluded.speaker_id,
       start_anchor_id = excluded.start_anchor_id,
       end_anchor_id = excluded.end_anchor_id,
       unit_type = excluded.unit_type,
       text_id = excluded.text_id,
       start_time = excluded.start_time,
       end_time = excluded.end_time,
       updated_at = excluded.updated_at`,
  );
  for (const unit of units) {
    statement.run(
      unit.id,
      optionalString(unit.layerId),
      optionalString(unit.mediaId),
      optionalString(unit.parentUnitId),
      optionalString(unit.speakerId),
      optionalString(unit.startAnchorId),
      optionalString(unit.endAnchorId),
      optionalString(unit.unitType),
      optionalString(unit.textId),
      finiteNumber(unit.startTime),
      finiteNumber(unit.endTime),
      optionalString(unit.updatedAt),
    );
  }
}

function upsertContents(db: SqliteDatabase, contents: readonly LayerUnitContentDocType[]): void {
  const statement = db.prepare(
    `INSERT INTO unit_contents (id, unit_id, role, text, text_id, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       unit_id = excluded.unit_id,
       role = excluded.role,
       text = excluded.text,
       text_id = excluded.text_id,
       updated_at = excluded.updated_at`,
  );
  for (const content of contents) {
    statement.run(
      content.id,
      optionalString(content.unitId) ?? '',
      optionalString(content.contentRole) ?? '',
      content.text ?? '',
      optionalString(content.textId),
      optionalString(content.updatedAt),
    );
  }
}

function field(value: unknown, key: string): unknown {
  if (typeof value !== 'object' || value === null) return undefined;
  return (value as Record<string, unknown>)[key];
}

function readBack(
  db: SqliteDatabase,
  write: RegexSplitCommit,
  resized: readonly ResizedSegment[],
): void {
  for (const anchor of write.anchors) {
    if (
      field(db.prepare('SELECT time FROM anchors WHERE id = ?').get(anchor.id), 'time') !==
      anchor.time
    ) {
      throw new StorageReadbackError(OPERATION);
    }
  }
  for (const unit of [...resized, ...write.units]) {
    const row: unknown = db
      .prepare('SELECT start_time, end_time, updated_at FROM units WHERE id = ?')
      .get(unit.id);
    if (
      field(row, 'start_time') !== unit.startTime ||
      field(row, 'end_time') !== unit.endTime ||
      field(row, 'updated_at') !== unit.updatedAt
    ) {
      throw new StorageReadbackError(OPERATION);
    }
  }
  for (const content of write.contents) {
    const row: unknown = db
      .prepare('SELECT text, updated_at FROM unit_contents WHERE id = ?')
      .get(content.id);
    if (
      field(row, 'text') !== (content.text ?? '') ||
      field(row, 'updated_at') !== content.updatedAt
    ) {
      throw new StorageReadbackError(OPERATION);
    }
  }
}

export function commitRegexSplitInProject(
  projectDir: string,
  write: RegexSplitCommit,
): { resizedSegmentIds: string[] } {
  const textIds = textIdsOf(write);
  if (textIds.length > 1) {
    throw new CatalogOwnershipMismatchError('layer_units', OPERATION, textIds[0]!, textIds[1]!);
  }
  const projectId = textIds[0];
  const owners = new Map(
    (write.resizeSegmentsOf ?? []).flatMap((id) => {
      const unit = write.units.find((row) => row.id === id);
      return unit ? [[id, unit] as const] : [];
    }),
  );
  const index = indexManuscripts(projectDir);
  assertOwnership(projectId, index, write);
  const file = targetFile(index, write, new Set(owners.keys()));
  const db = new Database(file);
  try {
    db.exec('PRAGMA journal_mode = DELETE');
    if (applicationId(db) !== MANUSCRIPT_APPLICATION_ID) {
      throw new Error(`${path.basename(file)} application_id is not a Jieyu manuscript`);
    }
    const commit = db.transaction(() => {
      const resized = resizeSegments(db, owners);
      upsertAnchors(db, write.anchors);
      upsertUnits(db, write.units);
      upsertContents(db, write.contents);
      return resized;
    });
    const resized = commit();
    readBack(db, write, resized);
    return { resizedSegmentIds: resized.map((row) => row.id) };
  } finally {
    db.close();
  }
}
