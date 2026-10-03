import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../db';
import { LinguisticService } from '../../services/LinguisticService';
import { deleteAnnotationToken, planAnnotationTokenDeletion } from './deleteAnnotationToken';
import { transcriptionMapWithSurface } from './writeAnnotationFormsToSurface';

const now = '2026-09-30T00:00:00.000Z';

describe('deleteAnnotationToken', () => {
  beforeEach(async () => {
    await Promise.all([
      db.unit_tokens.clear(),
      db.unit_morphemes.clear(),
      db.token_lexeme_links.clear(),
    ]);
  });

  it('moves the right word morphs and link onto the left word before deleting it', async () => {
    await db.unit_tokens.bulkPut([
      {
        id: 'left',
        textId: 'text-1',
        unitId: 'unit-1',
        form: { default: 'ta' },
        tokenIndex: 0,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'right',
        textId: 'text-1',
        unitId: 'unit-1',
        form: { default: 'na' },
        tokenIndex: 1,
        createdAt: now,
        updatedAt: now,
      },
    ]);
    await db.unit_morphemes.add({
      id: 'morph-right',
      textId: 'text-1',
      unitId: 'unit-1',
      tokenId: 'right',
      form: { default: 'na' },
      gloss: { eng: 'person', zho: '人' },
      morphemeIndex: 0,
      createdAt: now,
      updatedAt: now,
    });
    await db.token_lexeme_links.add({
      id: 'link-right',
      targetType: 'token',
      targetId: 'right',
      lexemeId: 'lex-1',
      senseId: 'sense-1',
      confidence: 0.8,
      createdAt: now,
      updatedAt: now,
    });

    const plan = await deleteAnnotationToken({ unitId: 'unit-1', tokenId: 'right' });
    expect(plan).toEqual({ kind: 'reattach', hostTokenId: 'left' });
    expect(await db.unit_tokens.get('right')).toBeUndefined();
    const morph = await db.unit_morphemes.get('morph-right');
    expect(morph?.tokenId).toBe('left');
    expect(morph?.gloss).toEqual({ eng: 'person', zho: '人' });
    const link = await db.token_lexeme_links.get('link-right');
    expect(link?.targetId).toBe('left');
    expect(link?.senseId).toBe('sense-1');
    expect(link?.confidence).toBe(0.8);
    const tokens = await LinguisticService.units.listTokensByUnitId('unit-1');
    expect(tokens.map((token) => token.id)).toEqual(['left']);
  });

  it('asks before deleting the only word that still has analysis', async () => {
    await db.unit_tokens.add({
      id: 'only',
      textId: 'text-1',
      unitId: 'unit-1',
      form: { default: 'ta' },
      tokenIndex: 0,
      createdAt: now,
      updatedAt: now,
    });
    await db.unit_morphemes.add({
      id: 'morph-only',
      textId: 'text-1',
      unitId: 'unit-1',
      tokenId: 'only',
      form: { default: 'ta' },
      morphemeIndex: 0,
      createdAt: now,
      updatedAt: now,
    });
    expect(
      planAnnotationTokenDeletion({
        tokenIdsInOrder: ['only'],
        tokenId: 'only',
        morphCount: 1,
        linkCount: 0,
      }),
    ).toEqual({ kind: 'confirm', morphCount: 1, linkCount: 0 });
    const held = await deleteAnnotationToken({ unitId: 'unit-1', tokenId: 'only' });
    expect(held.kind).toBe('confirm');
    expect(await db.unit_tokens.get('only')).toBeDefined();
    await deleteAnnotationToken({ unitId: 'unit-1', tokenId: 'only', confirmLoss: true });
    expect(await db.unit_tokens.get('only')).toBeUndefined();
    expect(await db.unit_morphemes.get('morph-only')).toBeUndefined();
  });

  it('rolls back morpheme and link cleanup when the token delete fails', async () => {
    await db.unit_tokens.add({
      id: 'only',
      textId: 'text-1',
      unitId: 'unit-1',
      form: { default: 'ta' },
      tokenIndex: 0,
      createdAt: now,
      updatedAt: now,
    });
    await db.unit_morphemes.add({
      id: 'morph-only',
      textId: 'text-1',
      unitId: 'unit-1',
      tokenId: 'only',
      form: { default: 'ta' },
      morphemeIndex: 0,
      createdAt: now,
      updatedAt: now,
    });
    await db.token_lexeme_links.add({
      id: 'link-only',
      targetType: 'token',
      targetId: 'only',
      lexemeId: 'lex-1',
      senseId: 'sense-1',
      createdAt: now,
      updatedAt: now,
    });
    const fail = () => {
      throw new Error('injected token delete failure');
    };
    db.unit_tokens.hook('deleting', fail);
    try {
      await expect(
        deleteAnnotationToken({ unitId: 'unit-1', tokenId: 'only', confirmLoss: true }),
      ).rejects.toThrow('injected token delete failure');
    } finally {
      db.unit_tokens.hook('deleting').unsubscribe(fail);
    }
    expect(await db.unit_tokens.get('only')).toBeDefined();
    expect(await db.unit_morphemes.get('morph-only')).toBeDefined();
    expect(await db.token_lexeme_links.get('link-only')).toBeDefined();
  });

  it('keeps the other transcription language when one language is edited', () => {
    expect(transcriptionMapWithSurface({ default: 'ŋa', eng: 'I' }, 'default', 'nga')).toEqual({
      default: 'nga',
      eng: 'I',
    });
  });
});
