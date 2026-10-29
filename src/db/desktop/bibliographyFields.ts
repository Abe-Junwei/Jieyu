import { createHash } from 'node:crypto';
import type Database from 'better-sqlite3';
import {
  getBibliographyEntry,
  type BibliographyAccess,
  type BibliographyEntry,
  type BibliographyFieldRevisions,
  type BibliographySourceType,
} from './bibliography';
import type { DiagnosticReceipt } from './diagnosticDelivery';
import {
  finishFieldDelivery,
  recordPendingDelivery,
  replayDelivery,
  resumeDelivery,
} from './fieldDelivery';

type SqliteDatabase = InstanceType<typeof Database>;

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

export function patchBibliography(
  db: SqliteDatabase,
  input: BibliographyPatch,
): BibliographyReading {
  const applied = db.transaction(() => applyPatch(db, input))();
  if (applied.receipt === null) return applied.reading;
  return finishFieldDelivery(db, applied.reading, applied.receipt, applied.reading.delivery);
}

export function redeliverBibliography(
  db: SqliteDatabase,
  operationId: string,
): BibliographyReading {
  return resumeDelivery(db, operationId, (summary) => bibliographyReading(db, summary));
}

function applyPatch(
  db: SqliteDatabase,
  input: BibliographyPatch,
): { reading: BibliographyReading; receipt: DiagnosticReceipt | null } {
  const fingerprint = createHash('sha256').update(JSON.stringify(input)).digest('hex');
  const replay = replayDelivery(db, input.operationId, fingerprint, (summary) =>
    bibliographyReading(db, summary),
  );
  if (replay !== null) {
    return {
      reading: { ...replay.reading, delivery: replay.status },
      receipt: replay.receipt,
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
  const receipt = recordPendingDelivery(db, {
    operationId: input.operationId,
    fingerprint,
    summary,
  });
  const stored = getBibliographyEntry(db, current.id);
  if (stored === null) throw new Error('bibliography readback failed');
  return { reading: { ...stored, delivery: 'pending' }, receipt };
}

function bibliographyReading(db: SqliteDatabase, summary: unknown): BibliographyEntry {
  const record = summary as { bibliographyId?: unknown };
  if (typeof record.bibliographyId !== 'string') throw new Error('diagnostic delivery is invalid');
  const entry = getBibliographyEntry(db, record.bibliographyId);
  if (entry === null) throw new Error('bibliography entry is missing');
  return entry;
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
