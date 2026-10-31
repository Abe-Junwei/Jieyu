import type Database from 'better-sqlite3';
import { getSpeaker } from './speakers';
import { readStoredUnit, type Unit } from './units';

type SqliteDatabase = InstanceType<typeof Database>;

export interface SpeakerAssignUndo {
  speakerId: string;
  units: { id: string; speakerId: string | null }[];
}

export function assignSpeaker(
  db: SqliteDatabase,
  input: { speakerId: string; unitIds: readonly string[] },
  afterWrite?: () => void,
): { units: Unit[]; undo: SpeakerAssignUndo | null } {
  if (input.unitIds.length === 0) throw new Error('speaker assign is empty');
  if (new Set(input.unitIds).size !== input.unitIds.length) {
    throw new Error('speaker assign ids repeat');
  }
  const write = db.transaction(() => {
    if (getSpeaker(db, input.speakerId) === null) throw new Error('speaker is missing');
    const before = input.unitIds.map((id) => {
      const unit = readStoredUnit(db, id);
      if (!unit) throw new Error('unit is missing');
      return unit;
    });
    if (before.every((unit) => unit.speakerId === input.speakerId)) {
      return { units: before, undo: null };
    }
    const now = new Date().toISOString();
    const update = db.prepare('UPDATE units SET speaker_id = ?, updated_at = ? WHERE id = ?');
    for (const unit of before) update.run(input.speakerId, now, unit.id);
    afterWrite?.();
    const units = before.map((unit) => {
      const stored = readStoredUnit(db, unit.id);
      if (!stored || stored.speakerId !== input.speakerId || stored.text !== unit.text) {
        throw new Error('speaker assign readback failed');
      }
      return stored;
    });
    return {
      units,
      undo: {
        speakerId: input.speakerId,
        units: before.map((unit) => ({ id: unit.id, speakerId: unit.speakerId })),
      },
    };
  });
  return write();
}

export function undoAssignSpeaker(
  db: SqliteDatabase,
  undo: SpeakerAssignUndo,
  afterWrite?: () => void,
): Unit[] {
  const write = db.transaction(() => {
    if (!assignStillAfter(db, undo)) throw new Error('speaker assign undo is stale');
    const now = new Date().toISOString();
    const update = db.prepare('UPDATE units SET speaker_id = ?, updated_at = ? WHERE id = ?');
    for (const unit of undo.units) update.run(unit.speakerId, now, unit.id);
    afterWrite?.();
    return undo.units.map((unit) => {
      const stored = readStoredUnit(db, unit.id);
      if (!stored || stored.speakerId !== unit.speakerId) {
        throw new Error('speaker assign undo readback failed');
      }
      return stored;
    });
  });
  return write();
}

function assignStillAfter(db: SqliteDatabase, undo: SpeakerAssignUndo): boolean {
  return undo.units.every((unit) => readStoredUnit(db, unit.id)?.speakerId === undo.speakerId);
}
