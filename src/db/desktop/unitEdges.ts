import type Database from 'better-sqlite3';
import { secToMs } from './timeMs';
import { deleteUnitTree, insertRemovedUnit, readRemovedUnit, type RemovedUnit } from './unitSpan';
import { readStoredUnit, updateBoundary, type Unit } from './units';

type SqliteDatabase = InstanceType<typeof Database>;

/** ADR-0122: the library allows 1ms. Drag, keyboard, and typed commits use 10ms. */
const UI_MIN_SPAN_MS = 10;

export type TimeEdge = 'start' | 'end';

export interface EdgeMove {
  unitId: string;
  edge: TimeEdge;
  from: number;
  to: number;
  manuscriptId: string;
}

export interface SharedBoundaryMove {
  leftId: string;
  rightId: string;
  from: number;
  to: number;
  leftStart: number;
  rightEnd: number;
  manuscriptId: string;
}

export function manuscriptIdOf(db: SqliteDatabase, unitId: string): string {
  const row = db
    .prepare(
      `SELECT layers.manuscript_id AS manuscriptId
       FROM units JOIN layers ON layers.id = units.layer_id
       WHERE units.id = ?`,
    )
    .get(unitId) as { manuscriptId: string } | undefined;
  if (!row) throw new Error('unit is missing');
  return row.manuscriptId;
}

function mediaLimitMs(db: SqliteDatabase, unitId: string): number | null {
  const row = db
    .prepare(
      `SELECT media.duration AS duration
       FROM units
       JOIN layers ON layers.id = units.layer_id
       JOIN manuscripts ON manuscripts.id = layers.manuscript_id
       LEFT JOIN media ON media.id = manuscripts.media_id AND media.deleted_at IS NULL
       WHERE units.id = ?`,
    )
    .get(unitId) as { duration: number | null } | undefined;
  if (!row || row.duration === null) return null;
  return secToMs(row.duration);
}

function assertInsideMedia(db: SqliteDatabase, unitId: string, start: number, end: number): void {
  const limit = mediaLimitMs(db, unitId);
  if (limit === null) return;
  if (start < 0 || end > limit) throw new Error('edge is outside the media');
}

function assertSpan(start: number, end: number): void {
  if (!Number.isInteger(start) || !Number.isInteger(end) || end - start < UI_MIN_SPAN_MS) {
    throw new Error('edge span is under 10ms');
  }
}

export function moveUnitEdge(
  db: SqliteDatabase,
  input: { unitId: string; edge: TimeEdge; time: number },
): { unit: Unit; move: EdgeMove | null } {
  const write = db.transaction(() => {
    const unit = readStoredUnit(db, input.unitId);
    if (!unit || unit.startMs === null || unit.endMs === null)
      throw new Error('unit time is missing');
    if (!Number.isInteger(input.time)) throw new Error('edge time is invalid');
    const from = input.edge === 'start' ? unit.startMs : unit.endMs;
    const start = input.edge === 'start' ? input.time : unit.startMs;
    const end = input.edge === 'end' ? input.time : unit.endMs;
    assertSpan(start, end);
    assertInsideMedia(db, unit.id, start, end);
    if (from === input.time) return { unit, move: null };
    const now = new Date().toISOString();
    const column = input.edge === 'start' ? 'start_ms' : 'end_ms';
    db.prepare(`UPDATE units SET ${column} = ?, updated_at = ? WHERE id = ?`).run(
      input.time,
      now,
      unit.id,
    );
    const next = readStoredUnit(db, unit.id);
    if (!next || (input.edge === 'start' ? next.startMs : next.endMs) !== input.time) {
      throw new Error('edge readback failed');
    }
    return {
      unit: next,
      move: {
        unitId: unit.id,
        edge: input.edge,
        from,
        to: input.time,
        manuscriptId: manuscriptIdOf(db, unit.id),
      },
    };
  });
  try {
    return write();
  } catch (error) {
    if (error instanceof Error && error.message.includes('same speaker intervals overlap')) {
      throw new Error('same speaker intervals overlap');
    }
    if (error instanceof Error && error.message.includes('timed units are out of sort order')) {
      throw new Error('timed units are out of sort order');
    }
    throw error;
  }
}

export function moveSharedBoundary(
  db: SqliteDatabase,
  input: { leftId: string; rightId: string; time: number },
): { left: Unit; right: Unit; move: SharedBoundaryMove | null } {
  const left = readStoredUnit(db, input.leftId);
  const right = readStoredUnit(db, input.rightId);
  if (
    !left ||
    !right ||
    left.startMs === null ||
    left.endMs === null ||
    right.startMs === null ||
    right.endMs === null
  ) {
    throw new Error('boundary units are missing');
  }
  if (left.endMs !== right.startMs) throw new Error('boundary units are not adjacent');
  if (!Number.isInteger(input.time)) throw new Error('edge time is invalid');
  assertSpan(left.startMs, input.time);
  assertSpan(input.time, right.endMs);
  assertInsideMedia(db, left.id, left.startMs, input.time);
  assertInsideMedia(db, right.id, input.time, right.endMs);
  if (input.time === left.endMs) return { left, right, move: null };
  const from = left.endMs;
  const moved = updateBoundary(db, input);
  return {
    left: moved.left,
    right: moved.right,
    move: {
      leftId: left.id,
      rightId: right.id,
      from,
      to: input.time,
      leftStart: left.startMs,
      rightEnd: right.endMs,
      manuscriptId: manuscriptIdOf(db, left.id),
    },
  };
}

export function previewUnitDelete(
  db: SqliteDatabase,
  unitId: string,
): { tokens: number; notes: number } {
  if (!readStoredUnit(db, unitId)) throw new Error('unit is missing');
  const tokens = db.prepare('SELECT COUNT(*) AS n FROM tokens WHERE unit_id = ?').get(unitId) as {
    n: number;
  };
  const notes = db.prepare('SELECT COUNT(*) AS n FROM notes WHERE unit_id = ?').get(unitId) as {
    n: number;
  };
  return { tokens: tokens.n, notes: notes.n };
}

export function removeUnit(db: SqliteDatabase, unitId: string): RemovedUnit {
  const write = db.transaction(() => {
    const tree = readRemovedUnit(db, unitId);
    deleteUnitTree(db, unitId);
    if (readStoredUnit(db, unitId)) throw new Error('unit delete readback failed');
    return tree;
  });
  return write();
}

export function treeStillMatches(db: SqliteDatabase, tree: RemovedUnit): boolean {
  const unit = readStoredUnit(db, tree.unit.id);
  const text = tree.texts.find((row) => row.role === 'transcription')?.body ?? '';
  return (
    unit !== null &&
    unit.startMs === tree.unit.start_ms &&
    unit.endMs === tree.unit.end_ms &&
    unit.text === text
  );
}

export function restoreRemovedUnit(db: SqliteDatabase, tree: RemovedUnit): Unit {
  const write = db.transaction(() => {
    if (readStoredUnit(db, tree.unit.id)) throw new Error('unit delete undo is stale');
    insertRemovedUnit(db, tree);
    const unit = readStoredUnit(db, tree.unit.id);
    if (!unit || unit.id !== tree.unit.id) throw new Error('unit delete undo readback failed');
    return unit;
  });
  try {
    return write();
  } catch (error) {
    if (error instanceof Error && error.message.includes('same speaker intervals overlap')) {
      throw new Error('unit delete undo is stale');
    }
    throw error;
  }
}
