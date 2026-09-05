import { LinguisticService, presentTokenLexemeLink } from '../../app/languageAssetPageAccess';
import type { LexemeDocType, TokenLexemeLinkDocType } from '../../types/jieyuDbDocTypes';
import { newId, pickDefaultTranscriptionText } from '../../utils/transcriptionFormatters';

export type AnnotationLexemeLinkDeps = {
  searchLexemes: (query: string) => Promise<LexemeDocType[]>;
  saveTokenLexemeLink: (data: TokenLexemeLinkDocType) => Promise<string>;
  listTokenLexemeLinks: (
    targetType: 'token',
    targetId: string,
  ) => Promise<TokenLexemeLinkDocType[]>;
  removeTokenLexemeLinks: (targetType: 'token', targetId: string) => Promise<void>;
};

const defaultDeps: AnnotationLexemeLinkDeps = {
  searchLexemes: (query) => LinguisticService.lexemes.search(query),
  saveTokenLexemeLink: (data) => LinguisticService.units.saveTokenLexemeLink(data),
  listTokenLexemeLinks: (targetType, targetId) =>
    LinguisticService.units.listTokenLexemeLinks(targetType, targetId),
  removeTokenLexemeLinks: (targetType, targetId) =>
    LinguisticService.units.removeTokenLexemeLinks(targetType, targetId),
};

export type AnnotationTokenLexemeLinkView = {
  linkId: string;
  lexemeId: string;
  lemma: string;
  brokenCode?: 'CITATION_LEXEME_NOT_FOUND';
};

export function resolveLexemeForLinkQuery(
  query: string,
  hits: readonly LexemeDocType[],
): LexemeDocType | undefined {
  const normalized = query.trim().toLowerCase();
  if (normalized.length === 0) return undefined;
  const exactId = hits.find((hit) => hit.id.toLowerCase() === normalized);
  if (exactId) return exactId;
  const exactLemma = hits.find((hit) =>
    Object.values(hit.lemma).some((value) => value.trim().toLowerCase() === normalized),
  );
  if (exactLemma) return exactLemma;
  if (hits.length !== 1) return undefined;
  const only = hits[0]!;
  const matches =
    only.id.toLowerCase().includes(normalized) ||
    Object.values(only.lemma).some((value) => value.toLowerCase().includes(normalized));
  return matches ? only : undefined;
}

export async function saveAnnotationTokenLexemeLink(
  tokenId: string,
  query: string,
  deps: AnnotationLexemeLinkDeps = defaultDeps,
): Promise<AnnotationTokenLexemeLinkView> {
  const hits = await deps.searchLexemes(query);
  const lexeme = resolveLexemeForLinkQuery(query, hits);
  if (!lexeme) {
    throw new Error('lexeme link requires exactly one matching entry');
  }
  await deps.removeTokenLexemeLinks('token', tokenId);
  const now = new Date().toISOString();
  const linkId = newId('tll');
  await deps.saveTokenLexemeLink({
    id: linkId,
    targetType: 'token',
    targetId: tokenId,
    lexemeId: lexeme.id,
    role: 'manual',
    createdAt: now,
    updatedAt: now,
  });
  const readback = await deps.listTokenLexemeLinks('token', tokenId);
  const stored = readback.find((row) => row.lexemeId === lexeme.id);
  if (!stored) {
    throw new Error(`lexeme link readback missing ${lexeme.id}`);
  }
  return presentTokenLexemeLink({
    linkId: stored.id,
    lexemeId: stored.lexemeId,
    lemma: pickDefaultTranscriptionText(lexeme.lemma),
  });
}

export async function removeAnnotationTokenLexemeLink(
  tokenId: string,
  deps: AnnotationLexemeLinkDeps = defaultDeps,
): Promise<void> {
  await deps.removeTokenLexemeLinks('token', tokenId);
  const readback = await deps.listTokenLexemeLinks('token', tokenId);
  if (readback.length > 0) {
    throw new Error(`lexeme unlink readback still has ${readback.length} rows`);
  }
}
