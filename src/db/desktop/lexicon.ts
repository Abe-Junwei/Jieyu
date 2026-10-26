import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import { parseStoredDmlexEntry, parseStoredJieyuLexeme } from '../dmlexEntrySchema';
import { withLexemeNestedIds } from '../dmlexNestedIds';
import {
  dropSenseFieldBag,
  lexemeExtensionForSave,
  splitLexemeExtension,
  writeRequiredFieldValues,
} from './customFields';

type SqliteDatabase = InstanceType<typeof Database>;

const ROLES = ['exact', 'stem', 'gloss_candidate', 'manual'] as const;
const ACCESS = ['open', 'restricted', 'confidential'] as const;

export interface LexemeLinkWrite {
  targetType: string;
  targetId: string;
  senseId: string;
  role?: string;
}

export interface LexemeSave {
  id?: string;
  entry: Record<string, unknown>;
  jieyu?: Record<string, unknown>;
  tags?: Record<string, boolean>;
  accessRights?: string;
  link?: LexemeLinkWrite;
  fieldValues?: Record<string, unknown>;
  senseFieldValues?: Record<string, Record<string, unknown>>;
}

export interface ProjectLexeme {
  id: string;
  entry: Record<string, unknown>;
  jieyu: Record<string, unknown>;
  tags: Record<string, boolean>;
  accessRights: string | null;
}

export interface ProjectLexemeLink {
  id: string;
  targetType: string;
  targetId: string;
  lexemeId: string;
  senseId: string;
  role: string | null;
}

interface PreparedEntry {
  id: string;
  entry: Record<string, unknown>;
  jieyu: Record<string, unknown>;
  tags: Record<string, boolean>;
  accessRights: string | null;
  senseIds: string[];
  link?: LexemeLinkWrite;
}

interface StoredRow {
  id: string;
  kind: string;
  entry_json: string;
  jieyu_json: string;
}

export function saveLexemeEntry(db: SqliteDatabase, input: LexemeSave): ProjectLexeme {
  const prepared = prepareEntry(input);
  const write = db.transaction(() => {
    const existing = readRow(db, prepared.id);
    if (existing !== undefined && existing.kind !== 'entry') {
      throw new Error('lexeme kind conflicts');
    }
    if (existing !== undefined) assertRemovedSensesFree(db, existing, prepared);
    upsertEntry(db, prepared, existing !== undefined);
    if (existing === undefined) {
      writeRequiredFieldValues(db, 'lexeme', prepared.id, input.fieldValues);
      for (const senseId of prepared.senseIds) {
        writeRequiredFieldValues(
          db,
          'lexeme-sense',
          senseId,
          input.senseFieldValues?.[senseId],
          prepared.id,
        );
      }
    } else {
      const previous = senseIdsOf(JSON.parse(existing.entry_json) as Record<string, unknown>);
      for (const senseId of prepared.senseIds) {
        if (previous.includes(senseId)) continue;
        writeRequiredFieldValues(
          db,
          'lexeme-sense',
          senseId,
          input.senseFieldValues?.[senseId],
          prepared.id,
        );
      }
    }
    if (prepared.link !== undefined) {
      insertLink(db, prepared.id, prepared.link, prepared.senseIds);
    }
    const stored = getLexemeEntry(db, prepared.id);
    if (stored === null) throw new Error('lexeme readback failed');
    return stored;
  });
  return write();
}

export function getLexemeEntry(db: SqliteDatabase, id: string): ProjectLexeme | null {
  const row = db
    .prepare(
      `SELECT id, kind, entry_json, jieyu_json, tags_json, access_rights
       FROM lexemes WHERE id = ?`,
    )
    .get(id) as
    | {
        id: string;
        kind: string;
        entry_json: string | null;
        jieyu_json: string;
        tags_json: string;
        access_rights: string | null;
      }
    | undefined;
  if (row === undefined || row.kind !== 'entry' || row.entry_json === null) return null;
  return {
    id: row.id,
    entry: JSON.parse(row.entry_json) as Record<string, unknown>,
    jieyu: JSON.parse(row.jieyu_json) as Record<string, unknown>,
    tags: JSON.parse(row.tags_json) as Record<string, boolean>,
    accessRights: row.access_rights,
  };
}

export function linkSense(
  db: SqliteDatabase,
  input: LexemeLinkWrite & { lexemeId: string },
): ProjectLexemeLink {
  const lexemeId = requiredId(input.lexemeId, 'lexeme id');
  const write = db.transaction(() => {
    const entry = getLexemeEntry(db, lexemeId);
    if (entry === null) throw new Error('lexeme is missing');
    return insertLink(db, lexemeId, input, senseIdsOf(entry.entry));
  });
  return write();
}

export function removeSense(
  db: SqliteDatabase,
  input: { lexemeId: string; senseId: string },
): ProjectLexeme {
  const lexemeId = requiredId(input.lexemeId, 'lexeme id');
  const senseId = requiredId(input.senseId, 'sense id');
  const write = db.transaction(() => {
    const existing = readRow(db, lexemeId);
    if (existing === undefined || existing.kind !== 'entry') throw new Error('lexeme is missing');
    const entry = JSON.parse(existing.entry_json) as Record<string, unknown>;
    const senses = senseList(entry);
    if (!senses.some((sense) => sense.id === senseId)) throw new Error('sense is missing');
    assertSenseFree(db, lexemeId, senseId, existing.jieyu_json);
    const next = {
      ...entry,
      senses: senses.filter((sense) => sense.id !== senseId),
    };
    db.prepare('UPDATE lexemes SET entry_json = ?, updated_at = ? WHERE id = ?').run(
      JSON.stringify(next),
      new Date().toISOString(),
      lexemeId,
    );
    dropSenseFieldBag(db, lexemeId, senseId);
    const stored = getLexemeEntry(db, lexemeId);
    if (stored === null) throw new Error('lexeme readback failed');
    return stored;
  });
  return write();
}

function prepareEntry(input: LexemeSave): PreparedEntry {
  if (typeof input.entry !== 'object' || input.entry === null || Array.isArray(input.entry)) {
    throw new Error('lexeme entry is invalid');
  }
  const id = input.id === undefined ? randomUUID() : requiredId(input.id, 'lexeme id');
  const normalized = withLexemeNestedIds({ id, kind: 'entry' as const, entry: input.entry });
  const entry = parseStoredDmlexEntry(normalized.entry) as Record<string, unknown>;
  const jieyu =
    input.jieyu === undefined
      ? {}
      : (parseStoredJieyuLexeme(splitLexemeExtension(input.jieyu)) as Record<string, unknown>);
  const link = input.link === undefined ? undefined : normalizeLink(input.link);
  return {
    id,
    entry,
    jieyu,
    tags: tagMap(input.tags),
    accessRights: accessRights(input.accessRights),
    senseIds: senseIdsOf(entry),
    ...(link === undefined ? {} : { link }),
  };
}

function upsertEntry(db: SqliteDatabase, prepared: PreparedEntry, exists: boolean): void {
  const now = new Date().toISOString();
  const entryJson = JSON.stringify(prepared.entry);
  const existingJson = exists ? readRow(db, prepared.id)?.jieyu_json : undefined;
  const jieyuJson = JSON.stringify(
    lexemeExtensionForSave(existingJson, prepared.jieyu, prepared.senseIds),
  );
  const tagsJson = JSON.stringify(prepared.tags);
  if (exists) {
    db.prepare(
      `UPDATE lexemes
       SET entry_json = ?, jieyu_json = ?, tags_json = ?, access_rights = ?, updated_at = ?
       WHERE id = ?`,
    ).run(entryJson, jieyuJson, tagsJson, prepared.accessRights, now, prepared.id);
    return;
  }
  db.prepare(
    `INSERT INTO lexemes (
      id, kind, entry_json, jieyu_json, tags_json, access_rights, created_at, updated_at
    ) VALUES (?, 'entry', ?, ?, ?, ?, ?, ?)`,
  ).run(prepared.id, entryJson, jieyuJson, tagsJson, prepared.accessRights, now, now);
}

function insertLink(
  db: SqliteDatabase,
  lexemeId: string,
  link: LexemeLinkWrite,
  senseIds: string[],
): ProjectLexemeLink {
  const normalized = normalizeLink(link);
  if (!senseIds.includes(normalized.senseId)) throw new Error('sense is missing');
  assertTarget(db, normalized.targetType, normalized.targetId);
  const id = randomUUID();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO token_lexeme_links (
      id, target_type, target_id, lexeme_id, sense_id, role, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    normalized.targetType,
    normalized.targetId,
    lexemeId,
    normalized.senseId,
    normalized.role ?? null,
    now,
    now,
  );
  return {
    id,
    targetType: normalized.targetType,
    targetId: normalized.targetId,
    lexemeId,
    senseId: normalized.senseId,
    role: normalized.role ?? null,
  };
}

function assertRemovedSensesFree(
  db: SqliteDatabase,
  existing: StoredRow,
  prepared: PreparedEntry,
): void {
  const jieyuJson = JSON.stringify(prepared.jieyu);
  for (const senseId of senseIdsOf(JSON.parse(existing.entry_json) as Record<string, unknown>)) {
    if (prepared.senseIds.includes(senseId)) continue;
    assertSenseFree(db, existing.id, senseId, jieyuJson);
  }
}

function assertSenseFree(
  _db: SqliteDatabase,
  _lexemeId: string,
  senseId: string,
  jieyuJson: string,
): void {
  const jieyu = JSON.parse(jieyuJson) as {
    exampleRefs?: { senseId: string }[];
    occurrenceCitations?: { senseId: string }[];
  };
  const cited =
    jieyu.exampleRefs?.some((item) => item.senseId === senseId) === true ||
    jieyu.occurrenceCitations?.some((item) => item.senseId === senseId) === true;
  if (cited) throw new Error('sense is still referenced');
}

function assertTarget(db: SqliteDatabase, targetType: string, targetId: string): void {
  const table = targetType === 'token' ? 'tokens' : 'morphemes';
  const row = db.prepare(`SELECT id FROM ${table} WHERE id = ?`).get(targetId) as
    { id: string } | undefined;
  if (row === undefined) throw new Error('link target is missing');
}

function readRow(db: SqliteDatabase, id: string): StoredRow | undefined {
  return db.prepare('SELECT id, kind, entry_json, jieyu_json FROM lexemes WHERE id = ?').get(id) as
    StoredRow | undefined;
}

function senseList(entry: Record<string, unknown>): { id: string }[] {
  const senses = entry.senses;
  if (!Array.isArray(senses)) return [];
  return senses.filter(
    (sense): sense is { id: string } =>
      typeof sense === 'object' &&
      sense !== null &&
      typeof (sense as { id?: unknown }).id === 'string',
  );
}

function senseIdsOf(entry: Record<string, unknown>): string[] {
  return senseList(entry).map((sense) => sense.id);
}

function normalizeLink(link: LexemeLinkWrite): LexemeLinkWrite {
  const targetType = link.targetType;
  if (targetType !== 'token' && targetType !== 'morpheme') {
    throw new Error('link target is invalid');
  }
  const role = link.role;
  if (role !== undefined && !(ROLES as readonly string[]).includes(role)) {
    throw new Error('link role is invalid');
  }
  return {
    targetType,
    targetId: requiredId(link.targetId, 'link target'),
    senseId: requiredId(link.senseId, 'sense id'),
    ...(role === undefined ? {} : { role }),
  };
}

function tagMap(tags: Record<string, boolean> | undefined): Record<string, boolean> {
  if (tags === undefined) return {};
  for (const [key, value] of Object.entries(tags)) {
    if (key.length === 0 || typeof value !== 'boolean') throw new Error('lexeme tags are invalid');
  }
  return tags;
}

function accessRights(value: string | undefined): string | null {
  if (value === undefined) return null;
  if (!(ACCESS as readonly string[]).includes(value)) throw new Error('lexeme access is invalid');
  return value;
}

function requiredId(value: string, name: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) throw new Error(`${name} is empty`);
  return trimmed;
}
