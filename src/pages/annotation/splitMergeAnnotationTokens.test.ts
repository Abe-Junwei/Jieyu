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
});
