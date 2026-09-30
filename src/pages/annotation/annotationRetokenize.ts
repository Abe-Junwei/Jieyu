import type { AnnotationAnalysisGraphFixture } from '../../annotation/analysisGraph';
import {
  listPendingAnalysisGraphCandidates,
  rejectAnalysisGraphCandidate,
  submitAnalysisGraphCandidate,
} from '../../annotation/analysisGraphConfirmation';
import { LinguisticService } from '../../app/languageAssetPageAccess';
import { getDb, withTransaction } from '../../app/jieyuDbPageAccess';
import type {
  TokenLexemeLinkDocType,
  TokenLexemeLinkRole,
  UnitMorphemeDocType,
  UnitTokenDocType,
} from '../../types/jieyuDbDocTypes';
import { newId, pickDefaultTranscriptionText } from '../../utils/transcriptionFormatters';
import { annotationSegmenterLocale } from './annotationTokenizationProfile';

type IntlSegmenterCtor = new (
  locales?: string | string[],
  options?: { granularity?: 'word' },
) => { segment(input: string): Iterable<{ segment: string; isWordLike?: boolean }> };

export type AnnotationRetokenizePreview = {
  unitId: string;
  proposedForms: string[];
  unchanged: boolean;
};

export type AnnotationRetokenizeApplyKind = 'unchanged' | 'tokens' | 'candidate' | 'forced';

export type AnnotationRetokenizeApplyResult = {
  kind: AnnotationRetokenizeApplyKind;
  proposedForms: string[];
};

export type AnnotationRetokenizeDeps = {
  listTokensByUnitId: (unitId: string) => Promise<UnitTokenDocType[]>;
  listTokensByUnitIds: (unitIds: readonly string[]) => Promise<UnitTokenDocType[]>;
  listMorphemesByTokenIds: (tokenIds: readonly string[]) => Promise<UnitMorphemeDocType[]>;
  listTokenLexemeLinks: (
    targetType: 'token',
    targetId: string,
  ) => Promise<TokenLexemeLinkDocType[]>;
  saveToken: (data: UnitTokenDocType) => Promise<string>;
  removeToken: (tokenId: string) => Promise<void>;
  saveMorpheme: (data: UnitMorphemeDocType) => Promise<string>;
  saveTokenLexemeLink: (data: TokenLexemeLinkDocType) => Promise<string>;
  submitCandidate: typeof submitAnalysisGraphCandidate;
  listPendingCandidates: typeof listPendingAnalysisGraphCandidates;
  rejectCandidate: typeof rejectAnalysisGraphCandidate;
  transaction?: <T>(action: () => Promise<T>) => Promise<T>;
};

const defaultDeps: AnnotationRetokenizeDeps = {
  listTokensByUnitId: (unitId) => LinguisticService.units.listTokensByUnitId(unitId),
  listTokensByUnitIds: (unitIds) => LinguisticService.units.listTokensByUnitIds(unitIds),
  listMorphemesByTokenIds: (tokenIds) => LinguisticService.units.listMorphemesByTokenIds(tokenIds),
  listTokenLexemeLinks: (targetType, targetId) =>
    LinguisticService.units.listTokenLexemeLinks(targetType, targetId),
  saveToken: (data) => LinguisticService.units.saveToken(data),
  removeToken: (tokenId) => LinguisticService.units.removeToken(tokenId),
  saveMorpheme: (data) => LinguisticService.units.saveMorpheme(data),
  saveTokenLexemeLink: (data) => LinguisticService.units.saveTokenLexemeLink(data),
  submitCandidate: submitAnalysisGraphCandidate,
  listPendingCandidates: listPendingAnalysisGraphCandidates,
  rejectCandidate: rejectAnalysisGraphCandidate,
  transaction: (action) => runRetokenizeTransaction(action),
};

function runRetokenizeTransaction<T>(action: () => Promise<T>): Promise<T> {
  return getDb().then((db) =>
    withTransaction(
      db,
      'rw',
      [
        db.dexie.unit_tokens,
        db.dexie.unit_morphemes,
        db.dexie.token_lexeme_links,
        db.dexie.unit_relations,
      ],
      action,
      { label: 'annotation-retokenize' },
    ),
  );
}

export function proposeAnnotationTokenForms(surface: string, languageId = 'und'): string[] {
  const text = surface.trim();
  if (text.length === 0) return [];
  const locale = annotationSegmenterLocale(languageId);
  const SegmenterCtor = (Intl as unknown as { Segmenter?: IntlSegmenterCtor }).Segmenter;
  if (typeof SegmenterCtor === 'function') {
    try {
      const forms: string[] = [];
      for (const part of new SegmenterCtor(locale, { granularity: 'word' }).segment(text)) {
        const piece = part.segment.trim();
        if (piece.length > 0 && part.isWordLike) forms.push(piece);
      }
      if (forms.length > 0) return forms;
    } catch {
      // Invalid locale; fall through.
    }
  }
  return text
    .split(/\s+/u)
    .map((piece) => piece.trim())
    .filter((piece) => piece.length > 0);
}

export function annotationRetokenizeUnchanged(
  currentForms: readonly string[],
  proposedForms: readonly string[],
): boolean {
  return (
    currentForms.length === proposedForms.length &&
    currentForms.every((form, index) => form === proposedForms[index])
  );
}

export function annotationTokenHasManualWork(
  token: Pick<UnitTokenDocType, 'pos' | 'gloss' | 'languageId'>,
  morphCount: number,
  linkCount: number,
  hasDraft: boolean,
): boolean {
  if (hasDraft) return true;
  if ((token.languageId ?? '').trim().length > 0) return true;
  if ((token.pos ?? '').trim().length > 0) return true;
  if (pickDefaultTranscriptionText(token.gloss ?? {}).trim().length > 0) return true;
  return morphCount > 0 || linkCount > 0;
}

export function buildRetokenizeCandidateGraph(input: {
  unitId: string;
  surface: string;
  proposedForms: readonly string[];
}): AnnotationAnalysisGraphFixture {
  const surface = input.surface.trim() || input.proposedForms.join(' ');
  const wordId = 'word-surface';
  const tokenNodes = input.proposedForms.map((form, index) => ({
    id: `tok-${index + 1}`,
    type: 'token' as const,
    label: form.slice(0, 256),
  }));
  return {
    id: `retok-${input.unitId}`.slice(0, 128),
    text: surface.slice(0, 256),
    displayGloss: input.proposedForms.join(' ').slice(0, 256) || surface.slice(0, 256),
    nodes: [{ id: wordId, type: 'word', label: surface.slice(0, 256) }, ...tokenNodes],
    relations: tokenNodes.map((node) => ({
      id: `alt-${node.id}`,
      type: 'alternativeAnalysis' as const,
      sourceId: wordId,
      targetId: node.id,
      role: 'retokenize',
    })),
    projectionDiagnostics: [
      {
        target: 'flex',
        status: 'needsReview',
        message: 'Secondary auto-tokenization candidate; existing tokens were not overwritten.',
      },
    ],
  };
}

type LangMap = Record<string, string>;

type SurfaceSpan = { startOffset: number; endOffset: number };

type SnapshotMorpheme = {
  id: string;
  form: string;
  forms?: LangMap;
  gloss?: string;
  glosses?: LangMap;
  pos?: string;
  lexemeId?: string;
  surfaceParts?: SurfaceSpan[];
  morphemeIndex: number;
};

type SnapshotLink = {
  id: string;
  lexemeId: string;
  role?: TokenLexemeLinkRole;
  senseId?: string;
  confidence?: number;
};

type SnapshotToken = {
  id: string;
  form: string;
  forms?: LangMap;
  gloss?: string;
  glosses?: LangMap;
  pos?: string;
  languageId?: string;
  tokenIndex: number;
  morphemes: SnapshotMorpheme[];
  links: SnapshotLink[];
};

const LINK_ROLES = new Set<TokenLexemeLinkRole>(['exact', 'stem', 'gloss_candidate', 'manual']);

function readRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function readText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function langMap(value: Record<string, string> | undefined): LangMap | undefined {
  if (!value) return undefined;
  const next: LangMap = {};
  for (const [key, text] of Object.entries(value)) {
    if (key.trim().length === 0 || typeof text !== 'string') continue;
    next[key] = text;
  }
  return Object.keys(next).length > 0 ? next : undefined;
}

function readLangMap(value: unknown): LangMap | undefined {
  const record = readRecord(value);
  if (!record) return undefined;
  const next: LangMap = {};
  for (const [key, text] of Object.entries(record)) {
    if (key.trim().length === 0 || typeof text !== 'string') continue;
    next[key] = text;
  }
  return Object.keys(next).length > 0 ? next : undefined;
}

function readConfidence(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

/** undefined = absent. null = present but not a usable id, so restore must not succeed. */
function readOptionalId(record: Record<string, unknown>, key: string): string | undefined | null {
  if (!Object.prototype.hasOwnProperty.call(record, key) || record[key] === undefined) {
    return undefined;
  }
  const text = readText(record[key]);
  return text.length > 0 ? text : null;
}

function readSurfaceParts(value: unknown): SurfaceSpan[] | undefined | null {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) return null;
  if (value.length === 0) return undefined;
  const spans: SurfaceSpan[] = [];
  for (const item of value) {
    const record = readRecord(item);
    if (!record) return null;
    const startOffset = record.startOffset;
    const endOffset = record.endOffset;
    if (
      typeof startOffset !== 'number' ||
      typeof endOffset !== 'number' ||
      !Number.isInteger(startOffset) ||
      !Number.isInteger(endOffset) ||
      endOffset <= startOffset
    ) {
      return null;
    }
    spans.push({ startOffset, endOffset });
  }
  return spans;
}

function snapshotTokenFromRow(
  token: UnitTokenDocType,
  morphemes: readonly UnitMorphemeDocType[],
  links: readonly TokenLexemeLinkDocType[],
): SnapshotToken {
  const forms = langMap(token.form);
  const glosses = langMap(token.gloss);
  const gloss = pickDefaultTranscriptionText(token.gloss ?? {}).trim();
  const pos = (token.pos ?? '').trim();
  const languageId = (token.languageId ?? '').trim();
  return {
    id: token.id,
    form: pickDefaultTranscriptionText(token.form),
    ...(forms ? { forms } : {}),
    ...(gloss.length > 0 ? { gloss } : {}),
    ...(glosses ? { glosses } : {}),
    ...(pos.length > 0 ? { pos } : {}),
    ...(languageId.length > 0 ? { languageId } : {}),
    tokenIndex: token.tokenIndex,
    morphemes: morphemes
      .filter((morph) => morph.tokenId === token.id)
      .sort((a, b) => a.morphemeIndex - b.morphemeIndex)
      .map((morph) => {
        const morphForms = langMap(morph.form);
        const morphGlosses = langMap(morph.gloss);
        const morphGloss = pickDefaultTranscriptionText(morph.gloss ?? {}).trim();
        const morphPos = (morph.pos ?? '').trim();
        const lexemeId = (morph.lexemeId ?? '').trim();
        const surfaceParts =
          morph.surfaceParts && morph.surfaceParts.length > 0 ? morph.surfaceParts : undefined;
        return {
          id: morph.id,
          form: pickDefaultTranscriptionText(morph.form),
          ...(morphForms ? { forms: morphForms } : {}),
          ...(morphGloss.length > 0 ? { gloss: morphGloss } : {}),
          ...(morphGlosses ? { glosses: morphGlosses } : {}),
          ...(morphPos.length > 0 ? { pos: morphPos } : {}),
          ...(lexemeId.length > 0 ? { lexemeId } : {}),
          ...(surfaceParts ? { surfaceParts } : {}),
          morphemeIndex: morph.morphemeIndex,
        };
      }),
    links: links.flatMap((link) => {
      const lexemeId = link.lexemeId.trim();
      if (lexemeId.length === 0) return [];
      const role = link.role;
      const senseId = link.senseId?.trim() ?? '';
      const confidence = readConfidence(link.confidence);
      return [
        {
          id: link.id,
          lexemeId,
          ...(role && LINK_ROLES.has(role) ? { role } : {}),
          ...(senseId.length > 0 ? { senseId } : {}),
          ...(confidence !== undefined ? { confidence } : {}),
        },
      ];
    }),
  };
}

function buildRetokenizeSnapshotGraph(input: {
  unitId: string;
  surface: string;
  tokens: readonly SnapshotToken[];
}): AnnotationAnalysisGraphFixture {
  const surface = input.surface.trim() || input.tokens.map((token) => token.form).join(' ');
  const wordId = 'word-surface';
  const tokenNodes = input.tokens.map((token, index) => ({
    id: `snap-${index + 1}`,
    type: 'token' as const,
    label: token.form.trim().slice(0, 256) || `token-${index + 1}`,
  }));
  return {
    id: `retok-snap-${input.unitId}`.slice(0, 128),
    text: surface.slice(0, 256) || 'snapshot',
    displayGloss:
      input.tokens
        .map((token) => token.form)
        .join(' ')
        .slice(0, 256) || 'snapshot',
    nodes: [
      {
        id: wordId,
        type: 'word',
        label: surface.slice(0, 256) || 'snapshot',
        features: { retokenizeSnapshot: { tokens: input.tokens } },
      },
      ...tokenNodes,
    ],
    relations: tokenNodes.map((node) => ({
      id: `snap-rel-${node.id}`,
      type: 'alternativeAnalysis' as const,
      sourceId: wordId,
      targetId: node.id,
      role: 'retokenize-snapshot',
    })),
    projectionDiagnostics: [
      {
        target: 'flex',
        status: 'needsReview',
        message: 'Retokenize overwrite snapshot. Restore puts these tokens back.',
      },
    ],
  };
}

function readSnapshotTokens(graph: AnnotationAnalysisGraphFixture): SnapshotToken[] | null {
  const word = graph.nodes.find((node) => node.type === 'word');
  const payload = readRecord(word?.features?.retokenizeSnapshot);
  const rows = payload?.tokens;
  if (!Array.isArray(rows) || rows.length === 0) return null;
  const tokens: SnapshotToken[] = [];
  for (const row of rows) {
    const record = readRecord(row);
    if (!record) return null;
    const id = readText(record.id);
    const form = readText(record.form);
    const tokenIndex = record.tokenIndex;
    if (id.length === 0 || form.length === 0 || typeof tokenIndex !== 'number') return null;
    const gloss = readText(record.gloss);
    const pos = readText(record.pos);
    const languageId = readOptionalId(record, 'languageId');
    if (languageId === null) return null;
    const forms = readLangMap(record.forms);
    const glosses = readLangMap(record.glosses);
    const morphemes: SnapshotMorpheme[] = [];
    if (Array.isArray(record.morphemes)) {
      for (const morphRow of record.morphemes) {
        const morph = readRecord(morphRow);
        if (!morph) return null;
        const morphId = readText(morph.id);
        const morphForm = readText(morph.form);
        const morphemeIndex = morph.morphemeIndex;
        if (morphId.length === 0 || morphForm.length === 0 || typeof morphemeIndex !== 'number') {
          return null;
        }
        const morphGloss = readText(morph.gloss);
        const morphPos = readText(morph.pos);
        const morphForms = readLangMap(morph.forms);
        const morphGlosses = readLangMap(morph.glosses);
        const lexemeId = readOptionalId(morph, 'lexemeId');
        if (lexemeId === null) return null;
        const surfaceParts = readSurfaceParts(morph.surfaceParts);
        if (surfaceParts === null) return null;
        morphemes.push({
          id: morphId,
          form: morphForm,
          ...(morphForms ? { forms: morphForms } : {}),
          ...(morphGloss.length > 0 ? { gloss: morphGloss } : {}),
          ...(morphGlosses ? { glosses: morphGlosses } : {}),
          ...(morphPos.length > 0 ? { pos: morphPos } : {}),
          ...(lexemeId ? { lexemeId } : {}),
          ...(surfaceParts ? { surfaceParts } : {}),
          morphemeIndex,
        });
      }
    }
    const links: SnapshotLink[] = [];
    if (Array.isArray(record.links)) {
      for (const linkRow of record.links) {
        const link = readRecord(linkRow);
        if (!link) return null;
        const linkId = readText(link.id);
        const lexemeId = readText(link.lexemeId);
        if (linkId.length === 0 || lexemeId.length === 0) return null;
        const role = readText(link.role);
        const senseId = readText(link.senseId);
        const confidence = readConfidence(link.confidence);
        links.push({
          id: linkId,
          lexemeId,
          ...(LINK_ROLES.has(role as TokenLexemeLinkRole)
            ? { role: role as TokenLexemeLinkRole }
            : {}),
          ...(senseId.length > 0 ? { senseId } : {}),
          ...(confidence !== undefined ? { confidence } : {}),
        });
      }
    }
    tokens.push({
      id,
      form,
      ...(forms ? { forms } : {}),
      ...(gloss.length > 0 ? { gloss } : {}),
      ...(glosses ? { glosses } : {}),
      ...(pos.length > 0 ? { pos } : {}),
      ...(languageId ? { languageId } : {}),
      tokenIndex,
      morphemes,
      links,
    });
  }
  return tokens;
}

export function previewAnnotationRetokenize(input: {
  unitId: string;
  surface: string;
  currentForms: readonly string[];
  languageId?: string;
}): AnnotationRetokenizePreview {
  const proposedForms = proposeAnnotationTokenForms(input.surface, input.languageId);
  return {
    unitId: input.unitId,
    proposedForms,
    unchanged:
      proposedForms.length === 0 ||
      annotationRetokenizeUnchanged(input.currentForms, proposedForms),
  };
}

async function replaceUnitTokens(
  input: { textId: string; unitId: string; proposedForms: readonly string[] },
  deps: AnnotationRetokenizeDeps,
  existing: readonly UnitTokenDocType[],
): Promise<void> {
  const now = new Date().toISOString();
  const transact = deps.transaction ?? defaultDeps.transaction;
  const write = async () => {
    for (const token of existing) {
      await deps.removeToken(token.id);
    }
    for (const [index, form] of input.proposedForms.entries()) {
      await deps.saveToken({
        id: newId('tok'),
        textId: input.textId,
        unitId: input.unitId,
        form: { default: form },
        tokenIndex: index,
        createdAt: now,
        updatedAt: now,
      });
    }
  };
  if (transact) await transact(write);
  else await write();
  const readback = [...(await deps.listTokensByUnitIds([input.unitId]))].sort(
    (a, b) => a.tokenIndex - b.tokenIndex,
  );
  const readForms = readback.map((token) => pickDefaultTranscriptionText(token.form));
  if (!annotationRetokenizeUnchanged(readForms, input.proposedForms)) {
    throw new Error('retokenize readback mismatch');
  }
}

async function writeSnapshotTokens(
  input: { textId: string; unitId: string; tokens: readonly SnapshotToken[] },
  deps: AnnotationRetokenizeDeps,
): Promise<void> {
  const now = new Date().toISOString();
  const ordered = [...input.tokens].sort((a, b) => a.tokenIndex - b.tokenIndex);
  for (const token of ordered) {
    await deps.saveToken({
      id: token.id,
      textId: input.textId,
      unitId: input.unitId,
      form: token.forms ?? { default: token.form },
      ...(token.glosses
        ? { gloss: token.glosses }
        : token.gloss
          ? { gloss: { default: token.gloss } }
          : {}),
      ...(token.pos ? { pos: token.pos } : {}),
      ...(token.languageId ? { languageId: token.languageId } : {}),
      tokenIndex: token.tokenIndex,
      createdAt: now,
      updatedAt: now,
    });
    for (const morph of token.morphemes) {
      await deps.saveMorpheme({
        id: morph.id,
        textId: input.textId,
        unitId: input.unitId,
        tokenId: token.id,
        form: morph.forms ?? { default: morph.form },
        ...(morph.glosses
          ? { gloss: morph.glosses }
          : morph.gloss
            ? { gloss: { default: morph.gloss } }
            : {}),
        ...(morph.pos ? { pos: morph.pos } : {}),
        ...(morph.lexemeId ? { lexemeId: morph.lexemeId } : {}),
        ...(morph.surfaceParts && morph.surfaceParts.length > 0
          ? { surfaceParts: morph.surfaceParts }
          : {}),
        morphemeIndex: morph.morphemeIndex,
        createdAt: now,
        updatedAt: now,
      });
    }
    for (const link of token.links) {
      await deps.saveTokenLexemeLink({
        id: link.id,
        targetType: 'token',
        targetId: token.id,
        lexemeId: link.lexemeId,
        ...(link.role ? { role: link.role } : {}),
        ...(link.senseId ? { senseId: link.senseId } : {}),
        ...(link.confidence !== undefined ? { confidence: link.confidence } : {}),
        createdAt: now,
        updatedAt: now,
      });
    }
  }
}

async function submitLoadedTokenSnapshot(
  input: { textId: string; unitId: string; surface: string },
  deps: AnnotationRetokenizeDeps,
  tokens: readonly UnitTokenDocType[],
  morphs: readonly UnitMorphemeDocType[],
  linkGroups: readonly { tokenId: string; links: readonly TokenLexemeLinkDocType[] }[],
): Promise<void> {
  const snapshot = tokens.map((token) =>
    snapshotTokenFromRow(
      token,
      morphs.filter((morph) => morph.tokenId === token.id),
      linkGroups.find((group) => group.tokenId === token.id)?.links ?? [],
    ),
  );
  if (snapshot.length === 0) return;
  await deps.submitCandidate({
    textId: input.textId,
    unitId: input.unitId,
    candidateGraph: buildRetokenizeSnapshotGraph({
      unitId: input.unitId,
      surface: input.surface,
      tokens: snapshot,
    }),
  });
}

/** Persist the unit's tokens, morphemes, and links as a restorable analysis snapshot. */
export async function submitAnnotationTokenSnapshot(
  input: { textId: string; unitId: string; surface: string },
  deps: AnnotationRetokenizeDeps = defaultDeps,
): Promise<void> {
  const tokens = [...(await deps.listTokensByUnitId(input.unitId))].sort(
    (a, b) => a.tokenIndex - b.tokenIndex,
  );
  const tokenIds = tokens.map((token) => token.id);
  const [morphs, linkGroups] = await Promise.all([
    tokenIds.length > 0 ? deps.listMorphemesByTokenIds(tokenIds) : Promise.resolve([]),
    Promise.all(
      tokenIds.map(async (tokenId) => ({
        tokenId,
        links: await deps.listTokenLexemeLinks('token', tokenId),
      })),
    ),
  ]);
  await submitLoadedTokenSnapshot(input, deps, tokens, morphs, linkGroups);
}

function snapshotAnnotationReadbackMatches(
  expected: readonly SnapshotToken[],
  tokens: readonly UnitTokenDocType[],
  morphemes: readonly UnitMorphemeDocType[],
): boolean {
  for (const token of expected) {
    const stored = tokens.find((row) => row.id === token.id);
    if (!stored) return false;
    if ((stored.languageId ?? '').trim() !== (token.languageId ?? '')) return false;
    for (const morph of token.morphemes) {
      const row = morphemes.find((item) => item.id === morph.id && item.tokenId === token.id);
      if (!row) return false;
      if ((row.lexemeId ?? '').trim() !== (morph.lexemeId ?? '')) return false;
      const expectedSpans = morph.surfaceParts ?? [];
      const storedSpans = row.surfaceParts ?? [];
      if (expectedSpans.length !== storedSpans.length) return false;
      for (const [index, span] of expectedSpans.entries()) {
        if (
          storedSpans[index]?.startOffset !== span.startOffset ||
          storedSpans[index]?.endOffset !== span.endOffset
        ) {
          return false;
        }
      }
    }
  }
  return true;
}

export async function applyAnnotationRetokenize(
  input: {
    textId: string;
    unitId: string;
    surface: string;
    proposedForms: readonly string[];
    draftTokenIds?: ReadonlySet<string>;
    mode?: 'force';
  },
  deps: AnnotationRetokenizeDeps = defaultDeps,
): Promise<AnnotationRetokenizeApplyResult> {
  const proposedForms = [...input.proposedForms];
  if (proposedForms.length === 0) {
    return { kind: 'unchanged', proposedForms };
  }
  const tokens = [...(await deps.listTokensByUnitId(input.unitId))].sort(
    (a, b) => a.tokenIndex - b.tokenIndex,
  );
  const currentForms = tokens.map((token) => pickDefaultTranscriptionText(token.form));
  if (annotationRetokenizeUnchanged(currentForms, proposedForms)) {
    return { kind: 'unchanged', proposedForms };
  }
  const tokenIds = tokens.map((token) => token.id);
  const [morphs, linkGroups] = await Promise.all([
    tokenIds.length > 0 ? deps.listMorphemesByTokenIds(tokenIds) : Promise.resolve([]),
    Promise.all(
      tokenIds.map(async (tokenId) => ({
        tokenId,
        links: await deps.listTokenLexemeLinks('token', tokenId),
      })),
    ),
  ]);
  const morphCountByToken = new Map<string, number>();
  for (const morph of morphs) {
    morphCountByToken.set(morph.tokenId, (morphCountByToken.get(morph.tokenId) ?? 0) + 1);
  }
  const blocked = tokens.some((token) =>
    annotationTokenHasManualWork(
      token,
      morphCountByToken.get(token.id) ?? 0,
      linkGroups.find((group) => group.tokenId === token.id)?.links.length ?? 0,
      input.draftTokenIds?.has(token.id) === true,
    ),
  );
  if (blocked && input.mode !== 'force') {
    await deps.submitCandidate({
      textId: input.textId,
      unitId: input.unitId,
      candidateGraph: buildRetokenizeCandidateGraph({
        unitId: input.unitId,
        surface: input.surface,
        proposedForms,
      }),
    });
    return { kind: 'candidate', proposedForms };
  }
  if (blocked && (input.draftTokenIds?.size ?? 0) > 0) {
    return { kind: 'candidate', proposedForms };
  }
  if (blocked) {
    await submitLoadedTokenSnapshot(input, deps, tokens, morphs, linkGroups);
    await replaceUnitTokens(input, deps, tokens);
    return { kind: 'forced', proposedForms };
  }
  await replaceUnitTokens(input, deps, tokens);
  return { kind: 'tokens', proposedForms };
}

export async function annotationRetokenizeHasSnapshot(
  unitId: string,
  deps: AnnotationRetokenizeDeps = defaultDeps,
): Promise<boolean> {
  const pending = await deps.listPendingCandidates(unitId);
  return pending.some((row) =>
    row.analysisGraphCandidate.relations.some(
      (relation) => relation.role === 'retokenize-snapshot',
    ),
  );
}

export async function restoreAnnotationRetokenize(
  input: { textId: string; unitId: string },
  deps: AnnotationRetokenizeDeps = defaultDeps,
): Promise<{ restored: boolean }> {
  const pending = await deps.listPendingCandidates(input.unitId);
  const snapshotRow = pending.find((row) =>
    row.analysisGraphCandidate.relations.some(
      (relation) => relation.role === 'retokenize-snapshot',
    ),
  );
  const snapshot = snapshotRow ? readSnapshotTokens(snapshotRow.analysisGraphCandidate) : null;
  if (!snapshotRow || !snapshot) return { restored: false };
  const tokens = [...(await deps.listTokensByUnitId(input.unitId))];
  const transact = deps.transaction ?? defaultDeps.transaction;
  const write = async () => {
    for (const token of tokens) {
      await deps.removeToken(token.id);
    }
    await writeSnapshotTokens({ ...input, tokens: snapshot }, deps);
    await deps.rejectCandidate(snapshotRow.id);
  };
  if (transact) await transact(write);
  else await write();
  const readback = [...(await deps.listTokensByUnitIds([input.unitId]))].sort(
    (a, b) => a.tokenIndex - b.tokenIndex,
  );
  const expected = [...snapshot].sort((a, b) => a.tokenIndex - b.tokenIndex);
  if (
    !annotationRetokenizeUnchanged(
      readback.map((token) => pickDefaultTranscriptionText(token.form)),
      expected.map((token) => token.form),
    )
  ) {
    throw new Error('retokenize restore readback mismatch');
  }
  const morphs = await deps.listMorphemesByTokenIds(readback.map((token) => token.id));
  if (!snapshotAnnotationReadbackMatches(expected, readback, morphs)) {
    throw new Error('retokenize restore readback mismatch');
  }
  return { restored: true };
}
