import { LinguisticService } from '../../app/languageAssetPageAccess';
import { upsertOccurrenceCitation, type OccurrenceCitation } from './annotationOccurrenceCitation';

export async function saveAnnotationOccurrenceCitation(input: {
  textId: string;
  unitId: string;
  tokenId: string;
  lexemeId: string;
  senseId: string;
}): Promise<void> {
  const lexemes = await LinguisticService.lexemes.list();
  const lexeme = lexemes.find((entry) => entry.id === input.lexemeId);
  if (!lexeme) return;
  const citation: OccurrenceCitation = {
    textId: input.textId,
    unitId: input.unitId,
    tokenId: input.tokenId,
    lexemeId: input.lexemeId,
    senseId: input.senseId,
  };
  await LinguisticService.lexemes.save({
    ...lexeme,
    jieyu: {
      ...(lexeme.jieyu ?? {}),
      occurrenceCitations: upsertOccurrenceCitation(lexeme.jieyu?.occurrenceCitations, citation),
    },
    updatedAt: new Date().toISOString(),
  });
}
