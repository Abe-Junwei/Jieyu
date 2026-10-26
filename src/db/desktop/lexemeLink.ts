import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import type { AnalysisGraphPayload } from '../../annotation/analysisGraphDomain';
import { foldSearchText } from '../../utils/searchTextNormalization';
import { readAnalysisMaterial } from './analysisCandidates';
import { writeGraph } from './analysisRestore';
import { getLexemeEntry, saveLexemeEntry } from './lexicon';

type SqliteDatabase = InstanceType<typeof Database>;

export interface LexemeLinkCandidate {
  id: string;
  headword: string;
  matchValues: string[];
  senses: { id: string; label: string }[];
}

export interface TokenLexemeLink {
  tokenId: string;
  lexemeId: string;
  senseId: string;
  headword: string | null;
}

export function listLexemeLinkCandidates(db: SqliteDatabase): LexemeLinkCandidate[] {
  // ponytail: one scan of lexemes. Index headwords when this scan shows up.
  const rows = db
    .prepare(`SELECT id, entry_json FROM lexemes WHERE kind = 'entry' AND entry_json IS NOT NULL`)
    .all() as { id: string; entry_json: string }[];
  const candidates: LexemeLinkCandidate[] = [];
  for (const row of rows) {
    const entry = JSON.parse(row.entry_json) as unknown;
    const candidate = candidateFrom(row.id, entry);
    if (candidate === null) continue;
    candidates.push(candidate);
  }
  return candidates;
}

export function matchLexemeLink(
  candidates: readonly LexemeLinkCandidate[],
  query: string,
): LexemeLinkCandidate {
  const normalized = foldSearchText(query.trim());
  if (normalized.length === 0) throw new Error('lexeme link has no match');
  const hits = candidates.filter((candidate) => candidate.matchValues.includes(normalized));
  if (hits.length === 0) throw new Error('lexeme link has no match');
  if (hits.length > 1) throw new Error('lexeme link is ambiguous');
  const hit = hits[0];
  if (hit === undefined || hit.senses.length === 0) throw new Error('lexeme has no sense');
  return hit;
}

export function matchLexemeLinkQuery(db: SqliteDatabase, query: string): LexemeLinkCandidate {
  return matchLexemeLink(listLexemeLinkCandidates(db), query);
}

export function createLinkedLexeme(
  db: SqliteDatabase,
  input: { targetId: string; headword: string; translation: string },
): TokenLexemeLink {
  const headword = input.headword.trim();
  const translation = input.translation.trim();
  if (headword.length === 0 || translation.length === 0) {
    throw new Error('lexeme create is empty');
  }
  const write = db.transaction(() => {
    const folded = foldSearchText(headword);
    const taken = listLexemeLinkCandidates(db).some(
      (candidate) => foldSearchText(candidate.headword) === folded,
    );
    if (taken) throw new Error('lexeme headword exists');
    const saved = saveLexemeEntry(db, {
      entry: { headword, senses: [{ headwordTranslations: [{ text: translation }] }] },
    });
    return replaceTokenLexemeLink(db, {
      tokenId: input.targetId,
      lexemeId: saved.id,
      senseId: firstSenseId(saved.entry),
    });
  });
  return write();
}

export function listTokenLexemeLinks(db: SqliteDatabase, unitId: string): TokenLexemeLink[] {
  const material = readAnalysisMaterial(db, unitId);
  if (material.graph === null) return [];
  const links: TokenLexemeLink[] = [];
  for (const relation of material.graph.relations) {
    if (relation.type !== 'linksLexeme' || relation.link === undefined) continue;
    const source = material.graph.nodes.find((node) => node.id === relation.sourceId);
    if (source === undefined || (source.type !== 'token' && source.type !== 'morpheme')) continue;
    const senseId = relation.link.senseId;
    if (senseId === undefined) continue;
    links.push({
      tokenId: source.id,
      lexemeId: relation.link.lexemeId,
      senseId,
      headword: headwordOf(db, relation.link.lexemeId),
    });
  }
  return links;
}

export function replaceTokenLexemeLink(
  db: SqliteDatabase,
  input: { tokenId: string; lexemeId: string; senseId: string },
): TokenLexemeLink {
  const write = db.transaction(() => {
    assertSense(db, input.lexemeId, input.senseId);
    rewriteTokenLink(db, input.tokenId, input);
    const stored = listTokenLexemeLinks(db, unitIdOfTarget(db, input.tokenId)).find(
      (link) => link.tokenId === input.tokenId && link.senseId === input.senseId,
    );
    if (stored === undefined) throw new Error('lexeme readback failed');
    return stored;
  });
  return write();
}

export function clearTokenLexemeLink(db: SqliteDatabase, tokenId: string): TokenLexemeLink[] {
  const write = db.transaction(() => {
    const unitId = unitIdOfTarget(db, tokenId);
    rewriteTokenLink(db, tokenId, null);
    return listTokenLexemeLinks(db, unitId).filter((link) => link.tokenId === tokenId);
  });
  return write();
}

function rewriteTokenLink(
  db: SqliteDatabase,
  tokenId: string,
  next: { lexemeId: string; senseId: string } | null,
): void {
  const unitId = unitIdOfTarget(db, tokenId);
  const material = readAnalysisMaterial(db, unitId);
  if (material.graph === null) throw new Error('analysis graph is missing');
  const graph = structuredClone(material.graph);
  const target = graph.nodes.find((node) => node.id === tokenId);
  if (target === undefined || (target.type !== 'token' && target.type !== 'morpheme')) {
    throw new Error('link target is missing');
  }
  const had = graph.relations.some(
    (relation) => relation.type === 'linksLexeme' && relation.sourceId === tokenId,
  );
  if (next === null && !had) return;
  const relations = graph.relations.filter(
    (relation) => !(relation.type === 'linksLexeme' && relation.sourceId === tokenId),
  );
  if (next !== null) {
    const ref = ensureLexemeRef(graph, next.lexemeId);
    const now = new Date().toISOString();
    relations.push({
      id: randomUUID(),
      type: 'linksLexeme',
      sourceId: tokenId,
      targetId: ref.id,
      link: {
        lexemeId: next.lexemeId,
        senseId: next.senseId,
        role: 'manual',
        createdAt: now,
        updatedAt: now,
      },
    });
  }
  const used = new Set(
    relations.flatMap((relation) => (relation.type === 'linksLexeme' ? [relation.targetId] : [])),
  );
  const nodes = graph.nodes.filter((node) => node.type !== 'lexemeRef' || used.has(node.id));
  writeGraph(db, material, { ...graph, nodes, relations });
}

function ensureLexemeRef(graph: AnalysisGraphPayload, lexemeId: string): { id: string } {
  const existing = graph.nodes.find((node) => node.type === 'lexemeRef' && node.label === lexemeId);
  if (existing !== undefined) return existing;
  const created = { id: randomUUID(), type: 'lexemeRef' as const, label: lexemeId };
  graph.nodes.push(created);
  return created;
}

function assertSense(db: SqliteDatabase, lexemeId: string, senseId: string): void {
  const entry = getLexemeEntry(db, lexemeId);
  if (entry === null) throw new Error('lexeme is missing');
  const senses = entry.entry['senses'];
  const found =
    Array.isArray(senses) &&
    senses.some(
      (sense) =>
        typeof sense === 'object' && sense !== null && (sense as { id?: unknown }).id === senseId,
    );
  if (!found) throw new Error('sense is missing');
}

function unitIdOfTarget(db: SqliteDatabase, targetId: string): string {
  const token = db.prepare('SELECT unit_id FROM tokens WHERE id = ?').get(targetId) as
    { unit_id: string } | undefined;
  if (token !== undefined) return token.unit_id;
  const morpheme = db
    .prepare(
      `SELECT tokens.unit_id AS unit_id
       FROM morphemes
       JOIN tokens ON tokens.id = morphemes.token_id
       WHERE morphemes.id = ?`,
    )
    .get(targetId) as { unit_id: string } | undefined;
  if (morpheme === undefined) throw new Error('link target is missing');
  return morpheme.unit_id;
}

function firstSenseId(entry: Record<string, unknown>): string {
  const senses = entry['senses'];
  const sense = Array.isArray(senses) ? senses[0] : undefined;
  const id =
    typeof sense === 'object' && sense !== null ? (sense as { id?: unknown }).id : undefined;
  if (typeof id !== 'string' || id.length === 0) throw new Error('lexeme has no sense');
  return id;
}

function headwordOf(db: SqliteDatabase, lexemeId: string): string | null {
  const entry = getLexemeEntry(db, lexemeId);
  if (entry === null) return null;
  const headword = entry.entry['headword'];
  return typeof headword === 'string' ? headword.trim() : null;
}

function candidateFrom(id: string, entry: unknown): LexemeLinkCandidate | null {
  if (typeof entry !== 'object' || entry === null) return null;
  const record = entry as {
    headword?: unknown;
    inflectedForms?: unknown;
    senses?: unknown;
  };
  if (typeof record.headword !== 'string' || record.headword.trim().length === 0) return null;
  // Same folded set as lexemeMatchValues: headword plus inflected forms. No id, no partial.
  const raw = [record.headword];
  if (Array.isArray(record.inflectedForms)) {
    for (const form of record.inflectedForms) {
      if (
        typeof form === 'object' &&
        form !== null &&
        typeof (form as { text?: unknown }).text === 'string'
      ) {
        raw.push((form as { text: string }).text);
      }
    }
  }
  return {
    id,
    headword: record.headword.trim(),
    matchValues: raw
      .map((value) => foldSearchText(value.trim()))
      .filter((value) => value.length > 0),
    senses: senseChoices(record.senses),
  };
}

function senseChoices(value: unknown): { id: string; label: string }[] {
  if (!Array.isArray(value)) return [];
  const choices: { id: string; label: string }[] = [];
  for (const sense of value) {
    if (typeof sense !== 'object' || sense === null) continue;
    const row = sense as {
      id?: unknown;
      indicator?: unknown;
      headwordTranslations?: { text?: unknown }[];
      definitions?: { text?: unknown }[];
    };
    if (typeof row.id !== 'string' || row.id.trim().length === 0) continue;
    const translation = textOf(row.headwordTranslations?.[0]);
    const definition = textOf(row.definitions?.[0]);
    const indicator = typeof row.indicator === 'string' ? row.indicator.trim() : '';
    const label =
      [translation, definition, indicator].find((item) => item.length > 0) ?? row.id.trim();
    choices.push({ id: row.id.trim(), label });
  }
  return choices;
}

function textOf(value: { text?: unknown } | undefined): string {
  const text = value?.text;
  return typeof text === 'string' ? text.trim() : '';
}
