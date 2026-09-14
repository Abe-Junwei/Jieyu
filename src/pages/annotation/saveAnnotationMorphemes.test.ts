import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../db';
import { LinguisticService } from '../../services/LinguisticService';
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

  it('maps imported morphemes with empty default and populated eng', () => {
    const mapped = mapStoredMorphemes([
      {
        id: 'mor-import-1',
        textId: 'text-morph-1',
        unitId: 'unit-morph-1',
        tokenId: 'tok-morph-1',
        form: { default: '', eng: 'un' },
        gloss: { default: '', eng: 'one' },
        morphemeIndex: 0,
        createdAt: now,
        updatedAt: now,
      },
    ]);
    expect(mapped).toEqual([
      {
        id: 'mor-import-1',
        tokenId: 'tok-morph-1',
        form: 'un',
        gloss: 'one',
        glossLang: 'eng',
        morphemeIndex: 0,
      },
    ]);
  });
});
