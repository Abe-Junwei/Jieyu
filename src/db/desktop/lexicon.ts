import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import type { AnalysisGraphPayload } from '../../annotation/analysisGraphDomain';
import { readAnalysisMaterial } from './analysisCandidates';
import { writeGraph } from './analysisRestore';
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
  accessRights?: string | null;
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
  jieyuProvided: boolean;
  tagsProvided: boolean;
  accessProvided: boolean;
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
    if (existing !== undefined) {
      keepOmittedAttachments(db, existing, prepared);
      assertRemovedSensesFree(db, existing, prepared);
    }
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
      attachSense(db, prepared.id, prepared.link, prepared.senseIds);
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
    return attachSense(db, lexemeId, input, senseIdsOf(entry.entry));
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
  const ids = senseIdsOf(entry);
  if (new Set(ids).size !== ids.length) throw new Error('sense id is duplicated');
  const link = input.link === undefined ? undefined : normalizeLink(input.link);
  return {
    id,
    entry,
    jieyu,
    tags: input.tags === undefined ? {} : tagMap(input.tags),
    accessRights: input.accessRights === undefined ? null : accessRights(input.accessRights),
    senseIds: ids,
    jieyuProvided: input.jieyu !== undefined,
    tagsProvided: input.tags !== undefined,
    accessProvided: input.accessRights !== undefined,
    ...(link === undefined ? {} : { link }),
  };
}

function keepOmittedAttachments(
  db: SqliteDatabase,
  existing: StoredRow,
  prepared: PreparedEntry,
): void {
  if (!prepared.jieyuProvided)
    prepared.jieyu = JSON.parse(existing.jieyu_json) as Record<string, unknown>;
  if (prepared.tagsProvided && prepared.accessProvided) return;
  const row = db
    .prepare('SELECT tags_json, access_rights FROM lexemes WHERE id = ?')
    .get(existing.id) as { tags_json: string; access_rights: string | null };
  if (!prepared.tagsProvided) prepared.tags = JSON.parse(row.tags_json) as Record<string, boolean>;
  if (!prepared.accessProvided) prepared.accessRights = row.access_rights;
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

function attachSense(
  db: SqliteDatabase,
  lexemeId: string,
  link: LexemeLinkWrite,
  senseIds: string[],
): ProjectLexemeLink {
  const normalized = normalizeLink(link);
  if (!senseIds.includes(normalized.senseId)) throw new Error('sense is missing');
  const unitId = unitOfTarget(db, normalized.targetType, normalized.targetId);
  const material = readAnalysisMaterial(db, unitId);
  if (material.graph === null) throw new Error('analysis graph is missing');
  const graph = structuredClone(material.graph);
  const ref = lexemeRef(graph, lexemeId);
  const now = new Date().toISOString();
  const relationId = randomUUID();
  graph.relations.push({
    id: relationId,
    type: 'linksLexeme',
    sourceId: normalized.targetId,
    targetId: ref.id,
    link: {
      lexemeId,
      senseId: normalized.senseId,
      ...(normalized.role === undefined ? {} : { role: normalized.role }),
      createdAt: now,
      updatedAt: now,
    },
  });
  writeGraph(db, material, graph, false);
  const row = db
    .prepare(
      `SELECT id, target_type, target_id, lexeme_id, sense_id, role
       FROM token_lexeme_links WHERE id = ?`,
    )
    .get(relationId) as
    | {
        id: string;
        target_type: string;
        target_id: string;
        lexeme_id: string;
        sense_id: string;
        role: string | null;
      }
    | undefined;
  if (row === undefined) throw new Error('lexeme readback failed');
  return {
    id: row.id,
    targetType: row.target_type,
    targetId: row.target_id,
    lexemeId: row.lexeme_id,
    senseId: row.sense_id,
    role: row.role,
  };
}

function lexemeRef(graph: AnalysisGraphPayload, lexemeId: string): { id: string } {
  const existing = graph.nodes.find((node) => node.type === 'lexemeRef' && node.label === lexemeId);
  if (existing !== undefined) return existing;
  const created = { id: randomUUID(), type: 'lexemeRef' as const, label: lexemeId };
  graph.nodes.push(created);
  return created;
}

function unitOfTarget(db: SqliteDatabase, targetType: string, targetId: string): string {
  const row =
    targetType === 'token'
      ? (db.prepare('SELECT unit_id FROM tokens WHERE id = ?').get(targetId) as
          { unit_id: string } | undefined)
      : (db
          .prepare(
            `SELECT tokens.unit_id AS unit_id
             FROM morphemes JOIN tokens ON tokens.id = morphemes.token_id
             WHERE morphemes.id = ?`,
          )
          .get(targetId) as { unit_id: string } | undefined);
  if (row === undefined) throw new Error('link target is missing');
  return row.unit_id;
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

function normalizeLink(link: LexemeLinkWrite): {
  targetType: 'token' | 'morpheme';
  targetId: string;
  senseId: string;
  role?: (typeof ROLES)[number];
} {
  const targetType = link.targetType;
  if (targetType !== 'token' && targetType !== 'morpheme') {
    throw new Error('link target is invalid');
  }
  const role = link.role === undefined ? undefined : ROLES.find((item) => item === link.role);
  if (link.role !== undefined && role === undefined) throw new Error('link role is invalid');
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

function accessRights(value: string | null): string | null {
  if (value === null) return null;
  if (!(ACCESS as readonly string[]).includes(value)) throw new Error('lexeme access is invalid');
  return value;
}

function requiredId(value: string, name: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) throw new Error(`${name} is empty`);
  return trimmed;
}
