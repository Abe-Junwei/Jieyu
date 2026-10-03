import { getDb, withTransaction } from '../../app/jieyuDbPageAccess';
import { LinguisticService, presentTokenLexemeLink } from '../../app/languageAssetPageAccess';
import { isLexemeEntry } from '../../app/jieyuDbPageAccess';
import type {
  LexemeDocType,
  LexemeEntryDoc,
  TokenLexemeLinkDocType,
} from '../../types/jieyuDbDocTypes';
import {
  lexemeHeadword,
  lexemeMatchValues,
  lexemeSenseChoices,
  lexemeSenseGloss,
  type LexemeSenseChoice,
} from '../../utils/dmlexEntry';
import { newId } from '../../utils/transcriptionFormatters';

export type AnnotationLexemeLinkDeps = {
  transaction?: <T>(action: () => Promise<T>) => Promise<T>;
  searchLexemes: (query: string) => Promise<LexemeDocType[]>;
  saveTokenLexemeLink: (data: TokenLexemeLinkDocType) => Promise<string>;
  listTokenLexemeLinks: (
    targetType: 'token',
    targetId: string,
  ) => Promise<TokenLexemeLinkDocType[]>;
  removeTokenLexemeLinks: (targetType: 'token', targetId: string) => Promise<void>;
};

const defaultDeps: AnnotationLexemeLinkDeps = {
  transaction: async (action) => {
    const db = await getDb();
    return withTransaction(
      db,
      'rw',
      [db.dexie.token_lexeme_links, db.dexie.unit_tokens, db.dexie.unit_morphemes],
      action,
    );
  },
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
  senseGloss?: string;
  linkReviewStatus?: 'draft' | 'suggested' | 'confirmed' | 'rejected';
  entryPartsOfSpeech?: string[];
  brokenCode?: 'CITATION_LEXEME_NOT_FOUND';
};

export type SaveAnnotationLexemeLinkResult =
  | { kind: 'linked'; view: AnnotationTokenLexemeLinkView }
  | { kind: 'choose-sense'; senses: LexemeSenseChoice[] };

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
  senseId?: string,
  deps: AnnotationLexemeLinkDeps = defaultDeps,
): Promise<SaveAnnotationLexemeLinkResult> {
  const hits = await deps.searchLexemes(query);
  const lexeme = resolveLexemeForLinkQuery(query, hits);
  if (!lexeme) {
    throw new Error('lexeme link requires exactly one matching entry');
  }
  const choices = lexemeSenseChoices(lexeme);
  const chosenId = senseId?.trim() ?? '';
  if (choices.length > 1 && chosenId.length === 0) {
    return { kind: 'choose-sense', senses: choices };
  }
  if (chosenId.length > 0 && !choices.some((choice) => choice.senseId === chosenId)) {
    throw new Error('lexeme link sense is not on the entry');
  }
  const storedSenseId = chosenId.length > 0 ? chosenId : choices[0]?.senseId;
  const replace = async () => {
    await deps.removeTokenLexemeLinks('token', tokenId);
    const now = new Date().toISOString();
    const linkId = newId('tll');
    await deps.saveTokenLexemeLink({
      id: linkId,
      targetType: 'token',
      targetId: tokenId,
      lexemeId: lexeme.id,
      ...(storedSenseId ? { senseId: storedSenseId } : {}),
      role: 'manual',
      createdAt: now,
      updatedAt: now,
    });
    const readback = await deps.listTokenLexemeLinks('token', tokenId);
    const stored = readback.find(
      (row) => row.id === linkId && row.lexemeId === lexeme.id && row.senseId === storedSenseId,
    );
    if (!stored) {
      throw new Error(`lexeme link readback missing ${lexeme.id}`);
    }
    return stored;
  };
  const stored = await (deps.transaction ? deps.transaction(replace) : replace());
  const presented = presentTokenLexemeLink({
    linkId: stored.id,
    lexemeId: stored.lexemeId,
    lemma: lexemeHeadword(lexeme),
  });
  const senseGloss = lexemeSenseGloss(lexeme, stored.senseId);
  return {
    kind: 'linked',
    view: {
      ...presented,
      ...(stored.senseId ? { senseId: stored.senseId } : {}),
      ...(senseGloss.length > 0 ? { senseGloss } : {}),
    },
  };
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
