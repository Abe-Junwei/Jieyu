/**
 * 来源记录写在项目库里（ADR-0074）。
 * 登记、改名和改关联各是一次事务，提交后再读回。读回失败不撤销。
 * 这一刀不保存原件字节，也不建录音表。
 */
import Database from 'better-sqlite3';
import { newCatalogUuid } from '../services/projectCatalogScope';
import {
  planSourceImport,
  SourceMediaLinkError,
  SourceProjectNotFoundError,
  type SourceImportPlan,
} from '../services/sourceRecordPlan';
import type { SourceRecordRegistration } from './storagePortSourceRecords';
import { StorageReadbackError } from './storageReadbackError';
import type { SourceRecordDocType } from './types';

type SqliteDatabase = InstanceType<typeof Database>;

const REGISTER = 'registerImportedSource';
const COLUMNS =
  'id, text_id, original_name, display_name, format, byte_size, sha256, external_doc_id, imported_at, import_batch_id, stored_bytes, media_id, linked_media_filename, updated_at';

function field(value: unknown, key: string): unknown {
  if (typeof value !== 'object' || value === null) return undefined;
  return (value as Record<string, unknown>)[key];
}

function filled(value: string | undefined): value is string {
  return value !== undefined && value.length > 0;
}

function requiredText(value: unknown): string {
  if (typeof value !== 'string') throw new Error('source record row is incomplete');
  return value;
}

function optionalText(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value !== 'string') throw new Error('source record row is incomplete');
  return value;
}

function optionalNumber(value: unknown): number | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error('source record row is incomplete');
  }
  return value;
}

function storedBytes(value: unknown): boolean {
  if (value === 0) return false;
  if (value === 1) return true;
  throw new Error('source record row is incomplete');
}

function readDoc(value: unknown): SourceRecordDocType {
  const byteSize = optionalNumber(field(value, 'byte_size'));
  const sha256 = optionalText(field(value, 'sha256'));
  const externalDocId = optionalText(field(value, 'external_doc_id'));
  const mediaId = optionalText(field(value, 'media_id'));
  const linkedMediaFilename = optionalText(field(value, 'linked_media_filename'));
  const doc: SourceRecordDocType = {
    id: requiredText(field(value, 'id')),
    textId: requiredText(field(value, 'text_id')),
    originalName: requiredText(field(value, 'original_name')),
    displayName: requiredText(field(value, 'display_name')),
    format: requiredText(field(value, 'format')),
    importedAt: requiredText(field(value, 'imported_at')),
    importBatchId: requiredText(field(value, 'import_batch_id')),
    storedBytes: storedBytes(field(value, 'stored_bytes')),
    updatedAt: requiredText(field(value, 'updated_at')),
  };
  if (byteSize !== undefined) doc.byteSize = byteSize;
  if (sha256 !== undefined) doc.sha256 = sha256;
  if (externalDocId !== undefined) doc.externalDocId = externalDocId;
  if (mediaId !== undefined) doc.mediaId = mediaId;
  if (linkedMediaFilename !== undefined) doc.linkedMediaFilename = linkedMediaFilename;
  return doc;
}

const COMPARED_KEYS = [
  'id',
  'textId',
  'originalName',
  'displayName',
  'format',
  'byteSize',
  'sha256',
  'externalDocId',
  'importedAt',
  'importBatchId',
  'storedBytes',
  'mediaId',
  'linkedMediaFilename',
  'updatedAt',
] as const;

function sameRecord(stored: SourceRecordDocType, written: SourceRecordDocType): boolean {
  return COMPARED_KEYS.every((key) => stored[key] === written[key]);
}

function valuesOf(doc: SourceRecordDocType): unknown[] {
  return [
    doc.id,
    doc.textId,
    doc.originalName,
    doc.displayName,
    doc.format,
    doc.byteSize ?? null,
    doc.sha256 ?? null,
    doc.externalDocId ?? null,
    doc.importedAt,
    doc.importBatchId,
    doc.storedBytes ? 1 : 0,
    doc.mediaId ?? null,
    doc.linkedMediaFilename ?? null,
    doc.updatedAt,
  ];
}

function projectExists(db: SqliteDatabase, textId: string): boolean {
  return db.prepare('SELECT id FROM project WHERE id = ?').get(textId) !== undefined;
}

function rowsForProject(db: SqliteDatabase, textId: string): SourceRecordDocType[] {
  return db
    .prepare(`SELECT ${COLUMNS} FROM source_records WHERE text_id = ? ORDER BY id`)
    .all(textId)
    .map((row) => readDoc(row));
}

function readById(db: SqliteDatabase, id: string): SourceRecordDocType | undefined {
  const row: unknown = db.prepare(`SELECT ${COLUMNS} FROM source_records WHERE id = ?`).get(id);
  if (row === undefined) return undefined;
  return readDoc(row);
}

function refuseMissingMedia(mediaId: string | undefined): void {
  if (!filled(mediaId)) return;
  throw new SourceMediaLinkError('media-missing', mediaId);
}

function readBack(
  db: SqliteDatabase,
  written: SourceRecordDocType,
  operation: string,
): SourceRecordDocType {
  let stored: SourceRecordDocType;
  try {
    const row = readById(db, written.id);
    if (row === undefined) throw new Error('source record row is incomplete');
    stored = row;
  } catch (error) {
    if (error instanceof StorageReadbackError) throw error;
    throw new StorageReadbackError(operation);
  }
  if (!sameRecord(stored, written)) throw new StorageReadbackError(operation);
  return stored;
}

function insertRecord(db: SqliteDatabase, doc: SourceRecordDocType): void {
  db.prepare(
    `INSERT INTO source_records (
       id, text_id, original_name, display_name, format, byte_size, sha256, external_doc_id,
       imported_at, import_batch_id, stored_bytes, media_id, linked_media_filename, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(...valuesOf(doc));
}

function updateRecord(db: SqliteDatabase, doc: SourceRecordDocType): void {
  const values = valuesOf(doc);
  db.prepare(
    `UPDATE source_records SET
       original_name = ?, display_name = ?, format = ?, byte_size = ?, sha256 = ?,
       external_doc_id = ?, imported_at = ?, import_batch_id = ?, stored_bytes = ?,
       media_id = ?, linked_media_filename = ?, updated_at = ?
     WHERE id = ? AND text_id = ?`,
  ).run(...values.slice(2), doc.id, doc.textId);
}

function recordForPlan(
  input: SourceRecordRegistration,
  plan: Exclude<SourceImportPlan, { kind: 'same-content' }>,
  now: string,
): SourceRecordDocType {
  if (plan.kind === 'update-existing') {
    return {
      ...plan.record,
      originalName: input.originalName,
      format: input.format,
      importedAt: now,
      importBatchId: input.importBatchId,
      updatedAt: now,
      ...(filled(input.sha256) ? { sha256: input.sha256 } : {}),
      ...(input.byteSize !== undefined ? { byteSize: input.byteSize } : {}),
      ...(filled(input.mediaId) ? { mediaId: input.mediaId } : {}),
      ...(filled(input.linkedMediaFilename)
        ? { linkedMediaFilename: input.linkedMediaFilename }
        : {}),
    };
  }
  return {
    id: newCatalogUuid(),
    textId: input.textId,
    originalName: input.originalName,
    displayName: plan.displayName,
    format: input.format,
    importedAt: now,
    importBatchId: input.importBatchId,
    storedBytes: false,
    updatedAt: now,
    ...(input.byteSize !== undefined ? { byteSize: input.byteSize } : {}),
    ...(filled(input.sha256) ? { sha256: input.sha256 } : {}),
    ...(filled(input.externalDocId) ? { externalDocId: input.externalDocId } : {}),
    ...(filled(input.mediaId) ? { mediaId: input.mediaId } : {}),
    ...(filled(input.linkedMediaFilename)
      ? { linkedMediaFilename: input.linkedMediaFilename }
      : {}),
  };
}

export function listSourceRecordsInProject(
  db: SqliteDatabase,
  textId: string,
): SourceRecordDocType[] {
  const projectId = textId.trim();
  if (projectId.length === 0) return [];
  return rowsForProject(db, projectId);
}

export function registerImportedSourceInProject(
  db: SqliteDatabase,
  input: SourceRecordRegistration,
): { plan: SourceImportPlan; record: SourceRecordDocType } {
  if (!projectExists(db, input.textId)) throw new SourceProjectNotFoundError(input.textId);
  refuseMissingMedia(input.mediaId);
  const existing = rowsForProject(db, input.textId);
  const plan = planSourceImport(
    {
      textId: input.textId,
      originalName: input.originalName,
      format: input.format,
      ...(filled(input.sha256) ? { sha256: input.sha256 } : {}),
      ...(filled(input.externalDocId) ? { externalDocId: input.externalDocId } : {}),
    },
    existing,
  );
  if (plan.kind === 'same-content') {
    const stored = readById(db, plan.record.id);
    if (
      stored === undefined ||
      stored.textId !== input.textId ||
      stored.sha256 !== plan.record.sha256
    ) {
      throw new StorageReadbackError(REGISTER);
    }
    return { plan, record: stored };
  }
  const written = recordForPlan(input, plan, new Date().toISOString());
  const commit = db.transaction(() => {
    if (plan.kind === 'new') insertRecord(db, written);
    else updateRecord(db, written);
  });
  commit();
  return { plan, record: readBack(db, written, REGISTER) };
}

export function renameSourceRecordInProject(
  db: SqliteDatabase,
  textId: string,
  recordId: string,
  displayName: string,
): SourceRecordDocType | undefined {
  const trimmed = displayName.trim();
  if (trimmed.length === 0) return undefined;
  const row = readById(db, recordId);
  if (row === undefined || row.textId !== textId) return undefined;
  const written = { ...row, displayName: trimmed, updatedAt: new Date().toISOString() };
  db.transaction(() => {
    updateRecord(db, written);
  })();
  return readBack(db, written, 'renameSourceRecord');
}

export function linkSourceRecordMediaInProject(
  db: SqliteDatabase,
  textId: string,
  recordId: string,
  mediaId: string | null,
): SourceRecordDocType | undefined {
  const target = mediaId?.trim() ?? '';
  const row = readById(db, recordId);
  if (row === undefined || row.textId !== textId) return undefined;
  if (target.length > 0) throw new SourceMediaLinkError('media-missing', target);
  const { mediaId: _previous, ...rest } = row;
  const written: SourceRecordDocType = { ...rest, updatedAt: new Date().toISOString() };
  db.transaction(() => {
    updateRecord(db, written);
  })();
  return readBack(db, written, 'linkSourceRecordMedia');
}
