import {
  DMLEX_HOMOGRAPH,
  DMLEX_RESOURCE_ID,
  DMLEX_SUBSENSE,
  type DmlexEntry,
  type DmlexRelation,
  type DmlexRelationType,
  type DmlexScopeRestriction,
  type DmlexSense,
  type JieyuExampleRef,
  type JieyuLexemeExtras,
  type JieyuNote,
} from '../db/dmlexTypes';
import type { LexemeEntryDoc, LexemeResourceDoc, MultiLangString } from '../db/types';
import { newId } from './transcriptionFormatters';

export const DEFAULT_TRANSLATION_LANG = 'zh';

export type LexiconSenseDraft = {
  id: string;
  parentId: string;
  indicator: string;
  translation: string;
  translationLang: string;
  explanation: string;
  explanationLang: string;
  definition: string;
  example: string;
  exampleTranslation: string;
  exampleTranslationLang: string;
  exampleSegmentId: string;
  labels: string;
  note: string;
};

export type LexiconEntryFields = {
  headword: string;
  homographNumber: string;
  partsOfSpeech: string;
  labels: string;
  pronunciation: string;
  inflectedForms: string;
  etymon: string;
  etymonLang: string;
  note: string;
  homographEntryId: string;
  senses: LexiconSenseDraft[];
};

export function emptySenseDraft(): LexiconSenseDraft {
  return {
    id: '',
    parentId: '',
    indicator: '',
    translation: '',
    translationLang: DEFAULT_TRANSLATION_LANG,
    explanation: '',
    explanationLang: DEFAULT_TRANSLATION_LANG,
    definition: '',
    example: '',
    exampleTranslation: '',
    exampleTranslationLang: DEFAULT_TRANSLATION_LANG,
    exampleSegmentId: '',
    labels: '',
    note: '',
  };
}

export function emptyEntryFields(): LexiconEntryFields {
  return {
    headword: '',
    homographNumber: '',
    partsOfSpeech: '',
    labels: '',
    pronunciation: '',
    inflectedForms: '',
    etymon: '',
    etymonLang: '',
    note: '',
    homographEntryId: '',
    senses: [emptySenseDraft()],
  };
}

export function splitTokens(value: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of value.split(/[,，\n]/)) {
    const text = part.trim();
    if (text.length === 0 || seen.has(text)) continue;
    seen.add(text);
    out.push(text);
  }
  return out;
}

export function lexemeHeadword(lexeme: LexemeEntryDoc): string {
  return lexeme.entry.headword.trim();
}

export function lexemePrimaryTranslation(lexeme: LexemeEntryDoc): string {
  const sense = lexeme.entry.senses?.[0];
  const translation = sense?.headwordTranslations?.[0]?.text?.trim() ?? '';
  if (translation.length > 0) return translation;
  return sense?.definitions?.[0]?.text?.trim() ?? '';
}

/** Annotation and auto-gloss read a MultiLangString. This is a projection, not a stored field. */
export function lexemeGlossProjection(lexeme: LexemeEntryDoc): MultiLangString {
  const gloss: MultiLangString = {};
  const sense = lexeme.entry.senses?.[0];
  for (const item of sense?.headwordTranslations ?? []) {
    const text = item.text.trim();
    if (text.length === 0) continue;
    const trimmedLang = item.langCode?.trim() ?? '';
    const key = trimmedLang.length > 0 ? trimmedLang : 'default';
    if (gloss[key] === undefined) gloss[key] = text;
  }
  if (Object.keys(gloss).length === 0) {
    const definition = sense?.definitions?.[0]?.text?.trim() ?? '';
    if (definition.length > 0) gloss.default = definition;
  }
  return gloss;
}

export function lexemeMatchValues(lexeme: LexemeEntryDoc): string[] {
  const values = [lexeme.entry.headword];
  for (const form of lexeme.entry.inflectedForms ?? []) values.push(form.text);
  return values.map((value) => value.trim().toLowerCase()).filter((value) => value.length > 0);
}

export function emptyDmlexResource(now: string): LexemeResourceDoc {
  return {
    id: DMLEX_RESOURCE_ID,
    kind: 'resource',
    resource: {
      langCode: 'und',
      translationLanguages: [DEFAULT_TRANSLATION_LANG],
    },
    createdAt: now,
    updatedAt: now,
  };
}

function parentByChild(relations: readonly DmlexRelation[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const relation of relations) {
    if (relation.type !== DMLEX_SUBSENSE || relation.members.length < 2) continue;
    const parent = relation.members[0]?.ref ?? '';
    const child = relation.members[1]?.ref ?? '';
    if (parent.length > 0 && child.length > 0) map.set(child, parent);
  }
  return map;
}

export function subsenseParentId(senseId: string, relations: readonly DmlexRelation[]): string {
  return parentByChild(relations).get(senseId) ?? '';
}

export function senseTreeDepth(senseId: string, relations: readonly DmlexRelation[]): number {
  const parents = parentByChild(relations);
  let depth = 0;
  let current = parents.get(senseId) ?? '';
  const seen = new Set<string>();
  while (current.length > 0 && !seen.has(current) && depth < 8) {
    seen.add(current);
    depth += 1;
    current = parents.get(current) ?? '';
  }
  return depth;
}

export function homographPartnerId(entryId: string, relations: readonly DmlexRelation[]): string {
  for (const relation of relations) {
    if (relation.type !== DMLEX_HOMOGRAPH) continue;
    const refs = relation.members.map((member) => member.ref);
    if (!refs.includes(entryId)) continue;
    return refs.find((ref) => ref !== entryId) ?? '';
  }
  return '';
}

function noteFor(
  notes: readonly JieyuNote[] | undefined,
  owner: 'entry' | 'sense',
  ref: string,
): string {
  return notes?.find((note) => note.owner === owner && note.ref === ref)?.text ?? '';
}

function draftFromSense(
  sense: DmlexSense,
  extras: JieyuLexemeExtras | undefined,
  relations: readonly DmlexRelation[],
): LexiconSenseDraft {
  const id = sense.id ?? '';
  const translation = sense.headwordTranslations?.[0];
  const explanation = sense.headwordExplanations?.[0];
  const example = sense.examples?.[0];
  const exampleTranslation = example?.exampleTranslations?.[0];
  const exampleRef = extras?.exampleRefs?.find(
    (ref) => ref.senseId === id && ref.exampleIndex === 0,
  );
  return {
    id,
    parentId: id.length > 0 ? subsenseParentId(id, relations) : '',
    indicator: sense.indicator ?? '',
    translation: translation?.text ?? '',
    translationLang: langOrDefault(translation?.langCode, DEFAULT_TRANSLATION_LANG),
    explanation: explanation?.text ?? '',
    explanationLang: langOrDefault(explanation?.langCode, DEFAULT_TRANSLATION_LANG),
    definition: sense.definitions?.[0]?.text ?? '',
    example: example?.text ?? '',
    exampleTranslation: exampleTranslation?.text ?? '',
    exampleTranslationLang: langOrDefault(exampleTranslation?.langCode, DEFAULT_TRANSLATION_LANG),
    exampleSegmentId: exampleRef?.segmentId ?? '',
    labels: (sense.labels ?? []).join(', '),
    note: noteFor(extras?.notes, 'sense', id),
  };
}

export function fieldsFromEntry(
  lexeme: LexemeEntryDoc | null,
  relations: readonly DmlexRelation[] = [],
): LexiconEntryFields {
  if (!lexeme) return emptyEntryFields();
  const entry = lexeme.entry;
  const etymon = entry.etymologies?.[0]?.etymons?.[0]?.etymonUnits?.[0];
  const senses = (entry.senses ?? []).map((sense) =>
    draftFromSense(sense, lexeme.jieyu, relations),
  );
  return {
    headword: entry.headword,
    homographNumber: entry.homographNumber ?? '',
    partsOfSpeech: (entry.partsOfSpeech ?? []).join(', '),
    labels: (entry.labels ?? []).join(', '),
    pronunciation: entry.pronunciations?.[0]?.transcriptions?.[0]?.text ?? '',
    inflectedForms: (entry.inflectedForms ?? []).map((form) => form.text).join(', '),
    etymon: etymon?.text ?? '',
    etymonLang: etymon?.langCode ?? '',
    note: noteFor(lexeme.jieyu?.notes, 'entry', lexeme.id),
    homographEntryId: homographPartnerId(lexeme.id, relations),
    senses: senses.length > 0 ? senses : [emptySenseDraft()],
  };
}

function langOrDefault(langCode: string | undefined, fallback: string): string {
  const trimmed = langCode?.trim() ?? '';
  return trimmed.length > 0 ? trimmed : fallback;
}

function textLang(text: string, langCode: string): { text: string; langCode: string } | undefined {
  const trimmed = text.trim();
  if (trimmed.length === 0) return undefined;
  return { text: trimmed, langCode: langOrDefault(langCode, DEFAULT_TRANSLATION_LANG) };
}

function buildSense(
  draft: LexiconSenseDraft,
  id: string,
): { sense: DmlexSense; note?: JieyuNote; exampleRef?: JieyuExampleRef } | undefined {
  const translation = textLang(draft.translation, draft.translationLang);
  const explanation = textLang(draft.explanation, draft.explanationLang);
  const definition = draft.definition.trim();
  const exampleText = draft.example.trim();
  const labels = splitTokens(draft.labels);
  const indicator = draft.indicator.trim();
  const noteText = draft.note.trim();
  const exampleTranslation = textLang(draft.exampleTranslation, draft.exampleTranslationLang);
  const hasContent =
    translation !== undefined ||
    explanation !== undefined ||
    definition.length > 0 ||
    exampleText.length > 0 ||
    labels.length > 0 ||
    indicator.length > 0 ||
    noteText.length > 0;
  if (!hasContent) return undefined;
  const sense: DmlexSense = {
    id,
    ...(indicator.length > 0 ? { indicator } : {}),
    ...(labels.length > 0 ? { labels } : {}),
    ...(definition.length > 0 ? { definitions: [{ text: definition }] } : {}),
    ...(translation ? { headwordTranslations: [translation] } : {}),
    ...(explanation ? { headwordExplanations: [explanation] } : {}),
    ...(exampleText.length > 0
      ? {
          examples: [
            {
              text: exampleText,
              ...(exampleTranslation ? { exampleTranslations: [exampleTranslation] } : {}),
            },
          ],
        }
      : {}),
  };
  const segmentId = draft.exampleSegmentId.trim();
  return {
    sense,
    ...(noteText.length > 0 ? { note: { owner: 'sense' as const, ref: id, text: noteText } } : {}),
    ...(exampleText.length > 0 && segmentId.length > 0
      ? { exampleRef: { senseId: id, exampleIndex: 0, segmentId } }
      : {}),
  };
}

function ensureRelationType(
  types: readonly DmlexRelationType[],
  type: string,
  scopeRestriction: DmlexScopeRestriction,
): DmlexRelationType[] {
  if (types.some((row) => row.type === type)) return [...types];
  return [...types, { type, scopeRestriction }];
}

export function applyLexiconEntryFields(
  existing: LexemeEntryDoc | null,
  fields: LexiconEntryFields,
  resource: LexemeResourceDoc | null,
  now: string,
): { entry: LexemeEntryDoc; resource: LexemeResourceDoc } {
  const headword = fields.headword.trim();
  if (headword.length === 0) throw new Error('empty headword');
  const id = existing?.id ?? newId('lex');
  const built = fields.senses.flatMap((draft) => {
    const trimmedSenseId = draft.id.trim();
    const senseId = trimmedSenseId.length > 0 ? trimmedSenseId : newId('sense');
    const row = buildSense({ ...draft, id: senseId }, senseId);
    return row ? [{ draft: { ...draft, id: senseId }, ...row }] : [];
  });
  const senseIds = new Set(built.map((row) => row.sense.id ?? ''));
  const partsOfSpeech = splitTokens(fields.partsOfSpeech);
  const labels = splitTokens(fields.labels);
  const inflectedForms = splitTokens(fields.inflectedForms).map((text) => ({ text }));
  const pronunciation = fields.pronunciation.trim();
  const etymon = fields.etymon.trim();
  const homographNumber = fields.homographNumber.trim();
  const entry: DmlexEntry = {
    id,
    headword,
    ...(homographNumber.length > 0 ? { homographNumber } : {}),
    ...(partsOfSpeech.length > 0 ? { partsOfSpeech } : {}),
    ...(labels.length > 0 ? { labels } : {}),
    ...(pronunciation.length > 0
      ? { pronunciations: [{ transcriptions: [{ text: pronunciation }] }] }
      : {}),
    ...(inflectedForms.length > 0 ? { inflectedForms } : {}),
    ...(built.length > 0 ? { senses: built.map((row) => row.sense) } : {}),
    ...(etymon.length > 0
      ? {
          etymologies: [
            {
              etymons: [
                {
                  etymonUnits: [
                    {
                      text: etymon,
                      langCode: langOrDefault(fields.etymonLang, 'und'),
                    },
                  ],
                },
              ],
            },
          ],
        }
      : {}),
  };
  const notes: JieyuNote[] = [];
  const entryNote = fields.note.trim();
  if (entryNote.length > 0) notes.push({ owner: 'entry', ref: id, text: entryNote });
  for (const row of built) {
    if (row.note) notes.push(row.note);
  }
  const exampleRefs = built.flatMap((row) => (row.exampleRef ? [row.exampleRef] : []));
  const jieyu: JieyuLexemeExtras | undefined =
    notes.length > 0 || exampleRefs.length > 0
      ? {
          ...(notes.length > 0 ? { notes } : {}),
          ...(exampleRefs.length > 0 ? { exampleRefs } : {}),
        }
      : undefined;
  const stored: LexemeEntryDoc = {
    ...(existing ?? { id, createdAt: now }),
    id,
    entry,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    ...(jieyu ? { jieyu } : {}),
  };
  if (!jieyu) delete stored.jieyu;

  const base = resource ?? emptyDmlexResource(now);
  const previousSenseIds = new Set((existing?.entry.senses ?? []).map((sense) => sense.id ?? ''));
  const owned = new Set([...previousSenseIds, ...senseIds]);
  const kept = (base.resource.relations ?? []).filter((relation) => {
    if (relation.type === DMLEX_SUBSENSE) {
      return !relation.members.every((member) => owned.has(member.ref));
    }
    if (relation.type === DMLEX_HOMOGRAPH) {
      return !relation.members.some((member) => member.ref === id);
    }
    return true;
  });
  const subsenses = built.flatMap((row) => {
    const parent = row.draft.parentId.trim();
    const child = row.sense.id ?? '';
    if (parent.length === 0 || parent === child || !senseIds.has(parent)) return [];
    return [{ type: DMLEX_SUBSENSE, members: [{ ref: parent }, { ref: child }] }];
  });
  const partner = fields.homographEntryId.trim();
  const homographs =
    partner.length > 0 && partner !== id
      ? [{ type: DMLEX_HOMOGRAPH, members: [{ ref: id }, { ref: partner }] }]
      : [];
  const relations = [...kept, ...subsenses, ...homographs];
  let relationTypes = base.resource.relationTypes ?? [];
  if (subsenses.length > 0) {
    relationTypes = ensureRelationType(relationTypes, DMLEX_SUBSENSE, 'sameEntry');
  }
  if (homographs.length > 0) {
    relationTypes = ensureRelationType(relationTypes, DMLEX_HOMOGRAPH, 'sameResource');
  }
  const langs = new Set(base.resource.translationLanguages);
  for (const row of built) {
    for (const item of row.sense.headwordTranslations ?? []) {
      const langCode = item.langCode?.trim() ?? '';
      if (langCode.length > 0) langs.add(langCode);
    }
    for (const item of row.sense.headwordExplanations ?? []) {
      const langCode = item.langCode?.trim() ?? '';
      if (langCode.length > 0) langs.add(langCode);
    }
    for (const example of row.sense.examples ?? []) {
      for (const item of example.exampleTranslations ?? []) {
        const langCode = item.langCode?.trim() ?? '';
        if (langCode.length > 0) langs.add(langCode);
      }
    }
  }
  if (langs.size === 0) langs.add(DEFAULT_TRANSLATION_LANG);
  const nextResource: LexemeResourceDoc = {
    ...base,
    id: DMLEX_RESOURCE_ID,
    kind: 'resource',
    resource: {
      langCode: langOrDefault(base.resource.langCode, 'und'),
      translationLanguages: [...langs],
      ...(typeof base.resource.title === 'string' && base.resource.title.length > 0
        ? { title: base.resource.title }
        : {}),
      ...(relations.length > 0 ? { relations } : {}),
      ...(relationTypes.length > 0 ? { relationTypes } : {}),
    },
    createdAt: base.createdAt,
    updatedAt: now,
  };
  return { entry: stored, resource: nextResource };
}

export function entryDoc(input: {
  id: string;
  headword: string;
  translation?: string;
  langCode?: string;
  definition?: string;
  createdAt?: string;
  updatedAt?: string;
}): LexemeEntryDoc {
  const now = input.createdAt ?? input.updatedAt ?? new Date().toISOString();
  const senseId = `${input.id}-sense`;
  const translation = input.translation?.trim() ?? '';
  const definition = input.definition?.trim() ?? '';
  return {
    id: input.id,
    entry: {
      id: input.id,
      headword: input.headword,
      ...(translation.length > 0 || definition.length > 0
        ? {
            senses: [
              {
                id: senseId,
                ...(translation.length > 0
                  ? {
                      headwordTranslations: [
                        {
                          text: translation,
                          langCode: input.langCode ?? DEFAULT_TRANSLATION_LANG,
                        },
                      ],
                    }
                  : {}),
                ...(definition.length > 0 ? { definitions: [{ text: definition }] } : {}),
              },
            ],
          }
        : {}),
    },
    createdAt: input.createdAt ?? now,
    updatedAt: input.updatedAt ?? now,
  };
}
