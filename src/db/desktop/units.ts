import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';

type SqliteDatabase = InstanceType<typeof Database>;

export interface Unit {
  id: string;
  layerId: string;
  speakerId: string | null;
  parentUnitId: string | null;
  startTime: number;
  endTime: number;
  createdAt: string;
  updatedAt: string;
  text: string;
}

export interface UnitCreate {
  layerId: string;
  startTime: number;
  endTime: number;
  text: string;
  speakerId?: string | null;
  parentUnitId?: string | null;
}

interface UnitRow {
  id: string;
  layer_id: string;
  speaker_id: string | null;
  parent_unit_id: string | null;
  start_time: number;
  end_time: number;
  created_at: string;
  updated_at: string;
  text: string;
}

const READ = `
SELECT units.id, units.layer_id, units.speaker_id, units.parent_unit_id,
       units.start_time, units.end_time, units.created_at, units.updated_at,
       unit_texts.body AS text
FROM units
JOIN unit_texts ON unit_texts.unit_id = units.id AND unit_texts.role = 'transcription'
WHERE units.id = ?
`;

export function createUnit(
  db: SqliteDatabase,
  input: UnitCreate,
  afterUnitInsert?: () => void,
): Unit {
  const id = randomUUID();
  const now = new Date().toISOString();
  const write = db.transaction(() => {
    db.prepare(
      `INSERT INTO units (
        id, layer_id, speaker_id, parent_unit_id, start_time, end_time, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      input.layerId,
      input.speakerId ?? null,
      input.parentUnitId ?? null,
      input.startTime,
      input.endTime,
      now,
      now,
    );
    afterUnitInsert?.();
    db.prepare(
      `INSERT INTO unit_texts (id, unit_id, role, body, updated_at) VALUES (?, ?, 'transcription', ?, ?)`,
    ).run(randomUUID(), id, input.text, now);
    const unit = getUnit(db, id);
    if (!unit) throw new Error('unit readback failed');
    return unit;
  });
  return write();
}

export function getUnit(db: SqliteDatabase, id: string): Unit | null {
  const row = db.prepare(READ).get(id) as UnitRow | undefined;
  if (!row) return null;
  return {
    id: row.id,
    layerId: row.layer_id,
    speakerId: row.speaker_id,
    parentUnitId: row.parent_unit_id,
    startTime: row.start_time,
    endTime: row.end_time,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    text: row.text,
  };
}
