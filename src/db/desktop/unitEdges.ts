import { createHash } from 'node:crypto';
import type Database from 'better-sqlite3';
import { secToMs } from './timeMs';
import {
  deleteUnitTree,
  insertRemovedUnit,
  nodeIdsOf,
  readRemovedUnit,
  type RemovedUnit,
} from './unitSpan';
import { readStoredUnit, updateBoundary, type Unit } from './units';

type SqliteDatabase = InstanceType<typeof Database>;

/** Baseline for structure delete: identity, span, speaker, text, and subdivision presence. */
function structureDeleteDigest(db: SqliteDatabase, unitIds: readonly string[]): string {
  const rows = [...unitIds].sort().map((id) => {
    const unit = readStoredUnit(db, id);
    if (!unit) throw new Error('unit is missing');
    const child = db.prepare('SELECT 1 FROM units WHERE parent_unit_id = ? LIMIT 1').get(id);
    return {
      id,
      startMs: unit.startMs,
      endMs: unit.endMs,
      speakerId: unit.speakerId,
      parentUnitId: unit.parentUnitId,
      text: unit.text,
      updatedAt: unit.updatedAt,
      hasChild: child !== undefined,
    };
  });
  return createHash('sha256').update(JSON.stringify(rows)).digest('hex');
}

function assertStructureDeleteFresh(
  db: SqliteDatabase,
  unitIds: readonly string[],
  expected: string | undefined,
) {
  if (expected === undefined) return;
  if (structureDeleteDigest(db, unitIds) !== expected) {
    throw new Error('unit delete preview is stale');
  }
}

/** ADR-0122: the library allows 1ms. Drag, keyboard, and typed commits use 10ms. */
const UI_MIN_SPAN_MS = 10;

export type TimeEdge = 'start' | 'end';

/** A time-subdivision child whose edges were pushed by its parent's edge move. */
export interface FollowerMove {
  unitId: string;
  fromStart: number;
  fromEnd: number;
  toStart: number;
  toEnd: number;
}

export interface EdgeMove {
  unitId: string;
  edge: TimeEdge;
  from: number;
  to: number;
  manuscriptId: string;
  followers?: FollowerMove[];
}

/** A whole-segment move: the unit and every timed descendant shift by `delta`. */
export interface UnitSpanMove {
  unitId: string;
  delta: number;
  fromStart: number;
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

function assertInsideParent(db: SqliteDatabase, unit: Unit, start: number, end: number): void {
  if (unit.parentUnitId === null) return;
  const parent = readStoredUnit(db, unit.parentUnitId);
  if (!parent || parent.startMs === null || parent.endMs === null) return;
  if (start < parent.startMs || end > parent.endMs) {
    throw new Error('time subdivision is outside its parent');
  }
}

/** Children that stick out of the parent's new range are clamped to it; one that would vanish rejects the move. */
function pushChildren(
  db: SqliteDatabase,
  parentId: string,
  start: number,
  end: number,
  restore: readonly FollowerMove[] | undefined,
  direction: 'to' | 'from',
): FollowerMove[] {
  const plan: FollowerMove[] =
    (restore === undefined ? undefined : [...restore]) ??
    (
      db
        .prepare(
          `SELECT id, start_ms AS startMs, end_ms AS endMs FROM units
           WHERE parent_unit_id = ? AND start_ms IS NOT NULL AND end_ms IS NOT NULL
           ORDER BY sort_order`,
        )
        .all(parentId) as { id: string; startMs: number; endMs: number }[]
    ).flatMap((child) => {
      const toStart = Math.max(child.startMs, start);
      const toEnd = Math.min(child.endMs, end);
      if (toStart === child.startMs && toEnd === child.endMs) return [];
      assertSpan(toStart, toEnd);
      return [{ unitId: child.id, fromStart: child.startMs, fromEnd: child.endMs, toStart, toEnd }];
    });
  const now = new Date().toISOString();
  for (const move of plan) {
    const nextStart = direction === 'to' ? move.toStart : move.fromStart;
    const nextEnd = direction === 'to' ? move.toEnd : move.fromEnd;
    db.prepare('UPDATE units SET start_ms = ?, end_ms = ?, updated_at = ? WHERE id = ?').run(
      nextStart,
      nextEnd,
      now,
      move.unitId,
    );
    const child = readStoredUnit(db, move.unitId);
    if (!child || child.startMs !== nextStart || child.endMs !== nextEnd) {
      throw new Error('edge readback failed');
    }
  }
  return [...plan];
}

/**
 * Moves one edge. A time-subdivision child stays inside its parent; a parent's edge pushes its
 * children along (`followers` replays exactly those pushes for undo and redo).
 */
export function moveUnitEdge(
  db: SqliteDatabase,
  input: { unitId: string; edge: TimeEdge; time: number; followers?: readonly FollowerMove[] },
  direction: 'to' | 'from' = 'to',
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
    assertInsideParent(db, unit, start, end);
    if (from === input.time) return { unit, move: null };
    const now = new Date().toISOString();
    const column = input.edge === 'start' ? 'start_ms' : 'end_ms';
    db.prepare(`UPDATE units SET ${column} = ?, updated_at = ? WHERE id = ?`).run(
      input.time,
      now,
      unit.id,
    );
    const followers = pushChildren(db, unit.id, start, end, input.followers, direction);
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
        ...(followers.length > 0 ? { followers } : {}),
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

export interface UnitDeletePreview {
  fingerprint?: string;
  linkedTexts: number;
  tokens: number;
  morphemes: number;
  notes: number;
  lexemeLinks: number;
  analysisCandidates: number;
  customFieldValues: number;
  drafts: number;
  receptionRecords: number;
}

/** Counts, in one read transaction, the rows deleteUnitTree removes besides the unit and its texts. */
export function previewUnitDeletion(db: SqliteDatabase, unitId: string): UnitDeletePreview {
  const read = db.transaction((): UnitDeletePreview => {
    if (!readStoredUnit(db, unitId)) throw new Error('unit is missing');
    const count = (sql: string, ...args: unknown[]): number =>
      (db.prepare(sql).get(...args) as { n: number }).n;
    const graph = db.prepare('SELECT analysis_graph_json FROM units WHERE id = ?').get(unitId) as
      { analysis_graph_json: string | null } | undefined;
    const nodeIds = nodeIdsOf(graph?.analysis_graph_json ?? null);
    return {
      fingerprint: structureDeleteDigest(db, [unitId]),
      linkedTexts: count(
        `SELECT COUNT(*) AS n FROM unit_texts
         WHERE unit_id = ? AND body <> ''
           AND layer_id <> (SELECT layer_id FROM units WHERE id = ?)`,
        unitId,
        unitId,
      ),
      tokens: count('SELECT COUNT(*) AS n FROM tokens WHERE unit_id = ?', unitId),
      morphemes: count(
        `SELECT COUNT(*) AS n FROM morphemes
         WHERE token_id IN (SELECT id FROM tokens WHERE unit_id = ?)`,
        unitId,
      ),
      notes: count('SELECT COUNT(*) AS n FROM notes WHERE unit_id = ?', unitId),
      lexemeLinks: count(
        `SELECT COUNT(DISTINCT id) AS n FROM token_lexeme_links
         WHERE target_id IN (SELECT id FROM tokens WHERE unit_id = ?)
            OR target_id IN (
              SELECT morphemes.id FROM morphemes JOIN tokens ON tokens.id = morphemes.token_id
              WHERE tokens.unit_id = ?
            )
            OR target_id IN (SELECT value FROM json_each(?))`,
        unitId,
        unitId,
        JSON.stringify(nodeIds),
      ),
      analysisCandidates: count(
        'SELECT COUNT(*) AS n FROM analysis_candidates WHERE unit_id = ?',
        unitId,
      ),
      customFieldValues: count(
        `SELECT COUNT(*) AS n FROM custom_field_values
         WHERE (target_type = 'unit' AND target_id = ?)
            OR (target_type = 'note' AND target_id IN (SELECT id FROM notes WHERE unit_id = ?))`,
        unitId,
        unitId,
      ),
      drafts:
        count('SELECT COUNT(*) AS n FROM unit_text_drafts WHERE unit_id = ?', unitId) +
        count('SELECT COUNT(*) AS n FROM unit_time_drafts WHERE unit_id = ?', unitId),
      receptionRecords:
        count('SELECT COUNT(*) AS n FROM reception_batches WHERE unit_id = ?', unitId) +
        count('SELECT COUNT(*) AS n FROM transcription_acceptances WHERE unit_id = ?', unitId),
    };
  });
  return read();
}

export function previewUnitsDeletion(
  db: SqliteDatabase,
  unitIds: readonly string[],
): UnitDeletePreview {
  if (unitIds.length < 2 || new Set(unitIds).size !== unitIds.length) {
    throw new Error('multiple units are required');
  }
  return db.transaction(() => {
    const total: UnitDeletePreview = {
      fingerprint: structureDeleteDigest(db, unitIds),
      linkedTexts: 0,
      tokens: 0,
      morphemes: 0,
      notes: 0,
      lexemeLinks: 0,
      analysisCandidates: 0,
      customFieldValues: 0,
      drafts: 0,
      receptionRecords: 0,
    };
    for (const id of unitIds) {
      const next = previewUnitDeletion(db, id);
      for (const key of Object.keys(total) as (keyof UnitDeletePreview)[]) {
        if (key === 'fingerprint') continue;
        total[key] = (total[key] as number) + (next[key] as number);
      }
    }
    return total;
  })();
}

export function removeUnit(db: SqliteDatabase, unitId: string, expected?: string): RemovedUnit {
  const write = db.transaction(() => {
    assertStructureDeleteFresh(db, [unitId], expected);
    const tree = readRemovedUnit(db, unitId);
    const child = db.prepare('SELECT 1 FROM units WHERE parent_unit_id = ? LIMIT 1').get(unitId);
    if (child !== undefined) throw new Error('unit has time subdivisions');
    deleteUnitTree(db, unitId);
    if (readStoredUnit(db, unitId)) throw new Error('unit delete readback failed');
    return tree;
  });
  return write();
}

export function removeUnits(
  db: SqliteDatabase,
  unitIds: readonly string[],
  expected?: string,
): RemovedUnit[] {
  if (unitIds.length < 2 || new Set(unitIds).size !== unitIds.length) {
    throw new Error('multiple units are required');
  }
  return db.transaction(() => {
    assertStructureDeleteFresh(db, unitIds, expected);
    const trees = unitIds.map((id) => readRemovedUnit(db, id));
    const manuscriptIds = new Set(trees.map((tree) => manuscriptIdOf(db, tree.unit.id)));
    if (manuscriptIds.size !== 1) throw new Error('units are not in the same manuscript');
    for (const id of unitIds) {
      if (
        db.prepare('SELECT 1 FROM units WHERE parent_unit_id = ? LIMIT 1').get(id) !== undefined
      ) {
        throw new Error('unit has time subdivisions');
      }
    }
    for (const id of unitIds) deleteUnitTree(db, id);
    if (unitIds.some((id) => readStoredUnit(db, id)))
      throw new Error('unit delete readback failed');
    return trees;
  })();
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

export function timedDescendants(
  db: SqliteDatabase,
  unitId: string,
): { id: string; startMs: number }[] {
  const found: { id: string; startMs: number }[] = [];
  let frontier = [unitId];
  while (frontier.length > 0) {
    const next: string[] = [];
    for (const parentId of frontier) {
      const rows = db
        .prepare(
          `SELECT id, start_ms AS startMs FROM units
           WHERE parent_unit_id = ? AND start_ms IS NOT NULL AND end_ms IS NOT NULL`,
        )
        .all(parentId) as { id: string; startMs: number }[];
      found.push(...rows);
      next.push(...rows.map((row) => row.id));
    }
    frontier = next;
  }
  return found;
}

/**
 * Moves a whole segment by `delta` ms. Its time-subdivision descendants move with it, so they
 * keep their place inside it; the receipt and the undo step are one.
 */
export function moveUnitSpan(
  db: SqliteDatabase,
  input: { unitId: string; delta: number },
): { unit: Unit; move: UnitSpanMove | null } {
  const write = db.transaction(() => {
    const unit = readStoredUnit(db, input.unitId);
    if (!unit || unit.startMs === null || unit.endMs === null)
      throw new Error('unit time is missing');
    if (!Number.isInteger(input.delta)) throw new Error('edge time is invalid');
    if (input.delta === 0) return { unit, move: null };
    const start = unit.startMs + input.delta;
    const end = unit.endMs + input.delta;
    assertInsideMedia(db, unit.id, start, end);
    assertInsideParent(db, unit, start, end);
    const now = new Date().toISOString();
    // Moving the far side first keeps siblings from overlapping halfway through.
    const ids = [{ id: unit.id, startMs: unit.startMs }, ...timedDescendants(db, unit.id)].sort(
      (a, b) => (input.delta > 0 ? b.startMs - a.startMs : a.startMs - b.startMs),
    );
    for (const { id } of ids) {
      db.prepare(
        'UPDATE units SET start_ms = start_ms + ?, end_ms = end_ms + ?, updated_at = ? WHERE id = ?',
      ).run(input.delta, input.delta, now, id);
    }
    const next = readStoredUnit(db, unit.id);
    if (!next || next.startMs !== start || next.endMs !== end) {
      throw new Error('edge readback failed');
    }
    return {
      unit: next,
      move: {
        unitId: unit.id,
        delta: input.delta,
        fromStart: unit.startMs,
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
