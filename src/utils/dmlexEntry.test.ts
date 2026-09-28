import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import Ajv from 'ajv/dist/2020';
import { DMLEX_HOMOGRAPH, DMLEX_RESOURCE_ID, DMLEX_SUBSENSE } from '../db/dmlexTypes';
import { validateLexemeDoc } from '../db/schemas';
import { applyLexiconEntryFields, emptyEntryFields, entryDoc, fieldsFromEntry } from './dmlexEntry';

const now = '2026-09-27T00:00:00.000Z';

describe('applyLexiconEntryFields', () => {
  it('writes a schema entry and keeps the note outside it', () => {
    const applied = applyLexiconEntryFields(
      null,
      {
        ...emptyEntryFields(),
        headword: 'pine',
        partsOfSpeech: 'noun',
        pronunciation: 'paɪn',
        etymon: 'pinus',
        etymonLang: 'la',
        note: 'seen on ridges',
        senses: [
          {
            ...emptyEntryFields().senses[0]!,
            id: 'sense-pine',
            translation: 'a conifer',
            translationLang: 'en',
            definition: 'evergreen tree',
            example: 'the pine stood alone',
            exampleTranslation: '那棵松单独立着',
            exampleTranslationLang: 'zh',
            exampleSegmentId: 'seg-1',
          },
        ],
      },
      null,
      now,
    );

    expect(applied.entry.entry).toMatchObject({
      id: applied.entry.id,
      headword: 'pine',
      partsOfSpeech: ['noun'],
      pronunciations: [{ transcriptions: [{ text: 'paɪn' }] }],
    });
    expect(applied.entry.entry.senses?.[0]?.headwordTranslations?.[0]).toEqual({
      text: 'a conifer',
      langCode: 'en',
    });
    expect(applied.entry.jieyu?.notes).toEqual([
      { owner: 'entry', ref: applied.entry.id, text: 'seen on ridges' },
    ]);
    expect(applied.entry.jieyu?.exampleRefs).toEqual([
      { senseId: 'sense-pine', exampleIndex: 0, segmentId: 'seg-1' },
    ]);
    expect(applied.entry.entry).not.toHaveProperty('jieyu');
    validateLexemeDoc(applied.entry);
    validateLexemeDoc(applied.resource);
  });

  it('records a subsense relation on the resource row', () => {
    const applied = applyLexiconEntryFields(
      entryDoc({
        id: 'lex-oak',
        headword: 'oak',
        translation: 'tree',
        createdAt: now,
        updatedAt: now,
      }),
      {
        ...fieldsFromEntry(
          entryDoc({
            id: 'lex-oak',
            headword: 'oak',
            translation: 'tree',
            createdAt: now,
            updatedAt: now,
          }),
        ),
        senses: [
          {
            ...emptyEntryFields().senses[0]!,
            id: 'sense-tree',
            translation: 'tree',
          },
          {
            ...emptyEntryFields().senses[0]!,
            id: 'sense-wood',
            parentId: 'sense-tree',
            translation: 'timber',
          },
        ],
      },
      null,
      now,
    );
    expect(applied.resource.id).toBe(DMLEX_RESOURCE_ID);
    expect(applied.resource.resource.relations).toEqual([
      { type: DMLEX_SUBSENSE, members: [{ ref: 'sense-tree' }, { ref: 'sense-wood' }] },
    ]);
    expect(applied.resource.resource.relationTypes).toEqual([
      { type: DMLEX_SUBSENSE, scopeRestriction: 'sameEntry' },
    ]);
  });

  it('links two entries with a homograph relation', () => {
    const applied = applyLexiconEntryFields(
      entryDoc({ id: 'lex-bank-1', headword: 'bank', createdAt: now, updatedAt: now }),
      {
        ...emptyEntryFields(),
        headword: 'bank',
        homographEntryId: 'lex-bank-2',
        senses: [{ ...emptyEntryFields().senses[0]!, id: 'sense-river', translation: 'shore' }],
      },
      null,
      now,
    );
    expect(applied.resource.resource.relations?.[0]).toEqual({
      type: DMLEX_HOMOGRAPH,
      members: [{ ref: 'lex-bank-1' }, { ref: 'lex-bank-2' }],
    });
    expect(applied.resource.resource.relationTypes).toEqual([
      { type: DMLEX_HOMOGRAPH, scopeRestriction: 'sameResource' },
    ]);
  });
});

describe('dmlex.schema.json fixture', () => {
  it('accepts one resource that embeds the stored entry', () => {
    const applied = applyLexiconEntryFields(
      null,
      {
        ...emptyEntryFields(),
        headword: 'pine',
        senses: [
          {
            ...emptyEntryFields().senses[0]!,
            translation: 'a conifer',
            translationLang: 'en',
            explanation: 'evergreen',
            explanationLang: 'zh',
          },
        ],
      },
      null,
      now,
    );
    const document = {
      langCode: applied.resource.resource.langCode,
      translationLanguages: applied.resource.resource.translationLanguages,
      entries: [applied.entry.entry],
    };
    const ajv = new Ajv({ allErrors: true, strict: false });
    const schema = JSON.parse(
      readFileSync(
        new URL('../../docs/architecture/dmlex/dmlex.schema.json', import.meta.url),
        'utf8',
      ),
    ) as object;
    const validate = ajv.compile(schema);
    expect(validate(document), JSON.stringify(validate.errors)).toBe(true);
    expect(validate(applied.entry.entry), JSON.stringify(validate.errors)).toBe(true);
  });
});
