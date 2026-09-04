import { LinguisticService } from '../../app/languageAssetPageAccess';
import type { UnitTokenDocType } from '../../types/jieyuDbDocTypes';
import type { AnnotationTokenWrite } from './annotationTokenDrafts';

export type AnnotationTokenWriteDeps = {
  updateTokenPos: (tokenId: string, pos: string | null) => Promise<void>;
  updateTokenGloss: (tokenId: string, gloss: string | null, lang?: string) => Promise<void>;
  listTokensByUnitIds: (unitIds: readonly string[]) => Promise<UnitTokenDocType[]>;
};

const defaultDeps: AnnotationTokenWriteDeps = {
  updateTokenPos: (tokenId, pos) => LinguisticService.units.updateTokenPos(tokenId, pos),
  updateTokenGloss: (tokenId, gloss, lang) =>
    LinguisticService.units.updateTokenGloss(tokenId, gloss, lang),
  listTokensByUnitIds: (unitIds) => LinguisticService.units.listTokensByUnitIds(unitIds),
};

export function verifyAnnotationTokenReadback(
  writes: readonly AnnotationTokenWrite[],
  tokens: readonly UnitTokenDocType[],
): void {
  const byId = new Map(tokens.map((token) => [token.id, token]));
  for (const write of writes) {
    const row = byId.get(write.tokenId);
    if (!row) {
      throw new Error(`readback missing token ${write.tokenId}`);
    }
    if (write.pos !== undefined) {
      const actual = (row.pos ?? '').trim();
      const expected = (write.pos ?? '').trim();
      if (actual !== expected) {
        throw new Error(`pos readback mismatch for ${write.tokenId}`);
      }
    }
    if (write.gloss !== undefined) {
      const actual = (row.gloss?.[write.glossLang] ?? '').trim();
      const expected = (write.gloss ?? '').trim();
      if (actual !== expected) {
        throw new Error(`gloss readback mismatch for ${write.tokenId}`);
      }
    }
  }
}

export async function saveAnnotationIgtRowTokens(
  unitId: string,
  writes: readonly AnnotationTokenWrite[],
  deps: AnnotationTokenWriteDeps = defaultDeps,
): Promise<UnitTokenDocType[]> {
  if (writes.length === 0) return [];
  for (const write of writes) {
    if (write.pos !== undefined) {
      await deps.updateTokenPos(write.tokenId, write.pos);
    }
    if (write.gloss !== undefined) {
      await deps.updateTokenGloss(write.tokenId, write.gloss, write.glossLang);
    }
  }
  const readback = await deps.listTokensByUnitIds([unitId]);
  verifyAnnotationTokenReadback(writes, readback);
  return readback;
}
