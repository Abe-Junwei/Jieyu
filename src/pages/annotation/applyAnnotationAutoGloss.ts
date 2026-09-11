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
  listTokenLexemeLinks: (
    targetType: 'token',
    targetId: string,
  ) => Promise<TokenLexemeLinkDocType[]>;
  listTokensByUnitIds: (unitIds: readonly string[]) => Promise<UnitTokenDocType[]>;
};

const defaultDeps: AnnotationAutoGlossDeps = {
  listTokensByUnitId: (unitId) => LinguisticService.units.listTokensByUnitId(unitId),
  listLexemes: () => LinguisticService.lexemes.list(),
  updateTokenGloss: (tokenId, gloss, lang) =>
    LinguisticService.units.updateTokenGloss(tokenId, gloss, lang),
  saveTokenLexemeLink: (data) => LinguisticService.units.saveTokenLexemeLink(data),
  listTokenLexemeLinks: (targetType, targetId) =>
    LinguisticService.units.listTokenLexemeLinks(targetType, targetId),
  listTokensByUnitIds: (unitIds) => LinguisticService.units.listTokensByUnitIds(unitIds),
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

export async function applyAnnotationAutoGlossPreview(
  unitId: string,
  matches: readonly AutoGlossPreviewMatch[],
  deps: AnnotationAutoGlossDeps = defaultDeps,
): Promise<UnitTokenDocType[]> {
  const now = new Date().toISOString();
  for (const match of matches) {
    const lang = resolveAnnotationGlossWriteLang(match.gloss);
    const text = (match.gloss[lang] ?? pickDefaultTranscriptionText(match.gloss)).trim();
    if (text.length === 0) continue;
    await deps.updateTokenGloss(match.tokenId, text, lang);
    const role: TokenLexemeLinkRole = match.matchType;
    await deps.saveTokenLexemeLink({
      id: newId('tll'),
      targetType: 'token',
      targetId: match.tokenId,
      lexemeId: match.lexemeId,
      role,
      confidence: match.confidence,
      createdAt: now,
      updatedAt: now,
    });
  }
  const readback = await deps.listTokensByUnitIds([unitId]);
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
