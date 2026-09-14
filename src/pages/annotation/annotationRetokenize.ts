import { submitAnalysisGraphCandidate } from '../../annotation/analysisGraphConfirmation';
import type { AnnotationAnalysisGraphFixture } from '../../annotation/analysisGraph';
import { LinguisticService } from '../../app/languageAssetPageAccess';
import type {
  TokenLexemeLinkDocType,
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

export type AnnotationRetokenizeApplyKind = 'unchanged' | 'tokens' | 'candidate';

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
  submitCandidate: typeof submitAnalysisGraphCandidate;
};

const defaultDeps: AnnotationRetokenizeDeps = {
  listTokensByUnitId: (unitId) => LinguisticService.units.listTokensByUnitId(unitId),
  listTokensByUnitIds: (unitIds) => LinguisticService.units.listTokensByUnitIds(unitIds),
  listMorphemesByTokenIds: (tokenIds) => LinguisticService.units.listMorphemesByTokenIds(tokenIds),
  listTokenLexemeLinks: (targetType, targetId) =>
    LinguisticService.units.listTokenLexemeLinks(targetType, targetId),
  saveToken: (data) => LinguisticService.units.saveToken(data),
  removeToken: (tokenId) => LinguisticService.units.removeToken(tokenId),
  submitCandidate: submitAnalysisGraphCandidate,
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

export async function applyAnnotationRetokenize(
  input: {
    textId: string;
    unitId: string;
    surface: string;
    proposedForms: readonly string[];
    draftTokenIds?: ReadonlySet<string>;
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
  if (blocked) {
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
  const now = new Date().toISOString();
  for (const token of tokens) {
    await deps.removeToken(token.id);
  }
  for (const [index, form] of proposedForms.entries()) {
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
  if (!annotationRetokenizeUnchanged(readForms, proposedForms)) {
    throw new Error('retokenize readback mismatch');
  }
  return { kind: 'tokens', proposedForms };
}
