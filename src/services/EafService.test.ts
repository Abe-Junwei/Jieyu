import { describe, expect, it } from 'vitest';
import type { LayerDocType, LayerSegmentDocType, UtteranceDocType, UtteranceTextDocType } from '../db';
import { exportToEaf } from './EafService';

const NOW = '2026-03-26T00:00:00.000Z';

describe('EafService export', () => {
  it('exports one alignable annotation per segment for multi-segment independent boundary layers', () => {
    const utterances: UtteranceDocType[] = [
      {
        id: 'utt_1',
        textId: 'text_1',
        mediaId: 'media_1',
        startTime: 1.0,
        endTime: 2.0,
        transcription: { default: 'hello world' },
        createdAt: NOW,
        updatedAt: NOW,
      },
    ];

    const layers: LayerDocType[] = [
      {
        id: 'layer_trc',
        textId: 'text_1',
        key: 'trc_zh',
        name: { zho: '转写' },
        layerType: 'transcription',
        languageId: 'zho',
        modality: 'text',
        acceptsAudio: false,
        isDefault: true,
        sortOrder: 0,
        createdAt: NOW,
        updatedAt: NOW,
      },
      {
        id: 'layer_trl_ind',
        textId: 'text_1',
        key: 'trl_en_ind',
        name: { zho: '翻译-独立边界' },
        layerType: 'translation',
        languageId: 'eng',
        modality: 'text',
        acceptsAudio: false,
        constraint: 'independent_boundary',
        parentLayerId: 'layer_trc',
        sortOrder: 1,
        createdAt: NOW,
        updatedAt: NOW,
      },
    ];

    const translations: UtteranceTextDocType[] = [
      {
        id: 'utr_trc_1',
        utteranceId: 'utt_1',
        layerId: 'layer_trc',
        modality: 'text',
        text: 'hello world',
        sourceType: 'human',
        createdAt: NOW,
        updatedAt: NOW,
      },
      {
        id: 'utr_seg_1',
        utteranceId: 'utt_1',
        layerId: 'layer_trl_ind',
        modality: 'text',
        text: 'hello',
        sourceType: 'human',
        createdAt: NOW,
        updatedAt: NOW,
      },
      {
        id: 'utr_seg_2',
        utteranceId: 'utt_1',
        layerId: 'layer_trl_ind',
        modality: 'text',
        text: 'world',
        sourceType: 'human',
        createdAt: NOW,
        updatedAt: NOW,
      },
    ];

    const layerSegments = new Map<string, LayerSegmentDocType[]>([
      ['layer_trl_ind', [
        {
          id: 'seg_1',
          textId: 'text_1',
          mediaId: 'media_1',
          layerId: 'layer_trl_ind',
          utteranceId: 'utt_1',
          startTime: 1.0,
          endTime: 1.5,
          createdAt: NOW,
          updatedAt: NOW,
        },
        {
          id: 'seg_2',
          textId: 'text_1',
          mediaId: 'media_1',
          layerId: 'layer_trl_ind',
          utteranceId: 'utt_1',
          startTime: 1.5,
          endTime: 2.0,
          createdAt: NOW,
          updatedAt: NOW,
        },
      ]],
    ]);

    const xml = exportToEaf({
      utterances,
      layers,
      translations,
      layerSegments,
    });

    const translationTierMatch = xml.match(/<TIER TIER_ID="翻译-独立边界"[\s\S]*?<\/TIER>/);
    expect(translationTierMatch).toBeTruthy();
    const translationTierXml = translationTierMatch?.[0] ?? '';

    // default transcription has 1 ALIGNABLE_ANNOTATION, translation tier should add 2 more.
    // 默认转写层有 1 条 ALIGNABLE_ANNOTATION，翻译层应再增加 2 条。
    const translationAlignableCount = (translationTierXml.match(/<ALIGNABLE_ANNOTATION /g) ?? []).length;
    expect(translationAlignableCount).toBe(2);
    expect(translationTierXml).toContain('hello');
    expect(translationTierXml).toContain('world');
  });
});
