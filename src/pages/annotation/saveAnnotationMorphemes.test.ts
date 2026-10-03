import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../db';
import { LinguisticService } from '../../services/LinguisticService';
import type { UnitMorphemeDocType } from '../../types/jieyuDbDocTypes';
import { planMorphemeFormsFromToken } from './annotationMorphemeDrafts';
import {
  buildSeedMorphemes,
  mapStoredMorphemes,
  saveAnnotationMorphemesForToken,
} from './saveAnnotationMorphemes';

describe('saveAnnotationMorphemesForToken', () => {
  const now = '2026-09-04T16:00:00.000Z';

  beforeEach(async () => {
    await Promise.all([db.unit_tokens.clear(), db.unit_morphemes.clear()]);
    await db.unit_tokens.put({
      id: 'tok-morph-1',
      textId: 'text-morph-1',
      unitId: 'unit-morph-1',
      form: { default: 'hello-world' },
      tokenIndex: 0,
      createdAt: now,
      updatedAt: now,
    });
  });

  it('rolls back deletion and partial insertion when a replacement insert fails', async () => {
    const old: UnitMorphemeDocType = {
      id: 'old-morph',
      textId: 'text-morph-1',
      unitId: 'unit-morph-1',
      tokenId: 'tok-morph-1',
      form: { default: 'old' },
      gloss: { default: 'OLD' },
      morphemeIndex: 0,
      createdAt: now,
      updatedAt: now,
    };
    await db.unit_morphemes.put(old);
    const fail = (_key: unknown, row: UnitMorphemeDocType) => {
      if (row.id === 'fail-morph') throw new Error('injected morph failure');
    };
    db.unit_morphemes.hook('creating', fail);
    try {
      await expect(
        LinguisticService.units.replaceMorphemesForToken('tok-morph-1', [
          { ...old, id: 'new-morph' },
          { ...old, id: 'fail-morph', morphemeIndex: 1 },
        ]),
      ).rejects.toThrow('injected morph failure');
    } finally {
      db.unit_morphemes.hook('creating').unsubscribe(fail);
    }
    expect(await LinguisticService.units.listMorphemesByTokenIds(['tok-morph-1'])).toEqual([old]);
  });

  it('writes morphemes then readback matches', async () => {
    const forms = planMorphemeFormsFromToken('hello-world');
    const seeded = buildSeedMorphemes({
      textId: 'text-morph-1',
      unitId: 'unit-morph-1',
      tokenId: 'tok-morph-1',
      forms,
    }).map((row, index) => ({
      ...row,
      gloss: index === 0 ? 'INTJ' : 'N',
    }));

    const readback = await saveAnnotationMorphemesForToken({
      textId: 'text-morph-1',
      unitId: 'unit-morph-1',
      tokenId: 'tok-morph-1',
      morphs: seeded,
    });

    expect(readback).toHaveLength(2);
    expect(readback.map((row) => row.form.default)).toEqual(['hello', 'world']);
    expect(readback.map((row) => row.gloss?.default)).toEqual(['INTJ', 'N']);

    const requery = await LinguisticService.units.listMorphemesByTokenIds(['tok-morph-1']);
    expect(requery.map((row) => row.id)).toEqual(seeded.map((row) => row.id));
  });

  it('keeps the token pos when a morpheme is saved with its own pos', async () => {
    await db.unit_tokens.put({
      id: 'tok-morph-1',
      textId: 'text-morph-1',
      unitId: 'unit-morph-1',
      form: { default: 'hello-world' },
      pos: 'VERB',
      tokenIndex: 0,
      createdAt: now,
      updatedAt: now,
    });
    await db.unit_morphemes.put({
      id: 'mor-pos',
      textId: 'text-morph-1',
      unitId: 'unit-morph-1',
      tokenId: 'tok-morph-1',
      form: { default: 'hello' },
      pos: 'N',
      morphemeIndex: 0,
      createdAt: now,
      updatedAt: now,
    });
    const saved = await saveAnnotationMorphemesForToken({
      textId: 'text-morph-1',
      unitId: 'unit-morph-1',
      tokenId: 'tok-morph-1',
      morphs: [
        {
          id: 'mor-pos',
          tokenId: 'tok-morph-1',
          form: 'hello',
          gloss: 'run',
          glossLang: 'default',
          morphemeIndex: 0,
        },
      ],
    });
    expect(saved[0]?.pos).toBe('N');
    const token = await db.unit_tokens.get('tok-morph-1');
    expect(token?.pos).toBe('VERB');
  });

  it('stores character spans and reads them back', async () => {
    const spans = [
      { startOffset: 0, endOffset: 2 },
      { startOffset: 3, endOffset: 5 },
    ];
    await saveAnnotationMorphemesForToken({
      textId: 'text-morph-1',
      unitId: 'unit-morph-1',
      tokenId: 'tok-morph-1',
      morphs: [
        {
          id: 'mor-span',
          tokenId: 'tok-morph-1',
          form: 'tango',
          gloss: '',
          glossLang: 'default',
          morphemeIndex: 0,
          surfaceParts: spans,
        },
      ],
    });
    const requery = await LinguisticService.units.listMorphemesByTokenIds(['tok-morph-1']);
    expect(requery[0]?.surfaceParts).toEqual(spans);
    expect(mapStoredMorphemes(requery)[0]?.surfaceParts).toEqual(spans);
  });

  it('keeps other languages and pos when one gloss is edited', async () => {
    await db.unit_morphemes.put({
      id: 'mor-keep',
      textId: 'text-morph-1',
      unitId: 'unit-morph-1',
      tokenId: 'tok-morph-1',
      form: { default: 'hello', eng: 'hi' },
      gloss: { default: 'INTJ', eng: 'hello' },
      pos: 'intj',
      morphemeIndex: 0,
      createdAt: now,
      updatedAt: now,
    });

    await saveAnnotationMorphemesForToken({
      textId: 'text-morph-1',
      unitId: 'unit-morph-1',
      tokenId: 'tok-morph-1',
      morphs: [
        {
          id: 'mor-keep',
          tokenId: 'tok-morph-1',
          form: 'hello',
          gloss: 'hello!',
          glossLang: 'eng',
          morphemeIndex: 0,
        },
      ],
    });

    const requery = await LinguisticService.units.listMorphemesByTokenIds(['tok-morph-1']);
    expect(requery).toHaveLength(1);
    expect(requery[0]?.form).toEqual({ default: 'hello', eng: 'hi' });
    expect(requery[0]?.gloss).toEqual({ default: 'INTJ', eng: 'hello!' });
    expect(requery[0]?.pos).toBe('intj');
  });
});

describe('mapStoredMorphemes', () => {
  const now = '2026-09-04T16:00:00.000Z';

  function row(patch: Pick<UnitMorphemeDocType, 'form' | 'gloss'>): UnitMorphemeDocType {
    return {
      id: 'mor-1',
      textId: 'text-1',
      unitId: 'unit-1',
      tokenId: 'tok-1',
      morphemeIndex: 0,
      createdAt: now,
      updatedAt: now,
      ...patch,
    };
  }

  it('uses the displayed gloss key when gloss has text', () => {
    expect(
      mapStoredMorphemes([
        row({ form: { default: 'dog' }, gloss: { default: '', eng: 'canine' } }),
      ]),
    ).toEqual([
      {
        id: 'mor-1',
        tokenId: 'tok-1',
        form: 'dog',
        gloss: 'canine',
        glossLang: 'eng',
        morphemeIndex: 0,
      },
    ]);
  });

  it('uses the displayed form key when gloss is blank', () => {
    expect(mapStoredMorphemes([row({ form: { eng: 'dog' }, gloss: { default: '' } })])).toEqual([
      {
        id: 'mor-1',
        tokenId: 'tok-1',
        form: 'dog',
        gloss: '',
        glossLang: 'eng',
        morphemeIndex: 0,
      },
    ]);
  });
});
