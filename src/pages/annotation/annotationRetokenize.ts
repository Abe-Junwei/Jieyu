import type { AnnotationAnalysisGraphFixture } from '../../annotation/analysisGraph';
import {
  listPendingAnalysisGraphCandidates,
  rejectAnalysisGraphCandidate,
  submitAnalysisGraphCandidate,
} from '../../annotation/analysisGraphConfirmation';
import { LinguisticService } from '../../app/languageAssetPageAccess';
import type {
  TokenLexemeLinkDocType,
  TokenLexemeLinkRole,
  UnitMorphemeDocType,
  UnitTokenDocType,
} from '../../types/jieyuDbDocTypes';
import { newId, pickDefaultTranscriptionText } from '../../utils/transcriptionFormatters';

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
};

export function proposeAnnotationTokenForms(surface: string, locale = 'und'): string[] {
  const text = surface.trim();
  if (text.length === 0) return [];
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
  token: Pick<UnitTokenDocType, 'pos' | 'gloss'>,
  morphCount: number,
  linkCount: number,
  hasDraft: boolean,
): boolean {
  if (hasDraft) return true;
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

type SnapshotMorpheme = {
  id: string;
  form: string;
  gloss?: string;
  pos?: string;
  morphemeIndex: number;
};

type SnapshotLink = {
  id: string;
  lexemeId: string;
  role?: TokenLexemeLinkRole;
};

type SnapshotToken = {
  id: string;
  form: string;
  gloss?: string;
  pos?: string;
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

function snapshotTokenFromRow(
  token: UnitTokenDocType,
  morphemes: readonly UnitMorphemeDocType[],
  links: readonly TokenLexemeLinkDocType[],
): SnapshotToken {
  const gloss = pickDefaultTranscriptionText(token.gloss ?? {}).trim();
  const pos = (token.pos ?? '').trim();
  return {
    id: token.id,
    form: pickDefaultTranscriptionText(token.form),
    ...(gloss.length > 0 ? { gloss } : {}),
    ...(pos.length > 0 ? { pos } : {}),
    tokenIndex: token.tokenIndex,
    morphemes: morphemes
      .filter((morph) => morph.tokenId === token.id)
      .sort((a, b) => a.morphemeIndex - b.morphemeIndex)
      .map((morph) => {
        const morphGloss = pickDefaultTranscriptionText(morph.gloss ?? {}).trim();
        const morphPos = (morph.pos ?? '').trim();
        return {
          id: morph.id,
          form: pickDefaultTranscriptionText(morph.form),
          ...(morphGloss.length > 0 ? { gloss: morphGloss } : {}),
          ...(morphPos.length > 0 ? { pos: morphPos } : {}),
          morphemeIndex: morph.morphemeIndex,
        };
      }),
    links: links.flatMap((link) => {
      const lexemeId = link.lexemeId.trim();
      if (lexemeId.length === 0) return [];
      const role = link.role;
      return [
        {
          id: link.id,
          lexemeId,
          ...(role && LINK_ROLES.has(role) ? { role } : {}),
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
        morphemes.push({
          id: morphId,
          form: morphForm,
          ...(morphGloss.length > 0 ? { gloss: morphGloss } : {}),
          ...(morphPos.length > 0 ? { pos: morphPos } : {}),
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
        links.push({
          id: linkId,
          lexemeId,
          ...(LINK_ROLES.has(role as TokenLexemeLinkRole)
            ? { role: role as TokenLexemeLinkRole }
            : {}),
        });
      }
    }
    tokens.push({
      id,
      form,
      ...(gloss.length > 0 ? { gloss } : {}),
      ...(pos.length > 0 ? { pos } : {}),
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
}): AnnotationRetokenizePreview {
  const proposedForms = proposeAnnotationTokenForms(input.surface);
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
      form: { default: token.form },
      ...(token.gloss ? { gloss: { default: token.gloss } } : {}),
      ...(token.pos ? { pos: token.pos } : {}),
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
        form: { default: morph.form },
        ...(morph.gloss ? { gloss: { default: morph.gloss } } : {}),
        ...(morph.pos ? { pos: morph.pos } : {}),
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
        createdAt: now,
        updatedAt: now,
      });
    }
  }
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
    const snapshot = tokens.map((token) =>
      snapshotTokenFromRow(
        token,
        morphs.filter((morph) => morph.tokenId === token.id),
        linkGroups.find((group) => group.tokenId === token.id)?.links ?? [],
      ),
    );
    await deps.submitCandidate({
      textId: input.textId,
      unitId: input.unitId,
      candidateGraph: buildRetokenizeSnapshotGraph({
        unitId: input.unitId,
        surface: input.surface,
        tokens: snapshot,
      }),
    });
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
  for (const token of tokens) {
    await deps.removeToken(token.id);
  }
  await writeSnapshotTokens({ ...input, tokens: snapshot }, deps);
  await deps.rejectCandidate(snapshotRow.id);
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
  return { restored: true };
}
