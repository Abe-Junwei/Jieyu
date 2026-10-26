import { createHash } from 'node:crypto';
import type Database from 'better-sqlite3';
import {
  getBibliographyEntry,
  type BibliographyAccess,
  type BibliographyEntry,
  type BibliographyFieldRevisions,
  type BibliographySourceType,
} from './bibliography';
import {
  diagnosticStoreFile,
  payloadHash,
  receiveDiagnostic,
  type DiagnosticReceipt,
} from './diagnosticDelivery';

type SqliteDatabase = InstanceType<typeof Database>;

// ponytail: fourth copy of the delivery helpers. Extract when one bug has to be fixed in more than one file.
export interface BibliographyReading extends BibliographyEntry {
  delivery: 'unchanged' | 'pending' | 'confirmed';
}

interface FieldPatch<T> {
  expectedRevision: number;
  value: T;
}

export interface BibliographyPatch {
  operationId: string;
  id: string;
  title?: FieldPatch<string>;
  authors?: FieldPatch<string[] | null>;
  year?: FieldPatch<number | null>;
  publisher?: FieldPatch<string | null>;
  doi?: FieldPatch<string | null>;
  url?: FieldPatch<string | null>;
  citationKey?: FieldPatch<string | null>;
  sourceType?: FieldPatch<BibliographySourceType | null>;
  notes?: FieldPatch<Record<string, string> | null>;
  accessRights?: FieldPatch<BibliographyAccess | null>;
}

interface DeliveryRow {
  origin_project_id: string;
  operation_id: string;
  event_seq: number;
  payload_hash: string;
  input_fingerprint: string;
  summary_json: string;
  status: 'pending' | 'confirmed';
}

export function patchBibliography(
  db: SqliteDatabase,
  input: BibliographyPatch,
): BibliographyReading {
  const applied = db.transaction(() => applyPatch(db, input))();
  if (applied.receipt === null) return applied.reading;
  return finishDelivery(db, applied.reading, applied.receipt, applied.reading.delivery);
}

export function redeliverBibliography(
  db: SqliteDatabase,
  operationId: string,
): BibliographyReading {
  const row = requireDelivery(db, operationId);
  const summary = JSON.parse(row.summary_json) as { bibliographyId?: unknown };
  if (typeof summary.bibliographyId !== 'string') throw new Error('diagnostic delivery is invalid');
  const entry = getBibliographyEntry(db, summary.bibliographyId);
  if (entry === null) throw new Error('bibliography entry is missing');
  return finishDelivery(
    db,
    { ...entry, delivery: row.status },
    {
      originProjectId: row.origin_project_id,
      operationId: row.operation_id,
      eventSeq: row.event_seq,
      payloadHash: row.payload_hash,
    },
    row.status,
  );
}

function finishDelivery(
  db: SqliteDatabase,
  reading: BibliographyReading,
  receipt: DiagnosticReceipt,
  current: BibliographyReading['delivery'] = 'pending',
): BibliographyReading {
  const file = diagnosticStoreFile();
  if (file === null) {
    return { ...reading, delivery: current === 'confirmed' ? 'confirmed' : 'pending' };
  }
  try {
    receiveDiagnostic(file, receipt);
  } catch (error) {
    if (error instanceof Error && error.message === 'diagnostic payload conflict') throw error;
    return { ...reading, delivery: 'pending' };
  }
  db.prepare(
    `UPDATE diagnostic_deliveries SET status = 'confirmed'
     WHERE origin_project_id = ? AND operation_id = ? AND event_seq = ?`,
  ).run(receipt.originProjectId, receipt.operationId, receipt.eventSeq);
  return { ...reading, delivery: 'confirmed' };
}

function applyPatch(
  db: SqliteDatabase,
  input: BibliographyPatch,
): { reading: BibliographyReading; receipt: DiagnosticReceipt | null } {
  const fingerprint = createHash('sha256').update(JSON.stringify(input)).digest('hex');
  const existing = findDelivery(db, input.operationId);
  if (existing !== null) {
    if (existing.input_fingerprint !== fingerprint) throw new Error('diagnostic delivery conflict');
    const summary = JSON.parse(existing.summary_json) as { bibliographyId?: unknown };
    if (typeof summary.bibliographyId !== 'string')
      throw new Error('diagnostic delivery is invalid');
    const entry = getBibliographyEntry(db, summary.bibliographyId);
    if (entry === null) throw new Error('bibliography entry is missing');
    return {
      reading: { ...entry, delivery: existing.status },
      receipt: {
        originProjectId: existing.origin_project_id,
        operationId: existing.operation_id,
        eventSeq: existing.event_seq,
        payloadHash: existing.payload_hash,
      },
    };
  }
  const current = getBibliographyEntry(db, input.id);
  if (current === null) throw new Error('bibliography entry is missing');
  const title = take(input.title, current.revisions.title, current.title, 'title');
  const authors = take(input.authors, current.revisions.authors, current.authors, 'authors');
  const year = take(input.year, current.revisions.year, current.year, 'year');
  const publisher = take(
    input.publisher,
    current.revisions.publisher,
    current.publisher,
    'publisher',
  );
  const doi = take(input.doi, current.revisions.doi, current.doi, 'doi');
  const url = take(input.url, current.revisions.url, current.url, 'url');
  const citationKey = take(
    input.citationKey,
    current.revisions.citationKey,
    current.citationKey,
    'citationKey',
  );
  const sourceType = take(
    input.sourceType,
    current.revisions.sourceType,
    current.sourceType,
    'sourceType',
  );
  const notes = take(input.notes, current.revisions.notes, current.notes, 'notes');
  const accessRights = take(
    input.accessRights,
    current.revisions.accessRights,
    current.accessRights,
    'accessRights',
  );
  const revisions: BibliographyFieldRevisions = {
    title: title.revision,
    authors: authors.revision,
    year: year.revision,
    publisher: publisher.revision,
    doi: doi.revision,
    url: url.revision,
    citationKey: citationKey.revision,
    sourceType: sourceType.revision,
    notes: notes.revision,
    accessRights: accessRights.revision,
  };
  const changed = (
    [
      ['title', title.changed],
      ['authors', authors.changed],
      ['year', year.changed],
      ['publisher', publisher.changed],
      ['doi', doi.changed],
      ['url', url.changed],
      ['citationKey', citationKey.changed],
      ['sourceType', sourceType.changed],
      ['notes', notes.changed],
      ['accessRights', accessRights.changed],
    ] as const
  )
    .filter((entry) => entry[1])
    .map((entry) => entry[0]);
  if (changed.length === 0)
    return { reading: { ...current, delivery: 'unchanged' }, receipt: null };
  db.prepare(
    `UPDATE bibliography
     SET title = ?, authors_json = ?, year = ?, publisher = ?, doi = ?, url = ?, citation_key = ?,
         source_type = ?, notes_json = ?, access_rights = ?, field_revisions_json = ?, updated_at = ?
     WHERE id = ?`,
  ).run(
    title.value,
    authors.value === null ? null : JSON.stringify(authors.value),
    year.value,
    publisher.value,
    doi.value,
    url.value,
    citationKey.value,
    sourceType.value,
    notes.value === null ? null : JSON.stringify(notes.value),
    accessRights.value,
    JSON.stringify(revisions),
    new Date().toISOString(),
    current.id,
  );
  const summary = { bibliographyId: current.id, fields: changed, revisions };
  const hash = payloadHash(summary);
  const origin = originProjectId(db);
  db.prepare(
    `INSERT INTO diagnostic_deliveries (
       origin_project_id, operation_id, event_seq, payload_hash, input_fingerprint, summary_json, status
     ) VALUES (?, ?, 0, ?, ?, ?, 'pending')`,
  ).run(origin, input.operationId, hash, fingerprint, JSON.stringify(summary));
  const stored = getBibliographyEntry(db, current.id);
  if (stored === null) throw new Error('bibliography readback failed');
  return {
    reading: { ...stored, delivery: 'pending' },
    receipt: {
      originProjectId: origin,
      operationId: input.operationId,
      eventSeq: 0,
      payloadHash: hash,
    },
  };
}

function take<T>(
  patch: FieldPatch<T> | undefined,
  revision: number,
  value: T,
  name: string,
): { value: T; revision: number; changed: boolean } {
  if (patch === undefined) return { value, revision, changed: false };
  if (patch.expectedRevision !== revision) throw new Error(`bibliography field conflict: ${name}`);
  if (JSON.stringify(patch.value) === JSON.stringify(value))
    return { value, revision, changed: false };
  return { value: patch.value, revision: revision + 1, changed: true };
}

function originProjectId(db: SqliteDatabase): string {
  const rows = db.prepare('SELECT id FROM project').all() as { id: string }[];
  const only = rows[0];
  if (rows.length !== 1 || only === undefined) throw new Error('project is missing');
  return only.id;
}

function requireDelivery(db: SqliteDatabase, operationId: string): DeliveryRow {
  const row = findDelivery(db, operationId);
  if (row === null) throw new Error('diagnostic delivery is missing');
  return row;
}

function findDelivery(db: SqliteDatabase, operationId: string): DeliveryRow | null {
  const rows = db
    .prepare('SELECT * FROM diagnostic_deliveries WHERE operation_id = ?')
    .all(operationId) as DeliveryRow[];
  const row = rows[0];
  if (row === undefined) return null;
  if (rows.length !== 1) throw new Error('diagnostic delivery is invalid');
  return row;
}
