import { LinguisticService } from '../../app/languageAssetPageAccess';
import { isLexemeEntry } from '../../db/lexemeNestedIds';
import type { LexemeDocType, LexemeEntryDoc, LexemeResourceDoc } from '../../types/jieyuDbDocTypes';
import {
  applyLexiconEntryFields,
  lexemeHeadword,
  type LexiconEntryFields,
} from '../../utils/dmlexEntry';

export type { LexiconEntryFields, LexiconSenseDraft } from '../../utils/dmlexEntry';

export type LexiconEntrySaveDeps = {
  save: (doc: LexemeDocType) => Promise<string>;
  list: () => Promise<LexemeEntryDoc[]>;
  loadResource: () => Promise<LexemeResourceDoc | null>;
  saveResource: (doc: LexemeResourceDoc) => Promise<string>;
};

const defaultDeps: LexiconEntrySaveDeps = {
  save: (doc) => LinguisticService.lexemes.save(doc),
  list: async () => {
    const rows = await LinguisticService.lexemes.list();
    return rows.filter(isLexemeEntry);
  },
  loadResource: () => LinguisticService.lexemes.getResource(),
  saveResource: (doc) => LinguisticService.lexemes.save(doc),
};

export function mergeLexemeIntoList(
  list: LexemeEntryDoc[],
  stored: LexemeEntryDoc,
): LexemeEntryDoc[] {
  const idx = list.findIndex((row) => row.id === stored.id);
  if (idx < 0) return [...list, stored];
  const next = list.slice();
  next[idx] = stored;
  return next;
}

export async function saveLexiconEntry(
  input: { existing: LexemeEntryDoc | null; fields: LexiconEntryFields },
  deps: LexiconEntrySaveDeps = defaultDeps,
): Promise<LexemeEntryDoc> {
  const now = new Date().toISOString();
  const resource = await deps.loadResource();
  const applied = applyLexiconEntryFields(input.existing, input.fields, resource, now);
  await deps.save(applied.entry);
  await deps.saveResource(applied.resource);
  const stored = (await deps.list()).find((row) => row.id === applied.entry.id);
  if (!stored || !isLexemeEntry(stored)) {
    throw new Error(`lexeme readback missing ${applied.entry.id}`);
  }
  if (lexemeHeadword(stored) !== input.fields.headword.trim()) {
    throw new Error(`lexeme headword readback mismatch for ${applied.entry.id}`);
  }
  return stored;
}
