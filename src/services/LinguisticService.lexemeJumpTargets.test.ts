import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../db';
import { entryDoc } from '../utils/dmlexEntry';
import { LinguisticService } from './LinguisticService';

describe('LinguisticService.lexemes.listTranscriptionJumpTargets', () => {
  const now = '2026-04-24T12:00:00.000Z';

  beforeEach(async () => {
    await Promise.all([
      db.token_lexeme_links.clear(),
      db.unit_tokens.clear(),
      db.unit_morphemes.clear(),
      db.layer_units.clear(),
      db.layer_unit_contents.clear(),
      db.lexemes.clear(),
      db.tier_definitions.clear(),
      db.texts.clear(),
      db.media_items.clear(),
    ]);
  });

  it('resolves a token link to textId, unit, layer, media and unitKind', async () => {
    await db.texts.put({
      id: 'text-jt-1',
      title: { default: 'JT' },
      createdAt: now,
      updatedAt: now,
    });
    await db.media_items.put({
      id: 'media-jt-1',
      textId: 'text-jt-1',
      filename: 'jt.wav',
      isOfflineCached: false,
      timelineKind: 'acoustic',
      byteLocation: 'none',
      availability: 'missing',
      createdAt: now,
    });
    await LinguisticService.layers.saveTranslation({
      id: 'layer-jt-tr',
      textId: 'text-jt-1',
      key: 'tr_jt',
      name: { default: 'TR' },
      layerType: 'transcription',
      languageId: 'und',
      modality: 'text',
      isDefault: true,
      sortOrder: 0,
      createdAt: now,
      updatedAt: now,
    });
    await db.layer_units.put({
      id: 'unit-jt-1',
      textId: 'text-jt-1',
      layerId: 'layer-jt-tr',
      mediaId: 'media-jt-1',
      startTime: 0,
      endTime: 2,
      createdAt: now,
      updatedAt: now,
    });
    await db.unit_tokens.put({
      id: 'tok-jt-1',
      textId: 'text-jt-1',
      unitId: 'unit-jt-1',
      form: { default: 'hello' },
      tokenIndex: 0,
      createdAt: now,
      updatedAt: now,
    });
    await db.lexemes.put(
      entryDoc({
        id: 'lex-jt-1',
        textId: 'text-jt-1',
        headword: 'hello',
        createdAt: now,
        updatedAt: now,
      }),
    );
    await db.token_lexeme_links.put({
      id: 'link-jt-1',
      targetType: 'token',
      targetId: 'tok-jt-1',
      lexemeId: 'lex-jt-1',
      createdAt: now,
      updatedAt: now,
    });

    const hits = await LinguisticService.lexemes.listTranscriptionJumpTargets('lex-jt-1');
    expect(hits).toHaveLength(1);
    expect(hits[0]).toEqual({
      textId: 'text-jt-1',
      unitId: 'unit-jt-1',
      layerId: 'layer-jt-tr',
      mediaId: 'media-jt-1',
      unitKind: 'unit',
      surfaceHint: 'hello',
      linkUpdatedAt: now,
    });
  });

  it('resolves morpheme targetType', async () => {
    await db.texts.put({
      id: 'text-jt-2',
      title: { default: 'JT2' },
      createdAt: now,
      updatedAt: now,
    });
    await LinguisticService.layers.saveTranslation({
      id: 'layer-jt-tr2',
      textId: 'text-jt-2',
      key: 'tr_jt2',
      name: { default: 'TR2' },
      layerType: 'transcription',
      languageId: 'und',
      modality: 'text',
      isDefault: true,
      sortOrder: 0,
      createdAt: now,
      updatedAt: now,
    });
    await db.layer_units.put({
      id: 'unit-jt-2',
      textId: 'text-jt-2',
      layerId: 'layer-jt-tr2',
      mediaId: 'media-x',
      startTime: 0,
      endTime: 1,
      unitType: 'segment',
      createdAt: now,
      updatedAt: now,
    });
    await db.unit_tokens.put({
      id: 'tok-jt-2',
      textId: 'text-jt-2',
      unitId: 'unit-jt-2',
      form: { default: 'x' },
      tokenIndex: 0,
      createdAt: now,
      updatedAt: now,
    });
    await db.unit_morphemes.put({
      id: 'mor-jt-2',
      textId: 'text-jt-2',
      unitId: 'unit-jt-2',
      tokenId: 'tok-jt-2',
      form: { default: 'ya' },
      morphemeIndex: 0,
      createdAt: now,
      updatedAt: now,
    });
    await db.lexemes.put(
      entryDoc({
        id: 'lex-jt-2',
        textId: 'text-jt-2',
        headword: 'ya',
        createdAt: now,
        updatedAt: now,
      }),
    );
    await db.token_lexeme_links.put({
      id: 'link-jt-2',
      targetType: 'morpheme',
      targetId: 'mor-jt-2',
      lexemeId: 'lex-jt-2',
      createdAt: now,
      updatedAt: now,
    });

    const hits = await LinguisticService.lexemes.listTranscriptionJumpTargets('lex-jt-2');
    expect(hits).toHaveLength(1);
    expect(hits[0]?.unitKind).toBe('segment');
    expect(hits[0]?.surfaceHint).toBe('ya');
  });

  it('uses the transcription-layer sentence as the baseline and keeps the word form separate', async () => {
    await db.texts.put({
      id: 'text-jt-3',
      title: { default: 'JT3' },
      createdAt: now,
      updatedAt: now,
    });
    await LinguisticService.layers.saveTranslation({
      id: 'layer-jt-tr3',
      textId: 'text-jt-3',
      key: 'tr_jt3',
      name: { default: 'TR3' },
      layerType: 'transcription',
      languageId: 'und',
      modality: 'text',
      isDefault: true,
      sortOrder: 0,
      createdAt: now,
      updatedAt: now,
    });
    await db.layer_units.put({
      id: 'unit-jt-3',
      textId: 'text-jt-3',
      layerId: 'layer-jt-tr3',
      mediaId: 'media-x',
      startTime: 0,
      endTime: 1,
      createdAt: now,
      updatedAt: now,
    });
    await db.layer_unit_contents.put({
      id: 'content-jt-3',
      textId: 'text-jt-3',
      unitId: 'unit-jt-3',
      layerId: 'layer-jt-tr3',
      modality: 'text',
      text: 'hello world',
      sourceType: 'human',
      createdAt: now,
      updatedAt: now,
    });
    await db.unit_tokens.put({
      id: 'tok-jt-3',
      textId: 'text-jt-3',
      unitId: 'unit-jt-3',
      form: { default: 'hello' },
      tokenIndex: 0,
      createdAt: now,
      updatedAt: now,
    });
    await db.lexemes.put(
      entryDoc({
        id: 'lex-jt-3',
        textId: 'text-jt-3',
        headword: 'hello',
        createdAt: now,
        updatedAt: now,
      }),
    );
    await db.token_lexeme_links.put({
      id: 'link-jt-3',
      targetType: 'token',
      targetId: 'tok-jt-3',
      lexemeId: 'lex-jt-3',
      createdAt: now,
      updatedAt: now,
    });

    const hits = await LinguisticService.lexemes.listTranscriptionJumpTargets('lex-jt-3');
    expect(hits[0]?.baselineText).toBe('hello world');
    expect(hits[0]?.surfaceHint).toBe('hello');
  });
});
