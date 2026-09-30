import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import type { LayerDocType } from '../db';
import { db } from '../db';
import { LayerTierUnifiedService } from './LayerTierUnifiedService';

const now = '2026-09-30T00:00:00.000Z';

function layer(languageId: string): LayerDocType {
  return {
    id: 'layer-1',
    textId: 'text-1',
    key: 'layer-1',
    name: { und: 'transcription' },
    layerType: 'transcription',
    languageId,
    modality: 'text',
    acceptsAudio: false,
    sortOrder: 0,
    createdAt: now,
    updatedAt: now,
  } as LayerDocType;
}

describe('updateLayer language id', () => {
  beforeEach(async () => {
    await Promise.all([
      db.tier_definitions.clear(),
      db.layer_links.clear(),
      db.unit_tokens.clear(),
      db.token_lexeme_links.clear(),
    ]);
    await db.unit_tokens.add({
      id: 'tok-1',
      textId: 'text-1',
      unitId: 'unit-1',
      form: { default: 'ta' },
      tokenIndex: 0,
      createdAt: now,
      updatedAt: now,
    });
    await db.token_lexeme_links.add({
      id: 'link-1',
      targetType: 'token',
      targetId: 'tok-1',
      lexemeId: 'lex-1',
      createdAt: now,
      updatedAt: now,
    });
  });

  it('keeps token and link ids when the layer language changes', async () => {
    await LayerTierUnifiedService.createLayer(layer('mvm'));
    await LayerTierUnifiedService.updateLayer(layer('cmn'));
    expect((await db.unit_tokens.get('tok-1'))?.id).toBe('tok-1');
    expect((await db.token_lexeme_links.get('link-1'))?.id).toBe('link-1');
    expect((await db.token_lexeme_links.get('link-1'))?.targetId).toBe('tok-1');
  });
});
