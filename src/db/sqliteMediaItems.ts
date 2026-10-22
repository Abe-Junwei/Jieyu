/**
 * 录音行写在项目库里（ADR-0075）。
 * 一次事务写入，提交后再读回。读回失败不撤销。
 * 音频字节留在文件夹里的普通文件，不进这一行。
 */
import Database from 'better-sqlite3';
import { StorageReadbackError } from './storageReadbackError';
import type {
  MediaAvailability,
  MediaByteLocation,
  MediaItemDocType,
  MediaTimelineKind,
} from './types';

type SqliteDatabase = InstanceType<typeof Database>;

const OPERATION = 'saveMediaItem';
const TIMELINE: readonly MediaTimelineKind[] = ['acoustic', 'placeholder'];
const BYTE_LOCATION: readonly MediaByteLocation[] = ['managed', 'url', 'none'];
const AVAILABILITY: readonly MediaAvailability[] = ['available', 'missing'];
const ACCESS_RIGHTS = ['open', 'restricted', 'confidential'] as const;

const COLUMNS =
  'id, text_id, filename, url, duration, details_json, is_offline_cached, access_rights, created_at, timeline_kind, byte_location, availability, content_size, content_sha256';

function field(value: unknown, key: string): unknown {
  if (typeof value !== 'object' || value === null) return undefined;
  return (value as Record<string, unknown>)[key];
}

function containsBlob(value: unknown): boolean {
  if (typeof Blob !== 'undefined' && value instanceof Blob) return true;
  if (Array.isArray(value)) return value.some((item) => containsBlob(item));
  if (typeof value === 'object' && value !== null) {
    return Object.values(value).some((item) => containsBlob(item));
  }
  return false;
}

function detailsJson(details: MediaItemDocType['details']): string | null {
  if (details === undefined) return null;
  if (typeof details !== 'object' || details === null || Array.isArray(details)) {
    throw new Error('media details is not an object');
  }
  if (containsBlob(details)) throw new Error('media details cannot store audio bytes');
  let json: string;
  try {
    json = JSON.stringify(details);
  } catch {
    throw new Error('media details is not an object');
  }
  return json;
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], label: string): T {
  if (typeof value === 'string' && allowed.some((item) => item === value)) return value as T;
  throw new Error(`media ${label} is not recognized`);
}

function optionalText(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value !== 'string') throw new Error('media row is incomplete');
  return value;
}

function optionalFinite(value: unknown): number | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value !== 'number' || !Number.isFinite(value))
    throw new Error('media row is incomplete');
  return value;
}

function finiteOrNull(value: number | undefined, label: string): number | null {
  if (value === undefined) return null;
  if (!Number.isFinite(value)) throw new Error(`media ${label} is not a finite number`);
  return value;
}

function readDoc(value: unknown): MediaItemDocType {
  const url = optionalText(field(value, 'url'));
  const duration = optionalFinite(field(value, 'duration'));
  const accessRights = optionalText(field(value, 'access_rights'));
  const contentSize = optionalFinite(field(value, 'content_size'));
  const contentSha256 = optionalText(field(value, 'content_sha256'));
  const detailsRaw = field(value, 'details_json');
  let details: MediaItemDocType['details'];
  if (typeof detailsRaw === 'string') {
    const parsed: unknown = JSON.parse(detailsRaw);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      throw new Error('media row is incomplete');
    }
    details = parsed as Record<string, unknown>;
  } else if (detailsRaw !== null && detailsRaw !== undefined) {
    throw new Error('media row is incomplete');
  }
  const cached = field(value, 'is_offline_cached');
  if (cached !== 0 && cached !== 1) throw new Error('media row is incomplete');
  const doc: MediaItemDocType = {
    id: typeof field(value, 'id') === 'string' ? (field(value, 'id') as string) : '',
    textId: typeof field(value, 'text_id') === 'string' ? (field(value, 'text_id') as string) : '',
    filename:
      typeof field(value, 'filename') === 'string' ? (field(value, 'filename') as string) : '',
    isOfflineCached: cached === 1,
    createdAt:
      typeof field(value, 'created_at') === 'string' ? (field(value, 'created_at') as string) : '',
    timelineKind: oneOf(field(value, 'timeline_kind'), TIMELINE, 'timelineKind'),
    byteLocation: oneOf(field(value, 'byte_location'), BYTE_LOCATION, 'byteLocation'),
    availability: oneOf(field(value, 'availability'), AVAILABILITY, 'availability'),
  };
  if (
    doc.id.length === 0 ||
    doc.textId.length === 0 ||
    doc.filename.length === 0 ||
    doc.createdAt.length === 0
  ) {
    throw new Error('media row is incomplete');
  }
  if (url !== undefined) doc.url = url;
  if (duration !== undefined) doc.duration = duration;
  if (details !== undefined) doc.details = details;
  if (accessRights !== undefined) {
    doc.accessRights = oneOf(accessRights, ACCESS_RIGHTS, 'accessRights');
  }
  if (contentSize !== undefined) doc.contentSize = contentSize;
  if (contentSha256 !== undefined) doc.contentSha256 = contentSha256;
  return doc;
}

function sameDetails(
  stored: MediaItemDocType['details'],
  written: MediaItemDocType['details'],
): boolean {
  return JSON.stringify(stored ?? null) === JSON.stringify(written ?? null);
}

function sameMedia(stored: MediaItemDocType, written: MediaItemDocType): boolean {
  return (
    stored.id === written.id &&
    stored.textId === written.textId &&
    stored.filename === written.filename &&
    stored.url === written.url &&
    stored.duration === written.duration &&
    stored.isOfflineCached === written.isOfflineCached &&
    stored.accessRights === written.accessRights &&
    stored.createdAt === written.createdAt &&
    stored.timelineKind === written.timelineKind &&
    stored.byteLocation === written.byteLocation &&
    stored.availability === written.availability &&
    stored.contentSize === written.contentSize &&
    stored.contentSha256 === written.contentSha256 &&
    sameDetails(stored.details, written.details)
  );
}

function readById(db: SqliteDatabase, id: string): MediaItemDocType | undefined {
  const row: unknown = db.prepare(`SELECT ${COLUMNS} FROM media_items WHERE id = ?`).get(id);
  if (row === undefined) return undefined;
  return readDoc(row);
}

export function listMediaByTextInProject(db: SqliteDatabase, textId: string): MediaItemDocType[] {
  const id = textId.trim();
  if (id.length === 0) return [];
  return db
    .prepare(`SELECT ${COLUMNS} FROM media_items WHERE text_id = ? ORDER BY id`)
    .all(id)
    .map((row) => readDoc(row));
}

export function listMediaIdsByTextInProject(db: SqliteDatabase, textId: string): string[] {
  return listMediaByTextInProject(db, textId).map((row) => row.id);
}

export function saveMediaItemInProject(db: SqliteDatabase, data: MediaItemDocType): string {
  const id = data.id.trim();
  if (id.length === 0) throw new StorageReadbackError(OPERATION);
  const row: MediaItemDocType = { ...data, id };
  oneOf(row.timelineKind, TIMELINE, 'timelineKind');
  oneOf(row.byteLocation, BYTE_LOCATION, 'byteLocation');
  oneOf(row.availability, AVAILABILITY, 'availability');
  if (row.accessRights !== undefined) oneOf(row.accessRights, ACCESS_RIGHTS, 'accessRights');
  const duration = finiteOrNull(row.duration, 'duration');
  const contentSize = finiteOrNull(row.contentSize, 'contentSize');
  const json = detailsJson(row.details);
  const statement = db.prepare(
    `INSERT INTO media_items (
       id, text_id, filename, url, duration, details_json, is_offline_cached, access_rights,
       created_at, timeline_kind, byte_location, availability, content_size, content_sha256
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       text_id = excluded.text_id,
       filename = excluded.filename,
       url = excluded.url,
       duration = excluded.duration,
       details_json = excluded.details_json,
       is_offline_cached = excluded.is_offline_cached,
       access_rights = excluded.access_rights,
       created_at = excluded.created_at,
       timeline_kind = excluded.timeline_kind,
       byte_location = excluded.byte_location,
       availability = excluded.availability,
       content_size = excluded.content_size,
       content_sha256 = excluded.content_sha256`,
  );
  db.transaction(() => {
    statement.run(
      row.id,
      row.textId,
      row.filename,
      row.url ?? null,
      duration,
      json,
      row.isOfflineCached ? 1 : 0,
      row.accessRights ?? null,
      row.createdAt,
      row.timelineKind,
      row.byteLocation,
      row.availability,
      contentSize,
      row.contentSha256 ?? null,
    );
  })();
  let stored: MediaItemDocType | undefined;
  try {
    stored = readById(db, row.id);
  } catch {
    throw new StorageReadbackError(OPERATION);
  }
  if (stored === undefined || !sameMedia(stored, row)) throw new StorageReadbackError(OPERATION);
  return stored.id;
}
