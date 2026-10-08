import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import Ajv from 'ajv/dist/2020';
import { DMLEX_HOMOGRAPH, dmlexResourceIdForProject } from '../db/dmlexTypes';
import type { LexemeResourceDoc } from '../db/types';
import { entryDoc } from './dmlexEntry';
import { exportLexemesAsDmlex, serializeLexemesToDmlex } from './dmlexJsonExport';

const now = '2026-09-28T00:00:00.000Z';

describe('serializeLexemesToDmlex', () => {
  it('embeds entries and leaves jieyu notes out of the document', () => {
    const document = serializeLexemesToDmlex(
      [
        {
          ...entryDoc({
            id: 'lex-pine',
            headword: 'pine',
            translation: 'a conifer',
            langCode: 'en',
            createdAt: now,
            updatedAt: now,
          }),
          jieyu: { notes: [{ owner: 'entry', ref: 'lex-pine', text: 'ridge note' }] },
        },
      ],
      null,
    );
    expect(document.entries).toEqual([
      expect.objectContaining({ id: 'lex-pine', headword: 'pine' }),
    ]);
    expect(JSON.stringify(document)).not.toContain('ridge note');
    expect(JSON.stringify(document)).not.toContain('createdAt');
    expect(document.langCode).toBe('und');
    expect(document.translationLanguages).toContain('en');
  });

  it('keeps resource relations and validates against the vendored schema', () => {
    const resource: LexemeResourceDoc = {
      id: dmlexResourceIdForProject('text-1'),
      textId: 'text-1',
      kind: 'resource',
      resource: {
        langCode: 'und',
        translationLanguages: ['en'],
        relations: [{ type: DMLEX_HOMOGRAPH, members: [{ ref: 'lex-pine' }, { ref: 'lex-pin' }] }],
        relationTypes: [{ type: DMLEX_HOMOGRAPH, scopeRestriction: 'sameResource' }],
      },
      createdAt: now,
      updatedAt: now,
    };
    const document = serializeLexemesToDmlex(
      [
        entryDoc({
          id: 'lex-pine',
          headword: 'pine',
          translation: 'a conifer',
          langCode: 'en',
          createdAt: now,
          updatedAt: now,
        }),
      ],
      resource,
    );
    expect(document.relations?.[0]?.type).toBe(DMLEX_HOMOGRAPH);
    const ajv = new Ajv({ allErrors: true, strict: false });
    const schema = JSON.parse(
      readFileSync(
        new URL('../../docs/architecture/dmlex/dmlex.schema.json', import.meta.url),
        'utf8',
      ),
    ) as object;
    const validate = ajv.compile(schema);
    expect(validate(document), JSON.stringify(validate.errors)).toBe(true);
  });

  it('does not download when the list is empty', () => {
    expect(exportLexemesAsDmlex([], null)).toEqual({ ok: false, reason: 'empty' });
  });
});
