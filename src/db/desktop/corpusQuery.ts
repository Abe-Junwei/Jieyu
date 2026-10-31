import type Database from 'better-sqlite3';
import { classifyLexemeReference } from './referenceState';

type SqliteDatabase = InstanceType<typeof Database>;

export interface CorpusQueryCursor {
  manuscriptId: string;
  layerId: string;
  startTime: number;
  unitId: string;
}

export interface CorpusQueryHit {
  kind: 'token' | 'morpheme';
  id: string;
  form: Record<string, string>;
  gloss: Record<string, string>;
  pos: string | null;
  lexemeId?: string;
  senseId?: string;
}

export interface CorpusTextSpan {
  start: number;
  end: number;
}

export interface CorpusQueryItem {
  manuscriptId: string;
  layerId: string;
  unitId: string;
  startTime: number;
  endTime: number;
  text: string;
  textSpans: CorpusTextSpan[];
  hits: CorpusQueryHit[];
}

export interface CorpusQuery {
  manuscriptId: string | null;
  text: string | null;
  form: string | null;
  gloss: string | null;
  pos: string | null;
  lexemeId: string | null;
  senseId: string | null;
  limit: number;
  cursor: CorpusQueryCursor | null;
}

export interface CorpusQueryPage {
  items: CorpusQueryItem[];
  hasMore: boolean;
}

interface ObjectRow {
  kind: string;
  id: string;
  unit_id: string;
  form_json: string;
  gloss_json: string;
  pos: string | null;
  token_index: number;
  morpheme_index: number;
}

interface LinkRow {
  id: string;
  target_type: string;
  target_id: string;
  lexeme_id: string;
  sense_id: string;
}

interface UnitRow {
  manuscript_id: string;
  layer_id: string;
  unit_id: string;
  start_time: number;
  end_time: number;
  text: string;
}

export function queryCorpus(db: SqliteDatabase, input: CorpusQuery): CorpusQueryPage {
  const manuscriptId = absent(input.manuscriptId);
  const text = absent(input.text);
  const form = absent(input.form);
  const gloss = absent(input.gloss);
  const pos = absent(input.pos);
  const lexemeId = absent(input.lexemeId);
  const senseId = absent(input.senseId);
  if ((lexemeId === null) !== (senseId === null)) {
    throw new Error('sense query needs lexemeId and senseId');
  }
  if (!Number.isInteger(input.limit) || input.limit < 1) {
    throw new Error('corpus query limit must be a positive integer');
  }
  const tokenFilter = form !== null || gloss !== null || pos !== null || lexemeId !== null;
  const hitsByUnit = tokenFilter
    ? matchHits(db, { manuscriptId, form, gloss, pos, lexemeId, senseId })
    : null;
  if (hitsByUnit !== null && hitsByUnit.size === 0) return { items: [], hasMore: false };
  const rows = selectUnits(db, {
    manuscriptId,
    text,
    unitIds: hitsByUnit === null ? null : [...hitsByUnit.keys()],
    cursor: input.cursor,
    limit: input.limit + 1,
  });
  const hasMore = rows.length > input.limit;
  return {
    items: rows.slice(0, input.limit).map((row) => ({
      manuscriptId: row.manuscript_id,
      layerId: row.layer_id,
      unitId: row.unit_id,
      startTime: row.start_time,
      endTime: row.end_time,
      text: row.text,
      textSpans: spansIn(row.text, text),
      hits: hitsByUnit?.get(row.unit_id) ?? [],
    })),
    hasMore,
  };
}

function absent(value: string | null): string | null {
  if (value === null || value.trim().length === 0) return null;
  return value;
}

function matchHits(
  db: SqliteDatabase,
  filter: {
    manuscriptId: string | null;
    form: string | null;
    gloss: string | null;
    pos: string | null;
    lexemeId: string | null;
    senseId: string | null;
  },
): Map<string, CorpusQueryHit[]> {
  const valid = new Map<string, boolean>();
  const pairOk = (lexeme: string, sense: string) => {
    const key = `${lexeme}\0${sense}`;
    const cached = valid.get(key);
    if (cached !== undefined) return cached;
    const ok = classifyLexemeReference(db, lexeme, sense).linkState === 'active';
    valid.set(key, ok);
    return ok;
  };
  if (
    filter.lexemeId !== null &&
    filter.senseId !== null &&
    !pairOk(filter.lexemeId, filter.senseId)
  ) {
    return new Map();
  }
  const objects = db
    .prepare(
      `SELECT 'token' AS kind, tokens.id AS id, tokens.unit_id AS unit_id,
              tokens.form_json AS form_json, tokens.gloss_json AS gloss_json, tokens.pos AS pos,
              tokens.token_index AS token_index, -1 AS morpheme_index
       FROM tokens
       JOIN units ON units.id = tokens.unit_id
       JOIN layers ON layers.id = units.layer_id
       JOIN manuscripts ON manuscripts.id = layers.manuscript_id
       WHERE manuscripts.deleted_at IS NULL
         AND (? IS NULL OR manuscripts.id = ?)
         AND (? IS NULL OR tokens.pos = ?)
       UNION ALL
       SELECT 'morpheme', morphemes.id, tokens.unit_id,
              morphemes.form_json, morphemes.gloss_json, morphemes.pos,
              tokens.token_index, morphemes.morpheme_index
       FROM morphemes
       JOIN tokens ON tokens.id = morphemes.token_id
       JOIN units ON units.id = tokens.unit_id
       JOIN layers ON layers.id = units.layer_id
       JOIN manuscripts ON manuscripts.id = layers.manuscript_id
       WHERE manuscripts.deleted_at IS NULL
         AND (? IS NULL OR manuscripts.id = ?)
         AND (? IS NULL OR morphemes.pos = ?)`,
    )
    .all(
      filter.manuscriptId,
      filter.manuscriptId,
      filter.pos,
      filter.pos,
      filter.manuscriptId,
      filter.manuscriptId,
      filter.pos,
      filter.pos,
    ) as ObjectRow[];
  if (objects.length === 0) return new Map();
  // ponytail: one valid pair per hit, lowest link id. The writer keeps a single active linksLexeme.
  // ponytail: scans tokens and morphemes in scope. Index gloss values if a project is slow.
  const links = new Map<string, LinkRow[]>();
  const linkSql =
    filter.lexemeId === null
      ? `SELECT id, target_type, target_id, lexeme_id, sense_id
         FROM token_lexeme_links
         WHERE attachment = 'active' AND sense_id IS NOT NULL
         ORDER BY id`
      : `SELECT id, target_type, target_id, lexeme_id, sense_id
         FROM token_lexeme_links
         WHERE attachment = 'active' AND sense_id IS NOT NULL
           AND lexeme_id = ? AND sense_id = ?
         ORDER BY id`;
  const linkRows = (
    filter.lexemeId === null
      ? db.prepare(linkSql).all()
      : db.prepare(linkSql).all(filter.lexemeId, filter.senseId)
  ) as LinkRow[];
  for (const link of linkRows) {
    const key = `${link.target_type}\0${link.target_id}`;
    const list = links.get(key) ?? [];
    list.push(link);
    links.set(key, list);
  }
  const grouped = new Map<
    string,
    (CorpusQueryHit & { tokenIndex: number; morphemeIndex: number })[]
  >();
  for (const row of objects) {
    if (filter.form !== null && !valueHit(row.form_json, filter.form)) continue;
    if (filter.gloss !== null && !valueHit(row.gloss_json, filter.gloss)) continue;
    const kind = hitKind(row.kind);
    const chosen = (links.get(`${kind}\0${row.id}`) ?? []).find((link) =>
      pairOk(link.lexeme_id, link.sense_id),
    );
    if (filter.lexemeId !== null && chosen === undefined) continue;
    const hit: CorpusQueryHit & { tokenIndex: number; morphemeIndex: number } = {
      kind,
      id: row.id,
      form: stringRecord(row.form_json),
      gloss: stringRecord(row.gloss_json),
      pos: row.pos,
      tokenIndex: row.token_index,
      morphemeIndex: row.morpheme_index,
      ...(chosen === undefined ? {} : { lexemeId: chosen.lexeme_id, senseId: chosen.sense_id }),
    };
    const list = grouped.get(row.unit_id) ?? [];
    list.push(hit);
    grouped.set(row.unit_id, list);
  }
  const hitsByUnit = new Map<string, CorpusQueryHit[]>();
  for (const [unitId, list] of grouped) {
    list.sort((a, b) => {
      if (a.tokenIndex !== b.tokenIndex) return a.tokenIndex - b.tokenIndex;
      if (a.morphemeIndex !== b.morphemeIndex) return a.morphemeIndex - b.morphemeIndex;
      if (a.id < b.id) return -1;
      if (a.id > b.id) return 1;
      return 0;
    });
    hitsByUnit.set(
      unitId,
      list.map(({ tokenIndex: _tokenIndex, morphemeIndex: _morphemeIndex, ...hit }) => hit),
    );
  }
  return hitsByUnit;
}

function selectUnits(
  db: SqliteDatabase,
  input: {
    manuscriptId: string | null;
    text: string | null;
    unitIds: string[] | null;
    cursor: CorpusQueryCursor | null;
    limit: number;
  },
): UnitRow[] {
  const where = ['manuscripts.deleted_at IS NULL'];
  const params: unknown[] = [];
  if (input.manuscriptId !== null) {
    where.push('manuscripts.id = ?');
    params.push(input.manuscriptId);
  }
  if (input.text !== null) {
    where.push('instr(unit_texts.body, ?) > 0');
    params.push(input.text);
  }
  if (input.unitIds !== null) {
    db.exec('CREATE TEMP TABLE IF NOT EXISTS corpus_hit_units (id TEXT PRIMARY KEY)');
    db.exec('DELETE FROM corpus_hit_units');
    const insert = db.prepare('INSERT OR IGNORE INTO corpus_hit_units (id) VALUES (?)');
    const writeIds = db.transaction((ids: readonly string[]) => {
      for (const id of ids) insert.run(id);
    });
    for (let index = 0; index < input.unitIds.length; index += 400) {
      writeIds(input.unitIds.slice(index, index + 400));
    }
    where.push('units.id IN (SELECT id FROM corpus_hit_units)');
  }
  const cursor = input.cursor;
  if (cursor !== null) {
    where.push(`(
      manuscripts.id > ?
      OR (manuscripts.id = ? AND layers.id > ?)
      OR (manuscripts.id = ? AND layers.id = ? AND units.start_time > ?)
      OR (manuscripts.id = ? AND layers.id = ? AND units.start_time = ? AND units.id > ?)
    )`);
    params.push(
      cursor.manuscriptId,
      cursor.manuscriptId,
      cursor.layerId,
      cursor.manuscriptId,
      cursor.layerId,
      cursor.startTime,
      cursor.manuscriptId,
      cursor.layerId,
      cursor.startTime,
      cursor.unitId,
    );
  }
  params.push(input.limit);
  return db
    .prepare(
      `SELECT manuscripts.id AS manuscript_id, layers.id AS layer_id, units.id AS unit_id,
              units.start_time AS start_time, units.end_time AS end_time, unit_texts.body AS text
       FROM units
       JOIN unit_texts ON unit_texts.unit_id = units.id AND unit_texts.role = 'transcription'
       JOIN layers ON layers.id = units.layer_id
       JOIN manuscripts ON manuscripts.id = layers.manuscript_id
       WHERE ${where.join(' AND ')}
       ORDER BY manuscripts.id, layers.id, units.start_time, units.id
       LIMIT ?`,
    )
    .all(...params) as UnitRow[];
}

function valueHit(json: string, needle: string): boolean {
  return Object.values(stringRecord(json)).some((value) => value.includes(needle));
}

function spansIn(body: string, needle: string | null): CorpusTextSpan[] {
  if (needle === null) return [];
  const spans: CorpusTextSpan[] = [];
  let from = 0;
  for (;;) {
    const start = body.indexOf(needle, from);
    if (start < 0) break;
    spans.push({ start, end: start + needle.length });
    from = start + needle.length;
  }
  return spans;
}

function stringRecord(json: string): Record<string, string> {
  const value = JSON.parse(json) as unknown;
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {};
  const out: Record<string, string> = {};
  for (const [key, item] of Object.entries(value)) {
    if (typeof item === 'string') out[key] = item;
  }
  return out;
}

function hitKind(value: string): 'token' | 'morpheme' {
  if (value === 'token' || value === 'morpheme') return value;
  throw new Error('corpus hit kind is invalid');
}
