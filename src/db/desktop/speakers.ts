import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import { writeRequiredFieldValues } from './customFields';

type SqliteDatabase = InstanceType<typeof Database>;

export type SpeakerRole = 'speaker' | 'translator' | 'annotator' | 'researcher';
export type SpeakerConsent = 'granted' | 'restricted' | 'anonymous';
export type SpeakerAccess = 'open' | 'restricted' | 'confidential';

export interface SpeakerFieldRevisions {
  name: number;
  pseudonym: number;
  gender: number;
  birthYear: number;
  languageIds: number;
  dialect: number;
  accent: number;
  role: number;
  consentStatus: number;
  accessRights: number;
  address: number;
  notes: number;
}

export interface Speaker {
  id: string;
  name: string;
  pseudonym: string | null;
  gender: string | null;
  birthYear: number | null;
  languageIds: string[] | null;
  dialect: string | null;
  accent: string | null;
  role: SpeakerRole | null;
  consentStatus: SpeakerConsent | null;
  accessRights: SpeakerAccess | null;
  address: string | null;
  notes: Record<string, string> | null;
  revisions: SpeakerFieldRevisions;
  createdAt: string;
  updatedAt: string;
}

export interface SpeakerCreate {
  name: string;
  fieldValues?: Record<string, unknown>;
}

interface SpeakerRow {
  id: string;
  name: string;
  pseudonym: string | null;
  gender: string | null;
  birth_year: number | null;
  language_ids_json: string | null;
  dialect: string | null;
  accent: string | null;
  role: string | null;
  consent_status: string | null;
  access_rights: string | null;
  address: string | null;
  notes_json: string | null;
  field_revisions_json: string;
  created_at: string;
  updated_at: string;
}

const SPEAKER_COLUMNS = `id, name, pseudonym, gender, birth_year, language_ids_json, dialect, accent,
  role, consent_status, access_rights, address, notes_json, field_revisions_json, created_at, updated_at`;

export function createSpeaker(db: SqliteDatabase, input: SpeakerCreate): Speaker {
  const id = randomUUID();
  const now = new Date().toISOString();
  const write = db.transaction(() => {
    db.prepare('INSERT INTO speakers (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)').run(
      id,
      input.name,
      now,
      now,
    );
    writeRequiredFieldValues(db, 'speaker', id, input.fieldValues);
    const speaker = getSpeaker(db, id);
    if (!speaker) throw new Error('speaker readback failed');
    return speaker;
  });
  return write();
}

export function listSpeakers(db: SqliteDatabase): Speaker[] {
  const rows = db.prepare('SELECT id FROM speakers ORDER BY name, id').all() as { id: string }[];
  return rows.map((row) => {
    const speaker = getSpeaker(db, row.id);
    if (!speaker) throw new Error('speaker readback failed');
    return speaker;
  });
}

export function getSpeaker(db: SqliteDatabase, id: string): Speaker | null {
  const row = db.prepare(`SELECT ${SPEAKER_COLUMNS} FROM speakers WHERE id = ?`).get(id) as
    SpeakerRow | undefined;
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    pseudonym: row.pseudonym,
    gender: row.gender,
    birthYear: row.birth_year,
    languageIds: languageIdsOf(row.language_ids_json),
    dialect: row.dialect,
    accent: row.accent,
    role: enumOf(row.role, ROLES, 'speaker role is invalid'),
    consentStatus: enumOf(row.consent_status, CONSENTS, 'speaker consent is invalid'),
    accessRights: enumOf(row.access_rights, ACCESS, 'speaker access is invalid'),
    address: row.address,
    notes: notesOf(row.notes_json),
    revisions: revisionsOf(row.field_revisions_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const ROLES = ['speaker', 'translator', 'annotator', 'researcher'] as const;
const CONSENTS = ['granted', 'restricted', 'anonymous'] as const;
const ACCESS = ['open', 'restricted', 'confidential'] as const;

function enumOf<T extends string>(
  value: string | null,
  allowed: readonly T[],
  error: string,
): T | null {
  if (value === null) return null;
  if ((allowed as readonly string[]).includes(value)) return value as T;
  throw new Error(error);
}

export function languageIdsOf(json: string | null): string[] | null {
  if (json === null) return null;
  const parsed: unknown = JSON.parse(json);
  if (
    !Array.isArray(parsed) ||
    parsed.some((item) => typeof item !== 'string' || item.length === 0)
  ) {
    throw new Error('speaker language ids are invalid');
  }
  return parsed as string[];
}

export function notesOf(json: string | null): Record<string, string> | null {
  if (json === null) return null;
  const parsed: unknown = JSON.parse(json);
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('speaker notes are invalid');
  }
  const notes: Record<string, string> = {};
  for (const [key, value] of Object.entries(parsed)) {
    if (key.length === 0 || typeof value !== 'string') throw new Error('speaker notes are invalid');
    notes[key] = value;
  }
  return notes;
}

export function revisionsOf(json: string): SpeakerFieldRevisions {
  const parsed: unknown = JSON.parse(json);
  if (typeof parsed !== 'object' || parsed === null)
    throw new Error('speaker revisions are invalid');
  const record = parsed as Record<string, unknown>;
  const revisions = {} as SpeakerFieldRevisions;
  for (const key of REVISION_KEYS) {
    const value = record[key];
    if (typeof value !== 'number') throw new Error('speaker revisions are invalid');
    revisions[key] = value;
  }
  return revisions;
}

const REVISION_KEYS = [
  'name',
  'pseudonym',
  'gender',
  'birthYear',
  'languageIds',
  'dialect',
  'accent',
  'role',
  'consentStatus',
  'accessRights',
  'address',
  'notes',
] as const satisfies readonly (keyof SpeakerFieldRevisions)[];
