import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../db';
import { LinguisticService } from '../../services/LinguisticService';
import { previewAutoGlossMatches } from '../../ai/autoGlossPreview';
import { entryDoc } from '../../utils/dmlexEntry';
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
    await db.lexemes.put(
      entryDoc({
        id: 'lex-ag-1',
        headword: 'dog',
        definition: 'canine',
        createdAt: now,
        updatedAt: now,
      }),
    );

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

  it('replaces prior links when apply runs twice for the same preview', async () => {
    await db.unit_tokens.put({
      id: 'tok-ag-2',
      textId: 'text-ag-2',
      unitId: 'unit-ag-2',
      form: { default: 'dog' },
      tokenIndex: 0,
      createdAt: now,
      updatedAt: now,
    });
    await db.lexemes.put(
      entryDoc({
        id: 'lex-ag-2',
        headword: 'dog',
        definition: 'canine',
        createdAt: now,
        updatedAt: now,
      }),
    );

    const preview = await previewAnnotationAutoGloss('unit-ag-2');
    await Promise.all([
      applyAnnotationAutoGlossPreview('unit-ag-2', preview.matches),
      applyAnnotationAutoGlossPreview('unit-ag-2', preview.matches),
    ]);

    const links = await LinguisticService.units.listTokenLexemeLinks('token', 'tok-ag-2');
    expect(links).toHaveLength(1);
    expect(links[0]?.lexemeId).toBe('lex-ag-2');
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
        entryDoc({
          id: 'lex',
          headword: 'dog',
          definition: 'canine',
          createdAt: now,
          updatedAt: now,
        }),
      ],
      new Set(['tok-dirty']),
    );
    expect(result.matches).toHaveLength(0);
    expect(result.skipped).toBe(2);
  });

  it('restores the old sense link when link creation fails mid-apply', async () => {
    await db.unit_tokens.put({
      id: 'tok-ag-rollback',
      textId: 'text-ag-rollback',
      unitId: 'unit-ag-rollback',
      form: { default: 'dog' },
      tokenIndex: 0,
      createdAt: now,
      updatedAt: now,
    });
    await db.token_lexeme_links.put({
      id: 'tll-old',
      targetType: 'token',
      targetId: 'tok-ag-rollback',
      lexemeId: 'lex-old',
      senseId: 'sense-old',
      role: 'manual',
      createdAt: now,
      updatedAt: now,
    });
    const fail = () => {
      throw new Error('injected link failure');
    };
    db.token_lexeme_links.hook('creating', fail);
    try {
      await expect(
        applyAnnotationAutoGlossPreview('unit-ag-rollback', [
          {
            tokenId: 'tok-ag-rollback',
            tokenForm: { default: 'dog' },
            lexemeId: 'lex-new',
            senseId: 'sense-new',
            lexemeLemma: { default: 'dog' },
            gloss: { default: 'AUTO' },
            confidence: 1,
            matchType: 'exact',
          },
        ]),
      ).rejects.toThrow('injected link failure');
    } finally {
      db.token_lexeme_links.hook('creating').unsubscribe(fail);
    }
    const token = await db.unit_tokens.get('tok-ag-rollback');
    expect(token?.gloss).toBeUndefined();
    const links = await LinguisticService.units.listTokenLexemeLinks('token', 'tok-ag-rollback');
    expect(links.map((link) => link.senseId)).toEqual(['sense-old']);
  });

  it('restores both old sense links when the second token link fails', async () => {
    await db.unit_tokens.bulkPut([
      {
        id: 'tok-ag-a',
        textId: 'text-ag-two',
        unitId: 'unit-ag-two',
        form: { default: 'dog' },
        tokenIndex: 0,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'tok-ag-b',
        textId: 'text-ag-two',
        unitId: 'unit-ag-two',
        form: { default: 'cat' },
        tokenIndex: 1,
        createdAt: now,
        updatedAt: now,
      },
    ]);
    await db.token_lexeme_links.bulkPut([
      {
        id: 'tll-a',
        targetType: 'token',
        targetId: 'tok-ag-a',
        lexemeId: 'lex-a',
        senseId: 'sense-a',
        role: 'manual',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'tll-b',
        targetType: 'token',
        targetId: 'tok-ag-b',
        lexemeId: 'lex-b',
        senseId: 'sense-b',
        role: 'manual',
        createdAt: now,
        updatedAt: now,
      },
    ]);
    let creates = 0;
    const failSecond = () => {
      creates += 1;
      if (creates >= 2) throw new Error('injected second link failure');
    };
    db.token_lexeme_links.hook('creating', failSecond);
    try {
      await expect(
        applyAnnotationAutoGlossPreview('unit-ag-two', [
          {
            tokenId: 'tok-ag-a',
            tokenForm: { default: 'dog' },
            lexemeId: 'lex-new-a',
            senseId: 'sense-new-a',
            lexemeLemma: { default: 'dog' },
            gloss: { default: 'AUTO-A' },
            confidence: 1,
            matchType: 'exact',
          },
          {
            tokenId: 'tok-ag-b',
            tokenForm: { default: 'cat' },
            lexemeId: 'lex-new-b',
            senseId: 'sense-new-b',
            lexemeLemma: { default: 'cat' },
            gloss: { default: 'AUTO-B' },
            confidence: 1,
            matchType: 'exact',
          },
        ]),
      ).rejects.toThrow('injected second link failure');
    } finally {
      db.token_lexeme_links.hook('creating').unsubscribe(failSecond);
    }
    expect((await db.unit_tokens.get('tok-ag-a'))?.gloss).toBeUndefined();
    expect((await db.unit_tokens.get('tok-ag-b'))?.gloss).toBeUndefined();
    const linksA = await LinguisticService.units.listTokenLexemeLinks('token', 'tok-ag-a');
    const linksB = await LinguisticService.units.listTokenLexemeLinks('token', 'tok-ag-b');
    expect(linksA.map((link) => link.senseId)).toEqual(['sense-a']);
    expect(linksB.map((link) => link.senseId)).toEqual(['sense-b']);
  });

  it('rolls back the first token when the second link fails', async () => {
    await db.unit_tokens.bulkPut([
      {
        id: 'tok-ag-a',
        textId: 'text-ag-two',
        unitId: 'unit-ag-two',
        form: { default: 'dog' },
        tokenIndex: 0,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'tok-ag-b',
        textId: 'text-ag-two',
        unitId: 'unit-ag-two',
        form: { default: 'cat' },
        tokenIndex: 1,
        createdAt: now,
        updatedAt: now,
      },
    ]);
    await db.token_lexeme_links.bulkPut([
      {
        id: 'tll-a',
        targetType: 'token',
        targetId: 'tok-ag-a',
        lexemeId: 'lex-old-a',
        senseId: 'sense-old-a',
        role: 'manual',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'tll-b',
        targetType: 'token',
        targetId: 'tok-ag-b',
        lexemeId: 'lex-old-b',
        senseId: 'sense-old-b',
        role: 'manual',
        createdAt: now,
        updatedAt: now,
      },
    ]);
    let creates = 0;
    const fail = () => {
      creates += 1;
      if (creates >= 2) throw new Error('injected second link failure');
    };
    db.token_lexeme_links.hook('creating', fail);
    try {
      await expect(
        applyAnnotationAutoGlossPreview('unit-ag-two', [
          {
            tokenId: 'tok-ag-a',
            tokenForm: { default: 'dog' },
            lexemeId: 'lex-new-a',
            senseId: 'sense-new-a',
            lexemeLemma: { default: 'dog' },
            gloss: { default: 'AUTO' },
            confidence: 1,
            matchType: 'exact',
          },
          {
            tokenId: 'tok-ag-b',
            tokenForm: { default: 'cat' },
            lexemeId: 'lex-new-b',
            senseId: 'sense-new-b',
            lexemeLemma: { default: 'cat' },
            gloss: { default: 'AUTO' },
            confidence: 1,
            matchType: 'exact',
          },
        ]),
      ).rejects.toThrow('injected second link failure');
    } finally {
      db.token_lexeme_links.hook('creating').unsubscribe(fail);
    }
    const tokens = await LinguisticService.units.listTokensByUnitIds(['unit-ag-two']);
    expect(tokens.map((token) => token.gloss?.default)).toEqual([undefined, undefined]);
    const linksA = await LinguisticService.units.listTokenLexemeLinks('token', 'tok-ag-a');
    const linksB = await LinguisticService.units.listTokenLexemeLinks('token', 'tok-ag-b');
    expect(linksA.map((link) => link.senseId)).toEqual(['sense-old-a']);
    expect(linksB.map((link) => link.senseId)).toEqual(['sense-old-b']);
  });

  it('does not apply a preview after a human gloss was saved', async () => {
    await db.unit_tokens.put({
      id: 'tok-ag-human',
      textId: 'text-ag-human',
      unitId: 'unit-ag-human',
      form: { default: 'dog' },
      tokenIndex: 0,
      createdAt: now,
      updatedAt: now,
    });
    const match = {
      tokenId: 'tok-ag-human',
      tokenForm: { default: 'dog' },
      lexemeId: 'lex-ag-human',
      lexemeLemma: { default: 'dog' },
      gloss: { default: 'AUTO' },
      confidence: 1,
      matchType: 'exact' as const,
    };
    await LinguisticService.units.updateTokenGloss('tok-ag-human', 'HUMAN', 'default');
    await expect(applyAnnotationAutoGlossPreview('unit-ag-human', [match])).rejects.toThrow(
      'autogloss preview conflict',
    );
    expect((await db.unit_tokens.get('tok-ag-human'))?.gloss?.default).toBe('HUMAN');

    await db.unit_tokens.put({
      id: 'tok-ag-draft',
      textId: 'text-ag-human',
      unitId: 'unit-ag-human',
      form: { default: 'cat' },
      tokenIndex: 1,
      createdAt: now,
      updatedAt: now,
    });
    await expect(
      applyAnnotationAutoGlossPreview(
        'unit-ag-human',
        [{ ...match, tokenId: 'tok-ag-draft', tokenForm: { default: 'cat' } }],
        undefined,
        new Set(['tok-ag-draft']),
      ),
    ).rejects.toThrow('autogloss preview conflict');
    expect((await db.unit_tokens.get('tok-ag-draft'))?.gloss).toBeUndefined();

    await expect(
      applyAnnotationAutoGlossPreview('unit-ag-human', [
        { ...match, tokenId: 'tok-missing', tokenForm: { default: 'dog' } },
      ]),
    ).rejects.toThrow('autogloss preview conflict');
  });
});
