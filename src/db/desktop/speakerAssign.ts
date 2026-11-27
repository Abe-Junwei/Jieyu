import type Database from 'better-sqlite3';
import { createSpeaker, getSpeaker, type Speaker } from './speakers';
import { readStoredUnit, type Unit } from './units';

type SqliteDatabase = InstanceType<typeof Database>;

export interface SpeakerAssignUndo {
  /** Speaker after the write. `null` means the units were cleared. */
  speakerId: string | null;
  manuscriptId: string;
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
    const manuscriptId = resolveAssignManuscriptId(db, before);
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
        manuscriptId,
        units: before.map((unit) => ({ id: unit.id, speakerId: unit.speakerId })),
      },
    };
  });
  return write();
}

export function clearSpeaker(
  db: SqliteDatabase,
  input: { unitIds: readonly string[] },
  afterWrite?: () => void,
): { units: Unit[]; undo: SpeakerAssignUndo | null } {
  if (input.unitIds.length === 0) throw new Error('speaker assign is empty');
  if (new Set(input.unitIds).size !== input.unitIds.length) {
    throw new Error('speaker assign ids repeat');
  }
  const write = db.transaction(() => {
    const before = input.unitIds.map((id) => {
      const unit = readStoredUnit(db, id);
      if (!unit) throw new Error('unit is missing');
      return unit;
    });
    const manuscriptId = resolveAssignManuscriptId(db, before);
    if (before.every((unit) => unit.speakerId === null)) return { units: before, undo: null };
    const now = new Date().toISOString();
    const update = db.prepare('UPDATE units SET speaker_id = NULL, updated_at = ? WHERE id = ?');
    for (const unit of before) update.run(now, unit.id);
    afterWrite?.();
    const units = before.map((unit) => {
      const stored = readStoredUnit(db, unit.id);
      if (!stored || stored.speakerId !== null || stored.text !== unit.text) {
        throw new Error('speaker assign readback failed');
      }
      return stored;
    });
    return {
      units,
      undo: {
        speakerId: null,
        manuscriptId,
        units: before.map((unit) => ({ id: unit.id, speakerId: unit.speakerId })),
      },
    };
  });
  return write();
}

/**
 * Create a directory speaker and assign units in one transaction.
 * Failure rolls back the new speaker; undo only restores assignments (keeps the directory row).
 */
export function createAndAssignSpeaker(
  db: SqliteDatabase,
  input: { name: string; unitIds: readonly string[] },
  afterWrite?: () => void,
): { speaker: Speaker; units: Unit[]; undo: SpeakerAssignUndo | null } {
  const write = db.transaction(() => {
    const speaker = createSpeaker(db, { name: input.name });
    const assigned = assignSpeaker(db, { speakerId: speaker.id, unitIds: input.unitIds });
    afterWrite?.();
    const stored = getSpeaker(db, speaker.id);
    if (!stored) throw new Error('speaker readback failed');
    return { speaker: stored, units: assigned.units, undo: assigned.undo };
  });
  return write();
}

/** One batch must stay on a single manuscript; mixed ids refuse before any write. */
function resolveAssignManuscriptId(db: SqliteDatabase, units: readonly Unit[]): string {
  const lookup = db.prepare(`SELECT manuscript_id AS manuscriptId FROM layers WHERE id = ?`);
  const ids = new Set<string>();
  for (const unit of units) {
    const row = lookup.get(unit.layerId) as { manuscriptId: string } | undefined;
    if (!row) throw new Error('unit is missing');
    ids.add(row.manuscriptId);
  }
  if (ids.size !== 1) throw new Error('speaker assign spans manuscripts');
  return [...ids][0]!;
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
