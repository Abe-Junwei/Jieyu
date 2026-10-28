import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import {
  mergeTextTimeMappingHistory,
  normalizeTextTimeMapping,
  type TextTimeMapping,
} from '../../services/LinguisticService.timeMapping';
import { writeRequiredFieldValues } from './customFields';
import { readStringMap } from './stringMap';

type SqliteDatabase = InstanceType<typeof Database>;

export interface Manuscript {
  id: string;
  title: Record<string, string>;
  mediaId: string;
  logicalDurationSec: number | null;
  timeMapping: TextTimeMapping | null;
  timeMappingRevision: number;
  timeMappingHistory: TextTimeMapping[];
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
  mediaId: string;
  fieldValues?: Record<string, unknown>;
}

interface ManuscriptRow {
  id: string;
  title_json: string;
  media_id: string;
  logical_duration_sec: number | null;
  time_mapping_json: string | null;
  time_mapping_history_json: string;
  export_timeline_mode: string | null;
  tier_roles_json: string;
  lifecycle_generation: number;
  deleted_at: string | null;
  retain_until: string | null;
  reminder_shown_at: string | null;
  created_at: string;
  updated_at: string;
}

const MANUSCRIPT_COLUMNS = `id, title_json, media_id, logical_duration_sec, time_mapping_json,
  time_mapping_history_json, export_timeline_mode, tier_roles_json, lifecycle_generation,
  deleted_at, retain_until, reminder_shown_at, created_at, updated_at`;

export function createManuscript(db: SqliteDatabase, input: ManuscriptCreate): Manuscript {
  const id = randomUUID();
  const now = new Date().toISOString();
  const write = db.transaction(() => {
    db.prepare(
      `INSERT INTO manuscripts (id, title_json, media_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`,
    ).run(id, JSON.stringify(input.title), input.mediaId, now, now);
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
  mediaId: string;
  mediaRelpath: string;
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
       FROM manuscripts JOIN media ON media.id = manuscripts.media_id
       WHERE manuscripts.id = ?`,
    )
    .get(id) as
    | {
        id: string;
        titleJson: string;
        mediaId: string;
        deletedAt: string | null;
        mediaRelpath: string;
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

export function setManuscriptTimeMapping(
  db: SqliteDatabase,
  input: {
    manuscriptId: string;
    expectedRevision: number;
    offsetSec: number;
    scale: number;
    sourceMediaId?: string;
  },
  afterWrite?: () => void,
): Manuscript {
  const write = db.transaction(() => {
    const row = manuscriptRow(db, input.manuscriptId);
    const stored = readStored(row.time_mapping_json);
    if (input.expectedRevision !== stored.revision)
      throw new Error('time mapping revision mismatch');
    assertMappingNumbers(input.offsetSec, input.scale);
    if (input.sourceMediaId !== undefined && input.sourceMediaId !== row.media_id) {
      throw new Error('time mapping media does not match the manuscript');
    }
    const now = new Date().toISOString();
    const next: TextTimeMapping = {
      offsetSec: input.offsetSec,
      scale: input.scale,
      revision: stored.revision + 1,
      updatedAt: now,
      sourceMediaId: row.media_id,
    };
    const history =
      mergeTextTimeMappingHistory(
        stored.mapping ?? undefined,
        readHistory(row.time_mapping_history_json),
      ) ?? [];
    db.prepare(
      `UPDATE manuscripts
       SET time_mapping_json = ?, time_mapping_history_json = ?, updated_at = ?
       WHERE id = ?`,
    ).run(JSON.stringify(next), JSON.stringify(history), now, row.id);
    afterWrite?.();
    const manuscript = getManuscript(db, row.id);
    if (!manuscript?.timeMapping) throw new Error('time mapping readback failed');
    return manuscript;
  });
  return write();
}

export function rollbackManuscriptTimeMapping(
  db: SqliteDatabase,
  input: { manuscriptId: string; expectedRevision: number },
): Manuscript {
  const write = db.transaction(() => {
    const row = manuscriptRow(db, input.manuscriptId);
    const stored = readStored(row.time_mapping_json);
    if (!stored.mapping) throw new Error('time mapping is identity');
    if (input.expectedRevision !== stored.revision) {
      throw new Error('time mapping revision mismatch');
    }
    const history = readHistory(row.time_mapping_history_json);
    const restored = history[0];
    const now = new Date().toISOString();
    const revision = stored.revision + 1;
    // ponytail: counter stays in the JSON. Identity keeps {identity,revision} so undo cannot reuse a version. A column is the upgrade if SQL NULL must mean "never mapped".
    const mappingJson =
      restored === undefined
        ? JSON.stringify({ identity: true, revision })
        : JSON.stringify(restoredMapping(restored, revision, now));
    db.prepare(
      `UPDATE manuscripts
       SET time_mapping_json = ?, time_mapping_history_json = ?, updated_at = ?
       WHERE id = ?`,
    ).run(mappingJson, JSON.stringify(restored === undefined ? [] : history.slice(1)), now, row.id);
    const manuscript = getManuscript(db, row.id);
    if (!manuscript || manuscript.timeMappingRevision !== revision) {
      throw new Error('time mapping readback failed');
    }
    return manuscript;
  });
  return write();
}

function manuscriptRow(db: SqliteDatabase, id: string): ManuscriptRow {
  const row = db.prepare(`SELECT ${MANUSCRIPT_COLUMNS} FROM manuscripts WHERE id = ?`).get(id) as
    ManuscriptRow | undefined;
  if (!row) throw new Error('manuscript is missing');
  return row;
}

function mapManuscript(row: ManuscriptRow): Manuscript {
  const mode = row.export_timeline_mode;
  const stored = readStored(row.time_mapping_json);
  return {
    id: row.id,
    title: readStringMap(row.title_json),
    mediaId: row.media_id,
    logicalDurationSec: row.logical_duration_sec,
    timeMapping: stored.mapping,
    timeMappingRevision: stored.revision,
    timeMappingHistory: readHistory(row.time_mapping_history_json),
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

function readStored(json: string | null): { mapping: TextTimeMapping | null; revision: number } {
  if (json === null) return { mapping: null, revision: 0 };
  const parsed: unknown = JSON.parse(json);
  const identity = identityMarker(parsed);
  if (identity) return { mapping: null, revision: identity.revision };
  const mapping = normalizeTextTimeMapping(parsed);
  if (!mapping) throw new Error('time mapping is invalid');
  return { mapping, revision: mapping.revision };
}

function identityMarker(value: unknown): { identity: true; revision: number } | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
  const record = value as { identity?: unknown; revision?: unknown; offsetSec?: unknown };
  if (
    record.identity !== true ||
    record.offsetSec !== undefined ||
    typeof record.revision !== 'number' ||
    !Number.isInteger(record.revision) ||
    record.revision < 1
  ) {
    return undefined;
  }
  return { identity: true, revision: record.revision };
}

function restoredMapping(
  previous: TextTimeMapping,
  revision: number,
  updatedAt: string,
): TextTimeMapping {
  return {
    offsetSec: previous.offsetSec,
    scale: previous.scale,
    revision,
    updatedAt,
    ...(previous.sourceMediaId === undefined ? {} : { sourceMediaId: previous.sourceMediaId }),
  };
}

function readHistory(json: string): TextTimeMapping[] {
  const parsed: unknown = JSON.parse(json);
  if (!Array.isArray(parsed)) throw new Error('time mapping history is invalid');
  return parsed.flatMap((item) => {
    const mapping = normalizeTextTimeMapping(item);
    return mapping ? [mapping] : [];
  });
}

function assertMappingNumbers(offsetSec: number, scale: number): void {
  if (!Number.isFinite(offsetSec) || offsetSec < 0) {
    throw new Error('offsetSec must be a finite number that is not negative');
  }
  if (!Number.isFinite(scale) || scale <= 0) {
    throw new Error('scale must be a finite number greater than 0');
  }
}
