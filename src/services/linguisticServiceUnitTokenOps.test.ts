import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../db';
import {
  batchUpdateTokenPosByForm,
  updateTokenForm,
  updateTokenGloss,
  updateTokenPos,
} from './linguisticServiceUnitTokenOps';

describe('linguisticServiceUnitTokenOps partial updates', () => {
  const now = '2026-10-02T00:00:00.000Z';

  beforeEach(async () => {
    await db.unit_tokens.clear();
  });

  it('updateTokenGloss keeps pos, form, other-language gloss, and reviewStatus', async () => {
    await db.unit_tokens.put({
      id: 'tok-gloss',
      textId: 'text-ops',
      unitId: 'unit-ops',
      form: { default: 'dog', ipa: 'dɔɡ' },
      gloss: { eng: 'dog', zho: '狗' },
      pos: 'N',
      provenance: {
        actorType: 'ai',
        method: 'auto-gloss',
        createdAt: now,
        reviewStatus: 'suggested',
      },
      tokenIndex: 0,
      createdAt: now,
      updatedAt: now,
    });

    await updateTokenGloss('tok-gloss', ' canine ', 'eng');

    const row = await db.unit_tokens.get('tok-gloss');
    expect(row?.gloss).toEqual({ eng: 'canine', zho: '狗' });
    expect(row?.pos).toBe('N');
    expect(row?.form).toEqual({ default: 'dog', ipa: 'dɔɡ' });
    expect(row?.provenance?.reviewStatus).toBe('suggested');

    await updateTokenGloss('tok-gloss', 'hound', 'eng', 'confirmed');

    const reviewed = await db.unit_tokens.get('tok-gloss');
    expect(reviewed?.gloss).toEqual({ eng: 'hound', zho: '狗' });
    expect(reviewed?.provenance?.actorType).toBe('ai');
    expect(reviewed?.provenance?.method).toBe('auto-gloss');
    expect(reviewed?.provenance?.reviewStatus).toBe('confirmed');

    await updateTokenGloss('tok-gloss', '', 'eng');

    const cleared = await db.unit_tokens.get('tok-gloss');
    expect(cleared?.gloss).toEqual({ zho: '狗' });
    expect(cleared?.pos).toBe('N');
  });

  it('updateTokenPos and updateTokenForm only touch their own fields', async () => {
    await db.unit_tokens.put({
      id: 'tok-fields',
      textId: 'text-ops',
      unitId: 'unit-ops',
      form: { default: 'dog', ipa: 'dɔɡ' },
      gloss: { eng: 'dog' },
      pos: 'N',
      tokenIndex: 0,
      createdAt: now,
      updatedAt: now,
    });

    await updateTokenPos('tok-fields', null);
    let row = await db.unit_tokens.get('tok-fields');
    expect(row?.pos).toBeUndefined();
    expect(row?.gloss).toEqual({ eng: 'dog' });
    expect(row?.form).toEqual({ default: 'dog', ipa: 'dɔɡ' });

    await updateTokenForm('tok-fields', 'hund', 'ipa');
    row = await db.unit_tokens.get('tok-fields');
    expect(row?.form).toEqual({ default: 'dog', ipa: 'hund' });
    expect(row?.gloss).toEqual({ eng: 'dog' });
  });

  it('batchUpdateTokenPosByForm rewrites only matching tokens and keeps their other fields', async () => {
    await db.unit_tokens.bulkPut([
      {
        id: 'tok-a',
        textId: 'text-ops',
        unitId: 'unit-ops',
        form: { default: 'sheep' },
        gloss: { eng: 'animal' },
        tokenIndex: 0,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'tok-b',
        textId: 'text-ops',
        unitId: 'unit-ops',
        form: { default: 'sheep', ipa: 'ʂiːp' },
        tokenIndex: 1,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'tok-c',
        textId: 'text-ops',
        unitId: 'unit-ops',
        form: { default: 'walk' },
        gloss: { eng: 'go' },
        pos: 'V',
        tokenIndex: 2,
        createdAt: now,
        updatedAt: now,
      },
    ]);

    const count = await batchUpdateTokenPosByForm('unit-ops', 'sheep', 'NOUN');
    expect(count).toBe(2);

    const a = await db.unit_tokens.get('tok-a');
    const b = await db.unit_tokens.get('tok-b');
    const c = await db.unit_tokens.get('tok-c');
    expect(a?.pos).toBe('NOUN');
    expect(a?.gloss).toEqual({ eng: 'animal' });
    expect(b?.pos).toBe('NOUN');
    expect(b?.form).toEqual({ default: 'sheep', ipa: 'ʂiːp' });
    expect(c?.pos).toBe('V');
    expect(c?.gloss).toEqual({ eng: 'go' });
  });
});
