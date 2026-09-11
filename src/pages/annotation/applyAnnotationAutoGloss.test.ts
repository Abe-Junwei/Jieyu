import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../db';
import { LinguisticService } from '../../services/LinguisticService';
import { previewAutoGlossMatches } from '../../ai/autoGlossPreview';
import {
  applyAnnotationAutoGlossPreview,
  previewAnnotationAutoGloss,
} from './applyAnnotationAutoGloss';

describe('applyAnnotationAutoGloss', () => {
  const now = '2026-09-11T08:00:00.000Z';

  beforeEach(async () => {
    await Promise.all([db.unit_tokens.clear(), db.lexemes.clear(), db.token_lexeme_links.clear()]);
  });

  it('previews without writing then apply readback writes gloss and link', async () => {
    await db.unit_tokens.put({
      id: 'tok-ag-1',
      textId: 'text-ag-1',
      unitId: 'unit-ag-1',
      form: { default: 'dog' },
      tokenIndex: 0,
      createdAt: now,
      updatedAt: now,
    });
    await db.lexemes.put({
      id: 'lex-ag-1',
      lemma: { default: 'dog' },
      senses: [{ gloss: { default: 'canine' } }],
      createdAt: now,
      updatedAt: now,
    });

    const preview = await previewAnnotationAutoGloss('unit-ag-1');
    expect(preview.matches).toHaveLength(1);
    expect(preview.matches[0]?.lexemeId).toBe('lex-ag-1');

    const before = await db.unit_tokens.get('tok-ag-1');
    expect(before?.gloss).toBeUndefined();
    const linksBefore = await db.token_lexeme_links.toArray();
    expect(linksBefore).toHaveLength(0);

    const readback = await applyAnnotationAutoGlossPreview('unit-ag-1', preview.matches);
    expect(readback[0]?.gloss?.default).toBe('canine');
    const requery = await LinguisticService.units.listTokensByUnitIds(['unit-ag-1']);
    expect(requery[0]?.gloss?.default).toBe('canine');
    const links = await LinguisticService.units.listTokenLexemeLinks('token', 'tok-ag-1');
    expect(links).toHaveLength(1);
    expect(links[0]?.lexemeId).toBe('lex-ag-1');
  });

  it('skips dirty or already glossed tokens in preview', () => {
    const tokens = [
      {
        id: 'tok-skip',
        textId: 't',
        unitId: 'u',
        form: { default: 'dog' },
        gloss: { default: 'already' },
        tokenIndex: 0,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'tok-dirty',
        textId: 't',
        unitId: 'u',
        form: { default: 'dog' },
        tokenIndex: 1,
        createdAt: now,
        updatedAt: now,
      },
    ];
    const result = previewAutoGlossMatches(
      tokens,
      [
        {
          id: 'lex',
          lemma: { default: 'dog' },
          senses: [{ gloss: { default: 'canine' } }],
          createdAt: now,
          updatedAt: now,
        },
      ],
      new Set(['tok-dirty']),
    );
    expect(result.matches).toHaveLength(0);
    expect(result.skipped).toBe(2);
  });
});
