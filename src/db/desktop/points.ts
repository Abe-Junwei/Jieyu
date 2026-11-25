import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import { secToMs } from './timeMs';

type SqliteDatabase = InstanceType<typeof Database>;

export interface Point {
  id: string;
  layerId: string;
  manuscriptId: string;
  timeMs: number;
  label: string;
  createdAt: string;
  updatedAt: string;
}

export interface PointCreate {
  id?: string;
  layerId: string;
  timeMs: number;
  label?: string;
}

export interface PointLabelUpdate {
  id: string;
  label: string;
}

export interface PointMove {
  id: string;
  timeMs: number;
}

export interface PointQuery {
  manuscriptId?: string;
  layerId?: string;
}

interface PointRow {
  id: string;
  layer_id: string;
  manuscript_id: string;
  time_ms: number;
  label: string;
  created_at: string;
  updated_at: string;
}

interface PointLayer {
  id: string;
  manuscriptId: string;
  contentType: string;
  deletedAt: string | null;
  duration: number | null;
}

function mapPoint(row: PointRow): Point {
  return {
    id: row.id,
    layerId: row.layer_id,
    manuscriptId: row.manuscript_id,
    timeMs: row.time_ms,
    label: row.label,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function assertWholeMs(value: number, name: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${name} must be a whole millisecond`);
  }
}

function readPointLayer(db: SqliteDatabase, layerId: string): PointLayer {
  const row = db
    .prepare(
      `SELECT layers.id AS id,
              layers.manuscript_id AS manuscriptId,
              layers.content_type AS contentType,
              layers.deleted_at AS deletedAt,
              media.duration AS duration
       FROM layers
       JOIN manuscripts ON manuscripts.id = layers.manuscript_id
       LEFT JOIN media ON media.id = manuscripts.media_id AND media.deleted_at IS NULL
       WHERE layers.id = ? AND manuscripts.deleted_at IS NULL`,
    )
    .get(layerId) as
    | {
        id: string;
        manuscriptId: string;
        contentType: string;
        deletedAt: string | null;
        duration: number | null;
      }
    | undefined;
  if (!row) throw new Error('layer is missing');
  if (row.deletedAt !== null) throw new Error('layer is deleted');
  if (row.contentType !== 'point') throw new Error('point layer is required');
  return row;
}

function assertTimeOnLayer(layer: PointLayer, timeMs: number): void {
  assertWholeMs(timeMs, 'timeMs');
  if (layer.duration === null) return;
  if (timeMs > secToMs(layer.duration)) throw new Error('point is outside the media');
}

function occupied(db: SqliteDatabase, layerId: string, timeMs: number, exceptId?: string): boolean {
  const row =
    exceptId === undefined
      ? (db
          .prepare('SELECT 1 AS hit FROM points WHERE layer_id = ? AND time_ms = ?')
          .get(layerId, timeMs) as { hit: number } | undefined)
      : (db
          .prepare('SELECT 1 AS hit FROM points WHERE layer_id = ? AND time_ms = ? AND id <> ?')
          .get(layerId, timeMs, exceptId) as { hit: number } | undefined);
  return row !== undefined;
}

function readPointRow(db: SqliteDatabase, id: string): PointRow | undefined {
  return db
    .prepare(
      `SELECT points.id, points.layer_id, layers.manuscript_id AS manuscript_id,
              points.time_ms, points.label, points.created_at, points.updated_at
       FROM points
       JOIN layers ON layers.id = points.layer_id
       JOIN manuscripts ON manuscripts.id = layers.manuscript_id
       WHERE points.id = ? AND manuscripts.deleted_at IS NULL`,
    )
    .get(id) as PointRow | undefined;
}

export function readPoint(db: SqliteDatabase, id: string): Point | null {
  const row = readPointRow(db, id);
  return row ? mapPoint(row) : null;
}

export function getPoint(db: SqliteDatabase, id: string): Point | null {
  const row = db
    .prepare(
      `SELECT points.id, points.layer_id, layers.manuscript_id AS manuscript_id,
              points.time_ms, points.label, points.created_at, points.updated_at
       FROM points
       JOIN layers ON layers.id = points.layer_id
       JOIN manuscripts ON manuscripts.id = layers.manuscript_id
       WHERE points.id = ?
         AND manuscripts.deleted_at IS NULL
         AND layers.deleted_at IS NULL`,
    )
    .get(id) as PointRow | undefined;
  return row ? mapPoint(row) : null;
}

export function listPoints(db: SqliteDatabase, query: PointQuery): Point[] {
  if (query.manuscriptId === undefined && query.layerId === undefined) {
    throw new Error('point query needs a manuscript or layer');
  }
  if (query.layerId !== undefined) {
    const layer = readPointLayer(db, query.layerId);
    if (query.manuscriptId !== undefined && query.manuscriptId !== layer.manuscriptId) {
      throw new Error('point layer is outside the manuscript');
    }
    const rows = db
      .prepare(
        `SELECT points.id, points.layer_id, layers.manuscript_id AS manuscript_id,
                points.time_ms, points.label, points.created_at, points.updated_at
         FROM points
         JOIN layers ON layers.id = points.layer_id
         WHERE points.layer_id = ?
           AND layers.deleted_at IS NULL
         ORDER BY points.time_ms, points.id`,
      )
      .all(query.layerId) as PointRow[];
    return rows.map(mapPoint);
  }
  const manuscriptId = query.manuscriptId;
  if (manuscriptId === undefined) throw new Error('point query needs a manuscript or layer');
  const rows = db
    .prepare(
      `SELECT points.id, points.layer_id, layers.manuscript_id AS manuscript_id,
              points.time_ms, points.label, points.created_at, points.updated_at
       FROM points
       JOIN layers ON layers.id = points.layer_id
       JOIN manuscripts ON manuscripts.id = layers.manuscript_id
       WHERE layers.manuscript_id = ?
         AND manuscripts.deleted_at IS NULL
         AND layers.deleted_at IS NULL
       ORDER BY points.time_ms, points.id`,
    )
    .all(manuscriptId) as PointRow[];
  return rows.map(mapPoint);
}

export function createPoint(db: SqliteDatabase, input: PointCreate): Point {
  assertWholeMs(input.timeMs, 'timeMs');
  const label = input.label ?? '';
  if (typeof label !== 'string') throw new Error('point label must be text');
  const write = db.transaction(() => {
    const layer = readPointLayer(db, input.layerId);
    assertTimeOnLayer(layer, input.timeMs);
    if (occupied(db, input.layerId, input.timeMs)) throw new Error('point time is taken');
    const id = input.id ?? randomUUID();
    if (input.id !== undefined && readPointRow(db, id) !== undefined) {
      throw new Error('point id is taken');
    }
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO points (id, layer_id, time_ms, label, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(id, input.layerId, input.timeMs, label, now, now);
    const stored = getPoint(db, id);
    if (
      !stored ||
      stored.layerId !== input.layerId ||
      stored.timeMs !== input.timeMs ||
      stored.label !== label
    ) {
      throw new Error('point readback failed');
    }
    return stored;
  });
  return write();
}

export function updatePointLabel(db: SqliteDatabase, input: PointLabelUpdate): Point {
  if (typeof input.label !== 'string') throw new Error('point label must be text');
  const write = db.transaction(() => {
    const before = readPointRow(db, input.id);
    if (!before) throw new Error('point is missing');
    readPointLayer(db, before.layer_id);
    if (before.label === input.label) {
      const same = getPoint(db, input.id);
      if (!same) throw new Error('point is missing');
      return same;
    }
    const now = new Date().toISOString();
    db.prepare('UPDATE points SET label = ?, updated_at = ? WHERE id = ?').run(
      input.label,
      now,
      input.id,
    );
    const stored = getPoint(db, input.id);
    if (!stored || stored.label !== input.label) throw new Error('point readback failed');
    return stored;
  });
  return write();
}

export function movePoint(db: SqliteDatabase, input: PointMove): Point {
  assertWholeMs(input.timeMs, 'timeMs');
  const write = db.transaction(() => {
    const before = readPointRow(db, input.id);
    if (!before) throw new Error('point is missing');
    const layer = readPointLayer(db, before.layer_id);
    assertTimeOnLayer(layer, input.timeMs);
    if (before.time_ms === input.timeMs) {
      const same = getPoint(db, input.id);
      if (!same) throw new Error('point is missing');
      return same;
    }
    if (occupied(db, before.layer_id, input.timeMs, input.id)) {
      throw new Error('point time is taken');
    }
    const now = new Date().toISOString();
    db.prepare('UPDATE points SET time_ms = ?, updated_at = ? WHERE id = ?').run(
      input.timeMs,
      now,
      input.id,
    );
    const stored = getPoint(db, input.id);
    if (!stored || stored.timeMs !== input.timeMs) throw new Error('point readback failed');
    return stored;
  });
  return write();
}

export function deletePoint(db: SqliteDatabase, id: string): { id: string } {
  const write = db.transaction(() => {
    const before = readPointRow(db, id);
    if (!before) throw new Error('point is missing');
    readPointLayer(db, before.layer_id);
    db.prepare('DELETE FROM points WHERE id = ?').run(id);
    if (readPointRow(db, id) !== undefined) throw new Error('point delete readback failed');
    return { id };
  });
  return write();
}

export interface PointCreateUndo {
  manuscriptId: string;
  point: Point;
}

export interface PointDeleteUndo {
  manuscriptId: string;
  point: Point;
}

export interface PointLabelUndo {
  manuscriptId: string;
  before: Point;
  after: Point;
}

export interface PointMoveUndo {
  manuscriptId: string;
  before: Point;
  after: Point;
}

/** Identity and editable fields only; timestamps move on every write. */
function pointMatches(current: Point | null, expected: Point): boolean {
  return (
    current !== null &&
    current.id === expected.id &&
    current.layerId === expected.layerId &&
    current.timeMs === expected.timeMs &&
    current.label === expected.label
  );
}

function insertPointRow(db: SqliteDatabase, point: Point): Point {
  db.prepare(
    `INSERT INTO points (id, layer_id, time_ms, label, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(point.id, point.layerId, point.timeMs, point.label, point.createdAt, point.updatedAt);
  const stored = getPoint(db, point.id);
  if (!pointMatches(stored, point)) throw new Error('point readback failed');
  return stored!;
}

/** Undo create: remove the point when it still matches the snapshot. */
export function undoPointCreate(db: SqliteDatabase, undo: PointCreateUndo): Point {
  const current = getPoint(db, undo.point.id);
  if (!pointMatches(current, undo.point)) throw new Error('point create undo is stale');
  deletePoint(db, undo.point.id);
  return undo.point;
}

/** Redo create: restore the same identity; reject when the slot is taken. */
export function redoPointCreate(db: SqliteDatabase, undo: PointCreateUndo): Point {
  if (getPoint(db, undo.point.id) !== null) throw new Error('point create redo is stale');
  const layer = readPointLayer(db, undo.point.layerId);
  assertTimeOnLayer(layer, undo.point.timeMs);
  if (occupied(db, undo.point.layerId, undo.point.timeMs)) {
    throw new Error('point create redo is stale');
  }
  return insertPointRow(db, undo.point);
}

export function undoPointDelete(db: SqliteDatabase, undo: PointDeleteUndo): Point {
  if (getPoint(db, undo.point.id) !== null) throw new Error('point delete undo is stale');
  const layer = readPointLayer(db, undo.point.layerId);
  assertTimeOnLayer(layer, undo.point.timeMs);
  if (occupied(db, undo.point.layerId, undo.point.timeMs)) {
    throw new Error('point delete undo is stale');
  }
  return insertPointRow(db, undo.point);
}

export function redoPointDelete(db: SqliteDatabase, undo: PointDeleteUndo): Point {
  const current = getPoint(db, undo.point.id);
  if (!pointMatches(current, undo.point)) throw new Error('point delete redo is stale');
  deletePoint(db, undo.point.id);
  return undo.point;
}

export function undoPointLabel(db: SqliteDatabase, undo: PointLabelUndo): Point {
  const current = getPoint(db, undo.after.id);
  if (!pointMatches(current, undo.after)) throw new Error('point label undo is stale');
  return updatePointLabel(db, { id: undo.before.id, label: undo.before.label });
}

export function redoPointLabel(db: SqliteDatabase, undo: PointLabelUndo): Point {
  const current = getPoint(db, undo.before.id);
  if (!pointMatches(current, undo.before)) throw new Error('point label redo is stale');
  return updatePointLabel(db, { id: undo.after.id, label: undo.after.label });
}

export function undoPointMove(db: SqliteDatabase, undo: PointMoveUndo): Point {
  const current = getPoint(db, undo.after.id);
  if (!pointMatches(current, undo.after)) throw new Error('point move undo is stale');
  if (occupied(db, undo.before.layerId, undo.before.timeMs, undo.before.id)) {
    throw new Error('point move undo is stale');
  }
  return movePoint(db, { id: undo.before.id, timeMs: undo.before.timeMs });
}

export function redoPointMove(db: SqliteDatabase, undo: PointMoveUndo): Point {
  const current = getPoint(db, undo.before.id);
  if (!pointMatches(current, undo.before)) throw new Error('point move redo is stale');
  if (occupied(db, undo.after.layerId, undo.after.timeMs, undo.after.id)) {
    throw new Error('point move redo is stale');
  }
  return movePoint(db, { id: undo.after.id, timeMs: undo.after.timeMs });
}
