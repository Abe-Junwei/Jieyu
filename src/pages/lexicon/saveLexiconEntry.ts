import { LinguisticService } from '../../app/languageAssetPageAccess';
import type { LexemeDocType, MultiLangString } from '../../types/jieyuDbDocTypes';
import { newId } from '../../utils/transcriptionFormatters';

export type LexiconEntryFields = {
  lemma: string;
  gloss: string;
  citationForm: string;
  language: string;
  notes: string;
};

export type LexiconEntrySaveDeps = {
  save: (doc: LexemeDocType) => Promise<string>;
  list: () => Promise<LexemeDocType[]>;
};

const defaultDeps: LexiconEntrySaveDeps = {
  save: (doc) => LinguisticService.lexemes.save(doc),
  list: () => LinguisticService.lexemes.list(),
};

export function readPrimaryMultiLang(record: MultiLangString | undefined): string {
  if (!record) return '';
  const preferred = record.default?.trim();
  if (preferred) return preferred;
  const first = Object.values(record).find((value) => value.trim().length > 0);
  return first ?? '';
}

export function writePrimaryMultiLang(
  record: MultiLangString | undefined,
  value: string,
): MultiLangString {
  const trimmed = value.trim();
  if (!record || Object.keys(record).length === 0) return { default: trimmed };
  if (Object.prototype.hasOwnProperty.call(record, 'default')) {
    return { ...record, default: trimmed };
  }
  const firstKey = Object.keys(record)[0];
  if (!firstKey) return { default: trimmed };
  return { ...record, [firstKey]: trimmed };
}

export function applyLexiconEntryFields(
  existing: LexemeDocType | null,
  fields: LexiconEntryFields,
  now: string,
): LexemeDocType {
  const lemma = fields.lemma.trim();
  if (lemma.length === 0) throw new Error('empty lemma');
  const gloss = fields.gloss.trim();
  const citationForm = fields.citationForm.trim();
  const language = fields.language.trim();
  const notes = fields.notes.trim();
  const id = existing?.id ?? newId('lex');
  const firstSense = existing?.senses[0];
  const nextGloss = writePrimaryMultiLang(firstSense?.gloss, gloss.length > 0 ? gloss : lemma);
  const restSenses = existing?.senses.slice(1) ?? [];
  const {
    citationForm: _oldCitation,
    language: _oldLanguage,
    notes: _oldNotes,
    ...rest
  } = existing ?? {
    id,
    lemma: { default: lemma },
    senses: [{ gloss: nextGloss }],
    createdAt: now,
    updatedAt: now,
  };
  return {
    ...rest,
    id,
    lemma: writePrimaryMultiLang(existing?.lemma, lemma),
    senses: [{ ...(firstSense ?? {}), gloss: nextGloss }, ...restSenses],
    ...(citationForm.length > 0 ? { citationForm } : {}),
    ...(language.length > 0 ? { language } : {}),
    ...(notes.length > 0 ? { notes: writePrimaryMultiLang(existing?.notes, notes) } : {}),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
}

export function mergeLexemeIntoList(list: LexemeDocType[], stored: LexemeDocType): LexemeDocType[] {
  const idx = list.findIndex((row) => row.id === stored.id);
  if (idx < 0) return [...list, stored];
  const next = list.slice();
  next[idx] = stored;
  return next;
}

export async function saveLexiconEntry(
  input: { existing: LexemeDocType | null; fields: LexiconEntryFields },
  deps: LexiconEntrySaveDeps = defaultDeps,
): Promise<LexemeDocType> {
  const now = new Date().toISOString();
  const doc = applyLexiconEntryFields(input.existing, input.fields, now);
  await deps.save(doc);
  const stored = (await deps.list()).find((row) => row.id === doc.id);
  if (!stored) throw new Error(`lexeme readback missing ${doc.id}`);
  if (readPrimaryMultiLang(stored.lemma) !== fieldsLemma(input.fields)) {
    throw new Error(`lexeme lemma readback mismatch for ${doc.id}`);
  }
  return stored;
}

function fieldsLemma(fields: LexiconEntryFields): string {
  return fields.lemma.trim();
}
