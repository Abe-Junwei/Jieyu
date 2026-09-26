import { LinguisticService } from '../../app/languageAssetPageAccess';
import type { LexemeDocType, MultiLangString } from '../../types/jieyuDbDocTypes';
import { readSenseParentId } from '../../utils/lexemeSenseTree';
import { newId } from '../../utils/transcriptionFormatters';

export type LexiconEntryScalarField =
  | 'lemma'
  | 'gloss'
  | 'category'
  | 'citationForm'
  | 'language'
  | 'notes'
  | 'lexemeType'
  | 'pronunciation'
  | 'etymologyForm'
  | 'etymologyGloss'
  | 'etymologySourceLanguage'
  | 'literalMeaning'
  | 'bibliography';

export type LexiconExampleDraft = {
  source: string;
  translation?: string;
};

export type LexiconSenseDraft = {
  id?: string;
  parentId?: string;
  gloss: string;
  definition: string;
  category?: string;
  examples?: LexiconExampleDraft[];
};

export type LexiconFormDraft = {
  id?: string;
  transcription: string;
};

export type LexiconEntryFields = {
  lemma: string;
  gloss: string;
  category: string;
  citationForm: string;
  language: string;
  notes: string;
  lexemeType: string;
  pronunciation: string;
  etymologyForm: string;
  etymologyGloss: string;
  etymologySourceLanguage: string;
  literalMeaning: string;
  bibliography: string;
  primarySenseId?: string;
  examples: LexiconExampleDraft[];
  extraSenses: LexiconSenseDraft[];
  forms: LexiconFormDraft[];
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

function readCategory(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function exampleDraftsFromStored(examples: unknown): LexiconExampleDraft[] {
  if (!Array.isArray(examples)) return [];
  return examples.flatMap((row) => {
    if (!row || typeof row !== 'object') return [];
    const sourceValue = 'source' in row ? row.source : undefined;
    const source = typeof sourceValue === 'string' ? sourceValue.trim() : '';
    if (source.length === 0) return [];
    const translationValue = 'translation' in row ? row.translation : undefined;
    const translation = typeof translationValue === 'string' ? translationValue.trim() : '';
    return translation.length > 0 ? [{ source, translation }] : [{ source }];
  });
}

export function withExampleChange(
  examples: LexiconExampleDraft[] | undefined,
  index: number,
  field: 'source' | 'translation',
  value: string,
): LexiconExampleDraft[] {
  return (examples ?? []).map((row, rowIndex) =>
    rowIndex === index ? { ...row, [field]: value } : row,
  );
}

export function withAddedExample(
  examples: LexiconExampleDraft[] | undefined,
): LexiconExampleDraft[] {
  return [...(examples ?? []), { source: '' }];
}

export function withoutExample(
  examples: LexiconExampleDraft[] | undefined,
  index: number,
): LexiconExampleDraft[] {
  return (examples ?? []).filter((_, rowIndex) => rowIndex !== index);
}

function nestedIdOf(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/** Carry a stored nested id onto an editor draft without writing blank/undefined keys. */
export function draftIdFromNested(id: unknown): { id: string } | Record<string, never> {
  const value = nestedIdOf(id);
  return value.length > 0 ? { id: value } : {};
}

function keepOrCreateNestedId(
  preferred: { id?: unknown } | undefined,
  fallback: { id?: unknown } | undefined,
  prefix: string,
): string {
  const preferredId = nestedIdOf(preferred?.id);
  if (preferredId.length > 0) return preferredId;
  const fallbackId = nestedIdOf(fallback?.id);
  if (fallbackId.length > 0) return fallbackId;
  return newId(prefix);
}

function findExistingRow<T extends { id?: unknown }>(
  rows: T[] | undefined,
  draftId: unknown,
  index: number,
): T | undefined {
  const id = nestedIdOf(draftId);
  if (id.length > 0 && rows) {
    return rows.find((row) => nestedIdOf(row.id) === id);
  }
  return rows?.[index];
}

export function applyLexiconEntryFields(
  existing: LexemeDocType | null,
  fields: LexiconEntryFields,
  now: string,
): LexemeDocType {
  const lemma = fields.lemma.trim();
  if (lemma.length === 0) throw new Error('empty lemma');
  const gloss = fields.gloss.trim();
  const category = readCategory(fields.category);
  const citationForm = fields.citationForm.trim();
  const language = fields.language.trim();
  const notes = fields.notes.trim();
  const lexemeType = fields.lexemeType.trim();
  const pronunciation = fields.pronunciation.trim();
  const etymologyForm = fields.etymologyForm.trim();
  const etymologyGloss = fields.etymologyGloss.trim();
  const etymologySourceLanguage = fields.etymologySourceLanguage.trim();
  const literalMeaning = fields.literalMeaning.trim();
  const bibliography = fields.bibliography.trim();
  const etymology =
    etymologyForm.length > 0
      ? {
          form: etymologyForm,
          ...(etymologyGloss.length > 0 ? { gloss: etymologyGloss } : {}),
          ...(etymologySourceLanguage.length > 0
            ? { sourceLanguage: etymologySourceLanguage }
            : {}),
        }
      : undefined;
  const primaryExamples = exampleDraftsFromStored(fields.examples);
  const id = existing?.id ?? newId('lex');
  const firstSense = existing?.senses[0];
  const nextGloss = writePrimaryMultiLang(firstSense?.gloss, gloss.length > 0 ? gloss : lemma);
  const primarySenseId = keepOrCreateNestedId({ id: fields.primarySenseId }, firstSense, 'sense');
  const extraSenses = fields.extraSenses.flatMap((draft, index) => {
    const glossText = draft.gloss.trim();
    if (glossText.length === 0) return [];
    const previous = findExistingRow(existing?.senses.slice(1), draft.id, index);
    const definitionText = draft.definition.trim();
    const {
      definition: _oldDefinition,
      parentId: _oldParentId,
      category: _oldCategory,
      examples: _oldExamples,
      ...previousRest
    } = previous ?? {
      gloss: { default: glossText },
    };
    const parentId = readSenseParentId(draft);
    const senseCategory = readCategory(draft.category);
    const senseExamples = exampleDraftsFromStored(draft.examples);
    return [
      {
        ...previousRest,
        id: keepOrCreateNestedId(draft, previous, 'sense'),
        gloss: writePrimaryMultiLang(previous?.gloss, glossText),
        ...(definitionText.length > 0
          ? { definition: writePrimaryMultiLang(previous?.definition, definitionText) }
          : {}),
        ...(senseCategory.length > 0 ? { category: senseCategory } : {}),
        ...(senseExamples.length > 0 ? { examples: senseExamples } : {}),
        ...(parentId.length > 0 ? { parentId } : {}),
      },
    ];
  });
  const nextForms = fields.forms.flatMap((draft, index) => {
    const text = draft.transcription.trim();
    if (text.length === 0) return [];
    const previous = findExistingRow(existing?.forms, draft.id, index);
    return [
      {
        ...(previous ?? {}),
        id: keepOrCreateNestedId(draft, previous, 'form'),
        transcription: writePrimaryMultiLang(
          previous?.transcription as MultiLangString | undefined,
          text,
        ),
      },
    ];
  });
  const {
    category: _oldPrimaryCategory,
    examples: _oldPrimaryExamples,
    ...primarySenseRest
  } = firstSense ?? {
    gloss: nextGloss,
  };
  const {
    citationForm: _oldCitation,
    language: _oldLanguage,
    notes: _oldNotes,
    forms: _oldForms,
    lexemeType: _oldLexemeType,
    pronunciation: _oldPronunciation,
    etymology: _oldEtymology,
    literalMeaning: _oldLiteralMeaning,
    bibliography: _oldBibliography,
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
    senses: [
      {
        ...primarySenseRest,
        id: primarySenseId,
        gloss: nextGloss,
        ...(category.length > 0 ? { category } : {}),
        ...(primaryExamples.length > 0 ? { examples: primaryExamples } : {}),
      },
      ...extraSenses,
    ],
    ...(citationForm.length > 0 ? { citationForm } : {}),
    ...(language.length > 0 ? { language } : {}),
    ...(lexemeType.length > 0 ? { lexemeType } : {}),
    ...(pronunciation.length > 0 ? { pronunciation } : {}),
    ...(etymology ? { etymology } : {}),
    ...(literalMeaning.length > 0 ? { literalMeaning } : {}),
    ...(bibliography.length > 0 ? { bibliography } : {}),
    ...(notes.length > 0 ? { notes: writePrimaryMultiLang(existing?.notes, notes) } : {}),
    ...(nextForms.length > 0 ? { forms: nextForms } : {}),
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
  const expectedExtra = input.fields.extraSenses
    .map((sense) => sense.gloss.trim())
    .filter((value) => value.length > 0);
  const storedExtra = stored.senses.slice(1).map((sense) => readPrimaryMultiLang(sense.gloss));
  if (
    expectedExtra.length !== storedExtra.length ||
    expectedExtra.some((value, index) => value !== storedExtra[index])
  ) {
    throw new Error(`lexeme extra-sense readback mismatch for ${doc.id}`);
  }
  const expectedForms = input.fields.forms
    .map((value) => value.transcription.trim())
    .filter((value) => value.length > 0);
  const storedForms = (stored.forms ?? []).map((form) =>
    readPrimaryMultiLang(form.transcription as MultiLangString | undefined),
  );
  if (
    expectedForms.length !== storedForms.length ||
    expectedForms.some((value, index) => value !== storedForms[index])
  ) {
    throw new Error(`lexeme form readback mismatch for ${doc.id}`);
  }
  return stored;
}

function fieldsLemma(fields: LexiconEntryFields): string {
  return fields.lemma.trim();
}
