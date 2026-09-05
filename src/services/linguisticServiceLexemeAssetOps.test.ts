import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  getDb,
  resetJieyuDatabaseSingletonForTests,
  type LexemeAssetDocType,
  type LexemeAssetLinkDocType,
  type LexemeDocType,
} from '../db';
import { LinguisticService } from './LinguisticService';
import { LEXEME_ASSET_MAX_BYTES } from './linguisticServiceLexemeAssetOps';

const now = '2026-09-05T12:00:00.000Z';

const lexeme: LexemeDocType = {
  id: 'lex-attach-1',
  lemma: { default: 'dog' },
  senses: [{ gloss: { eng: 'canine' } }],
  createdAt: now,
  updatedAt: now,
};

describe('linguisticServiceLexemeAssetOps', () => {
  beforeEach(async () => {
    await resetJieyuDatabaseSingletonForTests();
    const db = await getDb();
    await db.collections.lexemes.insert(lexeme);
  });

  it('attaches a file, lists it with blob readback, then unlinks and GCs', async () => {
    const blob = new Blob(['hello-img'], { type: 'image/png' });
    const attached = await LinguisticService.lexemes.attachFile('lex-attach-1', blob, {
      displayName: 'dog.png',
      languageCode: 'yue',
    });
    expect(attached.kind).toBe('image');
    expect(attached.languageCode).toBe('yue');
    expect(await attached.blob?.text()).toBe('hello-img');

    const listed = await LinguisticService.lexemes.listAttachments('lex-attach-1');
    expect(listed).toHaveLength(1);
    expect(listed[0]!.displayName).toBe('dog.png');
    expect(listed[0]!.blobOmitted).toBe(false);
    expect(await listed[0]!.blob?.text()).toBe('hello-img');

    await LinguisticService.lexemes.unlinkAttachment(listed[0]!.linkId);
    expect(await LinguisticService.lexemes.listAttachments('lex-attach-1')).toEqual([]);
    const db = await getDb();
    const leftover = await db.collections.lexeme_assets.find().exec();
    expect(leftover).toHaveLength(0);
  });

  it('keeps a shared blob until the last link is removed', async () => {
    const db = await getDb();
    const asset: LexemeAssetDocType = {
      id: 'la_shared',
      kind: 'document',
      mimeType: 'application/pdf',
      displayName: 'note.pdf',
      byteSize: 4,
      refCount: 2,
      blob: new Blob(['pdf!'], { type: 'application/pdf' }),
      createdAt: now,
      updatedAt: now,
    };
    const linkA: LexemeAssetLinkDocType = {
      id: 'll_a',
      lexemeId: 'lex-attach-1',
      assetId: 'la_shared',
      createdAt: now,
    };
    const linkB: LexemeAssetLinkDocType = {
      id: 'll_b',
      lexemeId: 'lex-attach-1',
      assetId: 'la_shared',
      createdAt: now,
    };
    await db.collections.lexeme_assets.insert(asset);
    await db.collections.lexeme_asset_links.insert(linkA);
    await db.collections.lexeme_asset_links.insert(linkB);

    await LinguisticService.lexemes.unlinkAttachment('ll_a');
    const afterFirst = await db.collections.lexeme_assets
      .findOne({ selector: { id: 'la_shared' } })
      .exec();
    expect(afterFirst?.toJSON().refCount).toBe(1);
    expect(await afterFirst?.toJSON().blob?.text()).toBe('pdf!');

    await LinguisticService.lexemes.unlinkAttachment('ll_b');
    const afterSecond = await db.collections.lexeme_assets
      .findOne({ selector: { id: 'la_shared' } })
      .exec();
    expect(afterSecond).toBeNull();
  });

  it('rejects unsupported, empty, oversized, and missing lexeme files', async () => {
    await expect(
      LinguisticService.lexemes.attachFile('lex-attach-1', new Blob(['x'], { type: 'video/mp4' })),
    ).rejects.toThrow('UNSUPPORTED_TYPE');
    await expect(
      LinguisticService.lexemes.attachFile('lex-attach-1', new Blob([], { type: 'image/png' })),
    ).rejects.toThrow('EMPTY');
    const oversized = new Blob([new Uint8Array(1)], { type: 'image/png' });
    Object.defineProperty(oversized, 'size', { value: LEXEME_ASSET_MAX_BYTES + 1 });
    await expect(LinguisticService.lexemes.attachFile('lex-attach-1', oversized)).rejects.toThrow(
      'TOO_LARGE',
    );
    await expect(
      LinguisticService.lexemes.attachFile('missing-lex', new Blob(['x'], { type: 'image/png' })),
    ).rejects.toThrow('NOT_FOUND');
    await expect(LinguisticService.lexemes.unlinkAttachment('missing-link')).rejects.toThrow(
      'NOT_FOUND',
    );
  });
});
