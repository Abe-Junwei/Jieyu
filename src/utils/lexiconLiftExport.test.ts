// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import type { LexemeDocType } from '../types/jieyuDbDocTypes';
import {
  LIFT_FILENAME,
  LIFT_PRODUCER,
  LIFT_VERSION,
  exportLexemesAsLift,
  serializeLexemesToLift,
} from './lexiconLiftExport';

const now = '2026-09-20T10:00:00.000Z';

const dog: LexemeDocType = {
  id: 'lex-dog',
  lemma: { default: 'dog', eng: 'hound' },
  citationForm: 'dog',
  language: 'eng',
  lexemeType: 'word',
  notes: { zho: '常见家养动物' },
  senses: [
    {
      id: 'sense_primary',
      gloss: { eng: 'canine' },
      definition: { eng: 'domesticated canine' },
      category: 'noun',
    },
    { id: 'sense_pet', gloss: { default: 'pet' }, definition: { default: 'companion' } },
  ],
  forms: [
    { id: 'form_dogs', transcription: { default: 'dogs' } },
    { id: 'form_doggie', transcription: { default: 'doggie' } },
  ],
  createdAt: now,
  updatedAt: now,
};

describe('lexiconLiftExport', () => {
  it('serializes lexemes as LIFT 0.13 with senses and allomorph variants', () => {
    const xml = serializeLexemesToLift([dog]);
    expect(xml).toContain(`<lift version="${LIFT_VERSION}" producer="${LIFT_PRODUCER}">`);
    expect(xml).toContain('id="lex-dog"');
    expect(xml).toContain(
      '<lexical-unit><form lang="eng"><text>hound</text></form></lexical-unit>',
    );
    expect(xml).toContain('<citation><form lang="eng"><text>dog</text></form></citation>');
    expect(xml).toContain('<trait name="morph-type" value="word"/>');
    expect(xml).toContain('<sense id="sense_primary" order="0">');
    expect(xml).toContain('<grammatical-info value="noun"/>');
    expect(xml).toContain('<gloss lang="eng"><text>canine</text></gloss>');
    expect(xml).toContain(
      '<definition><form lang="eng"><text>domesticated canine</text></form></definition>',
    );
    expect(xml).toContain('<sense id="sense_pet" order="1">');
    expect(xml).toContain('<gloss lang="eng"><text>pet</text></gloss>');
    expect(xml).toContain('<variant><form lang="eng"><text>dogs</text></form></variant>');
    expect(xml).toContain('<variant><form lang="eng"><text>doggie</text></form></variant>');
    expect(xml).toContain('<note><form lang="zho"><text>常见家养动物</text></form></note>');
    expect(xml).not.toContain('form_dogs');
  });

  it('writes sense examples as LIFT example elements and ignores entry-level example strings', () => {
    const xml = serializeLexemesToLift([
      {
        ...dog,
        examples: ['legacy note'],
        senses: [
          {
            ...dog.senses[0]!,
            examples: [{ source: 'the dog runs', translation: '狗在跑' }, { source: 'a <dog>' }],
          },
          dog.senses[1]!,
        ],
      },
    ]);
    expect(xml).toContain(
      '<example><form lang="eng"><text>the dog runs</text></form><translation><form lang="eng"><text>狗在跑</text></form></translation></example>',
    );
    expect(xml).toContain('<example><form lang="eng"><text>a &lt;dog&gt;</text></form></example>');
    expect(xml).not.toContain('legacy note');
  });

  it('nests parented senses as LIFT subsense elements', () => {
    const xml = serializeLexemesToLift([
      {
        ...dog,
        senses: [
          dog.senses[0]!,
          { id: 'sense_pet', parentId: 'sense_primary', gloss: { default: 'pet' } },
        ],
      },
    ]);
    expect(xml).toContain('<sense id="sense_primary" order="0">');
    expect(xml).toContain('<subsense id="sense_pet" order="0">');
    expect(xml).not.toContain('<sense id="sense_pet"');
  });

  it('escapes XML and maps default lang without duplicating vernacular form', () => {
    const xml = serializeLexemesToLift([
      {
        id: 'lex-amp',
        lemma: { default: 'a & b <c>' },
        language: 'eng',
        senses: [{ id: 'sense_amp', gloss: { default: 'and/or' } }],
        createdAt: now,
        updatedAt: now,
      },
    ]);
    expect(xml).toContain('<form lang="eng"><text>a &amp; b &lt;c&gt;</text></form>');
    expect(xml).toContain('<gloss lang="eng"><text>and/or</text></gloss>');
    expect(xml?.match(/<form lang="eng">/g)?.length).toBe(1);
  });

  it('emits the first pronunciation as und-fonipa and omits a blank one', () => {
    const xml = serializeLexemesToLift([{ ...dog, pronunciation: ' dɔg ' }]);
    expect(xml).toContain(
      '<pronunciation><form lang="und-fonipa"><text>dɔg</text></form></pronunciation>',
    );
    expect(serializeLexemesToLift([dog])).not.toContain('<pronunciation>');
  });

  it('emits one etymology and omits a blank source form', () => {
    const xml = serializeLexemesToLift([
      {
        ...dog,
        etymology: { form: 'perro', gloss: 'dog', sourceLanguage: 'Spanish' },
      },
    ]);
    expect(xml).toContain(
      '<etymology><trait name="languages" value="Spanish"/><form lang="und"><text>perro</text></form><gloss lang="und"><text>dog</text></gloss></etymology>',
    );
    expect(serializeLexemesToLift([dog])).not.toContain('<etymology>');
  });

  it('emits literal meaning as a field and omits a blank one', () => {
    const xml = serializeLexemesToLift([{ ...dog, literalMeaning: ' domestic animal ' }]);
    expect(xml).toContain(
      '<field type="literal-meaning"><form lang="und"><text>domestic animal</text></form></field>',
    );
    expect(serializeLexemesToLift([dog])).not.toContain('literal-meaning');
  });

  it('emits bibliography as a typed note after the untyped note', () => {
    const xml = serializeLexemesToLift([{ ...dog, bibliography: ' Smith 1990 ' }]);
    expect(xml).toContain('<note><form lang="zho"><text>常见家养动物</text></form></note>');
    expect(xml).toContain(
      '<note type="bibliography"><form lang="und"><text>Smith 1990</text></form></note>',
    );
    const noteAt = xml?.indexOf('<note>') ?? -1;
    const bibliographyAt = xml?.indexOf('<note type="bibliography">') ?? -1;
    expect(noteAt).toBeGreaterThanOrEqual(0);
    expect(bibliographyAt).toBeGreaterThan(noteAt);
    expect(serializeLexemesToLift([dog])).not.toContain('type="bibliography"');
  });

  it('returns null for an empty list or entries without lemma text', () => {
    expect(serializeLexemesToLift([])).toBeNull();
    expect(
      serializeLexemesToLift([
        { ...dog, lemma: { default: '   ' }, senses: [{ gloss: { default: 'x' } }] },
      ]),
    ).toBeNull();
  });

  it('downloads xml and refuses empty lists', () => {
    const createObjectURL = vi.fn(() => 'blob:lift');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', { ...URL, createObjectURL, revokeObjectURL });
    const click = vi.fn();
    const anchor = {
      href: '',
      download: '',
      click,
      remove: vi.fn(),
    };
    vi.spyOn(document, 'createElement').mockReturnValue(anchor as unknown as HTMLAnchorElement);
    vi.spyOn(document.body, 'appendChild').mockImplementation((node) => node);

    const exported = exportLexemesAsLift([dog]);
    expect(exported.ok).toBe(true);
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(click).toHaveBeenCalledTimes(1);
    expect(anchor.download).toBe(LIFT_FILENAME);

    const empty = exportLexemesAsLift([]);
    expect(empty).toEqual({ ok: false, reason: 'empty' });
    expect(createObjectURL).toHaveBeenCalledTimes(1);

    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });
});
