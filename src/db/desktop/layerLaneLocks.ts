import type Database from 'better-sqlite3';

type SqliteDatabase = InstanceType<typeof Database>;

export interface LaneLock {
  layerId: string;
  speakerId: string;
  laneIndex: number;
}

/** One layer's locks, replaced in a single transaction. A bad row leaves the table as it was. */
export function replaceLaneLocks(
  db: SqliteDatabase,
  input: { layerId: string; locks: readonly { speakerId: string; laneIndex: number }[] },
): LaneLock[] {
  const write = db.transaction(() => {
    const layer = db
      .prepare(
        `SELECT layers.deleted_at AS layerDeleted, manuscripts.deleted_at AS manuscriptDeleted
         FROM layers
         JOIN manuscripts ON manuscripts.id = layers.manuscript_id
         WHERE layers.id = ?`,
      )
      .get(input.layerId) as
      { layerDeleted: string | null; manuscriptDeleted: string | null } | undefined;
    if (layer === undefined) throw new Error('layer is missing');
    if (layer.manuscriptDeleted !== null) throw new Error('manuscript is deleted');
    if (layer.layerDeleted !== null) throw new Error('layer is deleted');
    const speakers = new Set<string>();
    const indexes = new Set<number>();
    for (const lock of input.locks) {
      if (!Number.isInteger(lock.laneIndex) || lock.laneIndex < 0) {
        throw new Error('lane index is invalid');
      }
      if (speakers.has(lock.speakerId) || indexes.has(lock.laneIndex)) {
        throw new Error('lane index repeats');
      }
      speakers.add(lock.speakerId);
      indexes.add(lock.laneIndex);
      if (db.prepare('SELECT id FROM speakers WHERE id = ?').get(lock.speakerId) === undefined) {
        throw new Error('speaker is missing');
      }
    }
    db.prepare('DELETE FROM layer_lane_locks WHERE layer_id = ?').run(input.layerId);
    const insert = db.prepare(
      'INSERT INTO layer_lane_locks (layer_id, speaker_id, lane_index) VALUES (?, ?, ?)',
    );
    for (const lock of input.locks) insert.run(input.layerId, lock.speakerId, lock.laneIndex);
    return listLaneLocks(db, input.layerId);
  });
  return write();
}

/** Drop only these speakers' locks. Other speakers on the layer stay. */
export function clearLaneLocks(
  db: SqliteDatabase,
  input: { layerId: string; speakerIds: readonly string[] },
): LaneLock[] {
  const write = db.transaction(() => {
    const remove = db.prepare('DELETE FROM layer_lane_locks WHERE layer_id = ? AND speaker_id = ?');
    for (const speakerId of input.speakerIds) remove.run(input.layerId, speakerId);
    return listLaneLocks(db, input.layerId);
  });
  return write();
}

export function listLaneLocks(db: SqliteDatabase, layerId: string): LaneLock[] {
  return db
    .prepare(
      `SELECT layer_id AS layerId, speaker_id AS speakerId, lane_index AS laneIndex
         FROM layer_lane_locks WHERE layer_id = ? ORDER BY lane_index`,
    )
    .all(layerId) as LaneLock[];
}

export function listManuscriptLaneLocks(db: SqliteDatabase, manuscriptId: string): LaneLock[] {
  return db
    .prepare(
      `SELECT locks.layer_id AS layerId, locks.speaker_id AS speakerId, locks.lane_index AS laneIndex
       FROM layer_lane_locks locks
       JOIN layers ON layers.id = locks.layer_id
       WHERE layers.manuscript_id = ?
       ORDER BY locks.layer_id, locks.lane_index`,
    )
    .all(manuscriptId) as LaneLock[];
}
