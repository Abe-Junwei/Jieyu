import { LinguisticService, presentTokenLexemeLink } from '../../app/languageAssetPageAccess';
import { isLexemeEntry } from '../../db/lexemeNestedIds';
import type {
  LexemeDocType,
  LexemeEntryDoc,
  TokenLexemeLinkDocType,
} from '../../types/jieyuDbDocTypes';
import { lexemeHeadword, lexemeMatchValues } from '../../utils/dmlexEntry';
import { newId } from '../../utils/transcriptionFormatters';

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
  senseId?: string;
  entryPartsOfSpeech?: string[];
  brokenCode?: 'CITATION_LEXEME_NOT_FOUND';
};

export function resolveLexemeForLinkQuery(
  query: string,
  hits: readonly LexemeDocType[],
): LexemeEntryDoc | undefined {
  const normalized = query.trim().toLowerCase();
  if (normalized.length === 0) return undefined;
  const entries = hits.filter(isLexemeEntry);
  const exactId = entries.find((hit) => hit.id.toLowerCase() === normalized);
  if (exactId) return exactId;
  const exactLemma = entries.find((hit) => lexemeMatchValues(hit).includes(normalized));
  if (exactLemma) return exactLemma;
  if (entries.length !== 1) return undefined;
  const only = entries[0]!;
  const matches =
    only.id.toLowerCase().includes(normalized) ||
    lexemeMatchValues(only).some((value) => value.includes(normalized));
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
    ...(lexeme.entry.senses?.[0]?.id ? { senseId: lexeme.entry.senses[0].id } : {}),
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
    lemma: lexemeHeadword(lexeme),
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
