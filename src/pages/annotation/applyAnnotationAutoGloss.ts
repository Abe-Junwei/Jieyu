import { getDb, withTransaction } from '../../app/jieyuDbPageAccess';
import { LinguisticService } from '../../app/languageAssetPageAccess';
import type {
  LexemeDocType,
  TokenLexemeLinkDocType,
  TokenLexemeLinkRole,
  UnitTokenDocType,
} from '../../types/jieyuDbDocTypes';
import { newId, pickDefaultTranscriptionText } from '../../utils/transcriptionFormatters';
import {
  previewAutoGlossMatches,
  type AutoGlossPreviewMatch,
  type AutoGlossPreviewResult,
} from '../../ai/autoGlossPreview';
import { resolveAnnotationGlossWriteLang } from './annotationTokenDrafts';

export type AnnotationAutoGlossDeps = {
  listTokensByUnitId: (unitId: string) => Promise<UnitTokenDocType[]>;
  listLexemes: () => Promise<LexemeDocType[]>;
  updateTokenGloss: (tokenId: string, gloss: string | null, lang?: string) => Promise<void>;
  saveTokenLexemeLink: (data: TokenLexemeLinkDocType) => Promise<string>;
  removeTokenLexemeLinks: (targetType: 'token', targetId: string) => Promise<void>;
  listTokenLexemeLinks: (
    targetType: 'token',
    targetId: string,
  ) => Promise<TokenLexemeLinkDocType[]>;
  listTokensByUnitIds: (unitIds: readonly string[]) => Promise<UnitTokenDocType[]>;
  transaction?: (<T>(action: () => Promise<T>) => Promise<T>) | undefined;
};

const defaultDeps: AnnotationAutoGlossDeps = {
  listTokensByUnitId: (unitId) => LinguisticService.units.listTokensByUnitId(unitId),
  listLexemes: () => LinguisticService.lexemes.list(),
  updateTokenGloss: (tokenId, gloss, lang) =>
    LinguisticService.units.updateTokenGloss(tokenId, gloss, lang),
  saveTokenLexemeLink: (data) => LinguisticService.units.saveTokenLexemeLink(data),
  removeTokenLexemeLinks: (targetType, targetId) =>
    LinguisticService.units.removeTokenLexemeLinks(targetType, targetId),
  listTokenLexemeLinks: (targetType, targetId) =>
    LinguisticService.units.listTokenLexemeLinks(targetType, targetId),
  listTokensByUnitIds: (unitIds) => LinguisticService.units.listTokensByUnitIds(unitIds),
  transaction: async (action) => {
    const db = await getDb();
    return withTransaction(db, 'rw', [db.dexie.unit_tokens, db.dexie.token_lexeme_links], action, {
      label: 'annotation-autogloss',
    });
  },
};

export async function previewAnnotationAutoGloss(
  unitId: string,
  skipTokenIds: ReadonlySet<string> = new Set(),
  deps: AnnotationAutoGlossDeps = defaultDeps,
): Promise<AutoGlossPreviewResult> {
  const [tokens, lexemes] = await Promise.all([
    deps.listTokensByUnitId(unitId),
    deps.listLexemes(),
  ]);
  return previewAutoGlossMatches(tokens, lexemes, skipTokenIds);
}

function glossText(
  gloss: UnitTokenDocType['gloss'] | AutoGlossPreviewMatch['gloss'],
  lang: string,
): string {
  if (!gloss) return '';
  return (gloss[lang] ?? pickDefaultTranscriptionText(gloss)).trim();
}

export async function applyAnnotationAutoGlossPreview(
  unitId: string,
  matches: readonly AutoGlossPreviewMatch[],
  deps: Partial<AnnotationAutoGlossDeps> = {},
  draftTokenIds: ReadonlySet<string> = new Set(),
): Promise<UnitTokenDocType[]> {
  const resolved: AnnotationAutoGlossDeps = {
    ...defaultDeps,
    ...deps,
    transaction: deps.transaction ?? defaultDeps.transaction,
  };
  for (const match of matches) {
    if (draftTokenIds.has(match.tokenId)) {
      throw new Error(`autogloss preview conflict for ${match.tokenId}`);
    }
  }
  const now = new Date().toISOString();
  const transact = resolved.transaction;
  const write = async () => {
    const live = await resolved.listTokensByUnitId(unitId);
    const byId = new Map(live.map((token) => [token.id, token]));
    for (const match of matches) {
      const token = byId.get(match.tokenId);
      const previewForm = pickDefaultTranscriptionText(match.tokenForm);
      if (token === undefined || pickDefaultTranscriptionText(token.form) !== previewForm) {
        throw new Error(`autogloss preview conflict for ${match.tokenId}`);
      }
      const lang = resolveAnnotationGlossWriteLang(match.gloss);
      const current = glossText(token.gloss, lang);
      const target = glossText(match.gloss, lang);
      const observed = match.observedGloss?.trim();
      const manual =
        observed !== undefined
          ? current !== observed && current !== target
          : current.length > 0 && current !== target;
      if (manual) {
        throw new Error(`autogloss preview conflict for ${match.tokenId}`);
      }
    }
    for (const match of matches) {
      const lang = resolveAnnotationGlossWriteLang(match.gloss);
      const text = glossText(match.gloss, lang);
      if (text.length === 0) continue;
      await resolved.updateTokenGloss(match.tokenId, text, lang);
      await resolved.removeTokenLexemeLinks('token', match.tokenId);
      const role: TokenLexemeLinkRole = match.matchType;
      await resolved.saveTokenLexemeLink({
        id: newId('tll'),
        targetType: 'token',
        targetId: match.tokenId,
        lexemeId: match.lexemeId,
        ...(match.senseId ? { senseId: match.senseId } : {}),
        role,
        confidence: match.confidence,
        createdAt: now,
        updatedAt: now,
      });
    }
  };
  if (transact) await transact(write);
  else await write();
  const readback = await resolved.listTokensByUnitIds([unitId]);
  for (const match of matches) {
    const row = readback.find((token) => token.id === match.tokenId);
    if (!row) throw new Error(`autogloss readback missing token ${match.tokenId}`);
    const lang = resolveAnnotationGlossWriteLang(match.gloss);
    const expected = (match.gloss[lang] ?? pickDefaultTranscriptionText(match.gloss)).trim();
    const actual = (row.gloss?.[lang] ?? pickDefaultTranscriptionText(row.gloss ?? {})).trim();
    if (actual !== expected) {
      throw new Error(`autogloss gloss readback mismatch for ${match.tokenId}`);
    }
  }
  return readback;
}
