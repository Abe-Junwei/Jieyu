import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../db';
import { LinguisticService } from '../../services/LinguisticService';
import { saveAnnotationIgtRowTokens } from './saveAnnotationIgtRowTokens';

describe('saveAnnotationIgtRowTokens', () => {
  const now = '2026-09-04T12:00:00.000Z';

  beforeEach(async () => {
    await Promise.all([db.unit_tokens.clear(), db.unit_morphemes.clear()]);
  });

  it('writes POS and gloss then readback matches', async () => {
    await db.unit_tokens.put({
      id: 'tok-save-1',
      textId: 'text-save-1',
      unitId: 'unit-save-1',
      form: { default: 'hello' },
      gloss: { default: 'INTJ' },
      pos: 'X',
      tokenIndex: 0,
      createdAt: now,
      updatedAt: now,
    });

    const readback = await saveAnnotationIgtRowTokens('unit-save-1', [
      { tokenId: 'tok-save-1', glossLang: 'default', pos: 'N', gloss: 'greeting' },
    ]);

    expect(readback).toHaveLength(1);
    expect(readback[0]?.pos).toBe('N');
    expect(readback[0]?.gloss?.default).toBe('greeting');

    const requery = await LinguisticService.units.listTokensByUnitIds(['unit-save-1']);
    expect(requery[0]?.pos).toBe('N');
    expect(requery[0]?.gloss?.default).toBe('greeting');
  });

  it('rejects when readback does not contain the written token', async () => {
    await expect(
      saveAnnotationIgtRowTokens('unit-missing', [
        { tokenId: 'tok-missing', glossLang: 'default', pos: 'N' },
      ]),
    ).rejects.toThrow(/未找到 token|readback missing token/);
  });
});
