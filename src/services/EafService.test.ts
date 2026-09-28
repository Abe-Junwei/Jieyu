// @vitest-environment jsdom
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
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
      role: 'transcription',
    });
    expect(result.tierMetadata.get('翻译')).toEqual({
      languageId: 'eng',
      orthographyId: 'ortho-en',
      scriptTag: 'Latn',
      role: 'translation',
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

  it('skips standard ELAN header properties and only parses jieyu metadata JSON', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<ANNOTATION_DOCUMENT AUTHOR="Jieyu" DATE="${NOW}" FORMAT="3.0" VERSION="3.0">
    <HEADER MEDIA_FILE="" TIME_UNITS="milliseconds">
        <PROPERTY NAME="URN">urn:nl-mpi-tools-elan-eaf:demo</PROPERTY>
        <PROPERTY NAME="lastUsedAnnotationId">42</PROPERTY>
        <MEDIA_DESCRIPTOR MEDIA_URL="file:///demo.wav" MIME_TYPE="audio/x-wav" />
        <PROPERTY NAME="jieyu:layer-meta:default">{"languageId":"ara","orthographyId":"ortho-ar","scriptTag":"Arab","bridgeId":"xf-ar-latn"}</PROPERTY>
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
    expect(result.units).toHaveLength(1);
    expect(result.tierMetadata.get('default')).toEqual({
      languageId: 'ara',
      orthographyId: 'ortho-ar',
      scriptTag: 'Arab',
      bridgeId: 'xf-ar-latn',
    });
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

  it('reads tier LANG_REF and does not treat ELAN font properties as languages', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<ANNOTATION_DOCUMENT AUTHOR="field" DATE="${NOW}" FORMAT="3.0" VERSION="3.0">
    <HEADER MEDIA_FILE="" TIME_UNITS="milliseconds">
        <MEDIA_DESCRIPTOR MEDIA_URL="file:///demo.wav" MIME_TYPE="audio/x-wav" />
        <PROPERTY NAME="languages">mvm-fonipa-x-emic en zh-CN</PROPERTY>
        <PROPERTY NAME="mvm-fonipa-x-emic">Charis SIL-true</PROPERTY>
        <PROPERTY NAME="en">Charis SIL</PROPERTY>
        <PROPERTY NAME="zh-CN">Source Han Serif CN-true</PROPERTY>
    </HEADER>
    <TIME_ORDER>
        <TIME_SLOT TIME_SLOT_ID="ts1" TIME_VALUE="0" />
        <TIME_SLOT TIME_SLOT_ID="ts2" TIME_VALUE="1000" />
    </TIME_ORDER>
    <TIER LANG_REF="mvm-fonipa-x-emic" LINGUISTIC_TYPE_REF="phrase-txt" TIER_ID="Transcription">
        <ANNOTATION>
            <ALIGNABLE_ANNOTATION ANNOTATION_ID="a1" TIME_SLOT_REF1="ts1" TIME_SLOT_REF2="ts2">
                <ANNOTATION_VALUE>tsəkə́</ANNOTATION_VALUE>
            </ALIGNABLE_ANNOTATION>
        </ANNOTATION>
    </TIER>
    <TIER LANG_REF="en" LINGUISTIC_TYPE_REF="phrase-gls" PARENT_REF="Transcription" TIER_ID="Phrase Free Translation">
        <ANNOTATION>
            <REF_ANNOTATION ANNOTATION_ID="g1" ANNOTATION_REF="a1">
                <ANNOTATION_VALUE>then</ANNOTATION_VALUE>
            </REF_ANNOTATION>
        </ANNOTATION>
    </TIER>
    <LINGUISTIC_TYPE GRAPHIC_REFERENCES="false" LINGUISTIC_TYPE_ID="phrase-txt" TIME_ALIGNABLE="true" />
    <LINGUISTIC_TYPE CONSTRAINTS="Symbolic_Association" GRAPHIC_REFERENCES="false" LINGUISTIC_TYPE_ID="phrase-gls" TIME_ALIGNABLE="false" />
    <LANGUAGE LANG_DEF="mvm-fonipa-x-emic" LANG_ID="mvm-fonipa-x-emic" LANG_LABEL="mvm-fonipa-x-emic" />
    <LANGUAGE LANG_DEF="en" LANG_ID="en" LANG_LABEL="en" />
</ANNOTATION_DOCUMENT>`;

    const result = importFromEaf(xml);
    expect(result.defaultLocale).toBe('mvm-fonipa-x-emic');
    expect(result.tierLocales.get('Phrase Free Translation')).toBe('en');
    expect(result.languageLabels.get('en')).toBe('en');
    expect(result.tierMetadata.size).toBe(0);
    expect([...result.translationTiers.keys()]).toEqual(['Phrase Free Translation']);
    expect([...result.translationTiers.keys()]).not.toContain('zh-CN');
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
        gloss: { en: 'greet' },
        morphemes: [{ form: { default: 'hell' }, gloss: { en: 'root' } }],
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
      { form: { default: 'hello' }, gloss: { und: 'greet' } },
      { form: { default: 'world' } },
    ]);
  });
});

describe('EAF interchange alignment', () => {
  const base = (body: string, timeUnits?: string) => `<?xml version="1.0" encoding="UTF-8"?>
<ANNOTATION_DOCUMENT AUTHOR="test" DATE="2026-01-01T00:00:00.000Z" FORMAT="3.0" VERSION="3.0">
  <HEADER MEDIA_FILE=""${timeUnits ? ` TIME_UNITS="${timeUnits}"` : ''}>
    <MEDIA_DESCRIPTOR MEDIA_URL="speech.wav" MIME_TYPE="audio/x-wav" RELATIVE_MEDIA_URL="./speech.wav" />
  </HEADER>
  <TIME_ORDER>
    <TIME_SLOT TIME_SLOT_ID="ts1" TIME_VALUE="0" />
    <TIME_SLOT TIME_SLOT_ID="ts2" TIME_VALUE="25" />
    <TIME_SLOT TIME_SLOT_ID="ts3" TIME_VALUE="10000" />
    <TIME_SLOT TIME_SLOT_ID="ts4" TIME_VALUE="11000" />
  </TIME_ORDER>
  ${body}
</ANNOTATION_DOCUMENT>`;

  it('converts PAL frames and flags an unrecognized time unit', () => {
    const pal = importFromEaf(
      base(
        `<TIER TIER_ID="utt" LINGUISTIC_TYPE_REF="default-lt">
          <ANNOTATION>
            <ALIGNABLE_ANNOTATION ANNOTATION_ID="a1" TIME_SLOT_REF1="ts1" TIME_SLOT_REF2="ts2">
              <ANNOTATION_VALUE>one second</ANNOTATION_VALUE>
            </ALIGNABLE_ANNOTATION>
          </ANNOTATION>
        </TIER>
        <LINGUISTIC_TYPE LINGUISTIC_TYPE_ID="default-lt" TIME_ALIGNABLE="true" GRAPHIC_REFERENCES="false" />`,
        'PAL-frames',
      ),
    );
    expect(pal.units[0]).toMatchObject({ startTime: 0, endTime: 1 });
    expect(pal.unrecognizedTimeUnit).toBeUndefined();

    const unknown = importFromEaf(
      base(
        `<TIER TIER_ID="utt" LINGUISTIC_TYPE_REF="default-lt">
          <ANNOTATION>
            <ALIGNABLE_ANNOTATION ANNOTATION_ID="a1" TIME_SLOT_REF1="ts1" TIME_SLOT_REF2="ts3">
              <ANNOTATION_VALUE>ten</ANNOTATION_VALUE>
            </ALIGNABLE_ANNOTATION>
          </ANNOTATION>
        </TIER>
        <LINGUISTIC_TYPE LINGUISTIC_TYPE_ID="default-lt" TIME_ALIGNABLE="true" GRAPHIC_REFERENCES="false" />`,
        'furlongs',
      ),
    );
    expect(unknown.unrecognizedTimeUnit).toBe(true);
    expect(unknown.losses).toEqual([{ code: 'unrecognized-time-unit' }]);
    expect(unknown.units[0]).toMatchObject({ startTime: 0, endTime: 10 });
  });

  it('keeps a gloss language from LANG_REF and leaves a second independent tier as translation', () => {
    const imported = importFromEaf(
      base(`
        <TIER TIER_ID="utt" LINGUISTIC_TYPE_REF="default-lt">
          <ANNOTATION>
            <ALIGNABLE_ANNOTATION ANNOTATION_ID="a1" TIME_SLOT_REF1="ts1" TIME_SLOT_REF2="ts2">
              <ANNOTATION_VALUE>hello</ANNOTATION_VALUE>
            </ALIGNABLE_ANNOTATION>
          </ANNOTATION>
        </TIER>
        <TIER TIER_ID="free" LINGUISTIC_TYPE_REF="default-lt">
          <ANNOTATION>
            <ALIGNABLE_ANNOTATION ANNOTATION_ID="a2" TIME_SLOT_REF1="ts1" TIME_SLOT_REF2="ts2">
              <ANNOTATION_VALUE>hi</ANNOTATION_VALUE>
            </ALIGNABLE_ANNOTATION>
          </ANNOTATION>
        </TIER>
        <TIER TIER_ID="words" LINGUISTIC_TYPE_REF="word-lt" PARENT_REF="utt">
          <ANNOTATION>
            <REF_ANNOTATION ANNOTATION_ID="w1" ANNOTATION_REF="a1">
              <ANNOTATION_VALUE>hello</ANNOTATION_VALUE>
            </REF_ANNOTATION>
          </ANNOTATION>
        </TIER>
        <TIER TIER_ID="gloss" LINGUISTIC_TYPE_REF="gloss-lt" PARENT_REF="words" LANG_REF="cmn">
          <ANNOTATION>
            <REF_ANNOTATION ANNOTATION_ID="g1" ANNOTATION_REF="w1">
              <ANNOTATION_VALUE>greet</ANNOTATION_VALUE>
            </REF_ANNOTATION>
          </ANNOTATION>
        </TIER>
        <LINGUISTIC_TYPE LINGUISTIC_TYPE_ID="default-lt" TIME_ALIGNABLE="true" GRAPHIC_REFERENCES="false" />
        <LINGUISTIC_TYPE LINGUISTIC_TYPE_ID="word-lt" TIME_ALIGNABLE="false" CONSTRAINTS="Symbolic_Subdivision" GRAPHIC_REFERENCES="false" />
        <LINGUISTIC_TYPE LINGUISTIC_TYPE_ID="gloss-lt" TIME_ALIGNABLE="false" CONSTRAINTS="Symbolic_Association" GRAPHIC_REFERENCES="false" />
      `),
    );
    expect(imported.units).toHaveLength(1);
    expect(imported.translationTiers.get('free')).toHaveLength(1);
    expect(imported.extraTranscriptionTiers).toBeUndefined();
    expect(imported.units[0]?.tokens?.[0]?.gloss).toEqual({ cmn: 'greet' });
  });

  it('honors transcription, exclude, and controlled-vocabulary roles', () => {
    const xml = base(`
      <TIER TIER_ID="utt" LINGUISTIC_TYPE_REF="default-lt">
        <ANNOTATION>
          <ALIGNABLE_ANNOTATION ANNOTATION_ID="a1" TIME_SLOT_REF1="ts1" TIME_SLOT_REF2="ts2">
            <ANNOTATION_VALUE>hello</ANNOTATION_VALUE>
          </ALIGNABLE_ANNOTATION>
        </ANNOTATION>
      </TIER>
      <TIER TIER_ID="free" LINGUISTIC_TYPE_REF="default-lt">
        <ANNOTATION>
          <ALIGNABLE_ANNOTATION ANNOTATION_ID="a2" TIME_SLOT_REF1="ts1" TIME_SLOT_REF2="ts2">
            <ANNOTATION_VALUE>also speech</ANNOTATION_VALUE>
          </ALIGNABLE_ANNOTATION>
        </ANNOTATION>
      </TIER>
      <TIER TIER_ID="cv" LINGUISTIC_TYPE_REF="cv-lt" PARENT_REF="utt">
        <ANNOTATION>
          <REF_ANNOTATION ANNOTATION_ID="c1" ANNOTATION_REF="a1">
            <ANNOTATION_VALUE>noun</ANNOTATION_VALUE>
          </REF_ANNOTATION>
        </ANNOTATION>
      </TIER>
      <TIER TIER_ID="late" LINGUISTIC_TYPE_REF="default-lt">
        <ANNOTATION>
          <ALIGNABLE_ANNOTATION ANNOTATION_ID="a3" TIME_SLOT_REF1="ts3" TIME_SLOT_REF2="ts4" ANNOTATION_REF="a1">
            <ANNOTATION_VALUE>still this utterance</ANNOTATION_VALUE>
          </ALIGNABLE_ANNOTATION>
        </ANNOTATION>
      </TIER>
      <LINGUISTIC_TYPE LINGUISTIC_TYPE_ID="default-lt" TIME_ALIGNABLE="true" GRAPHIC_REFERENCES="false" />
      <LINGUISTIC_TYPE LINGUISTIC_TYPE_ID="cv-lt" TIME_ALIGNABLE="false" CONSTRAINTS="Symbolic_Association" CONTROLLED_VOCABULARY_REF="pos" GRAPHIC_REFERENCES="false" />
    `);
    const both = importFromEaf(xml, {
      tierRoles: { utt: 'transcription', free: 'transcription', late: 'translation' },
    });
    expect(both.units).toHaveLength(1);
    expect(both.extraTranscriptionTiers).toHaveLength(1);
    expect(both.extraTranscriptionTiers?.[0]?.tierName).toBe('free');
    expect(both.translationTiers.has('cv')).toBe(false);
    expect(both.sideChannelNotes).toEqual([
      expect.objectContaining({
        kind: 'controlled-vocabulary',
        text: 'noun',
        parentAnnotationId: 'a1',
      }),
    ]);
    expect(both.translationTiers.get('late')?.[0]).toMatchObject({
      annotationRef: 'a1',
      startTime: 10,
      endTime: 11,
      text: 'still this utterance',
    });

    const excluded = importFromEaf(xml, {
      tierRoles: { utt: 'transcription', free: 'exclude', late: 'exclude' },
    });
    expect(excluded.units).toHaveLength(1);
    expect(excluded.extraTranscriptionTiers).toBeUndefined();
    expect(excluded.translationTiers.has('free')).toBe(false);
    expect(excluded.translationTiers.has('late')).toBe(false);
  });
});

function eafFixture(body: string, types: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<ANNOTATION_DOCUMENT AUTHOR="test" DATE="2026-01-01T00:00:00.000Z" FORMAT="3.0" VERSION="3.0">
  <HEADER MEDIA_FILE="" TIME_UNITS="milliseconds">
    <MEDIA_DESCRIPTOR MEDIA_URL="speech.wav" MIME_TYPE="audio/x-wav" RELATIVE_MEDIA_URL="./speech.wav" />
  </HEADER>
  <TIME_ORDER>
    <TIME_SLOT TIME_SLOT_ID="ts1" TIME_VALUE="0" />
    <TIME_SLOT TIME_SLOT_ID="ts2" TIME_VALUE="1000" />
    <TIME_SLOT TIME_SLOT_ID="ts3" TIME_VALUE="1000" />
    <TIME_SLOT TIME_SLOT_ID="ts4" TIME_VALUE="2000" />
  </TIME_ORDER>
  ${body}
  ${types}
</ANNOTATION_DOCUMENT>`;
}

const ALIGNABLE = `<LINGUISTIC_TYPE LINGUISTIC_TYPE_ID="align-lt" TIME_ALIGNABLE="true" GRAPHIC_REFERENCES="false" />`;
const ASSOC = `<LINGUISTIC_TYPE LINGUISTIC_TYPE_ID="assoc-lt" TIME_ALIGNABLE="false" CONSTRAINTS="Symbolic_Association" GRAPHIC_REFERENCES="false" />`;
const NOT_ALIGNABLE_ROOT = `<LINGUISTIC_TYPE LINGUISTIC_TYPE_ID="root-lt" TIME_ALIGNABLE="false" GRAPHIC_REFERENCES="false" />`;
const SUBDIVISION = `<LINGUISTIC_TYPE LINGUISTIC_TYPE_ID="sub-lt" TIME_ALIGNABLE="false" CONSTRAINTS="Symbolic_Subdivision" GRAPHIC_REFERENCES="false" />`;
const INCLUDED = `<LINGUISTIC_TYPE LINGUISTIC_TYPE_ID="incl-lt" TIME_ALIGNABLE="true" CONSTRAINTS="Included_In" GRAPHIC_REFERENCES="false" />`;

describe('EAF default tier pick', () => {
  it('reads the sentence from tx, the translation from ft, and the ids as parent notes', () => {
    const imported = importFromEaf(
      eafFixture(
        `<TIER TIER_ID="ref" LINGUISTIC_TYPE_REF="align-lt">
          <ANNOTATION><ALIGNABLE_ANNOTATION ANNOTATION_ID="a1" TIME_SLOT_REF1="ts1" TIME_SLOT_REF2="ts2"><ANNOTATION_VALUE>0001_doreco_x</ANNOTATION_VALUE></ALIGNABLE_ANNOTATION></ANNOTATION>
          <ANNOTATION><ALIGNABLE_ANNOTATION ANNOTATION_ID="a2" TIME_SLOT_REF1="ts3" TIME_SLOT_REF2="ts4"><ANNOTATION_VALUE>&lt;p:&gt;</ANNOTATION_VALUE></ALIGNABLE_ANNOTATION></ANNOTATION>
        </TIER>
        <TIER TIER_ID="tx" LINGUISTIC_TYPE_REF="assoc-lt" PARENT_REF="ref">
          <ANNOTATION><REF_ANNOTATION ANNOTATION_ID="t1" ANNOTATION_REF="a1"><ANNOTATION_VALUE>nono'eitiit woow</ANNOTATION_VALUE></REF_ANNOTATION></ANNOTATION>
          <ANNOTATION><REF_ANNOTATION ANNOTATION_ID="t2" ANNOTATION_REF="a2"><ANNOTATION_VALUE>second sentence</ANNOTATION_VALUE></REF_ANNOTATION></ANNOTATION>
        </TIER>
        <TIER TIER_ID="ft" LINGUISTIC_TYPE_REF="assoc-lt" PARENT_REF="ref">
          <ANNOTATION><REF_ANNOTATION ANNOTATION_ID="f1" ANNOTATION_REF="a1"><ANNOTATION_VALUE>Arapaho language</ANNOTATION_VALUE></REF_ANNOTATION></ANNOTATION>
        </TIER>`,
        `${ALIGNABLE}${ASSOC}`,
      ),
    );
    expect(imported.transcriptionTierName).toBe('tx');
    expect(imported.units.map((unit) => unit.transcription)).toEqual([
      "nono'eitiit woow",
      'second sentence',
    ]);
    expect(imported.translationTiers.get('ft')?.[0]?.text).toBe('Arapaho language');
    expect(imported.translationTiers.get('ft')?.[0]?.annotationRef).toBe('t1');
    expect(imported.userNotes?.map((note) => note.text)).toEqual(['0001_doreco_x', '<p:>']);
    expect(imported.userNotes?.[0]?.annotationRef).toBe('t1');
    expect(imported.losses).toEqual([{ code: 'guessed-tier', name: 'tx' }]);
    expect(imported.tierRolePrompt).toBeUndefined();
  });

  it('stores DoReCo gl and ps on morphemes and leaves ph off the translation rows', () => {
    const imported = importFromEaf(
      eafFixture(
        `<TIER TIER_ID="ref" LINGUISTIC_TYPE_REF="align-lt">
          <ANNOTATION><ALIGNABLE_ANNOTATION ANNOTATION_ID="a1" TIME_SLOT_REF1="ts1" TIME_SLOT_REF2="ts2"><ANNOTATION_VALUE>0001_doreco_x</ANNOTATION_VALUE></ALIGNABLE_ANNOTATION></ANNOTATION>
        </TIER>
        <TIER TIER_ID="tx" LINGUISTIC_TYPE_REF="assoc-lt" PARENT_REF="ref">
          <ANNOTATION><REF_ANNOTATION ANNOTATION_ID="t1" ANNOTATION_REF="a1"><ANNOTATION_VALUE>the sentence</ANNOTATION_VALUE></REF_ANNOTATION></ANNOTATION>
        </TIER>
        <TIER TIER_ID="ft" LINGUISTIC_TYPE_REF="assoc-lt" PARENT_REF="ref">
          <ANNOTATION><REF_ANNOTATION ANNOTATION_ID="f1" ANNOTATION_REF="a1"><ANNOTATION_VALUE>the translation</ANNOTATION_VALUE></REF_ANNOTATION></ANNOTATION>
        </TIER>
        <TIER TIER_ID="wd" LINGUISTIC_TYPE_REF="sub-lt" PARENT_REF="ref">
          <ANNOTATION><REF_ANNOTATION ANNOTATION_ID="w1" ANNOTATION_REF="a1"><ANNOTATION_VALUE>one</ANNOTATION_VALUE></REF_ANNOTATION></ANNOTATION>
        </TIER>
        <TIER TIER_ID="mb" LINGUISTIC_TYPE_REF="incl-lt" PARENT_REF="wd">
          <ANNOTATION><REF_ANNOTATION ANNOTATION_ID="m1" ANNOTATION_REF="w1"><ANNOTATION_VALUE>stem</ANNOTATION_VALUE></REF_ANNOTATION></ANNOTATION>
        </TIER>
        <TIER TIER_ID="ps" LINGUISTIC_TYPE_REF="assoc-lt" PARENT_REF="mb">
          <ANNOTATION><REF_ANNOTATION ANNOTATION_ID="p1" ANNOTATION_REF="m1"><ANNOTATION_VALUE>n</ANNOTATION_VALUE></REF_ANNOTATION></ANNOTATION>
        </TIER>
        <TIER TIER_ID="gl" LINGUISTIC_TYPE_REF="assoc-lt" PARENT_REF="mb">
          <ANNOTATION><REF_ANNOTATION ANNOTATION_ID="g1" ANNOTATION_REF="m1"><ANNOTATION_VALUE>STEM</ANNOTATION_VALUE></REF_ANNOTATION></ANNOTATION>
        </TIER>
        <TIER TIER_ID="ph" LINGUISTIC_TYPE_REF="assoc-lt" PARENT_REF="mb">
          <ANNOTATION><REF_ANNOTATION ANNOTATION_ID="h1" ANNOTATION_REF="m1"><ANNOTATION_VALUE>phon</ANNOTATION_VALUE></REF_ANNOTATION></ANNOTATION>
        </TIER>
        <TIER TIER_ID="doreco-mb-algn" LINGUISTIC_TYPE_REF="assoc-lt" PARENT_REF="mb">
          <ANNOTATION><REF_ANNOTATION ANNOTATION_ID="al1" ANNOTATION_REF="m1"><ANNOTATION_VALUE>align</ANNOTATION_VALUE></REF_ANNOTATION></ANNOTATION>
        </TIER>`,
        `${ALIGNABLE}${ASSOC}${SUBDIVISION}${INCLUDED}`,
      ),
    );
    expect(imported.translationTiers.get('ft')?.[0]?.text).toBe('the translation');
    for (const tierId of ['gl', 'ps', 'ph', 'doreco-mb-algn', 'wd', 'mb']) {
      expect(imported.translationTiers.has(tierId)).toBe(false);
    }
    expect(imported.units[0]?.tokens).toEqual([
      {
        form: { default: 'one' },
        morphemes: [{ form: { default: 'stem' }, gloss: { und: 'STEM' }, pos: 'n' }],
      },
    ]);
    expect(imported.extraTranscriptionTiers).toEqual([
      {
        tierName: 'ph',
        units: [
          expect.objectContaining({
            transcription: 'phon',
            annotationId: 'h1',
          }),
        ],
      },
    ]);
    expect(imported.losses).toEqual([
      { code: 'unmapped-field', name: 'doreco-mb-algn' },
      { code: 'guessed-tier', name: 'tx' },
    ]);
  });

  it('attaches time-aligned morphemes by the word span', () => {
    const imported = importFromEaf(
      eafFixture(
        `<TIER TIER_ID="ref" LINGUISTIC_TYPE_REF="align-lt">
          <ANNOTATION><ALIGNABLE_ANNOTATION ANNOTATION_ID="a1" TIME_SLOT_REF1="ts1" TIME_SLOT_REF2="ts2"><ANNOTATION_VALUE>0001_doreco_x</ANNOTATION_VALUE></ALIGNABLE_ANNOTATION></ANNOTATION>
        </TIER>
        <TIER TIER_ID="tx" LINGUISTIC_TYPE_REF="assoc-lt" PARENT_REF="ref">
          <ANNOTATION><REF_ANNOTATION ANNOTATION_ID="t1" ANNOTATION_REF="a1"><ANNOTATION_VALUE>the sentence</ANNOTATION_VALUE></REF_ANNOTATION></ANNOTATION>
        </TIER>
        <TIER TIER_ID="wd" LINGUISTIC_TYPE_REF="incl-lt" PARENT_REF="ref">
          <ANNOTATION><ALIGNABLE_ANNOTATION ANNOTATION_ID="w1" TIME_SLOT_REF1="ts1" TIME_SLOT_REF2="ts2"><ANNOTATION_VALUE>one</ANNOTATION_VALUE></ALIGNABLE_ANNOTATION></ANNOTATION>
        </TIER>
        <TIER TIER_ID="mb" LINGUISTIC_TYPE_REF="incl-lt" PARENT_REF="wd">
          <ANNOTATION><ALIGNABLE_ANNOTATION ANNOTATION_ID="m1" TIME_SLOT_REF1="ts1" TIME_SLOT_REF2="ts2"><ANNOTATION_VALUE>stem</ANNOTATION_VALUE></ALIGNABLE_ANNOTATION></ANNOTATION>
        </TIER>
        <TIER TIER_ID="gl" LINGUISTIC_TYPE_REF="assoc-lt" PARENT_REF="mb">
          <ANNOTATION><REF_ANNOTATION ANNOTATION_ID="g1" ANNOTATION_REF="m1"><ANNOTATION_VALUE>STEM</ANNOTATION_VALUE></REF_ANNOTATION></ANNOTATION>
        </TIER>
        <TIER TIER_ID="ps" LINGUISTIC_TYPE_REF="assoc-lt" PARENT_REF="mb">
          <ANNOTATION><REF_ANNOTATION ANNOTATION_ID="p1" ANNOTATION_REF="m1"><ANNOTATION_VALUE>n</ANNOTATION_VALUE></REF_ANNOTATION></ANNOTATION>
        </TIER>`,
        `${ALIGNABLE}${ASSOC}${INCLUDED}`,
      ),
    );
    expect(imported.translationTiers.has('gl')).toBe(false);
    expect(imported.translationTiers.has('ps')).toBe(false);
    expect(imported.units[0]?.tokens).toEqual([
      {
        form: { default: 'one' },
        morphemes: [{ form: { default: 'stem' }, gloss: { und: 'STEM' }, pos: 'n' }],
      },
    ]);
  });

  it('records an unnamed date tier as a loss and keeps named tx and ft', () => {
    const imported = importFromEaf(
      eafFixture(
        `<TIER TIER_ID="ref" LINGUISTIC_TYPE_REF="align-lt">
          <ANNOTATION><ALIGNABLE_ANNOTATION ANNOTATION_ID="a1" TIME_SLOT_REF1="ts1" TIME_SLOT_REF2="ts2"><ANNOTATION_VALUE>0001_doreco_x</ANNOTATION_VALUE></ALIGNABLE_ANNOTATION></ANNOTATION>
        </TIER>
        <TIER TIER_ID="tx" LINGUISTIC_TYPE_REF="assoc-lt" PARENT_REF="ref">
          <ANNOTATION><REF_ANNOTATION ANNOTATION_ID="t1" ANNOTATION_REF="a1"><ANNOTATION_VALUE>the sentence</ANNOTATION_VALUE></REF_ANNOTATION></ANNOTATION>
        </TIER>
        <TIER TIER_ID="ft" LINGUISTIC_TYPE_REF="assoc-lt" PARENT_REF="ref">
          <ANNOTATION><REF_ANNOTATION ANNOTATION_ID="f1" ANNOTATION_REF="a1"><ANNOTATION_VALUE>the translation</ANNOTATION_VALUE></REF_ANNOTATION></ANNOTATION>
        </TIER>
        <TIER TIER_ID="when@NOBODY" LINGUISTIC_TYPE_REF="assoc-lt" PARENT_REF="ref">
          <ANNOTATION><REF_ANNOTATION ANNOTATION_ID="w1" ANNOTATION_REF="a1"><ANNOTATION_VALUE>10/Apr/2013</ANNOTATION_VALUE></REF_ANNOTATION></ANNOTATION>
          <ANNOTATION><REF_ANNOTATION ANNOTATION_ID="w2" ANNOTATION_REF="a1"><ANNOTATION_VALUE>&lt;p:&gt;</ANNOTATION_VALUE></REF_ANNOTATION></ANNOTATION>
          <ANNOTATION><REF_ANNOTATION ANNOTATION_ID="w3" ANNOTATION_REF="a1"><ANNOTATION_VALUE>2013-04-10</ANNOTATION_VALUE></REF_ANNOTATION></ANNOTATION>
          <ANNOTATION><REF_ANNOTATION ANNOTATION_ID="w4" ANNOTATION_REF="a1"><ANNOTATION_VALUE>****</ANNOTATION_VALUE></REF_ANNOTATION></ANNOTATION>
        </TIER>`,
        `${ALIGNABLE}${ASSOC}`,
      ),
    );
    expect(imported.units.map((unit) => unit.transcription)).toEqual(['the sentence']);
    expect(imported.translationTiers.get('ft')?.[0]?.text).toBe('the translation');
    expect(imported.translationTiers.has('when@NOBODY')).toBe(false);
    expect(imported.userNotes?.some((note) => note.text === '10/Apr/2013')).toBe(false);
    expect(
      imported.losses?.some(
        (loss) => loss.code === 'unmapped-field' && loss.name?.includes('when@NOBODY'),
      ),
    ).toBe(true);

    const namedDates = importFromEaf(
      eafFixture(
        `<TIER TIER_ID="tx" LINGUISTIC_TYPE_REF="align-lt">
          <ANNOTATION><ALIGNABLE_ANNOTATION ANNOTATION_ID="a1" TIME_SLOT_REF1="ts1" TIME_SLOT_REF2="ts2"><ANNOTATION_VALUE>10/Apr/2013</ANNOTATION_VALUE></ALIGNABLE_ANNOTATION></ANNOTATION>
          <ANNOTATION><ALIGNABLE_ANNOTATION ANNOTATION_ID="a2" TIME_SLOT_REF1="ts3" TIME_SLOT_REF2="ts4"><ANNOTATION_VALUE>2013-04-10</ANNOTATION_VALUE></ALIGNABLE_ANNOTATION></ANNOTATION>
        </TIER>
        <TIER TIER_ID="ft" LINGUISTIC_TYPE_REF="assoc-lt" PARENT_REF="tx">
          <ANNOTATION><REF_ANNOTATION ANNOTATION_ID="f1" ANNOTATION_REF="a1"><ANNOTATION_VALUE>10/Apr/2013</ANNOTATION_VALUE></REF_ANNOTATION></ANNOTATION>
        </TIER>`,
        `${ALIGNABLE}${ASSOC}`,
      ),
    );
    expect(namedDates.transcriptionTierName).toBe('tx');
    expect(namedDates.units.map((unit) => unit.transcription)).toEqual([
      '10/Apr/2013',
      '2013-04-10',
    ]);
    expect(namedDates.translationTiers.get('ft')?.[0]?.text).toBe('10/Apr/2013');
    expect(namedDates.losses?.some((loss) => loss.code === 'unmapped-field')).toBeFalsy();
  });

  it('keeps recording metadata off the translation rows', () => {
    const imported = importFromEaf(
      eafFixture(
        `<TIER TIER_ID="ref" LINGUISTIC_TYPE_REF="align-lt">
          <ANNOTATION><ALIGNABLE_ANNOTATION ANNOTATION_ID="a1" TIME_SLOT_REF1="ts1" TIME_SLOT_REF2="ts2"><ANNOTATION_VALUE>0001_doreco_x</ANNOTATION_VALUE></ALIGNABLE_ANNOTATION></ANNOTATION>
        </TIER>
        <TIER TIER_ID="tx" LINGUISTIC_TYPE_REF="assoc-lt" PARENT_REF="ref">
          <ANNOTATION><REF_ANNOTATION ANNOTATION_ID="t1" ANNOTATION_REF="a1"><ANNOTATION_VALUE>the sentence</ANNOTATION_VALUE></REF_ANNOTATION></ANNOTATION>
        </TIER>
        <TIER TIER_ID="ft" LINGUISTIC_TYPE_REF="assoc-lt" PARENT_REF="ref">
          <ANNOTATION><REF_ANNOTATION ANNOTATION_ID="f1" ANNOTATION_REF="a1"><ANNOTATION_VALUE>the translation</ANNOTATION_VALUE></REF_ANNOTATION></ANNOTATION>
        </TIER>
        <TIER TIER_ID="sound@NOBODY" LINGUISTIC_TYPE_REF="assoc-lt" PARENT_REF="ref">
          <ANNOTATION><REF_ANNOTATION ANNOTATION_ID="s1" ANNOTATION_REF="a1"><ANNOTATION_VALUE>Zoom H4n</ANNOTATION_VALUE></REF_ANNOTATION></ANNOTATION>
        </TIER>
        <TIER TIER_ID="dt_rec@NOBODY" LINGUISTIC_TYPE_REF="assoc-lt" PARENT_REF="ref">
          <ANNOTATION><REF_ANNOTATION ANNOTATION_ID="d1" ANNOTATION_REF="a1"><ANNOTATION_VALUE>01/02/13</ANNOTATION_VALUE></REF_ANNOTATION></ANNOTATION>
        </TIER>`,
        `${ALIGNABLE}${ASSOC}`,
      ),
    );
    expect(imported.translationTiers.get('ft')?.[0]?.text).toBe('the translation');
    expect(imported.translationTiers.has('sound@NOBODY')).toBe(false);
    expect(imported.translationTiers.has('dt_rec@NOBODY')).toBe(false);
    expect(
      imported.losses?.some(
        (loss) => loss.code === 'unmapped-field' && loss.name?.includes('sound@NOBODY'),
      ),
    ).toBe(true);
    expect(
      imported.losses?.some(
        (loss) => loss.code === 'unmapped-field' && loss.name?.includes('dt_rec@NOBODY'),
      ),
    ).toBe(true);
  });

  it('keeps unassigned word and recording tiers off the page after the role dialog', () => {
    const xml = eafFixture(
      `<TIER TIER_ID="ref" LINGUISTIC_TYPE_REF="align-lt">
        <ANNOTATION><ALIGNABLE_ANNOTATION ANNOTATION_ID="a1" TIME_SLOT_REF1="ts1" TIME_SLOT_REF2="ts2"><ANNOTATION_VALUE>0001_doreco_x</ANNOTATION_VALUE></ALIGNABLE_ANNOTATION></ANNOTATION>
      </TIER>
      <TIER TIER_ID="tx" LINGUISTIC_TYPE_REF="assoc-lt" PARENT_REF="ref">
        <ANNOTATION><REF_ANNOTATION ANNOTATION_ID="t1" ANNOTATION_REF="a1"><ANNOTATION_VALUE>the sentence</ANNOTATION_VALUE></REF_ANNOTATION></ANNOTATION>
      </TIER>
      <TIER TIER_ID="ft" LINGUISTIC_TYPE_REF="assoc-lt" PARENT_REF="ref">
        <ANNOTATION><REF_ANNOTATION ANNOTATION_ID="f1" ANNOTATION_REF="a1"><ANNOTATION_VALUE>the translation</ANNOTATION_VALUE></REF_ANNOTATION></ANNOTATION>
      </TIER>
      <TIER TIER_ID="fn" LINGUISTIC_TYPE_REF="assoc-lt" PARENT_REF="ref">
        <ANNOTATION><REF_ANNOTATION ANNOTATION_ID="nfn" ANNOTATION_REF="a1"><ANNOTATION_VALUE>la traducción</ANNOTATION_VALUE></REF_ANNOTATION></ANNOTATION>
      </TIER>
      <TIER TIER_ID="nt@NOBODY" LINGUISTIC_TYPE_REF="assoc-lt" PARENT_REF="ref">
        <ANNOTATION><REF_ANNOTATION ANNOTATION_ID="n1" ANNOTATION_REF="a1"><ANNOTATION_VALUE>a note</ANNOTATION_VALUE></REF_ANNOTATION></ANNOTATION>
      </TIER>
      <TIER TIER_ID="wd" LINGUISTIC_TYPE_REF="sub-lt" PARENT_REF="ref">
        <ANNOTATION><REF_ANNOTATION ANNOTATION_ID="w1" ANNOTATION_REF="a1"><ANNOTATION_VALUE>one</ANNOTATION_VALUE></REF_ANNOTATION></ANNOTATION>
      </TIER>
      <TIER TIER_ID="sound@NOBODY" LINGUISTIC_TYPE_REF="assoc-lt" PARENT_REF="ref">
        <ANNOTATION><REF_ANNOTATION ANNOTATION_ID="s1" ANNOTATION_REF="a1"><ANNOTATION_VALUE>Zoom H4n</ANNOTATION_VALUE></REF_ANNOTATION></ANNOTATION>
      </TIER>`,
      `${ALIGNABLE}${ASSOC}${SUBDIVISION}`,
    );
    const confirmed = importFromEaf(xml, { tierRoles: { tx: 'transcription', ft: 'translation' } });
    expect(confirmed.transcriptionTierName).toBe('tx');
    expect(confirmed.units[0]?.transcription).toBe('the sentence');
    expect(confirmed.translationTiers.get('ft')?.[0]?.text).toBe('the translation');
    expect(confirmed.translationTiers.get('fn')?.[0]?.text).toBe('la traducción');
    expect(confirmed.translationTiers.has('nt@NOBODY')).toBe(false);
    expect(confirmed.userNotes).toEqual([
      expect.objectContaining({
        text: 'a note',
        category: 'comment',
        targetType: 'unit',
        annotationRef: 't1',
      }),
    ]);
    for (const tierId of ['ref', 'wd', 'sound@NOBODY']) {
      expect(confirmed.translationTiers.has(tierId)).toBe(false);
    }
    expect(confirmed.units[0]?.tokens?.map((token) => token.form.default)).toEqual(['one']);
    expect(confirmed.losses?.some((loss) => loss.code === 'guessed-tier')).toBeFalsy();
    expect(
      confirmed.losses?.some(
        (loss) => loss.code === 'unmapped-field' && loss.name?.includes('sound@NOBODY'),
      ),
    ).toBe(true);
  });

  it('stores a segmentation morpheme tier on the sentence instead of a translation row', () => {
    const imported = importFromEaf(
      eafFixture(
        `<TIER TIER_ID="reference_no" LINGUISTIC_TYPE_REF="align-lt">
          <ANNOTATION><ALIGNABLE_ANNOTATION ANNOTATION_ID="a1" TIME_SLOT_REF1="ts1" TIME_SLOT_REF2="ts2"><ANNOTATION_VALUE>1</ANNOTATION_VALUE></ALIGNABLE_ANNOTATION></ANNOTATION>
        </TIER>
        <TIER TIER_ID="transcription" LINGUISTIC_TYPE_REF="assoc-lt" PARENT_REF="reference_no">
          <ANNOTATION><REF_ANNOTATION ANNOTATION_ID="t1" ANNOTATION_REF="a1"><ANNOTATION_VALUE>the sentence</ANNOTATION_VALUE></REF_ANNOTATION></ANNOTATION>
        </TIER>
        <TIER TIER_ID="translation" LINGUISTIC_TYPE_REF="assoc-lt" PARENT_REF="transcription">
          <ANNOTATION><REF_ANNOTATION ANNOTATION_ID="f1" ANNOTATION_REF="t1"><ANNOTATION_VALUE>the translation</ANNOTATION_VALUE></REF_ANNOTATION></ANNOTATION>
        </TIER>
        <TIER TIER_ID="segmentation" LINGUISTIC_TYPE_REF="assoc-lt" PARENT_REF="transcription">
          <ANNOTATION><REF_ANNOTATION ANNOTATION_ID="s1" ANNOTATION_REF="t1"><ANNOTATION_VALUE>kuu =ja</ANNOTATION_VALUE></REF_ANNOTATION></ANNOTATION>
        </TIER>
        <TIER TIER_ID="morpheme" LINGUISTIC_TYPE_REF="sub-lt" PARENT_REF="segmentation">
          <ANNOTATION><REF_ANNOTATION ANNOTATION_ID="m1" ANNOTATION_REF="s1"><ANNOTATION_VALUE>kuu</ANNOTATION_VALUE></REF_ANNOTATION></ANNOTATION>
          <ANNOTATION><REF_ANNOTATION ANNOTATION_ID="m2" ANNOTATION_REF="s1" PREVIOUS_ANNOTATION="m1"><ANNOTATION_VALUE>=ja</ANNOTATION_VALUE></REF_ANNOTATION></ANNOTATION>
        </TIER>
        <TIER TIER_ID="gloss" LINGUISTIC_TYPE_REF="assoc-lt" PARENT_REF="morpheme">
          <ANNOTATION><REF_ANNOTATION ANNOTATION_ID="g1" ANNOTATION_REF="m1"><ANNOTATION_VALUE>today</ANNOTATION_VALUE></REF_ANNOTATION></ANNOTATION>
          <ANNOTATION><REF_ANNOTATION ANNOTATION_ID="g2" ANNOTATION_REF="m2"><ANNOTATION_VALUE>TOP</ANNOTATION_VALUE></REF_ANNOTATION></ANNOTATION>
        </TIER>`,
        `${ALIGNABLE}${ASSOC}${SUBDIVISION}`,
      ),
    );
    expect(imported.units[0]?.transcription).toBe('the sentence');
    expect(imported.translationTiers.get('translation')?.[0]?.text).toBe('the translation');
    for (const tierId of ['segmentation', 'morpheme', 'gloss']) {
      expect(imported.translationTiers.has(tierId)).toBe(false);
    }
    expect(imported.units[0]?.tokens).toEqual([
      {
        form: { default: 'kuu =ja' },
        morphemes: [
          { form: { default: 'kuu' }, gloss: { und: 'today' } },
          { form: { default: '=ja' }, gloss: { und: 'TOP' } },
        ],
      },
    ]);
  });

  it('does not publish an empty IPA tier or an empty phrase gloss', () => {
    const imported = importFromEaf(
      eafFixture(
        `<TIER TIER_ID="A_Transcription-txt-woe" LINGUISTIC_TYPE_REF="align-lt">
          <ANNOTATION><ALIGNABLE_ANNOTATION ANNOTATION_ID="a1" TIME_SLOT_REF1="ts1" TIME_SLOT_REF2="ts2"><ANNOTATION_VALUE>hello</ANNOTATION_VALUE></ALIGNABLE_ANNOTATION></ANNOTATION>
        </TIER>
        <TIER TIER_ID="A_Transcription-txt-ipa" LINGUISTIC_TYPE_REF="assoc-lt" PARENT_REF="A_Transcription-txt-woe">
          <ANNOTATION><REF_ANNOTATION ANNOTATION_ID="i1" ANNOTATION_REF="a1"><ANNOTATION_VALUE></ANNOTATION_VALUE></REF_ANNOTATION></ANNOTATION>
        </TIER>
        <TIER TIER_ID="A_phrase-gls-zh-CN" LINGUISTIC_TYPE_REF="assoc-lt" PARENT_REF="A_Transcription-txt-woe">
          <ANNOTATION><REF_ANNOTATION ANNOTATION_ID="g1" ANNOTATION_REF="a1"><ANNOTATION_VALUE></ANNOTATION_VALUE></REF_ANNOTATION></ANNOTATION>
        </TIER>
        <TIER TIER_ID="A_Translation-gls-en" LINGUISTIC_TYPE_REF="assoc-lt" PARENT_REF="A_Transcription-txt-woe">
          <ANNOTATION><REF_ANNOTATION ANNOTATION_ID="f1" ANNOTATION_REF="a1"><ANNOTATION_VALUE>hello there</ANNOTATION_VALUE></REF_ANNOTATION></ANNOTATION>
        </TIER>`,
        `${ALIGNABLE}${ASSOC}`,
      ),
    );
    expect(imported.units[0]?.transcription).toBe('hello');
    expect(imported.translationTiers.has('A_Transcription-txt-ipa')).toBe(false);
    expect(imported.translationTiers.has('A_phrase-gls-zh-CN')).toBe(false);
    expect(imported.translationTiers.get('A_Translation-gls-en')?.[0]?.text).toBe('hello there');
  });

  it('uses a transcription child when the root type is not time-alignable', () => {
    const imported = importFromEaf(
      eafFixture(
        `<TIER TIER_ID="ref" LINGUISTIC_TYPE_REF="root-lt">
          <ANNOTATION><ALIGNABLE_ANNOTATION ANNOTATION_ID="a1" TIME_SLOT_REF1="ts1" TIME_SLOT_REF2="ts2"><ANNOTATION_VALUE>0001_doreco_kamas</ANNOTATION_VALUE></ALIGNABLE_ANNOTATION></ANNOTATION>
        </TIER>
        <TIER TIER_ID="tx" LINGUISTIC_TYPE_REF="align-lt" PARENT_REF="ref">
          <ANNOTATION><ALIGNABLE_ANNOTATION ANNOTATION_ID="t1" TIME_SLOT_REF1="ts1" TIME_SLOT_REF2="ts2"><ANNOTATION_VALUE>Tumoʔim</ANNOTATION_VALUE></ALIGNABLE_ANNOTATION></ANNOTATION>
        </TIER>`,
        `${NOT_ALIGNABLE_ROOT}${ALIGNABLE}`,
      ),
    );
    expect(imported.units.length).toBeGreaterThan(0);
    expect(imported.units[0]?.transcription).toBe('Tumoʔim');
    expect(imported.transcriptionTierName).toBe('tx');
  });

  it('does not take an empty document_notes tier as the transcription', () => {
    const imported = importFromEaf(
      eafFixture(
        `<TIER TIER_ID="document_notes" LINGUISTIC_TYPE_REF="align-lt">
          <ANNOTATION><ALIGNABLE_ANNOTATION ANNOTATION_ID="a1" TIME_SLOT_REF1="ts1" TIME_SLOT_REF2="ts2"><ANNOTATION_VALUE></ANNOTATION_VALUE></ALIGNABLE_ANNOTATION></ANNOTATION>
        </TIER>
        <TIER TIER_ID="transcription" LINGUISTIC_TYPE_REF="assoc-lt" PARENT_REF="document_notes">
          <ANNOTATION><REF_ANNOTATION ANNOTATION_ID="t1" ANNOTATION_REF="a1"><ANNOTATION_VALUE>the sentence</ANNOTATION_VALUE></REF_ANNOTATION></ANNOTATION>
        </TIER>`,
        `${ALIGNABLE}${ASSOC}`,
      ),
    );
    expect(imported.transcriptionTierName).not.toBe('document_notes');
    expect(imported.units[0]?.transcription).toBe('the sentence');
  });

  it('does not take a numeric segnum tier as the transcription', () => {
    const imported = importFromEaf(
      eafFixture(
        `<TIER TIER_ID="segnum" LINGUISTIC_TYPE_REF="align-lt">
          <ANNOTATION><ALIGNABLE_ANNOTATION ANNOTATION_ID="a1" TIME_SLOT_REF1="ts1" TIME_SLOT_REF2="ts2"><ANNOTATION_VALUE>12</ANNOTATION_VALUE></ALIGNABLE_ANNOTATION></ANNOTATION>
        </TIER>
        <TIER TIER_ID="tx" LINGUISTIC_TYPE_REF="assoc-lt" PARENT_REF="segnum">
          <ANNOTATION><REF_ANNOTATION ANNOTATION_ID="t1" ANNOTATION_REF="a1"><ANNOTATION_VALUE>the sentence</ANNOTATION_VALUE></REF_ANNOTATION></ANNOTATION>
        </TIER>`,
        `${ALIGNABLE}${ASSOC}`,
      ),
    );
    expect(imported.units[0]?.transcription).toBe('the sentence');
    expect(imported.units[0]?.transcription).not.toBe('12');
  });

  it('keeps saved roles ahead of the default guess', () => {
    const xml = eafFixture(
      `<TIER TIER_ID="ref" LINGUISTIC_TYPE_REF="align-lt">
        <ANNOTATION><ALIGNABLE_ANNOTATION ANNOTATION_ID="a1" TIME_SLOT_REF1="ts1" TIME_SLOT_REF2="ts2"><ANNOTATION_VALUE>0001_doreco_x</ANNOTATION_VALUE></ALIGNABLE_ANNOTATION></ANNOTATION>
      </TIER>
      <TIER TIER_ID="tx" LINGUISTIC_TYPE_REF="assoc-lt" PARENT_REF="ref">
        <ANNOTATION><REF_ANNOTATION ANNOTATION_ID="t1" ANNOTATION_REF="a1"><ANNOTATION_VALUE>the sentence</ANNOTATION_VALUE></REF_ANNOTATION></ANNOTATION>
      </TIER>`,
      `${ALIGNABLE}${ASSOC}`,
    );
    const saved = importFromEaf(xml, { tierRoles: { ref: 'transcription', tx: 'translation' } });
    expect(saved.transcriptionTierName).toBe('ref');
    expect(saved.units[0]?.transcription).toBe('0001_doreco_x');
    expect(saved.losses?.some((loss) => loss.code === 'guessed-tier')).toBeFalsy();
  });

  it('keeps a one-to-one translation subdivision out of the word tokens', () => {
    const imported = importFromEaf(
      eafFixture(
        `<TIER TIER_ID="utterance" LINGUISTIC_TYPE_REF="align-lt">
          <ANNOTATION><ALIGNABLE_ANNOTATION ANNOTATION_ID="a1" TIME_SLOT_REF1="ts1" TIME_SLOT_REF2="ts2"><ANNOTATION_VALUE>Èta carita</ANNOTATION_VALUE></ALIGNABLE_ANNOTATION></ANNOTATION>
        </TIER>
        <TIER TIER_ID="Translation" LINGUISTIC_TYPE_REF="sub-lt" PARENT_REF="utterance">
          <ANNOTATION><REF_ANNOTATION ANNOTATION_ID="e1" ANNOTATION_REF="a1"><ANNOTATION_VALUE>The story is about</ANNOTATION_VALUE></REF_ANNOTATION></ANNOTATION>
        </TIER>
        <TIER TIER_ID="words" LINGUISTIC_TYPE_REF="sub-lt" PARENT_REF="utterance">
          <ANNOTATION><REF_ANNOTATION ANNOTATION_ID="w1" ANNOTATION_REF="a1"><ANNOTATION_VALUE>Èta</ANNOTATION_VALUE></REF_ANNOTATION></ANNOTATION>
          <ANNOTATION><REF_ANNOTATION ANNOTATION_ID="w2" ANNOTATION_REF="a1"><ANNOTATION_VALUE>carita</ANNOTATION_VALUE></REF_ANNOTATION></ANNOTATION>
        </TIER>`,
        `${ALIGNABLE}${SUBDIVISION}`,
      ),
    );
    expect(imported.translationTiers.get('Translation')?.[0]?.text).toBe('The story is about');
    expect(imported.units[0]?.tokens?.map((token) => token.form.default)).toEqual([
      'Èta',
      'carita',
    ]);
  });

  it('keeps golden transcription tier names and unit counts', () => {
    const root = join(__dirname, '../../tests/golden/eaf');
    const minimal = importFromEaf(readFileSync(join(root, 'minimal.eaf'), 'utf8'));
    expect(minimal.transcriptionTierName).toBe('default');
    expect(minimal.units).toHaveLength(2);
    expect(minimal.losses?.some((loss) => loss.code === 'guessed-tier')).toBeFalsy();

    const thai = importFromEaf(readFileSync(join(root, 'five-unit-thai.eaf'), 'utf8'));
    expect(thai.transcriptionTierName).toBe('default');
    expect(thai.units).toHaveLength(5);

    const muya = importFromEaf(readFileSync(join(root, 'mvm-muya-real.eaf'), 'utf8'));
    expect(muya.transcriptionTierName).toBe('mvm-fonipa-x-emic');
    expect(muya.units).toHaveLength(1);
    expect(muya.translationTiers.get('en')?.[0]?.text).toBe('Muya sample line');
  });

  const openEaf = join(__dirname, '../../tests/fixtures/open-corpora/elan');

  it.skipIf(!existsSync(join(openEaf, 'arapaho.eaf')))(
    'arapaho transcription does not start with a corpus id',
    () => {
      const imported = importFromEaf(readFileSync(join(openEaf, 'arapaho.eaf'), 'utf8'));
      const sample = imported.units.find((unit) => unit.transcription.trim())?.transcription ?? '';
      expect(sample.startsWith('0001_doreco_')).toBe(false);
      expect(sample.length).toBeGreaterThan(0);
      expect(imported.translationTiers.has('ft@33')).toBe(true);
      expect(imported.translationTiers.has('gl@33')).toBe(false);
      expect(imported.translationTiers.has('ps@33')).toBe(false);
      expect(
        imported.units.some((unit) =>
          unit.tokens?.some((token) =>
            token.morphemes?.some(
              (morph) => morph.gloss?.us === 'Arapaho language' && morph.pos === 'ni',
            ),
          ),
        ),
      ).toBe(true);
    },
  );

  it.skipIf(!existsSync(join(openEaf, 'kamas.eaf')))('kamas transcription contains Tumo', () => {
    const imported = importFromEaf(readFileSync(join(openEaf, 'kamas.eaf'), 'utf8'));
    expect(imported.units.some((unit) => unit.transcription.includes('Tumo'))).toBe(true);
  });

  it.skipIf(!existsSync(join(openEaf, 'sundanese-north-wind.eaf')))(
    'sundanese translation keeps the English sentence',
    () => {
      const imported = importFromEaf(
        readFileSync(join(openEaf, 'sundanese-north-wind.eaf'), 'utf8'),
      );
      const texts = [...imported.translationTiers.values()].flatMap((tier) =>
        tier.map((row) => row.text),
      );
      expect(texts.some((text) => text.includes('The story is about'))).toBe(true);
    },
  );

  it.skipIf(!existsSync(join(openEaf, 'duoxu.eaf')))(
    'duoxu uses the phrase segnum tier and keeps the gloss as translation',
    () => {
      const imported = importFromEaf(readFileSync(join(openEaf, 'duoxu.eaf'), 'utf8'));
      expect(imported.transcriptionTierName).not.toBe('A_phrase-segnum-en');
      expect(imported.tierRolePrompt).toBeUndefined();
      expect(imported.units.some((unit) => unit.transcription.trim() === '1')).toBe(false);
      expect(imported.units.some((unit) => unit.transcription.trim().length > 0)).toBe(true);
      const gloss = imported.translationTiers.get('A_phrase-gls-zh-CN') ?? [];
      expect(gloss.some((row) => row.text.includes('两口子有两个女儿'))).toBe(true);
      expect(imported.translationTiers.has('A_word-gls-zh-CN')).toBe(false);
      expect(imported.translationTiers.has('A_word-pos-zh-CN')).toBe(false);
      expect(imported.translationTiers.has('A_morph-gls-zh-CN')).toBe(false);
      expect(imported.translationTiers.has('interlinear-text-title-en')).toBe(false);
      expect(imported.participants.includes('***')).toBe(false);
      expect(imported.documentTitle?.en).toBe('duoxu001');
    },
  );

  it.skipIf(!existsSync(join(openEaf, 'palauan-frog-story.eaf')))(
    'palauan free translation stays a translation tier when the type is Note',
    () => {
      const imported = importFromEaf(readFileSync(join(openEaf, 'palauan-frog-story.eaf'), 'utf8'));
      expect(imported.transcriptionTierName).toBe('A_Transcription-txt-woe');
      const gloss = imported.translationTiers.get('A_Translation-gls-en') ?? [];
      expect(gloss.some((row) => row.text.includes('Frog, where are you?'))).toBe(true);
      expect(imported.translationTiers.has('A_Transcription-txt-ipa')).toBe(false);
      expect(
        imported.userNotes?.some((note) => note.text.includes('Frog, where are you?')),
      ).toBeFalsy();
    },
  );

  it.skipIf(!existsSync(join(openEaf, 'cashinahua.eaf')))(
    'cashinahua transcription is not a paragraph mark and still has word tokens',
    () => {
      const imported = importFromEaf(readFileSync(join(openEaf, 'cashinahua.eaf'), 'utf8'));
      expect(imported.transcriptionTierName).toBe('tx@JC');
      expect(imported.units.some((unit) => unit.transcription.includes('Peki'))).toBe(true);
      expect(imported.units.every((unit) => unit.transcription.trim() === '<p:>')).toBe(false);
      expect(imported.units.some((unit) => (unit.tokens?.length ?? 0) > 0)).toBe(true);
    },
  );

  it.skipIf(!existsSync(join(openEaf, 'tabaq.eaf')))(
    'tabaq keeps the free translation and drops the recording metadata tiers',
    () => {
      const xml = readFileSync(join(openEaf, 'tabaq.eaf'), 'utf8');
      const imported = importFromEaf(xml);
      expect(imported.translationTiers.has('ft@NHK')).toBe(true);
      expect(imported.translationTiers.has('sound@NOBODY')).toBe(false);
      expect(imported.translationTiers.has('dt_rec@NOBODY')).toBe(false);
      expect(imported.translationTiers.has('loc_rec@NOBODY')).toBe(false);
      const roles = Object.fromEntries(
        (imported.tierRolePrompt ?? []).map((tier) => [tier.tierId, tier.role]),
      );
      const confirmed = importFromEaf(xml, { tierRoles: roles });
      expect(confirmed.transcriptionTierName).toBe('tx@NHK');
      expect(confirmed.units.some((unit) => unit.transcription.trim().length > 0)).toBe(true);
      expect(confirmed.translationTiers.has('ft@NHK')).toBe(true);
      expect(confirmed.translationTiers.has('fn@NHK')).toBe(true);
      expect(confirmed.translationTiers.has('nt@NHK')).toBe(false);
      expect(confirmed.userNotes?.some((note) => note.text.includes('Sudanese Ar. yes'))).toBe(
        true,
      );
      expect(confirmed.extraTranscriptionTiers?.some((tier) => tier.tierName === 'ph@NHK')).toBe(
        true,
      );
      expect(
        confirmed.extraTranscriptionTiers
          ?.find((tier) => tier.tierName === 'ph@NHK')
          ?.units.some((unit) => unit.transcription.trim().length > 0),
      ).toBe(true);
      for (const tierId of [
        'sound@NOBODY',
        'dt_rec@NOBODY',
        'loc_rec@NOBODY',
        'wd@NHK',
        'ph@NHK',
        'ref@NHK',
        'ref@KBK',
      ]) {
        expect(confirmed.translationTiers.has(tierId)).toBe(false);
      }
      expect(confirmed.losses?.some((loss) => loss.code === 'guessed-tier')).toBeFalsy();
    },
  );

  it.skipIf(!existsSync(join(openEaf, 'okinawan-itoman-yukkanuhii.eaf')))(
    'okinawan morpheme gloss is stored on the sentence',
    () => {
      const imported = importFromEaf(
        readFileSync(join(openEaf, 'okinawan-itoman-yukkanuhii.eaf'), 'utf8'),
      );
      expect(imported.translationTiers.has('translation@HM')).toBe(true);
      expect(imported.translationTiers.has('segmentation@HM')).toBe(false);
      expect(imported.translationTiers.has('morpheme@HM')).toBe(false);
      expect(imported.translationTiers.has('gloss@HM')).toBe(false);
      expect(
        imported.units.some((unit) =>
          unit.tokens?.some((token) =>
            token.morphemes?.some(
              (morph) => morph.gloss?.en === 'TOP' || morph.gloss?.und === 'TOP',
            ),
          ),
        ),
      ).toBe(true);
    },
  );

  it('keeps word and morph rows off the translation page when they precede the phrase tier', () => {
    const imported = importFromEaf(
      eafFixture(
        `<TIER TIER_ID="A_word-gls-zh-CN" LINGUISTIC_TYPE_REF="assoc-lt" PARENT_REF="A_word-txt">
          <ANNOTATION><REF_ANNOTATION ANNOTATION_ID="g1" ANNOTATION_REF="w1"><ANNOTATION_VALUE>G1</ANNOTATION_VALUE></REF_ANNOTATION></ANNOTATION>
          <ANNOTATION><REF_ANNOTATION ANNOTATION_ID="g2" ANNOTATION_REF="w2"><ANNOTATION_VALUE>G2</ANNOTATION_VALUE></REF_ANNOTATION></ANNOTATION>
        </TIER>
        <TIER TIER_ID="A_word-pos" LINGUISTIC_TYPE_REF="assoc-lt" PARENT_REF="A_word-txt">
          <ANNOTATION><REF_ANNOTATION ANNOTATION_ID="p1" ANNOTATION_REF="w1"><ANNOTATION_VALUE>n</ANNOTATION_VALUE></REF_ANNOTATION></ANNOTATION>
        </TIER>
        <TIER TIER_ID="A_morph-txt" LINGUISTIC_TYPE_REF="sub-lt" PARENT_REF="A_word-txt">
          <ANNOTATION><REF_ANNOTATION ANNOTATION_ID="m1" ANNOTATION_REF="w1"><ANNOTATION_VALUE>aa</ANNOTATION_VALUE></REF_ANNOTATION></ANNOTATION>
        </TIER>
        <TIER TIER_ID="A_morph-gls" LINGUISTIC_TYPE_REF="assoc-lt" PARENT_REF="A_morph-txt">
          <ANNOTATION><REF_ANNOTATION ANNOTATION_ID="mg1" ANNOTATION_REF="m1"><ANNOTATION_VALUE>MG</ANNOTATION_VALUE></REF_ANNOTATION></ANNOTATION>
        </TIER>
        <TIER TIER_ID="A_morph-msa-en" LINGUISTIC_TYPE_REF="assoc-lt" PARENT_REF="A_morph-txt">
          <ANNOTATION><REF_ANNOTATION ANNOTATION_ID="ms1" ANNOTATION_REF="m1"><ANNOTATION_VALUE>n</ANNOTATION_VALUE></REF_ANNOTATION></ANNOTATION>
        </TIER>
        <TIER TIER_ID="A_morph-cf-en" LINGUISTIC_TYPE_REF="assoc-lt" PARENT_REF="A_morph-txt">
          <ANNOTATION><REF_ANNOTATION ANNOTATION_ID="cf1" ANNOTATION_REF="m1"><ANNOTATION_VALUE>lexeme</ANNOTATION_VALUE></REF_ANNOTATION></ANNOTATION>
        </TIER>
        <TIER TIER_ID="A_word-txt" LINGUISTIC_TYPE_REF="sub-lt" PARENT_REF="A_phrase-segnum-en">
          <ANNOTATION><REF_ANNOTATION ANNOTATION_ID="w2" ANNOTATION_REF="a1" PREVIOUS_ANNOTATION="w1"><ANNOTATION_VALUE>bb</ANNOTATION_VALUE></REF_ANNOTATION></ANNOTATION>
          <ANNOTATION><REF_ANNOTATION ANNOTATION_ID="w1" ANNOTATION_REF="a1"><ANNOTATION_VALUE>aa</ANNOTATION_VALUE></REF_ANNOTATION></ANNOTATION>
        </TIER>
        <TIER TIER_ID="A_phrase-segnum-en" LINGUISTIC_TYPE_REF="align-lt" PARTICIPANT="***">
          <ANNOTATION><ALIGNABLE_ANNOTATION ANNOTATION_ID="a1" TIME_SLOT_REF1="ts1" TIME_SLOT_REF2="ts2"><ANNOTATION_VALUE>1</ANNOTATION_VALUE></ALIGNABLE_ANNOTATION></ANNOTATION>
        </TIER>
        <TIER TIER_ID="A_phrase-gls-en" LINGUISTIC_TYPE_REF="assoc-lt" PARENT_REF="A_phrase-segnum-en">
          <ANNOTATION><REF_ANNOTATION ANNOTATION_ID="f1" ANNOTATION_REF="a1"><ANNOTATION_VALUE>the sentence</ANNOTATION_VALUE></REF_ANNOTATION></ANNOTATION>
        </TIER>`,
        `${ALIGNABLE}${ASSOC}${SUBDIVISION}`,
      ),
    );
    expect(imported.transcriptionTierName).toBe('A_word-txt');
    expect(imported.units.map((unit) => unit.transcription)).toEqual(['aa bb']);
    expect(imported.units[0]?.speakerId).toBeUndefined();
    expect(imported.participants).toEqual([]);
    expect(imported.translationTiers.get('A_phrase-gls-en')?.[0]?.text).toBe('the sentence');
    for (const tierId of [
      'A_word-txt',
      'A_word-gls-zh-CN',
      'A_word-pos',
      'A_morph-gls',
      'A_morph-cf-en',
    ]) {
      expect(imported.translationTiers.has(tierId)).toBe(false);
    }
    expect(imported.userNotes?.map((note) => note.text)).toContain('1');
    expect(imported.units[0]?.tokens).toEqual([
      {
        form: { default: 'aa' },
        gloss: { 'zh-CN': 'G1' },
        pos: 'n',
        morphemes: [{ form: { default: 'aa' }, gloss: { und: 'MG' }, pos: 'n' }],
      },
      { form: { default: 'bb' }, gloss: { 'zh-CN': 'G2' } },
    ]);
    expect(
      imported.losses?.some(
        (loss) => loss.code === 'unmapped-field' && loss.name?.includes('A_morph-cf-en'),
      ),
    ).toBe(true);
  });

  it('leaves the sentence empty when a segnum parent has no word forms', () => {
    const imported = importFromEaf(
      eafFixture(
        `<TIER TIER_ID="A_phrase-segnum-en" LINGUISTIC_TYPE_REF="align-lt">
          <ANNOTATION><ALIGNABLE_ANNOTATION ANNOTATION_ID="a1" TIME_SLOT_REF1="ts1" TIME_SLOT_REF2="ts2"><ANNOTATION_VALUE>1</ANNOTATION_VALUE></ALIGNABLE_ANNOTATION></ANNOTATION>
        </TIER>
        <TIER TIER_ID="A_phrase-gls-en" LINGUISTIC_TYPE_REF="assoc-lt" PARENT_REF="A_phrase-segnum-en">
          <ANNOTATION><REF_ANNOTATION ANNOTATION_ID="f1" ANNOTATION_REF="a1"><ANNOTATION_VALUE>the sentence</ANNOTATION_VALUE></REF_ANNOTATION></ANNOTATION>
        </TIER>`,
        `${ALIGNABLE}${ASSOC}`,
      ),
    );
    expect(imported.units[0]?.transcription).toBe('');
    expect(imported.translationTiers.get('A_phrase-gls-en')?.[0]?.text).toBe('the sentence');
    expect(imported.userNotes?.map((note) => note.text)).toEqual(['1']);
  });

  it('uses the participant id as the speaker name and stores the text title and phrase note', () => {
    const imported = importFromEaf(
      eafFixture(
        `<TIER TIER_ID="A_Transcription-txt-woe" LINGUISTIC_TYPE_REF="align-lt" PARTICIPANT="Lenny Saumar">
          <ANNOTATION><ALIGNABLE_ANNOTATION ANNOTATION_ID="a1" TIME_SLOT_REF1="ts1" TIME_SLOT_REF2="ts2"><ANNOTATION_VALUE>fiyango we nge</ANNOTATION_VALUE></ALIGNABLE_ANNOTATION></ANNOTATION>
        </TIER>
        <TIER TIER_ID="A_Translation-gls-en" LINGUISTIC_TYPE_REF="assoc-lt" PARENT_REF="A_Transcription-txt-woe" PARTICIPANT="Lenny Saumar">
          <ANNOTATION><REF_ANNOTATION ANNOTATION_ID="f1" ANNOTATION_REF="a1"><ANNOTATION_VALUE>This is the story</ANNOTATION_VALUE></REF_ANNOTATION></ANNOTATION>
        </TIER>
        <TIER TIER_ID="A_phrase-note-en" LINGUISTIC_TYPE_REF="assoc-lt" PARENT_REF="A_Transcription-txt-woe">
          <ANNOTATION><REF_ANNOTATION ANNOTATION_ID="n1" ANNOTATION_REF="a1"><ANNOTATION_VALUE>said quickly</ANNOTATION_VALUE></REF_ANNOTATION></ANNOTATION>
        </TIER>
        <TIER TIER_ID="A_Participant-note-en" LINGUISTIC_TYPE_REF="assoc-lt" PARENT_REF="A_Transcription-txt-woe" PARTICIPANT="Lenny Saumar">
          <ANNOTATION><REF_ANNOTATION ANNOTATION_ID="pn1" ANNOTATION_REF="a1"><ANNOTATION_VALUE>narrator</ANNOTATION_VALUE></REF_ANNOTATION></ANNOTATION>
        </TIER>
        <TIER TIER_ID="interlinear-text-title-en" LINGUISTIC_TYPE_REF="align-lt">
          <ANNOTATION><ALIGNABLE_ANNOTATION ANNOTATION_ID="t1" TIME_SLOT_REF1="ts1" TIME_SLOT_REF2="ts2"><ANNOTATION_VALUE>Pear Story</ANNOTATION_VALUE></ALIGNABLE_ANNOTATION></ANNOTATION>
        </TIER>`,
        `${ALIGNABLE}${ASSOC}`,
      ),
    );
    expect(imported.transcriptionTierName).toBe('A_Transcription-txt-woe');
    expect(imported.units[0]?.transcription).toBe('fiyango we nge');
    expect(imported.units[0]?.speakerId).toBe('Lenny Saumar');
    expect(imported.participants).toEqual(['Lenny Saumar']);
    expect(imported.translationTiers.get('A_Translation-gls-en')?.[0]?.text).toBe(
      'This is the story',
    );
    expect(imported.translationTiers.has('interlinear-text-title-en')).toBe(false);
    expect(imported.translationTiers.has('A_phrase-note-en')).toBe(false);
    expect(imported.documentTitle?.en).toBe('Pear Story');
    expect(imported.userNotes).toEqual([
      expect.objectContaining({
        text: 'said quickly',
        targetType: 'unit',
        category: 'comment',
        annotationRef: 'a1',
      }),
    ]);
    expect(imported.speakerNotes).toEqual([
      { participant: 'Lenny Saumar', text: 'narrator', lang: 'en' },
    ]);
  });
});
