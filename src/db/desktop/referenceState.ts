import type Database from 'better-sqlite3';
import type { AnalysisGraphPayload } from '../../annotation/analysisGraphDomain';

type SqliteDatabase = InstanceType<typeof Database>;

export type ReferenceLinkState = 'active' | 'target-missing';
export type ReferenceGap = 'missing-entry' | 'missing-sense';

export interface ClassifiedReference {
  linkState: ReferenceLinkState;
  gap?: ReferenceGap;
}

export interface LexemeLinkReading {
  id: string;
  targetType: string;
  targetId: string;
  lexemeId: string;
  senseId: string | null;
  role: string | null;
  attachment: 'active' | 'detached';
  linkState: ReferenceLinkState;
  gap?: ReferenceGap;
}

export interface GraphReferenceReading {
  kind: 'node' | 'relation';
  id: string;
  lexemeId: string;
  senseId: string | null;
  linkState: ReferenceLinkState;
  gap?: ReferenceGap;
}

export function classifyLexemeReference(
  db: SqliteDatabase,
  lexemeId: string,
  senseId: string | null,
): ClassifiedReference {
  const entry = readEntry(db, lexemeId);
  if (entry === null) return { linkState: 'target-missing', gap: 'missing-entry' };
  if (senseId === null) return { linkState: 'active' };
  if (!senseIds(entry).includes(senseId)) {
    return { linkState: 'target-missing', gap: 'missing-sense' };
  }
  return { linkState: 'active' };
}

export function readLexemeLinks(db: SqliteDatabase): LexemeLinkReading[] {
  const rows = db
    .prepare(
      `SELECT links.id, links.target_type, links.target_id, links.lexeme_id, links.sense_id,
              links.role, links.attachment
       FROM token_lexeme_links AS links
       WHERE NOT (
         (
           links.target_type = 'token' AND EXISTS (
             SELECT 1 FROM tokens
             JOIN units ON units.id = tokens.unit_id
             JOIN layers ON layers.id = units.layer_id
             JOIN manuscripts ON manuscripts.id = layers.manuscript_id
             WHERE tokens.id = links.target_id AND manuscripts.deleted_at IS NOT NULL
           )
         ) OR (
           links.target_type = 'morpheme' AND EXISTS (
             SELECT 1 FROM morphemes
             JOIN tokens ON tokens.id = morphemes.token_id
             JOIN units ON units.id = tokens.unit_id
             JOIN layers ON layers.id = units.layer_id
             JOIN manuscripts ON manuscripts.id = layers.manuscript_id
             WHERE morphemes.id = links.target_id AND manuscripts.deleted_at IS NOT NULL
           )
         )
       )
       ORDER BY links.id`,
    )
    .all() as {
    id: string;
    target_type: string;
    target_id: string;
    lexeme_id: string;
    sense_id: string | null;
    role: string | null;
    attachment: 'active' | 'detached';
  }[];
  return rows.map((row) => ({
    id: row.id,
    targetType: row.target_type,
    targetId: row.target_id,
    lexemeId: row.lexeme_id,
    senseId: row.sense_id,
    role: row.role,
    attachment: row.attachment,
    ...classifyLexemeReference(db, row.lexeme_id, row.sense_id),
  }));
}

export function countActiveLexemeLinks(db: SqliteDatabase): number {
  return readLexemeLinks(db).filter(
    (link) => link.linkState === 'active' && link.attachment === 'active',
  ).length;
}

export function readGraphReferences(
  db: SqliteDatabase,
  graph: AnalysisGraphPayload,
): GraphReferenceReading[] {
  const readings: GraphReferenceReading[] = [];
  for (const node of graph.nodes) {
    const lexemeId = node.domain?.lexemeId;
    if (lexemeId === undefined) continue;
    readings.push({
      kind: 'node',
      id: node.id,
      lexemeId,
      senseId: null,
      ...classifyLexemeReference(db, lexemeId, null),
    });
  }
  for (const relation of graph.relations) {
    if (relation.link === undefined) continue;
    const senseId = relation.link.senseId ?? null;
    readings.push({
      kind: 'relation',
      id: relation.id,
      lexemeId: relation.link.lexemeId,
      senseId,
      ...classifyLexemeReference(db, relation.link.lexemeId, senseId),
    });
  }
  return readings;
}

export function assertRetargetedReferences(
  db: SqliteDatabase,
  before: AnalysisGraphPayload | null,
  after: AnalysisGraphPayload,
): void {
  const previousNodes = new Map(
    (before?.nodes ?? []).map((node) => [node.id, node.domain?.lexemeId]),
  );
  for (const node of after.nodes) {
    const lexemeId = node.domain?.lexemeId;
    if (lexemeId === undefined || lexemeId === previousNodes.get(node.id)) continue;
    if (classifyLexemeReference(db, lexemeId, null).linkState !== 'active') {
      throw new Error('lexeme is missing');
    }
  }
  const previousLinks = new Map(
    (before?.relations ?? []).map((relation) => [relation.id, relation.link]),
  );
  for (const relation of after.relations) {
    if (relation.link === undefined) continue;
    const senseId = relation.link.senseId ?? null;
    const previous = previousLinks.get(relation.id);
    if (
      previous !== undefined &&
      previous.lexemeId === relation.link.lexemeId &&
      (previous.senseId ?? null) === senseId
    ) {
      continue;
    }
    const state = classifyLexemeReference(db, relation.link.lexemeId, senseId);
    if (state.linkState !== 'active') {
      throw new Error(state.gap === 'missing-sense' ? 'sense is missing' : 'lexeme is missing');
    }
  }
}

function readEntry(db: SqliteDatabase, lexemeId: string): Record<string, unknown> | null {
  const row = db
    .prepare(`SELECT entry_json FROM lexemes WHERE id = ? AND kind = 'entry'`)
    .get(lexemeId) as { entry_json: string | null } | undefined;
  if (row?.entry_json == null) return null;
  return JSON.parse(row.entry_json) as Record<string, unknown>;
}

function senseIds(entry: Record<string, unknown>): string[] {
  if (!Array.isArray(entry.senses)) return [];
  return entry.senses.flatMap((sense) => {
    if (typeof sense !== 'object' || sense === null) return [];
    const id = (sense as { id?: unknown }).id;
    return typeof id === 'string' ? [id] : [];
  });
}
