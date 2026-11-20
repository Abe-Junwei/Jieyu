import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import { writeRequiredFieldValues } from './customFields';
import { readStringMap } from './stringMap';

type SqliteDatabase = InstanceType<typeof Database>;

export interface Manuscript {
  id: string;
  title: Record<string, string>;
  mediaId: string | null;
  exportTimelineMode: 'document' | 'media' | null;
  tierRoles: Record<string, string>;
  lifecycleGeneration: number;
  deletedAt: string | null;
  retainUntil: string | null;
  reminderShownAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ManuscriptCreate {
  title: Record<string, string>;
  mediaId?: string | null;
  fieldValues?: Record<string, unknown>;
}

interface ManuscriptRow {
  id: string;
  title_json: string;
  media_id: string | null;
  export_timeline_mode: string | null;
  tier_roles_json: string;
  lifecycle_generation: number;
  deleted_at: string | null;
  retain_until: string | null;
  reminder_shown_at: string | null;
  created_at: string;
  updated_at: string;
}

const MANUSCRIPT_COLUMNS = `id, title_json, media_id, export_timeline_mode, tier_roles_json,
  lifecycle_generation, deleted_at, retain_until, reminder_shown_at, created_at, updated_at`;

export function createManuscript(db: SqliteDatabase, input: ManuscriptCreate): Manuscript {
  const id = randomUUID();
  const now = new Date().toISOString();
  const write = db.transaction(() => {
    const mediaId = input.mediaId ?? null;
    if (mediaId !== null) {
      const media = db
        .prepare('SELECT deleted_at AS deletedAt FROM media WHERE id = ?')
        .get(mediaId) as { deletedAt: string | null } | undefined;
      if (media === undefined) throw new Error('media is missing');
      if (media.deletedAt !== null) throw new Error('media is deleted');
    }
    db.prepare(
      `INSERT INTO manuscripts (id, title_json, media_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`,
    ).run(id, JSON.stringify(input.title), mediaId, now, now);
    writeRequiredFieldValues(db, 'manuscript', id, input.fieldValues);
    const manuscript = getManuscript(db, id);
    if (!manuscript) throw new Error('manuscript readback failed');
    return manuscript;
  });
  return write();
}

export function getManuscript(db: SqliteDatabase, id: string): Manuscript | null {
  const row = db.prepare(`SELECT ${MANUSCRIPT_COLUMNS} FROM manuscripts WHERE id = ?`).get(id) as
    ManuscriptRow | undefined;
  if (!row) return null;
  return mapManuscript(row);
}

export function listManuscripts(db: SqliteDatabase): Manuscript[] {
  const rows = db
    .prepare(
      `SELECT ${MANUSCRIPT_COLUMNS} FROM manuscripts
       WHERE deleted_at IS NULL ORDER BY created_at, id`,
    )
    .all() as ManuscriptRow[];
  return rows.map(mapManuscript);
}

export function unitBelongsToDeletedManuscript(db: SqliteDatabase, unitId: string): boolean {
  const row = db
    .prepare(
      `SELECT manuscripts.deleted_at AS deletedAt
       FROM units
       JOIN layers ON layers.id = units.layer_id
       JOIN manuscripts ON manuscripts.id = layers.manuscript_id
       WHERE units.id = ?`,
    )
    .get(unitId) as { deletedAt: string | null } | undefined;
  return row !== undefined && row.deletedAt !== null;
}

export function listDeletedManuscripts(db: SqliteDatabase): Manuscript[] {
  const rows = db
    .prepare(
      `SELECT ${MANUSCRIPT_COLUMNS} FROM manuscripts
       WHERE deleted_at IS NOT NULL ORDER BY deleted_at, id`,
    )
    .all() as ManuscriptRow[];
  return rows.map(mapManuscript);
}

function plusUtcDays(iso: string, days: number): string {
  const date = new Date(iso);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString();
}

export interface ManuscriptDeletePreview {
  id: string;
  title: Record<string, string>;
  mediaId: string | null;
  mediaRelpath: string | null;
  alreadyDeleted: boolean;
  running: boolean;
}

export interface RecordingDeletePreview {
  id: string;
  relpath: string;
  alreadyDeleted: boolean;
  running: boolean;
  manuscripts: {
    id: string;
    title: Record<string, string>;
    alreadyDeleted: boolean;
    retainUntil: string | null;
  }[];
}

export function previewManuscriptDelete(db: SqliteDatabase, id: string): ManuscriptDeletePreview {
  const row = db
    .prepare(
      `SELECT manuscripts.id, manuscripts.title_json AS titleJson, manuscripts.media_id AS mediaId,
              manuscripts.deleted_at AS deletedAt, media.relpath AS mediaRelpath,
              EXISTS (
                SELECT 1 FROM model_runs
                WHERE model_runs.manuscript_id = manuscripts.id AND model_runs.status = 'running'
              ) AS running
       FROM manuscripts LEFT JOIN media ON media.id = manuscripts.media_id
       WHERE manuscripts.id = ?`,
    )
    .get(id) as
    | {
        id: string;
        titleJson: string;
        mediaId: string | null;
        deletedAt: string | null;
        mediaRelpath: string | null;
        running: number;
      }
    | undefined;
  if (row === undefined) throw new Error('manuscript is missing');
  return {
    id: row.id,
    title: readStringMap(row.titleJson),
    mediaId: row.mediaId,
    mediaRelpath: row.mediaRelpath,
    alreadyDeleted: row.deletedAt !== null,
    running: row.running === 1,
  };
}

export function previewRecordingDelete(
  db: SqliteDatabase,
  mediaId: string,
): RecordingDeletePreview {
  const media = db
    .prepare('SELECT id, relpath, deleted_at AS deletedAt FROM media WHERE id = ?')
    .get(mediaId) as { id: string; relpath: string; deletedAt: string | null } | undefined;
  if (media === undefined) throw new Error('media is missing');
  const manuscripts = db
    .prepare(
      `SELECT id, title_json AS titleJson, deleted_at AS deletedAt, retain_until AS retainUntil,
              EXISTS (
                SELECT 1 FROM model_runs
                WHERE model_runs.manuscript_id = manuscripts.id AND model_runs.status = 'running'
              ) AS running
       FROM manuscripts WHERE media_id = ?
       ORDER BY id`,
    )
    .all(mediaId) as {
    id: string;
    titleJson: string;
    deletedAt: string | null;
    retainUntil: string | null;
    running: number;
  }[];
  return {
    id: media.id,
    relpath: media.relpath,
    alreadyDeleted: media.deletedAt !== null,
    running: manuscripts.some((row) => row.running === 1),
    manuscripts: manuscripts.map((row) => ({
      id: row.id,
      title: readStringMap(row.titleJson),
      alreadyDeleted: row.deletedAt !== null,
      retainUntil: row.retainUntil,
    })),
  };
}

export function deleteManuscript(db: SqliteDatabase, id: string): Manuscript {
  const write = db.transaction(() => {
    const current = getManuscript(db, id);
    if (!current) throw new Error('manuscript is missing');
    if (current.deletedAt !== null) throw new Error('manuscript is deleted');
    const running = db
      .prepare(`SELECT id FROM model_runs WHERE manuscript_id = ? AND status = 'running' LIMIT 1`)
      .get(id) as { id: string } | undefined;
    if (running) throw new Error('manuscript has a running task');
    const now = new Date().toISOString();
    const retainUntil = plusUtcDays(now, 90);
    db.prepare(
      `UPDATE manuscripts
       SET deleted_at = ?, retain_until = ?, reminder_shown_at = NULL,
           lifecycle_generation = lifecycle_generation + 1, updated_at = ?
       WHERE id = ? AND deleted_at IS NULL`,
    ).run(now, retainUntil, now, id);
    const next = getManuscript(db, id);
    if (
      !next ||
      next.deletedAt !== now ||
      next.retainUntil !== retainUntil ||
      next.reminderShownAt !== null ||
      next.lifecycleGeneration !== current.lifecycleGeneration + 1
    ) {
      throw new Error('manuscript delete readback failed');
    }
    return next;
  });
  return write();
}

export interface RecordingDeletion {
  id: string;
  deletedAt: string;
  retainUntil: string;
  reminderShownAt: null;
}

export function deleteRecording(db: SqliteDatabase, mediaId: string): RecordingDeletion {
  const write = db.transaction(() => {
    const media = db
      .prepare('SELECT deleted_at AS deletedAt FROM media WHERE id = ?')
      .get(mediaId) as { deletedAt: string | null } | undefined;
    if (!media) throw new Error('media is missing');
    if (media.deletedAt !== null) throw new Error('media is deleted');
    const linked = db
      .prepare(
        `SELECT id, deleted_at, retain_until, lifecycle_generation
         FROM manuscripts WHERE media_id = ?`,
      )
      .all(mediaId) as {
      id: string;
      deleted_at: string | null;
      retain_until: string | null;
      lifecycle_generation: number;
    }[];
    for (const row of linked) {
      const running = db
        .prepare(`SELECT id FROM model_runs WHERE manuscript_id = ? AND status = 'running' LIMIT 1`)
        .get(row.id) as { id: string } | undefined;
      if (running) throw new Error('manuscript has a running task');
    }
    const now = new Date().toISOString();
    const retainUntil = plusUtcDays(now, 90);
    db.prepare(
      `UPDATE media
       SET deleted_at = ?, retain_until = ?, reminder_shown_at = NULL
       WHERE id = ? AND deleted_at IS NULL`,
    ).run(now, retainUntil, mediaId);
    for (const row of linked) {
      if (row.deleted_at === null) {
        db.prepare(
          `UPDATE manuscripts
           SET deleted_at = ?, retain_until = ?, reminder_shown_at = NULL,
               lifecycle_generation = lifecycle_generation + 1, updated_at = ?
           WHERE id = ? AND deleted_at IS NULL`,
        ).run(now, retainUntil, now, row.id);
      } else if (row.retain_until !== null && row.retain_until < retainUntil) {
        db.prepare('UPDATE manuscripts SET retain_until = ?, updated_at = ? WHERE id = ?').run(
          retainUntil,
          now,
          row.id,
        );
      }
    }
    const stored = db
      .prepare(
        `SELECT deleted_at AS deletedAt, retain_until AS retainUntil,
                reminder_shown_at AS reminderShownAt
         FROM media WHERE id = ?`,
      )
      .get(mediaId) as {
      deletedAt: string | null;
      retainUntil: string | null;
      reminderShownAt: string | null;
    };
    if (
      stored.deletedAt !== now ||
      stored.retainUntil !== retainUntil ||
      stored.reminderShownAt !== null
    ) {
      throw new Error('media delete readback failed');
    }
    for (const row of linked) {
      const next = getManuscript(db, row.id);
      const lengthened =
        row.deleted_at === null || (row.retain_until !== null && row.retain_until < retainUntil);
      if (
        !next ||
        next.deletedAt !== (row.deleted_at ?? now) ||
        next.retainUntil !== (lengthened ? retainUntil : row.retain_until) ||
        next.lifecycleGeneration !==
          (row.deleted_at === null ? row.lifecycle_generation + 1 : row.lifecycle_generation)
      ) {
        throw new Error('manuscript delete readback failed');
      }
    }
    return { id: mediaId, deletedAt: now, retainUntil, reminderShownAt: null };
  });
  return write();
}

export function restoreManuscript(db: SqliteDatabase, id: string): Manuscript {
  const write = db.transaction(() => {
    const current = getManuscript(db, id);
    if (!current) throw new Error('manuscript is missing');
    if (current.deletedAt === null) throw new Error('manuscript is active');
    const now = new Date().toISOString();
    db.prepare(
      `UPDATE manuscripts
       SET deleted_at = NULL, retain_until = NULL, reminder_shown_at = NULL,
           lifecycle_generation = lifecycle_generation + 1, updated_at = ?
       WHERE id = ? AND deleted_at IS NOT NULL`,
    ).run(now, id);
    db.prepare(
      `UPDATE media
       SET deleted_at = NULL, retain_until = NULL, reminder_shown_at = NULL
       WHERE id = ?`,
    ).run(current.mediaId);
    const next = getManuscript(db, id);
    if (
      !next ||
      next.deletedAt !== null ||
      next.retainUntil !== null ||
      next.reminderShownAt !== null ||
      next.lifecycleGeneration !== current.lifecycleGeneration + 1
    ) {
      throw new Error('manuscript restore readback failed');
    }
    return next;
  });
  return write();
}

export interface RetimeUndo {
  manuscriptId: string;
  manuscriptGeneration: number;
  units: Array<{ id: string; startMs: number; endMs: number }>;
  points: Array<{ id: string; timeMs: number }>;
}

/** Rewrite aligned segment and point times in one step. scale must stay positive. */
export function retimeManuscript(
  db: SqliteDatabase,
  input: { manuscriptId: string; offsetMs: number; scale: number },
): { count: number; undo: RetimeUndo } {
  if (!Number.isFinite(input.scale) || input.scale <= 0 || !Number.isInteger(input.offsetMs)) {
    throw new Error('retime is invalid');
  }
  const write = db.transaction(() => {
    const manuscript = db
      .prepare(
        'SELECT lifecycle_generation AS generation, deleted_at AS deletedAt FROM manuscripts WHERE id = ?',
      )
      .get(input.manuscriptId) as { generation: number; deletedAt: string | null } | undefined;
    if (manuscript === undefined) throw new Error('manuscript is missing');
    if (manuscript.deletedAt !== null) throw new Error('manuscript is deleted');
    const units = db
      .prepare(
        `SELECT units.id AS id, units.start_ms AS startMs, units.end_ms AS endMs
         FROM units JOIN layers ON layers.id = units.layer_id
         WHERE layers.manuscript_id = ? AND units.start_ms IS NOT NULL
         ORDER BY units.sort_order, units.id`,
      )
      .all(input.manuscriptId) as Array<{ id: string; startMs: number; endMs: number }>;
    const points = db
      .prepare(
        `SELECT points.id AS id, points.layer_id AS layerId, points.time_ms AS timeMs,
                points.label AS label, points.created_at AS createdAt
         FROM points JOIN layers ON layers.id = points.layer_id
         WHERE layers.manuscript_id = ?
         ORDER BY points.time_ms, points.id`,
      )
      .all(input.manuscriptId) as Array<{
      id: string;
      layerId: string;
      timeMs: number;
      label: string;
      createdAt: string;
    }>;
    const now = new Date().toISOString();
    if (units.length > 0) {
      db.prepare(
        `UPDATE units SET start_ms = NULL, end_ms = NULL, updated_at = ?
         WHERE id IN (${units.map(() => '?').join(', ')})`,
      ).run(now, ...units.map((unit) => unit.id));
    }
    for (const unit of units) {
      const startMs = Math.round(unit.startMs * input.scale + input.offsetMs);
      const endMs = Math.round(unit.endMs * input.scale + input.offsetMs);
      if (startMs < 0 || startMs >= endMs) throw new Error('retime is invalid');
      db.prepare('UPDATE units SET start_ms = ?, end_ms = ?, updated_at = ? WHERE id = ?').run(
        startMs,
        endMs,
        now,
        unit.id,
      );
    }
    for (const point of points) {
      db.prepare('DELETE FROM points WHERE id = ?').run(point.id);
    }
    for (const point of points) {
      const timeMs = Math.round(point.timeMs * input.scale + input.offsetMs);
      if (timeMs < 0) throw new Error('retime is invalid');
      db.prepare(
        `INSERT INTO points (id, layer_id, time_ms, label, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      ).run(point.id, point.layerId, timeMs, point.label, point.createdAt, now);
    }
    db.prepare(
      `UPDATE manuscripts SET lifecycle_generation = lifecycle_generation + 1, updated_at = ? WHERE id = ?`,
    ).run(now, input.manuscriptId);
    const stored = db
      .prepare('SELECT lifecycle_generation AS generation FROM manuscripts WHERE id = ?')
      .get(input.manuscriptId) as { generation: number };
    if (stored.generation !== manuscript.generation + 1) throw new Error('retime readback failed');
    return {
      count: units.length + points.length,
      undo: {
        manuscriptId: input.manuscriptId,
        manuscriptGeneration: stored.generation,
        units: units.map((unit) => ({ id: unit.id, startMs: unit.startMs, endMs: unit.endMs })),
        points: points.map((point) => ({ id: point.id, timeMs: point.timeMs })),
      },
    };
  });
  return write();
}

export function undoRetime(db: SqliteDatabase, undo: RetimeUndo): void {
  const write = db.transaction(() => {
    const manuscript = db
      .prepare('SELECT lifecycle_generation AS generation FROM manuscripts WHERE id = ?')
      .get(undo.manuscriptId) as { generation: number } | undefined;
    if (manuscript === undefined || manuscript.generation !== undo.manuscriptGeneration) {
      throw new Error('retime undo is stale');
    }
    const now = new Date().toISOString();
    if (undo.units.length > 0) {
      db.prepare(
        `UPDATE units SET start_ms = NULL, end_ms = NULL, updated_at = ?
         WHERE id IN (${undo.units.map(() => '?').join(', ')})`,
      ).run(now, ...undo.units.map((unit) => unit.id));
    }
    for (const unit of undo.units) {
      db.prepare('UPDATE units SET start_ms = ?, end_ms = ?, updated_at = ? WHERE id = ?').run(
        unit.startMs,
        unit.endMs,
        now,
        unit.id,
      );
      const row = db.prepare('SELECT start_ms AS startMs FROM units WHERE id = ?').get(unit.id) as
        { startMs: number } | undefined;
      if (row?.startMs !== unit.startMs) throw new Error('retime undo is stale');
    }
    if (undo.points.length > 0) {
      const ids = undo.points.map((point) => point.id);
      const marks = ids.map(() => '?').join(', ');
      const current = db
        .prepare(
          `SELECT id, layer_id AS layerId, label, created_at AS createdAt
           FROM points WHERE id IN (${marks})`,
        )
        .all(...ids) as Array<{ id: string; layerId: string; label: string; createdAt: string }>;
      if (current.length !== undo.points.length) throw new Error('retime undo is stale');
      const kept = new Map(current.map((point) => [point.id, point]));
      db.prepare(`DELETE FROM points WHERE id IN (${marks})`).run(...ids);
      const insert = db.prepare(
        `INSERT INTO points (id, layer_id, time_ms, label, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      );
      for (const point of undo.points) {
        const row = kept.get(point.id);
        if (row === undefined) throw new Error('retime undo is stale');
        insert.run(point.id, row.layerId, point.timeMs, row.label, row.createdAt, now);
      }
    }
    db.prepare(
      `UPDATE manuscripts SET lifecycle_generation = lifecycle_generation + 1, updated_at = ? WHERE id = ?`,
    ).run(now, undo.manuscriptId);
  });
  write();
}

function mapManuscript(row: ManuscriptRow): Manuscript {
  const mode = row.export_timeline_mode;
  return {
    id: row.id,
    title: readStringMap(row.title_json),
    mediaId: row.media_id,
    exportTimelineMode: mode === 'document' || mode === 'media' ? mode : null,
    tierRoles: readStringMap(row.tier_roles_json),
    lifecycleGeneration: row.lifecycle_generation,
    deletedAt: row.deleted_at,
    retainUntil: row.retain_until,
    reminderShownAt: row.reminder_shown_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
