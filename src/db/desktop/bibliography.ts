import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';

type SqliteDatabase = InstanceType<typeof Database>;

export type BibliographySourceType =
  'book' | 'article' | 'thesis' | 'fieldnotes' | 'grammar' | 'other';
export type BibliographyAccess = 'open' | 'restricted' | 'confidential';

export interface BibliographyFieldRevisions {
  title: number;
  authors: number;
  year: number;
  publisher: number;
  doi: number;
  url: number;
  citationKey: number;
  sourceType: number;
  notes: number;
  accessRights: number;
}

export interface BibliographyEntry {
  id: string;
  title: string;
  authors: string[] | null;
  year: number | null;
  publisher: string | null;
  doi: string | null;
  url: string | null;
  citationKey: string | null;
  sourceType: BibliographySourceType | null;
  notes: Record<string, string> | null;
  accessRights: BibliographyAccess | null;
  revisions: BibliographyFieldRevisions;
  createdAt: string;
  updatedAt: string;
}

interface BibliographyRow {
  id: string;
  title: string;
  authors_json: string | null;
  year: number | null;
  publisher: string | null;
  doi: string | null;
  url: string | null;
  citation_key: string | null;
  source_type: string | null;
  notes_json: string | null;
  access_rights: string | null;
  field_revisions_json: string;
  created_at: string;
  updated_at: string;
}

const COLUMNS = `id, title, authors_json, year, publisher, doi, url, citation_key, source_type,
  notes_json, access_rights, field_revisions_json, created_at, updated_at`;

const SOURCE_TYPES = ['book', 'article', 'thesis', 'fieldnotes', 'grammar', 'other'] as const;
const ACCESS = ['open', 'restricted', 'confidential'] as const;
const REVISION_KEYS = [
  'title',
  'authors',
  'year',
  'publisher',
  'doi',
  'url',
  'citationKey',
  'sourceType',
  'notes',
  'accessRights',
] as const satisfies readonly (keyof BibliographyFieldRevisions)[];

export function createBibliographyEntry(db: SqliteDatabase, title: string): BibliographyEntry {
  const id = randomUUID();
  const now = new Date().toISOString();
  db.prepare(
    'INSERT INTO bibliography (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)',
  ).run(id, title, now, now);
  const entry = getBibliographyEntry(db, id);
  if (!entry) throw new Error('bibliography readback failed');
  return entry;
}

export function getBibliographyEntry(db: SqliteDatabase, id: string): BibliographyEntry | null {
  const row = db.prepare(`SELECT ${COLUMNS} FROM bibliography WHERE id = ?`).get(id) as
    BibliographyRow | undefined;
  if (!row) return null;
  return {
    id: row.id,
    title: row.title,
    authors: authorsOf(row.authors_json),
    year: row.year,
    publisher: row.publisher,
    doi: row.doi,
    url: row.url,
    citationKey: row.citation_key,
    sourceType: enumOf(row.source_type, SOURCE_TYPES, 'bibliography source type is invalid'),
    notes: notesOf(row.notes_json),
    accessRights: enumOf(row.access_rights, ACCESS, 'bibliography access is invalid'),
    revisions: revisionsOf(row.field_revisions_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function authorsOf(json: string | null): string[] | null {
  if (json === null) return null;
  const parsed: unknown = JSON.parse(json);
  if (
    !Array.isArray(parsed) ||
    parsed.some((item) => typeof item !== 'string' || item.length === 0)
  ) {
    throw new Error('bibliography authors are invalid');
  }
  return parsed as string[];
}

function notesOf(json: string | null): Record<string, string> | null {
  if (json === null) return null;
  const parsed: unknown = JSON.parse(json);
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('bibliography notes are invalid');
  }
  const notes: Record<string, string> = {};
  for (const [key, value] of Object.entries(parsed)) {
    if (key.length === 0 || typeof value !== 'string')
      throw new Error('bibliography notes are invalid');
    notes[key] = value;
  }
  return notes;
}

function enumOf<T extends string>(
  value: string | null,
  allowed: readonly T[],
  error: string,
): T | null {
  if (value === null) return null;
  if ((allowed as readonly string[]).includes(value)) return value as T;
  throw new Error(error);
}

function revisionsOf(json: string): BibliographyFieldRevisions {
  const parsed: unknown = JSON.parse(json);
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('bibliography revisions are invalid');
  }
  const record = parsed as Record<string, unknown>;
  const revisions = {} as BibliographyFieldRevisions;
  for (const key of REVISION_KEYS) {
    const value = record[key];
    if (typeof value !== 'number') throw new Error('bibliography revisions are invalid');
    revisions[key] = value;
  }
  return revisions;
}
