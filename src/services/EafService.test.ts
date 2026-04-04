// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import type { LayerDocType, LayerSegmentDocType, OrthographyDocType, UtteranceDocType, UtteranceTextDocType } from '../db';
import { exportToEaf, importFromEaf } from './EafService';

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

  it('round-trips provider-neutral orthography metadata through EAF header properties', () => {
    const utterances: UtteranceDocType[] = [
      {
        id: 'utt_1',
        textId: 'text_1',
        mediaId: 'media_1',
        startTime: 0,
        endTime: 1.2,
        transcription: { default: 'marhaban' },
        createdAt: NOW,
        updatedAt: NOW,
      },
    ];

    const layers: LayerDocType[] = [
      {
        id: 'layer_trc',
        textId: 'text_1',
        key: 'trc_ar',
        name: { zho: '转写' },
        layerType: 'transcription',
        languageId: 'ara',
        orthographyId: 'ortho-ar',
        modality: 'text',
        acceptsAudio: false,
        isDefault: true,
        sortOrder: 0,
        createdAt: NOW,
        updatedAt: NOW,
      },
      {
        id: 'layer_trl',
        textId: 'text_1',
        key: 'trl_en',
        name: { zho: '翻译' },
        layerType: 'translation',
        languageId: 'eng',
        orthographyId: 'ortho-en',
        modality: 'text',
        acceptsAudio: false,
        parentLayerId: 'layer_trc',
        sortOrder: 1,
        createdAt: NOW,
        updatedAt: NOW,
      },
    ];

    const orthographies: OrthographyDocType[] = [
      {
        id: 'ortho-ar',
        languageId: 'ara',
        name: { zho: '阿拉伯文' },
        scriptTag: 'Arab',
        regionTag: 'EG',
        variantTag: 'fonipa',
        createdAt: NOW,
      } as OrthographyDocType,
      {
        id: 'ortho-en',
        languageId: 'eng',
        name: { zho: '英文' },
        scriptTag: 'Latn',
        createdAt: NOW,
      } as OrthographyDocType,
    ];

    const translations: UtteranceTextDocType[] = [
      {
        id: 'utr_trc_1',
        utteranceId: 'utt_1',
        layerId: 'layer_trc',
        modality: 'text',
        text: 'marhaban',
        sourceType: 'human',
        createdAt: NOW,
        updatedAt: NOW,
      },
      {
        id: 'utr_trl_1',
        utteranceId: 'utt_1',
        layerId: 'layer_trl',
        modality: 'text',
        text: 'hello',
        sourceType: 'human',
        createdAt: NOW,
        updatedAt: NOW,
      },
    ];

    const xml = exportToEaf({
      utterances,
      layers,
      orthographies,
      translations,
    });

    expect(xml).toContain('jieyu:layer-meta:default');
    expect(xml).toContain('jieyu:layer-meta:翻译');

    const result = importFromEaf(xml);
    expect(result.tierMetadata.get('default')).toEqual({
      languageId: 'ara',
      orthographyId: 'ortho-ar',
      scriptTag: 'Arab',
      regionTag: 'EG',
      variantTag: 'fonipa',
    });
    expect(result.tierMetadata.get('翻译')).toEqual({
      languageId: 'eng',
      orthographyId: 'ortho-en',
      scriptTag: 'Latn',
    });
  });

  it('prefers English fallback labels for exported tier ids', () => {
    const utterances: UtteranceDocType[] = [
      {
        id: 'utt_1',
        textId: 'text_1',
        mediaId: 'media_1',
        startTime: 0,
        endTime: 1,
        transcription: { default: 'ni hao' },
        createdAt: NOW,
        updatedAt: NOW,
      },
    ];

    const layers: LayerDocType[] = [
      {
        id: 'layer_trc',
        textId: 'text_1',
        key: 'trc_zh',
        name: { zho: '默认转写', eng: 'Default Transcription' },
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
        id: 'layer_trl',
        textId: 'text_1',
        key: 'trl_notes',
        name: { zho: '中文层名', eng: 'English Tier Name' },
        layerType: 'translation',
        languageId: 'eng',
        modality: 'text',
        acceptsAudio: false,
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
        text: 'ni hao',
        sourceType: 'human',
        createdAt: NOW,
        updatedAt: NOW,
      },
      {
        id: 'utr_trl_1',
        utteranceId: 'utt_1',
        layerId: 'layer_trl',
        modality: 'text',
        text: 'hello',
        sourceType: 'human',
        createdAt: NOW,
        updatedAt: NOW,
      },
    ];

    const xml = exportToEaf({
      utterances,
      layers,
      translations,
    });

    expect(xml).toContain('TIER_ID="English Tier Name"');
    expect(xml).not.toContain('TIER_ID="中文层名"');
    expect(xml).toContain('jieyu:layer-meta:English Tier Name');
    expect(xml).not.toContain('jieyu:layer-meta:中文层名');
  });

  it('ignores unknown EAF tier metadata fields while preserving bridgeId on import', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<ANNOTATION_DOCUMENT AUTHOR="Jieyu" DATE="${NOW}" FORMAT="3.0" VERSION="3.0">
    <HEADER MEDIA_FILE="" TIME_UNITS="milliseconds">
        <PROPERTY NAME="jieyu:layer-meta:default">{"languageId":"ara","orthographyId":"ortho-ar","scriptTag":"Arab","bridgeId":"xf-ar-latn","provider":"custom","unknownField":"drop-me"}</PROPERTY>
    </HEADER>
    <TIME_ORDER>
        <TIME_SLOT TIME_SLOT_ID="ts1" TIME_VALUE="0" />
        <TIME_SLOT TIME_SLOT_ID="ts2" TIME_VALUE="1000" />
    </TIME_ORDER>
    <TIER TIER_ID="default" LINGUISTIC_TYPE_REF="default-lt" DEFAULT_LOCALE="ara">
        <ANNOTATION>
            <ALIGNABLE_ANNOTATION ANNOTATION_ID="a1" TIME_SLOT_REF1="ts1" TIME_SLOT_REF2="ts2">
                <ANNOTATION_VALUE>marhaban</ANNOTATION_VALUE>
            </ALIGNABLE_ANNOTATION>
        </ANNOTATION>
    </TIER>
    <LINGUISTIC_TYPE LINGUISTIC_TYPE_ID="default-lt" TIME_ALIGNABLE="true" GRAPHIC_REFERENCES="false" />
</ANNOTATION_DOCUMENT>`;

    const result = importFromEaf(xml);
    expect(result.tierMetadata.get('default')).toEqual({
      languageId: 'ara',
      orthographyId: 'ortho-ar',
      scriptTag: 'Arab',
      bridgeId: 'xf-ar-latn',
    });
  });
});
