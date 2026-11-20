import type Database from 'better-sqlite3';

type SqliteDatabase = InstanceType<typeof Database>;

export type TimeEdge = 'start' | 'end';

export interface UnitTimeDraft {
  unitId: string;
  edge: TimeEdge;
  rawInput: string;
  baseMs: number;
  issue: string | null;
  updatedAt: string;
  /** The formal edge now. When it differs from baseMs the draft was typed against an older value. */
  currentMs: number | null;
  conflict: boolean;
}

interface DraftRow {
  unit_id: string;
  edge: string;
  raw_input: string;
  base_ms: number;
  issue: string | null;
  updated_at: string;
  start_ms: number | null;
  end_ms: number | null;
}

function asEdge(value: string): TimeEdge {
  if (value === 'start' || value === 'end') return value;
  throw new Error('time draft edge is invalid');
}

function mapDraft(row: DraftRow): UnitTimeDraft {
  const edge = asEdge(row.edge);
  const currentMs = edge === 'start' ? row.start_ms : row.end_ms;
  return {
    unitId: row.unit_id,
    edge,
    rawInput: row.raw_input,
    baseMs: row.base_ms,
    issue: row.issue,
    updatedAt: row.updated_at,
    currentMs,
    conflict: currentMs !== row.base_ms,
  };
}

export function readUnitTimeDrafts(db: SqliteDatabase, unitId: string): UnitTimeDraft[] {
  return (
    db
      .prepare(
        `SELECT d.unit_id, d.edge, d.raw_input, d.base_ms, d.issue, d.updated_at,
                u.start_ms, u.end_ms
         FROM unit_time_drafts d JOIN units u ON u.id = d.unit_id
         WHERE d.unit_id = ? ORDER BY d.edge`,
      )
      .all(unitId) as DraftRow[]
  ).map(mapDraft);
}

export function putUnitTimeDraft(
  db: SqliteDatabase,
  input: { unitId: string; edge: TimeEdge; rawInput: string; baseMs: number; issue: string | null },
): UnitTimeDraft {
  const write = db.transaction(() => {
    const unit = db.prepare('SELECT id FROM units WHERE id = ?').get(input.unitId) as
      { id: string } | undefined;
    if (unit === undefined) throw new Error('unit is missing');
    if (!Number.isInteger(input.baseMs) || input.baseMs < 0) {
      throw new Error('time draft base is invalid');
    }
    const updatedAt = new Date().toISOString();
    db.prepare(
      `INSERT INTO unit_time_drafts (unit_id, edge, raw_input, base_ms, issue, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(unit_id, edge) DO UPDATE SET
         raw_input = excluded.raw_input,
         base_ms = excluded.base_ms,
         issue = excluded.issue,
         updated_at = excluded.updated_at`,
    ).run(input.unitId, input.edge, input.rawInput, input.baseMs, input.issue, updatedAt);
    const stored = readUnitTimeDrafts(db, input.unitId).find((draft) => draft.edge === input.edge);
    if (!stored) throw new Error('time draft readback failed');
    return stored;
  });
  return write();
}

export function discardUnitTimeDraft(db: SqliteDatabase, unitId: string, edge?: TimeEdge): void {
  if (edge === undefined) {
    db.prepare('DELETE FROM unit_time_drafts WHERE unit_id = ?').run(unitId);
    return;
  }
  db.prepare('DELETE FROM unit_time_drafts WHERE unit_id = ? AND edge = ?').run(unitId, edge);
}
