import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LayerDocType } from '../../db';
import { db } from '../../db';
import { createSaveUnitText } from './useTranscriptionUnitActions.textWrites';

const now = '2026-09-30T00:00:00.000Z';

function layer(id: string): LayerDocType {
  return {
    id,
    textId: 'text-1',
    key: id,
    name: { und: id },
    layerType: 'transcription',
    languageId: id === 'layer-a' ? 'mvm' : 'cmn',
    modality: 'text',
    acceptsAudio: false,
    sortOrder: 0,
    createdAt: now,
    updatedAt: now,
  } as LayerDocType;
}

describe('createSaveUnitText language keys', () => {
  beforeEach(async () => {
    await Promise.all([
      db.layer_unit_contents.clear(),
      db.layer_units.clear(),
      db.unit_tokens.clear(),
      db.unit_morphemes.clear(),
      db.token_lexeme_links.clear(),
    ]);
    await db.layer_units.add({
      id: 'unit-1',
      textId: 'text-1',
      mediaId: 'media-1',
      unitType: 'unit',
      startTime: 0,
      endTime: 1,
      createdAt: now,
      updatedAt: now,
    });
    await db.layer_unit_contents.bulkAdd([
      {
        id: 'content-a',
        unitId: 'unit-1',
        layerId: 'layer-a',
        modality: 'text',
        text: 'old-a',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'content-b',
        unitId: 'unit-1',
        layerId: 'layer-b',
        modality: 'text',
        text: 'keep-b',
        createdAt: now,
        updatedAt: now,
      },
    ]);
    await db.unit_tokens.add({
      id: 'tok-1',
      textId: 'text-1',
      unitId: 'unit-1',
      form: { mvm: 'ta', cmn: '他' },
      tokenIndex: 0,
      createdAt: now,
      updatedAt: now,
    });
    await db.unit_morphemes.add({
      id: 'morph-1',
      textId: 'text-1',
      unitId: 'unit-1',
      tokenId: 'tok-1',
      form: { default: 'ta' },
      gloss: { eng: 'he', cmn: '他' },
      morphemeIndex: 0,
      createdAt: now,
      updatedAt: now,
    });
    await db.token_lexeme_links.add({
      id: 'link-1',
      targetType: 'token',
      targetId: 'tok-1',
      lexemeId: 'lex-1',
      senseId: 'sense-1',
      confidence: 0.8,
      createdAt: now,
      updatedAt: now,
    });
  });

  it('keeps the other transcription layer, morpheme glosses, and link fields', async () => {
    const save = createSaveUnitText({
      defaultTranscriptionLayerId: 'layer-a',
      layerById: new Map([
        ['layer-a', layer('layer-a')],
        ['layer-b', layer('layer-b')],
      ]),
      locale: 'zh-CN',
      pushUndo: () => undefined,
      resolveUnitById: async () => (await db.layer_units.get('unit-1')) ?? null,
      setSaveState: vi.fn(),
      setTranslations: vi.fn(),
      setUnitDrafts: vi.fn(),
    });

    await save('unit-1', 'new-a', 'layer-a');

    expect((await db.layer_unit_contents.get('content-b'))?.text).toBe('keep-b');
    expect((await db.unit_morphemes.get('morph-1'))?.gloss).toEqual({ eng: 'he', cmn: '他' });
    const link = await db.token_lexeme_links.get('link-1');
    expect(link?.senseId).toBe('sense-1');
    expect(link?.confidence).toBe(0.8);
    expect(link?.targetId).toBe('tok-1');
    expect((await db.unit_tokens.get('tok-1'))?.form).toEqual({ mvm: 'ta', cmn: '他' });
  });
});
