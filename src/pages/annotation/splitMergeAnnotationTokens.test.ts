import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../db';
import { LinguisticService } from '../../services/LinguisticService';
import { restoreAnnotationRetokenize } from './annotationRetokenize';
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
      db.unit_relations.clear(),
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

  it('keeps the right token gloss, POS, and language when the left token has none', async () => {
    await db.unit_tokens.bulkPut([
      {
        id: 'tok-a',
        textId: 'text-merge-3',
        unitId: 'unit-merge-3',
        form: { default: 'hello' },
        tokenIndex: 0,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'tok-b',
        textId: 'text-merge-3',
        unitId: 'unit-merge-3',
        form: { default: 'world' },
        gloss: { default: 'WORLD' },
        pos: 'N',
        languageId: 'eng',
        tokenIndex: 1,
        createdAt: now,
        updatedAt: now,
      },
    ]);

    await mergeAnnotationUnitTokenWithNext('unit-merge-3', 'tok-a');

    const requery = await LinguisticService.units.listTokensByUnitIds(['unit-merge-3']);
    expect(requery).toHaveLength(1);
    expect(requery[0]?.id).toBe('tok-a');
    expect(requery[0]?.form.default).toBe('hello world');
    expect(requery[0]?.gloss).toEqual({ default: 'WORLD' });
    expect(requery[0]?.pos).toBe('N');
    expect(requery[0]?.languageId).toBe('eng');
  });

  it('snapshots conflicting gloss and POS instead of joining them, then restore reads both tokens', async () => {
    await db.unit_tokens.bulkPut([
      {
        id: 'tok-a',
        textId: 'text-merge-4',
        unitId: 'unit-merge-4',
        form: { default: 'hello' },
        gloss: { default: 'HI' },
        pos: 'V',
        languageId: 'bod',
        tokenIndex: 0,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'tok-b',
        textId: 'text-merge-4',
        unitId: 'unit-merge-4',
        form: { default: 'world' },
        gloss: { default: 'WORLD' },
        pos: 'N',
        languageId: 'eng',
        tokenIndex: 1,
        createdAt: now,
        updatedAt: now,
      },
    ]);

    await mergeAnnotationUnitTokenWithNext('unit-merge-4', 'tok-a');

    const merged = await LinguisticService.units.listTokensByUnitIds(['unit-merge-4']);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.gloss).toEqual({ default: 'HI' });
    expect(merged[0]?.pos).toBe('V');
    expect(merged[0]?.languageId).toBe('bod');

    const restored = await restoreAnnotationRetokenize({
      textId: 'text-merge-4',
      unitId: 'unit-merge-4',
    });
    expect(restored.restored).toBe(true);
    const requery = await LinguisticService.units.listTokensByUnitIds(['unit-merge-4']);
    const left = requery.find((row) => row.id === 'tok-a');
    const right = requery.find((row) => row.id === 'tok-b');
    expect(left?.gloss).toEqual({ default: 'HI' });
    expect(left?.pos).toBe('V');
    expect(left?.languageId).toBe('bod');
    expect(right?.form.default).toBe('world');
    expect(right?.gloss).toEqual({ default: 'WORLD' });
    expect(right?.pos).toBe('N');
    expect(right?.languageId).toBe('eng');
  });

  it('shifts right morpheme spans onto the merged form, including gaps, unicode, and a left morpheme', async () => {
    const leftForm = 'hi';
    const rightForm = 'a👋b';
    const rightSpans = [
      { startOffset: 0, endOffset: 1 },
      { startOffset: 3, endOffset: 4 },
    ];
    const rightFragment = rightSpans
      .map((span) => rightForm.slice(span.startOffset, span.endOffset))
      .join('');
    await db.unit_tokens.bulkPut([
      {
        id: 'tok-a',
        textId: 'text-merge-5',
        unitId: 'unit-merge-5',
        form: { default: leftForm },
        tokenIndex: 0,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'tok-b',
        textId: 'text-merge-5',
        unitId: 'unit-merge-5',
        form: { default: rightForm },
        tokenIndex: 1,
        createdAt: now,
        updatedAt: now,
      },
    ]);
    await db.unit_morphemes.bulkPut([
      {
        id: 'mor-left',
        textId: 'text-merge-5',
        unitId: 'unit-merge-5',
        tokenId: 'tok-a',
        form: { default: leftForm },
        surfaceParts: [{ startOffset: 0, endOffset: leftForm.length }],
        morphemeIndex: 0,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'mor-right',
        textId: 'text-merge-5',
        unitId: 'unit-merge-5',
        tokenId: 'tok-b',
        form: { default: rightFragment },
        surfaceParts: rightSpans,
        morphemeIndex: 0,
        createdAt: now,
        updatedAt: now,
      },
    ]);

    await mergeAnnotationUnitTokenWithNext('unit-merge-5', 'tok-a');

    const requery = await LinguisticService.units.listTokensByUnitIds(['unit-merge-5']);
    const mergedForm = requery[0]?.form.default ?? '';
    const morphs = await LinguisticService.units.listMorphemesByTokenIds(['tok-a']);
    const left = morphs.find((row) => row.id === 'mor-left');
    const right = morphs.find((row) => row.id === 'mor-right');
    const leftSpan = left?.surfaceParts?.[0];
    expect(leftSpan).toBeDefined();
    expect(mergedForm.slice(leftSpan!.startOffset, leftSpan!.endOffset)).toBe(leftForm);
    const rightSlice = (right?.surfaceParts ?? [])
      .map((span) => mergedForm.slice(span.startOffset, span.endOffset))
      .join('');
    expect(rightSlice).toBe(rightFragment);
    expect(rightSlice).toBe('ab');
  });

  it('keeps the original token when the right half fails to create', async () => {
    await db.unit_tokens.put({
      id: 'tok-split-fail',
      textId: 'text-split-fail',
      unitId: 'unit-split-fail',
      form: { default: 'one two' },
      tokenIndex: 0,
      createdAt: now,
      updatedAt: now,
    });
    const fail = () => {
      throw new Error('injected token failure');
    };
    db.unit_tokens.hook('creating', fail);
    try {
      await expect(splitAnnotationUnitToken('unit-split-fail', 'tok-split-fail')).rejects.toThrow(
        'injected token failure',
      );
    } finally {
      db.unit_tokens.hook('creating').unsubscribe(fail);
    }
    const requery = await LinguisticService.units.listTokensByUnitIds(['unit-split-fail']);
    expect(requery.map((token) => token.form.default)).toEqual(['one two']);
  });

  it('keeps the original tokens when a later index write fails', async () => {
    await db.unit_tokens.bulkPut([
      {
        id: 'tok-split-left',
        textId: 'text-split-index',
        unitId: 'unit-split-index',
        form: { default: 'one two' },
        tokenIndex: 0,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'tok-split-later',
        textId: 'text-split-index',
        unitId: 'unit-split-index',
        form: { default: 'three' },
        tokenIndex: 1,
        createdAt: now,
        updatedAt: now,
      },
    ]);
    const fail = (_mods: object, primKey: string) => {
      if (primKey === 'tok-split-later') throw new Error('injected index failure');
    };
    db.unit_tokens.hook('updating', fail);
    try {
      await expect(splitAnnotationUnitToken('unit-split-index', 'tok-split-left')).rejects.toThrow(
        'injected index failure',
      );
    } finally {
      db.unit_tokens.hook('updating').unsubscribe(fail);
    }
    const requery = [
      ...(await LinguisticService.units.listTokensByUnitIds(['unit-split-index'])),
    ].sort((a, b) => a.tokenIndex - b.tokenIndex);
    expect(requery.map((token) => token.form.default)).toEqual(['one two', 'three']);
    expect(requery.map((token) => token.tokenIndex)).toEqual([0, 1]);
  });

  it('moves right-half morphemes onto the new right token and shifts their spans', async () => {
    await db.unit_tokens.put({
      id: 'tok-split-morph',
      textId: 'text-split-morph',
      unitId: 'unit-split-morph',
      form: { default: 'hello world' },
      tokenIndex: 0,
      createdAt: now,
      updatedAt: now,
    });
    await db.unit_morphemes.bulkPut([
      {
        id: 'mor-left',
        textId: 'text-split-morph',
        unitId: 'unit-split-morph',
        tokenId: 'tok-split-morph',
        form: { default: 'hello' },
        surfaceParts: [{ startOffset: 0, endOffset: 5 }],
        morphemeIndex: 0,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'mor-right',
        textId: 'text-split-morph',
        unitId: 'unit-split-morph',
        tokenId: 'tok-split-morph',
        form: { default: 'world' },
        surfaceParts: [{ startOffset: 6, endOffset: 11 }],
        morphemeIndex: 1,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'mor-whole',
        textId: 'text-split-morph',
        unitId: 'unit-split-morph',
        tokenId: 'tok-split-morph',
        form: { default: 'hello world' },
        morphemeIndex: 2,
        createdAt: now,
        updatedAt: now,
      },
    ]);
    await db.token_lexeme_links.put({
      id: 'link-split',
      targetType: 'token',
      targetId: 'tok-split-morph',
      lexemeId: 'lex-hello',
      senseId: 'sense-hello',
      createdAt: now,
      updatedAt: now,
    });

    const readback = await splitAnnotationUnitToken('unit-split-morph', 'tok-split-morph');
    const right = readback.find((row) => row.id !== 'tok-split-morph');
    expect(right?.form.default).toBe('world');

    const leftMorphs = await LinguisticService.units.listMorphemesByTokenIds(['tok-split-morph']);
    expect(leftMorphs.map((row) => row.id)).toEqual(['mor-left', 'mor-whole']);
    expect(leftMorphs[0]?.surfaceParts).toEqual([{ startOffset: 0, endOffset: 5 }]);

    const rightMorphs = await LinguisticService.units.listMorphemesByTokenIds([right!.id]);
    expect(rightMorphs.map((row) => row.id)).toEqual(['mor-right']);
    expect(rightMorphs[0]?.morphemeIndex).toBe(0);
    expect(rightMorphs[0]?.surfaceParts).toEqual([{ startOffset: 0, endOffset: 5 }]);
    const span = rightMorphs[0]!.surfaceParts![0]!;
    expect((right!.form.default ?? '').slice(span.startOffset, span.endOffset)).toBe('world');

    const leftLinks = await LinguisticService.units.listTokenLexemeLinks(
      'token',
      'tok-split-morph',
    );
    expect(leftLinks.map((row) => row.id)).toEqual(['link-split']);
    expect(await LinguisticService.units.listTokenLexemeLinks('token', right!.id)).toEqual([]);
  });

  it('keeps both tokens when merge deletion fails', async () => {
    await db.unit_tokens.bulkPut([
      {
        id: 'tok-merge-left',
        textId: 'text-merge-fail',
        unitId: 'unit-merge-fail',
        form: { default: 'one' },
        tokenIndex: 0,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'tok-merge-right',
        textId: 'text-merge-fail',
        unitId: 'unit-merge-fail',
        form: { default: 'two' },
        tokenIndex: 1,
        createdAt: now,
        updatedAt: now,
      },
    ]);
    const fail = () => {
      throw new Error('injected merge failure');
    };
    db.unit_tokens.hook('deleting', fail);
    try {
      await expect(
        mergeAnnotationUnitTokenWithNext('unit-merge-fail', 'tok-merge-left'),
      ).rejects.toThrow('injected merge failure');
    } finally {
      db.unit_tokens.hook('deleting').unsubscribe(fail);
    }
    const requery = [...(await LinguisticService.units.listTokensByUnitIds(['unit-merge-fail']))]
      .sort((a, b) => a.tokenIndex - b.tokenIndex)
      .map((token) => token.form.default);
    expect(requery).toEqual(['one', 'two']);
  });
});
