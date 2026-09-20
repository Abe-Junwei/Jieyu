import { LinguisticService } from '../../app/languageAssetPageAccess';
import type { LexemeDocType } from '../../types/jieyuDbDocTypes';

export type LexiconEntryDeleteDeps = {
  remove: (lexemeId: string) => Promise<void>;
  list: () => Promise<LexemeDocType[]>;
};

const defaultDeps: LexiconEntryDeleteDeps = {
  remove: (lexemeId) => LinguisticService.lexemes.delete(lexemeId),
  list: () => LinguisticService.lexemes.list(),
};

export async function deleteLexiconEntry(
  lexemeId: string,
  deps: LexiconEntryDeleteDeps = defaultDeps,
): Promise<void> {
  const id = lexemeId.trim();
  if (id.length === 0) throw new Error('empty lexeme id');
  await deps.remove(id);
  const stored = (await deps.list()).find((row) => row.id === id);
  if (stored) throw new Error(`lexeme delete readback still present ${id}`);
}
