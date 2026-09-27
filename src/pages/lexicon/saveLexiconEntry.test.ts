import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../db';
import { LinguisticService } from '../../services/LinguisticService';
import {
  applyLexiconEntryFields,
  draftIdFromNested,
  mergeLexemeIntoList,
  readPrimaryMultiLang,
  saveLexiconEntry,
  writePrimaryMultiLang,
} from './saveLexiconEntry';

function fields(
  partial: Partial<{
    lemma: string;
    gloss: string;
    citationForm: string;
    language: string;
    notes: string;
    category: string;
    scientificName: string;
    anthropologyNote: string;
    senseBibliography: string;
    discourseNote: string;
    encyclopedicNote: string;
    generalNote: string;
    grammarNote: string;
    semanticDomains: string;
    phonologyNote: string;
    semanticsNote: string;
    sociolinguisticsNote: string;
    sourceNote: string;
    usages: string;
    senseType: string;
    academicDomains: string;
    anthropologyCategories: string;
    senseStatus: string;
    dialectLabels: string;
    senseRestrictions: string;
    importResidue: string;
    reversals: {
      lang: string;
      text: string;
      main?: { text: string; main?: { text: string } };
    }[];
    lexemeType: string;
    pronunciation: string;
    etymologyForm: string;
    etymologyGloss: string;
    etymologySourceLanguage: string;
    literalMeaning: string;
    summaryDefinition: string;
    bibliography: string;
    restrictions: string;
    primarySenseId: string;
    examples: { source: string; translation?: string }[];
    extraSenses: {
      id?: string;
      parentId?: string;
      gloss: string;
      definition: string;
      category?: string;
      scientificName?: string;
      anthropologyNote?: string;
      senseBibliography?: string;
      discourseNote?: string;
      encyclopedicNote?: string;
      generalNote?: string;
      grammarNote?: string;
      semanticDomains?: string;
      phonologyNote?: string;
      semanticsNote?: string;
      sociolinguisticsNote?: string;
      sourceNote?: string;
      usages?: string;
      senseType?: string;
      academicDomains?: string;
      anthropologyCategories?: string;
      senseStatus?: string;
      dialectLabels?: string;
      senseRestrictions?: string;
      importResidue?: string;
      reversals?: {
        lang: string;
        text: string;
        main?: { text: string; main?: { text: string } };
      }[];
      examples?: { source: string; translation?: string }[];
    }[];
    forms: { id?: string; transcription: string }[];
  }> & { lemma: string },
) {
  return {
    gloss: '',
    category: '',
    scientificName: '',
    anthropologyNote: '',
    senseBibliography: '',
    discourseNote: '',
    encyclopedicNote: '',
    generalNote: '',
    grammarNote: '',
    semanticDomains: '',
    phonologyNote: '',
    semanticsNote: '',
    sociolinguisticsNote: '',
    sourceNote: '',
    usages: '',
    senseType: '',
    academicDomains: '',
    anthropologyCategories: '',
    senseStatus: '',
    dialectLabels: '',
    senseRestrictions: '',
    importResidue: '',
    reversals: [],
    citationForm: '',
    language: '',
    notes: '',
    lexemeType: '',
    pronunciation: '',
    etymologyForm: '',
    etymologyGloss: '',
    etymologySourceLanguage: '',
    literalMeaning: '',
    summaryDefinition: '',
    bibliography: '',
    restrictions: '',
    examples: [],
    extraSenses: [],
    forms: [],
    ...partial,
  };
}

describe('saveLexiconEntry', () => {
  const now = '2026-09-11T10:00:00.000Z';

  beforeEach(async () => {
    await db.lexemes.clear();
  });

  it('writes onto the first existing gloss key instead of adding default', () => {
    expect(writePrimaryMultiLang({ eng: 'canine' }, 'dog')).toEqual({ eng: 'dog' });
    expect(readPrimaryMultiLang({ eng: 'canine' })).toBe('canine');
  });

  it('replaces an existing list row and appends a new id', () => {
    const dog = {
      id: 'lex-dog',
      lemma: { default: 'dog' },
      senses: [{ gloss: { default: 'canine' } }],
      createdAt: now,
      updatedAt: now,
    };
    const hound = { ...dog, lemma: { default: 'hound' } };
    expect(mergeLexemeIntoList([dog], hound)).toEqual([hound]);
    const cat = {
      id: 'lex-cat',
      lemma: { default: 'cat' },
      senses: [{ gloss: { default: 'feline' } }],
      createdAt: now,
      updatedAt: now,
    };
    expect(mergeLexemeIntoList([dog], cat)).toEqual([dog, cat]);
  });

  it('rejects an empty lemma', () => {
    expect(() => applyLexiconEntryFields(null, fields({ lemma: '  ', gloss: 'x' }), now)).toThrow(
      /empty lemma/,
    );
  });

  it('writes a sense part of speech and drops it when cleared', () => {
    const created = applyLexiconEntryFields(
      null,
      fields({
        lemma: 'dog',
        gloss: 'canine',
        category: ' noun ',
        extraSenses: [{ gloss: 'pet', definition: '', category: ' verb ' }],
      }),
      now,
    );
    expect(created.senses[0]?.category).toBe('noun');
    expect(created.senses[1]?.category).toBe('verb');
    const extraId = created.senses[1]?.id;
    expect(extraId).toBeTruthy();
    if (!extraId) return;
    const cleared = applyLexiconEntryFields(
      created,
      fields({
        lemma: 'dog',
        gloss: 'canine',
        category: ' ',
        extraSenses: [{ id: extraId, gloss: 'pet', definition: '', category: '' }],
      }),
      now,
    );
    expect(cleared.senses[0]?.category).toBeUndefined();
    expect(cleared.senses[1]?.category).toBeUndefined();
  });

  it('writes a trimmed scientific name on the primary and extra sense', () => {
    const created = applyLexiconEntryFields(
      null,
      fields({
        lemma: 'dog',
        gloss: 'canine',
        category: 'noun',
        scientificName: ' Canis familiaris ',
        extraSenses: [{ gloss: 'pet', definition: '', scientificName: ' Canis lupus ' }],
      }),
      now,
    );
    expect(created.senses[0]?.scientificName).toBe('Canis familiaris');
    expect(created.senses[0]?.category).toBe('noun');
    expect(created.senses[1]?.scientificName).toBe('Canis lupus');
    const extraId = created.senses[1]?.id;
    expect(extraId).toBeTruthy();
    if (!extraId) return;
    const cleared = applyLexiconEntryFields(
      created,
      fields({
        lemma: 'dog',
        gloss: 'canine',
        category: 'noun',
        scientificName: ' ',
        extraSenses: [{ id: extraId, gloss: 'pet', definition: '', scientificName: '' }],
      }),
      now,
    );
    expect(cleared.senses[0]?.scientificName).toBeUndefined();
    expect(cleared.senses[0]?.category).toBe('noun');
    expect(cleared.senses[1]?.scientificName).toBeUndefined();
  });

  it('writes a trimmed anthropology note on the primary and extra sense', () => {
    const created = applyLexiconEntryFields(
      null,
      fields({
        lemma: 'dog',
        gloss: 'canine',
        scientificName: 'Canis familiaris',
        anthropologyNote: ' kept at home ',
        extraSenses: [{ gloss: 'pet', definition: '', anthropologyNote: ' companion ' }],
      }),
      now,
    );
    expect(created.senses[0]?.anthropologyNote).toBe('kept at home');
    expect(created.senses[0]?.scientificName).toBe('Canis familiaris');
    expect(created.senses[1]?.anthropologyNote).toBe('companion');
    const extraId = created.senses[1]?.id;
    expect(extraId).toBeTruthy();
    if (!extraId) return;
    const cleared = applyLexiconEntryFields(
      created,
      fields({
        lemma: 'dog',
        gloss: 'canine',
        scientificName: 'Canis familiaris',
        anthropologyNote: ' ',
        extraSenses: [{ id: extraId, gloss: 'pet', definition: '', anthropologyNote: '' }],
      }),
      now,
    );
    expect(cleared.senses[0]?.anthropologyNote).toBeUndefined();
    expect(cleared.senses[0]?.scientificName).toBe('Canis familiaris');
    expect(cleared.senses[1]?.anthropologyNote).toBeUndefined();
  });

  it('writes a trimmed sense bibliography and keeps the anthropology note and entry bibliography', () => {
    const created = applyLexiconEntryFields(
      null,
      fields({
        lemma: 'dog',
        gloss: 'canine',
        bibliography: ' Smith 1990 ',
        anthropologyNote: 'kept at home',
        senseBibliography: ' sense source ',
        extraSenses: [{ gloss: 'pet', definition: '', senseBibliography: ' pet source ' }],
      }),
      now,
    );
    expect(created.bibliography).toBe('Smith 1990');
    expect(created.senses[0]?.senseBibliography).toBe('sense source');
    expect(created.senses[0]?.anthropologyNote).toBe('kept at home');
    expect(created.senses[1]?.senseBibliography).toBe('pet source');
    const extraId = created.senses[1]?.id;
    expect(extraId).toBeTruthy();
    if (!extraId) return;
    const cleared = applyLexiconEntryFields(
      created,
      fields({
        lemma: 'dog',
        gloss: 'canine',
        bibliography: 'Smith 1990',
        anthropologyNote: 'kept at home',
        senseBibliography: ' ',
        extraSenses: [{ id: extraId, gloss: 'pet', definition: '', senseBibliography: '' }],
      }),
      now,
    );
    expect(cleared.bibliography).toBe('Smith 1990');
    expect(cleared.senses[0]?.senseBibliography).toBeUndefined();
    expect(cleared.senses[0]?.anthropologyNote).toBe('kept at home');
    expect(cleared.senses[1]?.senseBibliography).toBeUndefined();
  });

  it('writes a trimmed discourse note on the primary and extra sense', () => {
    const created = applyLexiconEntryFields(
      null,
      fields({
        lemma: 'dog',
        gloss: 'canine',
        anthropologyNote: 'kept at home',
        discourseNote: ' narrative use ',
        extraSenses: [{ gloss: 'pet', definition: '', discourseNote: ' vocative ' }],
      }),
      now,
    );
    expect(created.senses[0]?.discourseNote).toBe('narrative use');
    expect(created.senses[0]?.anthropologyNote).toBe('kept at home');
    expect(created.senses[1]?.discourseNote).toBe('vocative');
    const extraId = created.senses[1]?.id;
    expect(extraId).toBeTruthy();
    if (!extraId) return;
    const cleared = applyLexiconEntryFields(
      created,
      fields({
        lemma: 'dog',
        gloss: 'canine',
        anthropologyNote: 'kept at home',
        discourseNote: ' ',
        extraSenses: [{ id: extraId, gloss: 'pet', definition: '', discourseNote: '' }],
      }),
      now,
    );
    expect(cleared.senses[0]?.discourseNote).toBeUndefined();
    expect(cleared.senses[0]?.anthropologyNote).toBe('kept at home');
    expect(cleared.senses[1]?.discourseNote).toBeUndefined();
  });

  it('writes a trimmed encyclopedic note on the primary and extra sense', () => {
    const created = applyLexiconEntryFields(
      null,
      fields({
        lemma: 'dog',
        gloss: 'canine',
        discourseNote: 'narrative use',
        encyclopedicNote: ' domestic canine ',
        extraSenses: [{ gloss: 'pet', definition: '', encyclopedicNote: ' household companion ' }],
      }),
      now,
    );
    expect(created.senses[0]?.encyclopedicNote).toBe('domestic canine');
    expect(created.senses[0]?.discourseNote).toBe('narrative use');
    expect(created.senses[1]?.encyclopedicNote).toBe('household companion');
    const extraId = created.senses[1]?.id;
    expect(extraId).toBeTruthy();
    if (!extraId) return;
    const cleared = applyLexiconEntryFields(
      created,
      fields({
        lemma: 'dog',
        gloss: 'canine',
        discourseNote: 'narrative use',
        encyclopedicNote: ' ',
        extraSenses: [{ id: extraId, gloss: 'pet', definition: '', encyclopedicNote: '' }],
      }),
      now,
    );
    expect(cleared.senses[0]?.encyclopedicNote).toBeUndefined();
    expect(cleared.senses[0]?.discourseNote).toBe('narrative use');
    expect(cleared.senses[1]?.encyclopedicNote).toBeUndefined();
  });

  it('writes a trimmed sense general note and keeps the encyclopedic note and entry notes', () => {
    const created = applyLexiconEntryFields(
      null,
      fields({
        lemma: 'dog',
        gloss: 'canine',
        notes: 'entry note',
        encyclopedicNote: 'domestic canine',
        generalNote: ' seen in town ',
        extraSenses: [{ gloss: 'pet', definition: '', generalNote: ' household ' }],
      }),
      now,
    );
    expect(created.notes?.default).toBe('entry note');
    expect(created.senses[0]?.generalNote).toBe('seen in town');
    expect(created.senses[0]?.encyclopedicNote).toBe('domestic canine');
    expect(created.senses[1]?.generalNote).toBe('household');
    const extraId = created.senses[1]?.id;
    expect(extraId).toBeTruthy();
    if (!extraId) return;
    const cleared = applyLexiconEntryFields(
      created,
      fields({
        lemma: 'dog',
        gloss: 'canine',
        notes: 'entry note',
        encyclopedicNote: 'domestic canine',
        generalNote: ' ',
        extraSenses: [{ id: extraId, gloss: 'pet', definition: '', generalNote: '' }],
      }),
      now,
    );
    expect(cleared.notes?.default).toBe('entry note');
    expect(cleared.senses[0]?.generalNote).toBeUndefined();
    expect(cleared.senses[0]?.encyclopedicNote).toBe('domestic canine');
    expect(cleared.senses[1]?.generalNote).toBeUndefined();
  });

  it('writes a trimmed grammar note on the primary and extra sense', () => {
    const created = applyLexiconEntryFields(
      null,
      fields({
        lemma: 'dog',
        gloss: 'canine',
        encyclopedicNote: 'domestic canine',
        grammarNote: ' count noun ',
        extraSenses: [{ gloss: 'pet', definition: '', grammarNote: ' used with classifiers ' }],
      }),
      now,
    );
    expect(created.senses[0]?.grammarNote).toBe('count noun');
    expect(created.senses[0]?.encyclopedicNote).toBe('domestic canine');
    expect(created.senses[1]?.grammarNote).toBe('used with classifiers');
    const extraId = created.senses[1]?.id;
    expect(extraId).toBeTruthy();
    if (!extraId) return;
    const cleared = applyLexiconEntryFields(
      created,
      fields({
        lemma: 'dog',
        gloss: 'canine',
        encyclopedicNote: 'domestic canine',
        grammarNote: ' ',
        extraSenses: [{ id: extraId, gloss: 'pet', definition: '', grammarNote: '' }],
      }),
      now,
    );
    expect(cleared.senses[0]?.grammarNote).toBeUndefined();
    expect(cleared.senses[0]?.encyclopedicNote).toBe('domestic canine');
    expect(cleared.senses[1]?.grammarNote).toBeUndefined();
  });

  it('writes trimmed semantic domains on the primary and extra sense', () => {
    const created = applyLexiconEntryFields(
      null,
      fields({
        lemma: 'dog',
        gloss: 'canine',
        grammarNote: 'count noun',
        semanticDomains: ' 1.1 Sky \n\n1.1 Sky\n1.2 World ',
        extraSenses: [{ gloss: 'pet', definition: '', semanticDomains: '2.1 Body\n2.1 Body\n ' }],
      }),
      now,
    );
    expect(created.senses[0]?.semanticDomains).toEqual(['1.1 Sky', '1.2 World']);
    expect(created.senses[0]?.grammarNote).toBe('count noun');
    expect(created.senses[1]?.semanticDomains).toEqual(['2.1 Body']);
    const extraId = created.senses[1]?.id;
    expect(extraId).toBeTruthy();
    if (!extraId) return;
    const cleared = applyLexiconEntryFields(
      created,
      fields({
        lemma: 'dog',
        gloss: 'canine',
        grammarNote: 'count noun',
        semanticDomains: ' \n ',
        extraSenses: [{ id: extraId, gloss: 'pet', definition: '', semanticDomains: '' }],
      }),
      now,
    );
    expect(cleared.senses[0]?.semanticDomains).toBeUndefined();
    expect(cleared.senses[0]?.grammarNote).toBe('count noun');
    expect(cleared.senses[1]?.semanticDomains).toBeUndefined();
  });

  it('writes a trimmed phonology note on the primary and extra sense', () => {
    const created = applyLexiconEntryFields(
      null,
      fields({
        lemma: 'dog',
        gloss: 'canine',
        semanticDomains: '1.1 Sky',
        phonologyNote: ' tone on the first syllable ',
        extraSenses: [{ gloss: 'pet', definition: '', phonologyNote: ' stress final ' }],
      }),
      now,
    );
    expect(created.senses[0]?.phonologyNote).toBe('tone on the first syllable');
    expect(created.senses[0]?.semanticDomains).toEqual(['1.1 Sky']);
    expect(created.senses[1]?.phonologyNote).toBe('stress final');
    const extraId = created.senses[1]?.id;
    expect(extraId).toBeTruthy();
    if (!extraId) return;
    const cleared = applyLexiconEntryFields(
      created,
      fields({
        lemma: 'dog',
        gloss: 'canine',
        semanticDomains: '1.1 Sky',
        phonologyNote: ' ',
        extraSenses: [{ id: extraId, gloss: 'pet', definition: '', phonologyNote: '' }],
      }),
      now,
    );
    expect(cleared.senses[0]?.phonologyNote).toBeUndefined();
    expect(cleared.senses[0]?.semanticDomains).toEqual(['1.1 Sky']);
    expect(cleared.senses[1]?.phonologyNote).toBeUndefined();
  });

  it('writes a trimmed semantics note on the primary and extra sense', () => {
    const created = applyLexiconEntryFields(
      null,
      fields({
        lemma: 'dog',
        gloss: 'canine',
        phonologyNote: 'tone on the first syllable',
        semanticsNote: ' narrows to the daytime sky ',
        extraSenses: [{ gloss: 'pet', definition: '', semanticsNote: ' companion animal ' }],
      }),
      now,
    );
    expect(created.senses[0]?.semanticsNote).toBe('narrows to the daytime sky');
    expect(created.senses[0]?.phonologyNote).toBe('tone on the first syllable');
    expect(created.senses[1]?.semanticsNote).toBe('companion animal');
    const extraId = created.senses[1]?.id;
    expect(extraId).toBeTruthy();
    if (!extraId) return;
    const cleared = applyLexiconEntryFields(
      created,
      fields({
        lemma: 'dog',
        gloss: 'canine',
        phonologyNote: 'tone on the first syllable',
        semanticsNote: ' ',
        extraSenses: [{ id: extraId, gloss: 'pet', definition: '', semanticsNote: '' }],
      }),
      now,
    );
    expect(cleared.senses[0]?.semanticsNote).toBeUndefined();
    expect(cleared.senses[0]?.phonologyNote).toBe('tone on the first syllable');
    expect(cleared.senses[1]?.semanticsNote).toBeUndefined();
  });

  it('writes a trimmed sociolinguistics note on the primary and extra sense', () => {
    const created = applyLexiconEntryFields(
      null,
      fields({
        lemma: 'dog',
        gloss: 'canine',
        semanticsNote: 'narrows to the daytime sky',
        sociolinguisticsNote: ' used by elders ',
        extraSenses: [{ gloss: 'pet', definition: '', sociolinguisticsNote: ' child directed ' }],
      }),
      now,
    );
    expect(created.senses[0]?.sociolinguisticsNote).toBe('used by elders');
    expect(created.senses[0]?.semanticsNote).toBe('narrows to the daytime sky');
    expect(created.senses[1]?.sociolinguisticsNote).toBe('child directed');
    const extraId = created.senses[1]?.id;
    expect(extraId).toBeTruthy();
    if (!extraId) return;
    const cleared = applyLexiconEntryFields(
      created,
      fields({
        lemma: 'dog',
        gloss: 'canine',
        semanticsNote: 'narrows to the daytime sky',
        sociolinguisticsNote: ' ',
        extraSenses: [{ id: extraId, gloss: 'pet', definition: '', sociolinguisticsNote: '' }],
      }),
      now,
    );
    expect(cleared.senses[0]?.sociolinguisticsNote).toBeUndefined();
    expect(cleared.senses[0]?.semanticsNote).toBe('narrows to the daytime sky');
    expect(cleared.senses[1]?.sociolinguisticsNote).toBeUndefined();
  });

  it('writes a trimmed source note on the primary and extra sense', () => {
    const created = applyLexiconEntryFields(
      null,
      fields({
        lemma: 'dog',
        gloss: 'canine',
        sociolinguisticsNote: 'used by elders',
        sourceNote: ' from a neighboring dialect ',
        extraSenses: [{ gloss: 'pet', definition: '', sourceNote: ' borrowed in speech ' }],
      }),
      now,
    );
    expect(created.senses[0]?.sourceNote).toBe('from a neighboring dialect');
    expect(created.senses[0]?.sociolinguisticsNote).toBe('used by elders');
    expect(created.senses[1]?.sourceNote).toBe('borrowed in speech');
    const extraId = created.senses[1]?.id;
    expect(extraId).toBeTruthy();
    if (!extraId) return;
    const cleared = applyLexiconEntryFields(
      created,
      fields({
        lemma: 'dog',
        gloss: 'canine',
        sociolinguisticsNote: 'used by elders',
        sourceNote: ' ',
        extraSenses: [{ id: extraId, gloss: 'pet', definition: '', sourceNote: '' }],
      }),
      now,
    );
    expect(cleared.senses[0]?.sourceNote).toBeUndefined();
    expect(cleared.senses[0]?.sociolinguisticsNote).toBe('used by elders');
    expect(cleared.senses[1]?.sourceNote).toBeUndefined();
  });

  it('writes trimmed usages on the primary and extra sense', () => {
    const created = applyLexiconEntryFields(
      null,
      fields({
        lemma: 'dog',
        gloss: 'canine',
        sourceNote: 'from a neighboring dialect',
        usages: ' formal \n\nformal\nchild directed ',
        extraSenses: [{ gloss: 'pet', definition: '', usages: 'informal\ninformal\n ' }],
      }),
      now,
    );
    expect(created.senses[0]?.usages).toEqual(['formal', 'child directed']);
    expect(created.senses[0]?.sourceNote).toBe('from a neighboring dialect');
    expect(created.senses[1]?.usages).toEqual(['informal']);
    const extraId = created.senses[1]?.id;
    expect(extraId).toBeTruthy();
    if (!extraId) return;
    const cleared = applyLexiconEntryFields(
      created,
      fields({
        lemma: 'dog',
        gloss: 'canine',
        sourceNote: 'from a neighboring dialect',
        usages: ' \n ',
        extraSenses: [{ id: extraId, gloss: 'pet', definition: '', usages: '' }],
      }),
      now,
    );
    expect(cleared.senses[0]?.usages).toBeUndefined();
    expect(cleared.senses[0]?.sourceNote).toBe('from a neighboring dialect');
    expect(cleared.senses[1]?.usages).toBeUndefined();
  });

  it('writes a trimmed sense type on the primary and extra sense', () => {
    const created = applyLexiconEntryFields(
      null,
      fields({
        lemma: 'dog',
        gloss: 'canine',
        usages: 'formal',
        senseType: ' figurative ',
        extraSenses: [{ gloss: 'pet', definition: '', senseType: ' literal ' }],
      }),
      now,
    );
    expect(created.senses[0]?.senseType).toBe('figurative');
    expect(created.senses[0]?.usages).toEqual(['formal']);
    expect(created.lexemeType).toBeUndefined();
    expect(created.senses[1]?.senseType).toBe('literal');
    const extraId = created.senses[1]?.id;
    expect(extraId).toBeTruthy();
    if (!extraId) return;
    const cleared = applyLexiconEntryFields(
      created,
      fields({
        lemma: 'dog',
        gloss: 'canine',
        usages: 'formal',
        senseType: ' ',
        extraSenses: [{ id: extraId, gloss: 'pet', definition: '', senseType: '' }],
      }),
      now,
    );
    expect(cleared.senses[0]?.senseType).toBeUndefined();
    expect(cleared.senses[0]?.usages).toEqual(['formal']);
    expect(cleared.senses[1]?.senseType).toBeUndefined();
  });

  it('writes trimmed academic domains on the primary and extra sense', () => {
    const created = applyLexiconEntryFields(
      null,
      fields({
        lemma: 'dog',
        gloss: 'canine',
        senseType: 'figurative',
        academicDomains: ' linguistics \n\nlinguistics\nbotany ',
        extraSenses: [{ gloss: 'pet', definition: '', academicDomains: 'medicine\nmedicine\n ' }],
      }),
      now,
    );
    expect(created.senses[0]?.academicDomains).toEqual(['linguistics', 'botany']);
    expect(created.senses[0]?.senseType).toBe('figurative');
    expect(created.senses[1]?.academicDomains).toEqual(['medicine']);
    const extraId = created.senses[1]?.id;
    expect(extraId).toBeTruthy();
    if (!extraId) return;
    const cleared = applyLexiconEntryFields(
      created,
      fields({
        lemma: 'dog',
        gloss: 'canine',
        senseType: 'figurative',
        academicDomains: ' \n ',
        extraSenses: [{ id: extraId, gloss: 'pet', definition: '', academicDomains: '' }],
      }),
      now,
    );
    expect(cleared.senses[0]?.academicDomains).toBeUndefined();
    expect(cleared.senses[0]?.senseType).toBe('figurative');
    expect(cleared.senses[1]?.academicDomains).toBeUndefined();
  });

  it('writes trimmed anthropology categories on the primary and extra sense', () => {
    const created = applyLexiconEntryFields(
      null,
      fields({
        lemma: 'dog',
        gloss: 'canine',
        academicDomains: 'linguistics',
        anthropologyNote: 'kept at home',
        anthropologyCategories: ' kin \n\nkin\nritual ',
        extraSenses: [{ gloss: 'pet', definition: '', anthropologyCategories: '290\n290\n ' }],
      }),
      now,
    );
    expect(created.senses[0]?.anthropologyCategories).toEqual(['kin', 'ritual']);
    expect(created.senses[0]?.academicDomains).toEqual(['linguistics']);
    expect(created.senses[0]?.anthropologyNote).toBe('kept at home');
    expect(created.senses[1]?.anthropologyCategories).toEqual(['290']);
    const extraId = created.senses[1]?.id;
    expect(extraId).toBeTruthy();
    if (!extraId) return;
    const cleared = applyLexiconEntryFields(
      created,
      fields({
        lemma: 'dog',
        gloss: 'canine',
        academicDomains: 'linguistics',
        anthropologyNote: 'kept at home',
        anthropologyCategories: ' \n ',
        extraSenses: [{ id: extraId, gloss: 'pet', definition: '', anthropologyCategories: '' }],
      }),
      now,
    );
    expect(cleared.senses[0]?.anthropologyCategories).toBeUndefined();
    expect(cleared.senses[0]?.academicDomains).toEqual(['linguistics']);
    expect(cleared.senses[0]?.anthropologyNote).toBe('kept at home');
    expect(cleared.senses[1]?.anthropologyCategories).toBeUndefined();
  });

  it('writes one trimmed sense status and keeps anthropology categories', () => {
    const created = applyLexiconEntryFields(
      null,
      fields({
        lemma: 'dog',
        gloss: 'canine',
        anthropologyCategories: 'kin',
        senseStatus: ' Confirmed ',
        extraSenses: [{ gloss: 'pet', definition: '', senseStatus: ' Pending ' }],
      }),
      now,
    );
    expect(created.senses[0]?.senseStatus).toBe('Confirmed');
    expect(created.senses[0]?.anthropologyCategories).toEqual(['kin']);
    expect(created.senses[1]?.senseStatus).toBe('Pending');
    const extraId = created.senses[1]?.id;
    expect(extraId).toBeTruthy();
    if (!extraId) return;
    const cleared = applyLexiconEntryFields(
      created,
      fields({
        lemma: 'dog',
        gloss: 'canine',
        anthropologyCategories: 'kin',
        senseStatus: ' ',
        extraSenses: [{ id: extraId, gloss: 'pet', definition: '', senseStatus: '' }],
      }),
      now,
    );
    expect(cleared.senses[0]?.senseStatus).toBeUndefined();
    expect(cleared.senses[0]?.anthropologyCategories).toEqual(['kin']);
    expect(cleared.senses[1]?.senseStatus).toBeUndefined();
  });

  it('writes trimmed dialect labels on the primary and extra sense', () => {
    const created = applyLexiconEntryFields(
      null,
      fields({
        lemma: 'dog',
        gloss: 'canine',
        senseStatus: 'Confirmed',
        dialectLabels: ' northern \n\nnorthern\nsouthern ',
        extraSenses: [{ gloss: 'pet', definition: '', dialectLabels: 'highland\nhighland\n ' }],
      }),
      now,
    );
    expect(created.senses[0]?.dialectLabels).toEqual(['northern', 'southern']);
    expect(created.senses[0]?.senseStatus).toBe('Confirmed');
    expect(created.senses[1]?.dialectLabels).toEqual(['highland']);
    const extraId = created.senses[1]?.id;
    expect(extraId).toBeTruthy();
    if (!extraId) return;
    const cleared = applyLexiconEntryFields(
      created,
      fields({
        lemma: 'dog',
        gloss: 'canine',
        senseStatus: 'Confirmed',
        dialectLabels: ' \n ',
        extraSenses: [{ id: extraId, gloss: 'pet', definition: '', dialectLabels: '' }],
      }),
      now,
    );
    expect(cleared.senses[0]?.dialectLabels).toBeUndefined();
    expect(cleared.senses[0]?.senseStatus).toBe('Confirmed');
    expect(cleared.senses[1]?.dialectLabels).toBeUndefined();
  });

  it('writes a trimmed sense restrictions note and keeps dialect labels and entry restrictions', () => {
    const created = applyLexiconEntryFields(
      null,
      fields({
        lemma: 'dog',
        gloss: 'canine',
        restrictions: ' secret ',
        dialectLabels: 'northern',
        senseRestrictions: ' not used with elders ',
        extraSenses: [{ gloss: 'pet', definition: '', senseRestrictions: ' avoid in ritual ' }],
      }),
      now,
    );
    expect(created.restrictions).toBe('secret');
    expect(created.senses[0]?.senseRestrictions).toBe('not used with elders');
    expect(created.senses[0]?.dialectLabels).toEqual(['northern']);
    expect(created.senses[1]?.senseRestrictions).toBe('avoid in ritual');
    const extraId = created.senses[1]?.id;
    expect(extraId).toBeTruthy();
    if (!extraId) return;
    const cleared = applyLexiconEntryFields(
      created,
      fields({
        lemma: 'dog',
        gloss: 'canine',
        restrictions: 'secret',
        dialectLabels: 'northern',
        senseRestrictions: ' ',
        extraSenses: [{ id: extraId, gloss: 'pet', definition: '', senseRestrictions: '' }],
      }),
      now,
    );
    expect(cleared.restrictions).toBe('secret');
    expect(cleared.senses[0]?.senseRestrictions).toBeUndefined();
    expect(cleared.senses[0]?.dialectLabels).toEqual(['northern']);
    expect(cleared.senses[1]?.senseRestrictions).toBeUndefined();
  });

  it('writes a trimmed sense import residue and keeps sense restrictions', () => {
    const created = applyLexiconEntryFields(
      null,
      fields({
        lemma: 'dog',
        gloss: 'canine',
        restrictions: 'secret',
        senseRestrictions: 'not used with elders',
        importResidue: ' leftover marker ',
        extraSenses: [{ gloss: 'pet', definition: '', importResidue: ' second residue ' }],
      }),
      now,
    );
    expect(created.restrictions).toBe('secret');
    expect(created.senses[0]?.importResidue).toBe('leftover marker');
    expect(created.senses[0]?.senseRestrictions).toBe('not used with elders');
    expect(created.senses[1]?.importResidue).toBe('second residue');
    const extraId = created.senses[1]?.id;
    expect(extraId).toBeTruthy();
    if (!extraId) return;
    const cleared = applyLexiconEntryFields(
      created,
      fields({
        lemma: 'dog',
        gloss: 'canine',
        restrictions: 'secret',
        senseRestrictions: 'not used with elders',
        importResidue: ' ',
        extraSenses: [
          {
            id: extraId,
            gloss: 'pet',
            definition: '',
            senseRestrictions: 'avoid in ritual',
            importResidue: '',
          },
        ],
      }),
      now,
    );
    expect(cleared.restrictions).toBe('secret');
    expect(cleared.senses[0]?.importResidue).toBeUndefined();
    expect(cleared.senses[0]?.senseRestrictions).toBe('not used with elders');
    expect(cleared.senses[1]?.importResidue).toBeUndefined();
    expect(cleared.senses[1]?.senseRestrictions).toBe('avoid in ritual');
  });

  it('writes sense reversals per writing system and keeps the main chain', () => {
    const created = applyLexiconEntryFields(
      null,
      fields({
        lemma: 'dog',
        gloss: 'canine',
        importResidue: 'kept marker',
        reversals: [
          {
            lang: ' en ',
            text: ' Buick ',
            main: { text: ' ', main: { text: ' car ' } },
          },
          { lang: 'en', text: 'house' },
          { lang: '', text: 'skip' },
          { lang: 'es', text: ' ' },
        ],
        extraSenses: [
          { gloss: 'pet', definition: '', reversals: [{ lang: ' es ', text: ' casa ' }] },
        ],
      }),
      now,
    );
    expect(created.senses[0]?.reversals).toEqual([
      { lang: 'en', text: 'Buick', main: { text: 'car' } },
      { lang: 'en', text: 'house' },
    ]);
    expect(created.senses[0]?.importResidue).toBe('kept marker');
    expect(created.senses[1]?.reversals).toEqual([{ lang: 'es', text: 'casa' }]);
    const extraId = created.senses[1]?.id;
    expect(extraId).toBeTruthy();
    if (!extraId) return;
    const cleared = applyLexiconEntryFields(
      created,
      fields({
        lemma: 'dog',
        gloss: 'canine',
        importResidue: 'kept marker',
        reversals: [],
        extraSenses: [{ id: extraId, gloss: 'pet', definition: '', reversals: [] }],
      }),
      now,
    );
    expect(cleared.senses[0]?.reversals).toBeUndefined();
    expect(cleared.senses[0]?.importResidue).toBe('kept marker');
    expect(cleared.senses[1]?.reversals).toBeUndefined();
  });

  it('writes sense examples, drops a blank source, and keeps entry-level examples', () => {
    const existing = applyLexiconEntryFields(null, fields({ lemma: 'dog', gloss: 'canine' }), now);
    const withLegacy = { ...existing, examples: ['legacy note'] };
    const updated = applyLexiconEntryFields(
      withLegacy,
      fields({
        lemma: 'dog',
        gloss: 'canine',
        examples: [{ source: ' the dog runs ', translation: ' 狗在跑 ' }],
        extraSenses: [
          { gloss: 'pet', definition: '', examples: [{ source: 'my pet', translation: ' ' }] },
        ],
      }),
      now,
    );
    expect(updated.senses[0]?.examples).toEqual([
      { source: 'the dog runs', translation: '狗在跑' },
    ]);
    expect(updated.senses[1]?.examples).toEqual([{ source: 'my pet' }]);
    expect(updated.examples).toEqual(['legacy note']);
    const extraId = updated.senses[1]?.id;
    expect(extraId).toBeTruthy();
    if (!extraId) return;
    const cleared = applyLexiconEntryFields(
      updated,
      fields({
        lemma: 'dog',
        gloss: 'canine',
        examples: [{ source: '  ', translation: 'gone' }],
        extraSenses: [{ id: extraId, gloss: 'pet', definition: '', examples: [] }],
      }),
      now,
    );
    expect(cleared.senses[0]?.examples).toBeUndefined();
    expect(cleared.senses[1]?.examples).toBeUndefined();
    expect(cleared.examples).toEqual(['legacy note']);
  });

  it('writes lexeme type, drops it when cleared, and keeps morpheme type', () => {
    const existing = applyLexiconEntryFields(null, fields({ lemma: 'dog', gloss: 'canine' }), now);
    const withTypes = { ...existing, lexemeType: 'word', morphemeType: 'prefix' };
    const updated = applyLexiconEntryFields(
      withTypes,
      fields({ lemma: 'dog', gloss: 'canine', lexemeType: ' stem ' }),
      now,
    );
    expect(updated.lexemeType).toBe('stem');
    expect(updated.morphemeType).toBe('prefix');
    const cleared = applyLexiconEntryFields(
      updated,
      fields({ lemma: 'dog', gloss: 'canine', lexemeType: ' ' }),
      now,
    );
    expect(cleared.lexemeType).toBeUndefined();
  });

  it('writes a trimmed pronunciation and omits a blank one', () => {
    const existing = applyLexiconEntryFields(null, fields({ lemma: 'dog', gloss: 'canine' }), now);
    const withMorph = { ...existing, morphemeType: 'prefix' };
    const updated = applyLexiconEntryFields(
      withMorph,
      fields({ lemma: 'dog', gloss: 'canine', pronunciation: ' dɔg ' }),
      now,
    );
    expect(updated.pronunciation).toBe('dɔg');
    expect(updated.morphemeType).toBe('prefix');
    const cleared = applyLexiconEntryFields(
      updated,
      fields({ lemma: 'dog', gloss: 'canine', pronunciation: ' ' }),
      now,
    );
    expect(cleared.pronunciation).toBeUndefined();
    expect(cleared.morphemeType).toBe('prefix');
  });

  it('writes one etymology and omits it when the source form is blank', () => {
    const existing = applyLexiconEntryFields(null, fields({ lemma: 'dog', gloss: 'canine' }), now);
    const withMorph = { ...existing, morphemeType: 'prefix' };
    const updated = applyLexiconEntryFields(
      withMorph,
      fields({
        lemma: 'dog',
        gloss: 'canine',
        etymologyForm: ' perro ',
        etymologyGloss: ' dog ',
        etymologySourceLanguage: ' Spanish ',
      }),
      now,
    );
    expect(updated.etymology).toEqual({ form: 'perro', gloss: 'dog', sourceLanguage: 'Spanish' });
    expect(updated.morphemeType).toBe('prefix');
    const cleared = applyLexiconEntryFields(
      updated,
      fields({ lemma: 'dog', gloss: 'canine', etymologyForm: ' ' }),
      now,
    );
    expect(cleared.etymology).toBeUndefined();
    expect(cleared.morphemeType).toBe('prefix');
  });

  it('writes a trimmed literal meaning and omits a blank one', () => {
    const existing = applyLexiconEntryFields(null, fields({ lemma: 'dog', gloss: 'canine' }), now);
    const withMorph = { ...existing, morphemeType: 'prefix' };
    const updated = applyLexiconEntryFields(
      withMorph,
      fields({ lemma: 'dog', gloss: 'canine', literalMeaning: ' domestic animal ' }),
      now,
    );
    expect(updated.literalMeaning).toBe('domestic animal');
    expect(updated.morphemeType).toBe('prefix');
    const cleared = applyLexiconEntryFields(
      updated,
      fields({ lemma: 'dog', gloss: 'canine', literalMeaning: ' ' }),
      now,
    );
    expect(cleared.literalMeaning).toBeUndefined();
    expect(cleared.morphemeType).toBe('prefix');
  });

  it('writes a trimmed summary definition and omits a blank one', () => {
    const existing = applyLexiconEntryFields(
      null,
      fields({ lemma: 'dog', gloss: 'canine', literalMeaning: 'domestic animal' }),
      now,
    );
    const withMorph = { ...existing, morphemeType: 'prefix' };
    const updated = applyLexiconEntryFields(
      withMorph,
      fields({
        lemma: 'dog',
        gloss: 'canine',
        literalMeaning: 'domestic animal',
        summaryDefinition: ' a canine kept at home ',
      }),
      now,
    );
    expect(updated.summaryDefinition).toBe('a canine kept at home');
    expect(updated.literalMeaning).toBe('domestic animal');
    expect(updated.morphemeType).toBe('prefix');
    const cleared = applyLexiconEntryFields(
      updated,
      fields({
        lemma: 'dog',
        gloss: 'canine',
        literalMeaning: 'domestic animal',
        summaryDefinition: ' ',
      }),
      now,
    );
    expect(cleared.summaryDefinition).toBeUndefined();
    expect(cleared.literalMeaning).toBe('domestic animal');
    expect(cleared.morphemeType).toBe('prefix');
  });

  it('writes a trimmed bibliography and omits a blank one', () => {
    const existing = applyLexiconEntryFields(
      null,
      fields({ lemma: 'dog', gloss: 'canine', notes: 'field note' }),
      now,
    );
    const withMorph = { ...existing, morphemeType: 'prefix' };
    const updated = applyLexiconEntryFields(
      withMorph,
      fields({
        lemma: 'dog',
        gloss: 'canine',
        notes: 'field note',
        bibliography: ' Smith 1990 ',
      }),
      now,
    );
    expect(updated.bibliography).toBe('Smith 1990');
    expect(updated.notes?.default).toBe('field note');
    expect(updated.morphemeType).toBe('prefix');
    const cleared = applyLexiconEntryFields(
      updated,
      fields({ lemma: 'dog', gloss: 'canine', notes: 'field note', bibliography: ' ' }),
      now,
    );
    expect(cleared.bibliography).toBeUndefined();
    expect(cleared.notes?.default).toBe('field note');
    expect(cleared.morphemeType).toBe('prefix');
  });

  it('writes a trimmed restrictions value and omits a blank one', () => {
    const existing = applyLexiconEntryFields(
      null,
      fields({ lemma: 'dog', gloss: 'canine', bibliography: 'Smith 1990' }),
      now,
    );
    const withMorph = { ...existing, morphemeType: 'prefix' };
    const updated = applyLexiconEntryFields(
      withMorph,
      fields({
        lemma: 'dog',
        gloss: 'canine',
        bibliography: 'Smith 1990',
        restrictions: ' internal ',
      }),
      now,
    );
    expect(updated.restrictions).toBe('internal');
    expect(updated.bibliography).toBe('Smith 1990');
    expect(updated.morphemeType).toBe('prefix');
    const cleared = applyLexiconEntryFields(
      updated,
      fields({ lemma: 'dog', gloss: 'canine', bibliography: 'Smith 1990', restrictions: ' ' }),
      now,
    );
    expect(cleared.restrictions).toBeUndefined();
    expect(cleared.bibliography).toBe('Smith 1990');
    expect(cleared.morphemeType).toBe('prefix');
  });

  it('creates then updates a lexeme with list readback', async () => {
    const created = await saveLexiconEntry({
      existing: null,
      fields: fields({
        lemma: 'dog',
        gloss: 'canine',
        citationForm: 'dog',
        language: 'eng',
        notes: 'field note',
      }),
    });
    expect(created.lemma.default).toBe('dog');
    expect(created.senses[0]?.gloss.default).toBe('canine');
    expect(created.citationForm).toBe('dog');

    const requery = await LinguisticService.lexemes.list();
    expect(requery.find((row) => row.id === created.id)?.notes?.default).toBe('field note');

    const updated = await saveLexiconEntry({
      existing: created,
      fields: fields({
        lemma: 'hound',
        gloss: 'hunting dog',
        citationForm: '',
        language: 'eng',
        notes: '',
      }),
    });
    expect(updated.id).toBe(created.id);
    expect(updated.lemma.default).toBe('hound');
    expect(updated.citationForm).toBeUndefined();
    const after = await LinguisticService.lexemes.list();
    expect(after.find((row) => row.id === created.id)?.senses[0]?.gloss.default).toBe(
      'hunting dog',
    );
  });

  it('writes extra senses and forms then drops empty rows', async () => {
    const created = await saveLexiconEntry({
      existing: null,
      fields: fields({
        lemma: 'dog',
        gloss: 'canine',
        extraSenses: [
          { gloss: 'pet', definition: 'companion animal' },
          { gloss: '  ', definition: 'ignored' },
        ],
        forms: [{ transcription: 'dogs' }, { transcription: '  ' }, { transcription: 'doggie' }],
      }),
    });
    expect(created.senses).toHaveLength(2);
    expect(created.senses[1]?.gloss.default).toBe('pet');
    expect(created.senses[1]?.definition?.default).toBe('companion animal');
    expect(created.forms?.map((form) => form.transcription.default)).toEqual(['dogs', 'doggie']);
    expect(created.senses[0]?.id).toMatch(/^sense_/);
    expect(created.senses[1]?.id).toMatch(/^sense_/);
    expect(created.forms?.[0]?.id).toMatch(/^form_/);
    expect(created.forms?.[1]?.id).toMatch(/^form_/);
    const senseIds = created.senses.map((sense) => sense.id);
    const formIds = (created.forms ?? []).map((form) => form.id);

    const updated = await saveLexiconEntry({
      existing: created,
      fields: fields({
        lemma: 'dog',
        gloss: 'canine',
        extraSenses: [{ gloss: 'pet', definition: 'companion animal' }],
        forms: [{ transcription: 'dogs' }, { transcription: 'doggie' }],
      }),
    });
    expect(updated.senses.map((sense) => sense.id)).toEqual(senseIds);
    expect((updated.forms ?? []).map((form) => form.id)).toEqual(formIds);

    const cleared = await saveLexiconEntry({
      existing: created,
      fields: fields({
        lemma: 'dog',
        gloss: 'canine',
        extraSenses: [{ gloss: '', definition: '' }],
        forms: [{ transcription: '' }, { transcription: '' }],
      }),
    });
    expect(cleared.senses).toHaveLength(1);
    expect(cleared.forms).toBeUndefined();
  });

  it('keeps remaining nested ids after a middle extra sense or form is removed', async () => {
    const created = await saveLexiconEntry({
      existing: null,
      fields: fields({
        lemma: 'dog',
        gloss: 'canine',
        extraSenses: [
          { gloss: 'pet', definition: 'companion' },
          { gloss: 'follow', definition: 'pursue' },
          { gloss: 'hot dog', definition: 'food' },
        ],
        forms: [{ transcription: 'dogs' }, { transcription: 'doggie' }, { transcription: 'hound' }],
      }),
    });
    const extra = created.senses.slice(1);
    const storedForms = created.forms ?? [];
    expect(extra).toHaveLength(3);
    expect(storedForms).toHaveLength(3);

    const afterDelete = applyLexiconEntryFields(
      created,
      fields({
        lemma: 'dog',
        gloss: 'canine',
        extraSenses: [
          { ...draftIdFromNested(extra[0]?.id), gloss: 'pet', definition: 'companion' },
          { ...draftIdFromNested(extra[2]?.id), gloss: 'hot dog', definition: 'food' },
        ],
        forms: [
          { ...draftIdFromNested(storedForms[0]?.id), transcription: 'dogs' },
          { ...draftIdFromNested(storedForms[2]?.id), transcription: 'hound' },
        ],
      }),
      now,
    );
    expect(afterDelete.senses.map((sense) => sense.id)).toEqual([
      created.senses[0]?.id,
      extra[0]?.id,
      extra[2]?.id,
    ]);
    expect((afterDelete.forms ?? []).map((form) => form.id)).toEqual([
      storedForms[0]?.id,
      storedForms[2]?.id,
    ]);
    expect(afterDelete.senses.map((sense) => readPrimaryMultiLang(sense.gloss))).toEqual([
      'canine',
      'pet',
      'hot dog',
    ]);

    const stored = await saveLexiconEntry({
      existing: created,
      fields: fields({
        lemma: 'dog',
        gloss: 'canine',
        extraSenses: [
          { ...draftIdFromNested(extra[0]?.id), gloss: 'pet', definition: 'companion' },
          { ...draftIdFromNested(extra[2]?.id), gloss: 'hot dog', definition: 'food' },
        ],
        forms: [
          { ...draftIdFromNested(storedForms[0]?.id), transcription: 'dogs' },
          { ...draftIdFromNested(storedForms[2]?.id), transcription: 'hound' },
        ],
      }),
    });
    expect(stored.senses.map((sense) => sense.id)).toEqual([
      created.senses[0]?.id,
      extra[0]?.id,
      extra[2]?.id,
    ]);
    expect((stored.forms ?? []).map((form) => form.id)).toEqual([
      storedForms[0]?.id,
      storedForms[2]?.id,
    ]);
    const requery = await LinguisticService.lexemes.list();
    const readback = requery.find((row) => row.id === created.id);
    expect(readback?.senses.map((sense) => sense.id)).toEqual([
      created.senses[0]?.id,
      extra[0]?.id,
      extra[2]?.id,
    ]);
    expect((readback?.forms ?? []).map((form) => form.id)).toEqual([
      storedForms[0]?.id,
      storedForms[2]?.id,
    ]);
  });

  it('persists a subsense parentId and drops children when the parent extra sense is removed', async () => {
    const created = await saveLexiconEntry({
      existing: null,
      fields: fields({
        lemma: 'dog',
        gloss: 'canine',
        extraSenses: [{ gloss: 'pet', definition: 'companion' }],
      }),
    });
    const primaryId = created.senses[0]?.id;
    const petId = created.senses[1]?.id;
    expect(primaryId).toBeTruthy();
    expect(petId).toBeTruthy();
    if (primaryId === undefined || petId === undefined) return;

    const withChild = await saveLexiconEntry({
      existing: created,
      fields: fields({
        lemma: 'dog',
        gloss: 'canine',
        primarySenseId: primaryId,
        extraSenses: [
          { ...draftIdFromNested(petId), gloss: 'pet', definition: 'companion' },
          {
            gloss: 'puppy',
            definition: 'young dog',
            parentId: petId,
          },
        ],
      }),
    });
    expect(withChild.senses[2]?.parentId).toBe(petId);
    const requery = await LinguisticService.lexemes.list();
    const readback = requery.find((row) => row.id === created.id);
    expect(readback?.senses[2]?.parentId).toBe(petId);

    const afterDelete = applyLexiconEntryFields(
      withChild,
      fields({
        lemma: 'dog',
        gloss: 'canine',
        extraSenses: [],
      }),
      now,
    );
    expect(afterDelete.senses.map((sense) => readPrimaryMultiLang(sense.gloss))).toEqual([
      'canine',
    ]);
  });
});
