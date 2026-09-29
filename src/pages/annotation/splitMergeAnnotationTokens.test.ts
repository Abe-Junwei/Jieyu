import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../db';
import { LinguisticService } from '../../services/LinguisticService';
import {
  mergeAnnotationUnitTokenWithNext,
  splitAnnotationUnitToken,
} from './splitMergeAnnotationTokens';

describe('splitMergeAnnotationTokens', () => {
  const now = '2026-09-04T16:00:00.000Z';

  beforeEach(async () => {
    await Promise.all([
      db.unit_tokens.clear(),
      db.unit_morphemes.clear(),
      db.token_lexeme_links.clear(),
    ]);
  });

  it('splits a token at whitespace then readback keeps both forms', async () => {
    await db.unit_tokens.bulkPut([
      {
        id: 'tok-a',
        textId: 'text-split-1',
        unitId: 'unit-split-1',
        form: { default: 'hello world' },
        tokenIndex: 0,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'tok-b',
        textId: 'text-split-1',
        unitId: 'unit-split-1',
        form: { default: 'next' },
        tokenIndex: 1,
        createdAt: now,
        updatedAt: now,
      },
    ]);

    const readback = await splitAnnotationUnitToken('unit-split-1', 'tok-a');
    expect(readback.map((row) => row.form.default)).toEqual(['hello', 'world', 'next']);
    expect(readback.map((row) => row.tokenIndex)).toEqual([0, 1, 2]);

    const requery = await LinguisticService.units.listTokensByUnitIds(['unit-split-1']);
    expect(requery).toHaveLength(3);
  });

  it('merges a token with the next then readback drops the right id', async () => {
    await db.unit_tokens.bulkPut([
      {
        id: 'tok-a',
        textId: 'text-merge-1',
        unitId: 'unit-merge-1',
        form: { default: 'hello' },
        tokenIndex: 0,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'tok-b',
        textId: 'text-merge-1',
        unitId: 'unit-merge-1',
        form: { default: 'world' },
        tokenIndex: 1,
        createdAt: now,
        updatedAt: now,
      },
    ]);

    const readback = await mergeAnnotationUnitTokenWithNext('unit-merge-1', 'tok-a');
    expect(readback).toHaveLength(1);
    expect(readback[0]?.form.default).toBe('hello world');

    const requery = await LinguisticService.units.listTokensByUnitIds(['unit-merge-1']);
    expect(requery.map((row) => row.id)).toEqual(['tok-a']);
  });

  it('keeps the right token morpheme and lexicon link on the survivor', async () => {
    await db.unit_tokens.bulkPut([
      {
        id: 'tok-a',
        textId: 'text-merge-2',
        unitId: 'unit-merge-2',
        form: { default: 'hello' },
        tokenIndex: 0,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'tok-b',
        textId: 'text-merge-2',
        unitId: 'unit-merge-2',
        form: { default: 'world' },
        tokenIndex: 1,
        createdAt: now,
        updatedAt: now,
      },
    ]);
    await db.unit_morphemes.put({
      id: 'mor-right',
      textId: 'text-merge-2',
      unitId: 'unit-merge-2',
      tokenId: 'tok-b',
      form: { default: 'world', eng: 'world' },
      pos: 'n',
      morphemeIndex: 0,
      createdAt: now,
      updatedAt: now,
    });
    await db.token_lexeme_links.put({
      id: 'link-right',
      targetType: 'token',
      targetId: 'tok-b',
      lexemeId: 'lex-world',
      senseId: 'sense-world',
      confidence: 0.8,
      role: 'manual',
      createdAt: now,
      updatedAt: now,
    });

    await mergeAnnotationUnitTokenWithNext('unit-merge-2', 'tok-a');

    const morphs = await LinguisticService.units.listMorphemesByTokenIds(['tok-a']);
    expect(morphs.map((row) => row.id)).toEqual(['mor-right']);
    expect(morphs[0]?.form).toEqual({ default: 'world', eng: 'world' });
    expect(morphs[0]?.pos).toBe('n');
    const links = await LinguisticService.units.listTokenLexemeLinks('token', 'tok-a');
    expect(links.map((row) => row.id)).toEqual(['link-right']);
    expect(links[0]?.senseId).toBe('sense-world');
    expect(links[0]?.confidence).toBe(0.8);
    expect(await LinguisticService.units.listMorphemesByTokenIds(['tok-b'])).toEqual([]);
  });
});
