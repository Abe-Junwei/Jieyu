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
