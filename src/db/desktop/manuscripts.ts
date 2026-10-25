import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import {
  mergeTextTimeMappingHistory,
  normalizeTextTimeMapping,
  type TextTimeMapping,
} from '../../services/LinguisticService.timeMapping';
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
  createdAt: string;
  updatedAt: string;
}

export interface ManuscriptCreate {
  title: Record<string, string>;
  mediaId: string;
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
  created_at: string;
  updated_at: string;
}

const MANUSCRIPT_COLUMNS = `id, title_json, media_id, logical_duration_sec, time_mapping_json,
  time_mapping_history_json, export_timeline_mode, tier_roles_json, created_at, updated_at`;

export function createManuscript(db: SqliteDatabase, input: ManuscriptCreate): Manuscript {
  const id = randomUUID();
  const now = new Date().toISOString();
  const write = db.transaction(() => {
    db.prepare(
      `INSERT INTO manuscripts (id, title_json, media_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`,
    ).run(id, JSON.stringify(input.title), input.mediaId, now, now);
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
    .prepare(`SELECT ${MANUSCRIPT_COLUMNS} FROM manuscripts ORDER BY created_at, id`)
    .all() as ManuscriptRow[];
  return rows.map(mapManuscript);
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
