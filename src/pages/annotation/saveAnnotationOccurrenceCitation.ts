import { getDb, isLexemeEntry } from '../../app/jieyuDbPageAccess';
import { LinguisticService } from '../../app/languageAssetPageAccess';
import { dispatchWorkspaceLexemeUpdated } from '../../utils/workspaceEvents';
import { upsertOccurrenceCitation, type OccurrenceCitation } from './annotationOccurrenceCitation';

export async function saveAnnotationOccurrenceCitation(input: {
  textId: string;
  unitId: string;
  tokenId: string;
  lexemeId: string;
  senseId: string;
}): Promise<void> {
  const lexemes = await LinguisticService.lexemes.list(input.textId);
  const lexeme = lexemes.find((entry) => entry.id === input.lexemeId);
  if (!lexeme) return;
  const citation: OccurrenceCitation = {
    textId: input.textId,
    unitId: input.unitId,
    tokenId: input.tokenId,
    lexemeId: input.lexemeId,
    senseId: input.senseId,
  };
  const updatedAt = new Date().toISOString();
  const db = await getDb();
  await db.dexie.lexemes
    .where('id')
    .equals(input.lexemeId)
    .modify((row) => {
      if (!isLexemeEntry(row)) return;
      row.jieyu = {
        ...(row.jieyu ?? {}),
        occurrenceCitations: upsertOccurrenceCitation(row.jieyu?.occurrenceCitations, citation),
      };
      row.updatedAt = updatedAt;
    });
  dispatchWorkspaceLexemeUpdated({ lexemeId: input.lexemeId });
}
