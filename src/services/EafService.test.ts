// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import type {
  LayerDocType,
  LayerLinkDocType,
  LayerUnitDocType,
  OrthographyDocType,
  LayerUnitContentDocType,
  UnitMorphemeDocType,
  UnitTokenDocType,
} from '../db';
import { exportToEaf, importFromEaf, resolveEafMediaMimeType } from './EafService';

const NOW = '2026-03-26T00:00:00.000Z';

describe('EafService export', () => {
  it('exports one alignable annotation per segment for multi-segment independent boundary layers', () => {
    const units: LayerUnitDocType[] = [
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
        sortOrder: 1,
        createdAt: NOW,
        updatedAt: NOW,
      },
    ];

    const layerLinksTrlInd: LayerLinkDocType[] = [
      {
        id: 'link-trl-ind',
        layerId: 'layer_trl_ind',
        transcriptionLayerKey: 'trc_zh',
        hostTranscriptionLayerId: 'layer_trc',
        linkType: 'free',
        isPreferred: true,
        createdAt: NOW,
      },
    ];

    const translations: LayerUnitContentDocType[] = [
      {
        id: 'utr_trc_1',
        unitId: 'utt_1',
        layerId: 'layer_trc',
        modality: 'text',
        text: 'hello world',
        sourceType: 'human',
        createdAt: NOW,
        updatedAt: NOW,
      },
      {
        id: 'utr_seg_1',
        unitId: 'utt_1',
        layerId: 'layer_trl_ind',
        modality: 'text',
        text: 'hello',
        sourceType: 'human',
        createdAt: NOW,
        updatedAt: NOW,
      },
      {
        id: 'utr_seg_2',
        unitId: 'utt_1',
        layerId: 'layer_trl_ind',
        modality: 'text',
        text: 'world',
        sourceType: 'human',
        createdAt: NOW,
        updatedAt: NOW,
      },
    ];

    const layerSegments = new Map<string, LayerUnitDocType[]>([
      [
        'layer_trl_ind',
        [
          {
            id: 'seg_1',
            textId: 'text_1',
            mediaId: 'media_1',
            layerId: 'layer_trl_ind',
            unitId: 'utt_1',
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
            unitId: 'utt_1',
            startTime: 1.5,
            endTime: 2.0,
            createdAt: NOW,
            updatedAt: NOW,
          },
        ],
      ],
    ]);

    const xml = exportToEaf({
      units,
      layers,
      translations,
      layerSegments,
      layerLinks: layerLinksTrlInd,
    });

    const translationTierMatch = xml.match(/<TIER TIER_ID="翻译-独立边界"[\s\S]*?<\/TIER>/);
    expect(translationTierMatch).toBeTruthy();
    const translationTierXml = translationTierMatch?.[0] ?? '';

    // default transcription has 1 ALIGNABLE_ANNOTATION, translation tier should add 2 more.
    // 默认转写层有 1 条 ALIGNABLE_ANNOTATION，翻译层应再增加 2 条。
    const translationAlignableCount = (translationTierXml.match(/<ALIGNABLE_ANNOTATION /g) ?? [])
      .length;
    expect(translationAlignableCount).toBe(2);
    expect(translationTierXml).toContain('hello');
    expect(translationTierXml).toContain('world');
  });

  it('round-trips provider-neutral orthography metadata through EAF header properties', () => {
    const units: LayerUnitDocType[] = [
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

    const translations: LayerUnitContentDocType[] = [
      {
        id: 'utr_trc_1',
        unitId: 'utt_1',
        layerId: 'layer_trc',
        modality: 'text',
        text: 'marhaban',
        sourceType: 'human',
        createdAt: NOW,
        updatedAt: NOW,
      },
      {
        id: 'utr_trl_1',
        unitId: 'utt_1',
        layerId: 'layer_trl',
        modality: 'text',
        text: 'hello',
        sourceType: 'human',
        createdAt: NOW,
        updatedAt: NOW,
      },
    ];

    const xml = exportToEaf({
      units,
      layers,
      orthographies,
      translations,
      layerLinks: [
        {
          id: 'link-trl-ortho',
          layerId: 'layer_trl',
          transcriptionLayerKey: 'trc_ar',
          hostTranscriptionLayerId: 'layer_trc',
          linkType: 'free',
          isPreferred: true,
          createdAt: NOW,
        },
      ],
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
    const units: LayerUnitDocType[] = [
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
        sortOrder: 1,
        createdAt: NOW,
        updatedAt: NOW,
      },
    ];

    const translations: LayerUnitContentDocType[] = [
      {
        id: 'utr_trc_1',
        unitId: 'utt_1',
        layerId: 'layer_trc',
        modality: 'text',
        text: 'ni hao',
        sourceType: 'human',
        createdAt: NOW,
        updatedAt: NOW,
      },
      {
        id: 'utr_trl_1',
        unitId: 'utt_1',
        layerId: 'layer_trl',
        modality: 'text',
        text: 'hello',
        sourceType: 'human',
        createdAt: NOW,
        updatedAt: NOW,
      },
    ];

    const xml = exportToEaf({
      units,
      layers,
      translations,
      layerLinks: [
        {
          id: 'link-trl-notes',
          layerId: 'layer_trl',
          transcriptionLayerKey: 'trc_zh',
          hostTranscriptionLayerId: 'layer_trc',
          linkType: 'free',
          isPreferred: true,
          createdAt: NOW,
        },
      ],
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

describe('EafService logical timeline round-trip', () => {
  const layer: LayerDocType = {
    id: 'layer_trc',
    textId: 'text_1',
    key: 'trc_default',
    name: { eng: 'Transcription' },
    layerType: 'transcription',
    languageId: 'und',
    modality: 'text',
    acceptsAudio: false,
    isDefault: true,
    sortOrder: 0,
    createdAt: NOW,
    updatedAt: NOW,
  };

  it('export→import preserves non-uniform segment times without local media (sorted export order)', () => {
    const units: LayerUnitDocType[] = [
      {
        id: 'utt_mid',
        textId: 'text_1',
        mediaId: 'media_placeholder_only',
        startTime: 10.25,
        endTime: 12.5,
        transcription: { default: 'mid' },
        createdAt: NOW,
        updatedAt: NOW,
      },
      {
        id: 'utt_first',
        textId: 'text_1',
        mediaId: 'media_placeholder_only',
        startTime: 0,
        endTime: 0.333,
        transcription: { default: 'first' },
        createdAt: NOW,
        updatedAt: NOW,
      },
      {
        id: 'utt_gap',
        textId: 'text_1',
        mediaId: 'media_placeholder_only',
        startTime: 5,
        endTime: 6.125,
        transcription: { default: 'gap' },
        createdAt: NOW,
        updatedAt: NOW,
      },
    ];

    const translations: LayerUnitContentDocType[] = [
      {
        id: 't1',
        unitId: 'utt_mid',
        layerId: 'layer_trc',
        modality: 'text',
        text: 'mid',
        sourceType: 'human',
        createdAt: NOW,
        updatedAt: NOW,
      },
      {
        id: 't2',
        unitId: 'utt_first',
        layerId: 'layer_trc',
        modality: 'text',
        text: 'first',
        sourceType: 'human',
        createdAt: NOW,
        updatedAt: NOW,
      },
      {
        id: 't3',
        unitId: 'utt_gap',
        layerId: 'layer_trc',
        modality: 'text',
        text: 'gap',
        sourceType: 'human',
        createdAt: NOW,
        updatedAt: NOW,
      },
    ];

    const xml = exportToEaf({
      units,
      layers: [layer],
      translations,
      timelineMetadata: { timelineMode: 'document', logicalDurationSec: 20 },
    });

    expect(xml).not.toMatch(/MEDIA_DESCRIPTOR/);

    const imported = importFromEaf(xml);
    const got = [...imported.units].sort((a, b) => a.startTime - b.startTime);
    expect(got.map((u) => [u.startTime, u.endTime, u.transcription])).toEqual([
      [0, 0.333, 'first'],
      [5, 6.125, 'gap'],
      [10.25, 12.5, 'mid'],
    ]);
  });

  it('preserves Arabic annotation text through export and import round-trip', () => {
    const arabic = 'مرحبا بالعالم';
    const arabicLayer: LayerDocType = {
      id: 'layer_trc',
      textId: 'text_1',
      key: 'trc_ar',
      name: { zho: '阿拉伯语转写' },
      layerType: 'transcription',
      languageId: 'ara',
      modality: 'text',
      acceptsAudio: false,
      isDefault: true,
      sortOrder: 0,
      createdAt: NOW,
      updatedAt: NOW,
    };
    const units: LayerUnitDocType[] = [
      {
        id: 'utt_ar',
        textId: 'text_1',
        mediaId: 'media_1',
        startTime: 0,
        endTime: 2,
        transcription: { default: arabic },
        createdAt: NOW,
        updatedAt: NOW,
      },
    ];
    const translations: LayerUnitContentDocType[] = [
      {
        id: 'utr_ar',
        unitId: 'utt_ar',
        layerId: arabicLayer.id,
        modality: 'text',
        text: arabic,
        sourceType: 'human',
        createdAt: NOW,
        updatedAt: NOW,
      },
    ];

    const xml = exportToEaf({ units, layers: [arabicLayer], translations });
    const imported = importFromEaf(xml);
    expect(imported.units[0]?.transcription).toBe(arabic);
  });

  it('preserves sub-second EAF timecodes at millisecond precision', () => {
    const units: LayerUnitDocType[] = [
      {
        id: 'utt_precise',
        textId: 'text_1',
        mediaId: 'media_1',
        startTime: 0.125,
        endTime: 1.875,
        transcription: { default: 'precise' },
        createdAt: NOW,
        updatedAt: NOW,
      },
    ];
    const translations: LayerUnitContentDocType[] = [
      {
        id: 'utr_precise',
        unitId: 'utt_precise',
        layerId: layer.id,
        modality: 'text',
        text: 'precise',
        sourceType: 'human',
        createdAt: NOW,
        updatedAt: NOW,
      },
    ];

    const xml = exportToEaf({ units, layers: [layer], translations });
    expect(xml).toContain('TIME_VALUE="125"');
    expect(xml).toContain('TIME_VALUE="1875"');

    const imported = importFromEaf(xml);
    expect(imported.units[0]?.startTime).toBe(0.125);
    expect(imported.units[0]?.endTime).toBe(1.875);
  });

  it('binds PARTICIPANT to primary-tier units and recovers notes tier', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<ANNOTATION_DOCUMENT AUTHOR="test" DATE="2026-01-01T00:00:00.000Z" FORMAT="3.0" VERSION="3.0">
  <HEADER MEDIA_FILE="" TIME_UNITS="milliseconds">
    <MEDIA_DESCRIPTOR MEDIA_URL="clip.mp3" MIME_TYPE="audio/mpeg" RELATIVE_MEDIA_URL="./clip.mp3" />
  </HEADER>
  <TIME_ORDER>
    <TIME_SLOT TIME_SLOT_ID="ts1" TIME_VALUE="0" />
    <TIME_SLOT TIME_SLOT_ID="ts2" TIME_VALUE="1000" />
  </TIME_ORDER>
  <TIER TIER_ID="tx" LINGUISTIC_TYPE_REF="default-lt" PARTICIPANT="Alice">
    <ANNOTATION>
      <ALIGNABLE_ANNOTATION ANNOTATION_ID="a1" TIME_SLOT_REF1="ts1" TIME_SLOT_REF2="ts2">
        <ANNOTATION_VALUE>hello</ANNOTATION_VALUE>
      </ALIGNABLE_ANNOTATION>
    </ANNOTATION>
  </TIER>
  <TIER TIER_ID="notes" LINGUISTIC_TYPE_REF="default-lt" DEFAULT_LOCALE="en">
    <ANNOTATION>
      <ALIGNABLE_ANNOTATION ANNOTATION_ID="a2" TIME_SLOT_REF1="ts1" TIME_SLOT_REF2="ts2">
        <ANNOTATION_VALUE>a note</ANNOTATION_VALUE>
      </ALIGNABLE_ANNOTATION>
    </ANNOTATION>
  </TIER>
  <LINGUISTIC_TYPE LINGUISTIC_TYPE_ID="default-lt" TIME_ALIGNABLE="true" GRAPHIC_REFERENCES="false" />
</ANNOTATION_DOCUMENT>`;
    const imported = importFromEaf(xml);
    expect(imported.units[0]?.speakerId).toBe('Alice');
    expect(imported.participants).toContain('Alice');
    expect(imported.userNotes).toEqual([{ startTime: 0, endTime: 1, text: 'a note' }]);
    expect(imported.translationTiers.has('notes')).toBe(false);
  });

  it('resolves MEDIA_DESCRIPTOR MIME from filename / details', () => {
    expect(resolveEafMediaMimeType({ filename: 'a.mp3' })).toBe('audio/mpeg');
    expect(
      resolveEafMediaMimeType({ filename: 'a.wav', details: { mimeType: 'audio/custom' } }),
    ).toBe('audio/custom');
  });

  it('exports Symbolic_Subdivision word tiers and re-imports unit.tokens', () => {
    const layer: LayerDocType = {
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
    };
    const units: LayerUnitDocType[] = [
      {
        id: 'utt_1',
        textId: 'text_1',
        mediaId: 'media_1',
        startTime: 0,
        endTime: 2,
        transcription: { default: 'hello world' },
        createdAt: NOW,
        updatedAt: NOW,
      },
    ];
    const translations: LayerUnitContentDocType[] = [
      {
        id: 'utr_1',
        unitId: 'utt_1',
        layerId: layer.id,
        modality: 'text',
        text: 'hello world',
        sourceType: 'human',
        createdAt: NOW,
        updatedAt: NOW,
      },
    ];
    const tokens: UnitTokenDocType[] = [
      {
        id: 'tok_1',
        textId: 'text_1',
        unitId: 'utt_1',
        form: { default: 'hello' },
        gloss: { eng: 'greet' },
        tokenIndex: 0,
        createdAt: NOW,
        updatedAt: NOW,
      },
      {
        id: 'tok_2',
        textId: 'text_1',
        unitId: 'utt_1',
        form: { default: 'world' },
        tokenIndex: 1,
        createdAt: NOW,
        updatedAt: NOW,
      },
    ];
    const morphemes: UnitMorphemeDocType[] = [
      {
        id: 'morph_1',
        textId: 'text_1',
        unitId: 'utt_1',
        tokenId: 'tok_1',
        form: { default: 'hell' },
        gloss: { eng: 'root' },
        morphemeIndex: 0,
        createdAt: NOW,
        updatedAt: NOW,
      },
    ];

    const xml = exportToEaf({ units, layers: [layer], translations, tokens, morphemes });
    expect(xml).toContain('TIER_ID="words"');
    expect(xml).toContain('CONSTRAINTS="Symbolic_Subdivision"');
    expect(xml).toContain('TIER_ID="word-gloss"');
    expect(xml).toContain('TIER_ID="morphemes"');
    expect(xml).toContain('TIER_ID="morph-gloss"');
    expect(xml).toMatch(/PREVIOUS_ANNOTATION="w\d+"/);

    const imported = importFromEaf(xml);
    expect(imported.units[0]?.tokens).toEqual([
      {
        form: { default: 'hello' },
        gloss: { eng: 'greet' },
        morphemes: [{ form: { default: 'hell' }, gloss: { eng: 'root' } }],
      },
      { form: { default: 'world' } },
    ]);
  });

  it('maps Symbolic_Subdivision word tier into unit.tokens and keeps secondary media', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<ANNOTATION_DOCUMENT AUTHOR="test" DATE="2026-01-01T00:00:00.000Z" FORMAT="3.0" VERSION="3.0">
  <HEADER MEDIA_FILE="" TIME_UNITS="milliseconds">
    <MEDIA_DESCRIPTOR MEDIA_URL="primary.wav" MIME_TYPE="audio/x-wav" RELATIVE_MEDIA_URL="./primary.wav" />
    <MEDIA_DESCRIPTOR MEDIA_URL="video.mp4" MIME_TYPE="video/mp4" RELATIVE_MEDIA_URL="./video.mp4" />
  </HEADER>
  <TIME_ORDER>
    <TIME_SLOT TIME_SLOT_ID="ts1" TIME_VALUE="0" />
    <TIME_SLOT TIME_SLOT_ID="ts2" TIME_VALUE="2000" />
  </TIME_ORDER>
  <TIER TIER_ID="utterance" LINGUISTIC_TYPE_REF="utterance-lt">
    <ANNOTATION>
      <ALIGNABLE_ANNOTATION ANNOTATION_ID="a1" TIME_SLOT_REF1="ts1" TIME_SLOT_REF2="ts2">
        <ANNOTATION_VALUE>hello world</ANNOTATION_VALUE>
      </ALIGNABLE_ANNOTATION>
    </ANNOTATION>
  </TIER>
  <TIER TIER_ID="words" LINGUISTIC_TYPE_REF="words-lt" PARENT_REF="utterance">
    <ANNOTATION>
      <REF_ANNOTATION ANNOTATION_ID="w1" ANNOTATION_REF="a1">
        <ANNOTATION_VALUE>hello</ANNOTATION_VALUE>
      </REF_ANNOTATION>
    </ANNOTATION>
    <ANNOTATION>
      <REF_ANNOTATION ANNOTATION_ID="w2" ANNOTATION_REF="a1">
        <ANNOTATION_VALUE>world</ANNOTATION_VALUE>
      </REF_ANNOTATION>
    </ANNOTATION>
  </TIER>
  <TIER TIER_ID="gloss" LINGUISTIC_TYPE_REF="gloss-lt" PARENT_REF="words">
    <ANNOTATION>
      <REF_ANNOTATION ANNOTATION_ID="g1" ANNOTATION_REF="w1">
        <ANNOTATION_VALUE>greet</ANNOTATION_VALUE>
      </REF_ANNOTATION>
    </ANNOTATION>
  </TIER>
  <LINGUISTIC_TYPE LINGUISTIC_TYPE_ID="utterance-lt" TIME_ALIGNABLE="true" GRAPHIC_REFERENCES="false" />
  <LINGUISTIC_TYPE LINGUISTIC_TYPE_ID="words-lt" TIME_ALIGNABLE="false" CONSTRAINTS="Symbolic_Subdivision" GRAPHIC_REFERENCES="false" />
  <LINGUISTIC_TYPE LINGUISTIC_TYPE_ID="gloss-lt" TIME_ALIGNABLE="false" CONSTRAINTS="Symbolic_Association" GRAPHIC_REFERENCES="false" />
</ANNOTATION_DOCUMENT>`;
    const imported = importFromEaf(xml);
    expect(imported.mediaFilename).toBe('primary.wav');
    expect(imported.secondaryMedia).toEqual([
      { filename: 'video.mp4', mimeType: 'video/mp4', url: 'video.mp4' },
    ]);
    expect(imported.translationTiers.has('words')).toBe(false);
    expect(imported.translationTiers.has('gloss')).toBe(false);
    expect(imported.units[0]?.tokens).toEqual([
      { form: { default: 'hello' }, gloss: { eng: 'greet' } },
      { form: { default: 'world' } },
    ]);
  });
});
