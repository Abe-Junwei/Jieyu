// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { exportToEaf, importFromEaf } from './EafService';
import type { EafExportInput } from './EafService';
import type {
  UtteranceDocType,
  TranslationLayerDocType,
  UtteranceTextDocType,
  MediaItemDocType,
} from '../db';

// ── Helpers ──────────────────────────────────────────────────

function makeMedia(overrides?: Partial<MediaItemDocType>): MediaItemDocType {
  return {
    id: 'media1',
    textId: 'text1',
    filename: 'test.wav',
    isOfflineCached: false,
    createdAt: '2025-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeUtterance(id: string, start: number, end: number, text: string): UtteranceDocType {
  return {
    id,
    textId: 'text1',
    mediaId: 'media1',
    transcription: { default: text },
    startTime: start,
    endTime: end,
    annotationStatus: 'raw',
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
  };
}

function makeLayer(
  id: string,
  key: string,
  layerType: 'transcription' | 'translation',
  overrides?: Partial<TranslationLayerDocType>,
): TranslationLayerDocType {
  return {
    id,
    textId: 'text_1',
    key,
    name: { eng: key },
    layerType,
    languageId: 'en',
    modality: 'text',
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
    ...overrides,
  } as TranslationLayerDocType;
}

function makeTranslation(
  uttId: string,
  layerId: string,
  text: string,
): UtteranceTextDocType {
  return {
    id: `utr_${uttId}_${layerId}`,
    utteranceId: uttId,
    tierId: layerId,
    modality: 'text',
    text,
    sourceType: 'human',
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
  } as UtteranceTextDocType;
}

// ── Tests ────────────────────────────────────────────────────

describe('EafService', () => {
  describe('importFromEaf', () => {
    it('parses utterances from the first tier', () => {
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<ANNOTATION_DOCUMENT>
  <HEADER MEDIA_FILE="" TIME_UNITS="milliseconds">
    <MEDIA_DESCRIPTOR MEDIA_URL="test.wav" MIME_TYPE="audio/x-wav" RELATIVE_MEDIA_URL="./test.wav" />
  </HEADER>
  <TIME_ORDER>
    <TIME_SLOT TIME_SLOT_ID="ts1" TIME_VALUE="0" />
    <TIME_SLOT TIME_SLOT_ID="ts2" TIME_VALUE="1000" />
    <TIME_SLOT TIME_SLOT_ID="ts3" TIME_VALUE="1000" />
    <TIME_SLOT TIME_SLOT_ID="ts4" TIME_VALUE="2500" />
  </TIME_ORDER>
  <TIER TIER_ID="default" LINGUISTIC_TYPE_REF="default-lt">
    <ANNOTATION>
      <ALIGNABLE_ANNOTATION ANNOTATION_ID="a1" TIME_SLOT_REF1="ts1" TIME_SLOT_REF2="ts2">
        <ANNOTATION_VALUE>Hello</ANNOTATION_VALUE>
      </ALIGNABLE_ANNOTATION>
    </ANNOTATION>
    <ANNOTATION>
      <ALIGNABLE_ANNOTATION ANNOTATION_ID="a2" TIME_SLOT_REF1="ts3" TIME_SLOT_REF2="ts4">
        <ANNOTATION_VALUE>World</ANNOTATION_VALUE>
      </ALIGNABLE_ANNOTATION>
    </ANNOTATION>
  </TIER>
</ANNOTATION_DOCUMENT>`;

      const result = importFromEaf(xml);
      expect(result.utterances).toHaveLength(2);
      expect(result.utterances[0]).toEqual({ startTime: 0, endTime: 1, transcription: 'Hello' });
      expect(result.utterances[1]).toEqual({ startTime: 1, endTime: 2.5, transcription: 'World' });
      expect(result.mediaFilename).toBe('test.wav');
    });

    it('parses additional tiers as translationTiers', () => {
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<ANNOTATION_DOCUMENT>
  <HEADER MEDIA_FILE="" TIME_UNITS="milliseconds">
    <MEDIA_DESCRIPTOR MEDIA_URL="test.wav" MIME_TYPE="audio/x-wav" RELATIVE_MEDIA_URL="./test.wav" />
  </HEADER>
  <TIME_ORDER>
    <TIME_SLOT TIME_SLOT_ID="ts1" TIME_VALUE="0" />
    <TIME_SLOT TIME_SLOT_ID="ts2" TIME_VALUE="1000" />
  </TIME_ORDER>
  <TIER TIER_ID="default">
    <ANNOTATION>
      <ALIGNABLE_ANNOTATION ANNOTATION_ID="a1" TIME_SLOT_REF1="ts1" TIME_SLOT_REF2="ts2">
        <ANNOTATION_VALUE>你好</ANNOTATION_VALUE>
      </ALIGNABLE_ANNOTATION>
    </ANNOTATION>
  </TIER>
  <TIER TIER_ID="English">
    <ANNOTATION>
      <ALIGNABLE_ANNOTATION ANNOTATION_ID="a2" TIME_SLOT_REF1="ts1" TIME_SLOT_REF2="ts2">
        <ANNOTATION_VALUE>Hello</ANNOTATION_VALUE>
      </ALIGNABLE_ANNOTATION>
    </ANNOTATION>
  </TIER>
  <TIER TIER_ID="IPA">
    <ANNOTATION>
      <ALIGNABLE_ANNOTATION ANNOTATION_ID="a3" TIME_SLOT_REF1="ts1" TIME_SLOT_REF2="ts2">
        <ANNOTATION_VALUE>ni˧˥ xaʊ˧˩˧</ANNOTATION_VALUE>
      </ALIGNABLE_ANNOTATION>
    </ANNOTATION>
  </TIER>
</ANNOTATION_DOCUMENT>`;

      const result = importFromEaf(xml);
      expect(result.utterances).toHaveLength(1);
      expect(result.translationTiers.size).toBe(2);
      expect(result.translationTiers.get('English')![0]!.text).toBe('Hello');
      expect(result.translationTiers.get('IPA')![0]!.text).toBe('ni˧˥ xaʊ˧˩˧');
    });

    it('throws on invalid XML', () => {
      expect(() => importFromEaf('<not valid xml>>>')).toThrow();
    });

    it('skips annotations that reference missing time slots', () => {
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<ANNOTATION_DOCUMENT>
  <TIME_ORDER>
    <TIME_SLOT TIME_SLOT_ID="ts1" TIME_VALUE="0" />
    <TIME_SLOT TIME_SLOT_ID="ts2" TIME_VALUE="1000" />
  </TIME_ORDER>
  <TIER TIER_ID="default">
    <ANNOTATION>
      <ALIGNABLE_ANNOTATION ANNOTATION_ID="a1" TIME_SLOT_REF1="ts1" TIME_SLOT_REF2="ts2">
        <ANNOTATION_VALUE>valid</ANNOTATION_VALUE>
      </ALIGNABLE_ANNOTATION>
    </ANNOTATION>
    <ANNOTATION>
      <ALIGNABLE_ANNOTATION ANNOTATION_ID="a2" TIME_SLOT_REF1="ts_missing" TIME_SLOT_REF2="ts2">
        <ANNOTATION_VALUE>invalid</ANNOTATION_VALUE>
      </ALIGNABLE_ANNOTATION>
    </ANNOTATION>
  </TIER>
</ANNOTATION_DOCUMENT>`;

      const result = importFromEaf(xml);
      expect(result.utterances).toHaveLength(1);
      expect(result.utterances[0]!.transcription).toBe('valid');
    });
  });

  describe('exportToEaf', () => {
    it('exports default transcription tier', () => {
      const input: EafExportInput = {
        mediaItem: makeMedia(),
        utterances: [makeUtterance('u1', 0, 1, 'Hello'), makeUtterance('u2', 1, 2.5, 'World')],
        layers: [],
        translations: [],
      };
      const xml = exportToEaf(input);
      expect(xml).toContain('TIER_ID="default"');
      expect(xml).toContain('Hello');
      expect(xml).toContain('World');
      expect(xml).toContain('TIME_VALUE="0"');
      expect(xml).toContain('TIME_VALUE="2500"');
    });

    it('includes translation layers as additional tiers', () => {
      const layer = makeLayer('l1', 'trl_en', 'translation');
      const input: EafExportInput = {
        mediaItem: makeMedia(),
        utterances: [makeUtterance('u1', 0, 1, '你好')],
        layers: [layer],
        translations: [makeTranslation('u1', 'l1', 'Hello')],
      };
      const xml = exportToEaf(input);
      expect(xml).toContain('TIER_ID="trl_en"');
      expect(xml).toContain('Hello');
    });

    it('includes non-default transcription layers in export', () => {
      const defaultTrc = makeLayer('l_default', 'trc_default', 'transcription', { isDefault: true });
      const ipaTrc = makeLayer('l_ipa', 'trc_ipa', 'transcription');
      const input: EafExportInput = {
        mediaItem: makeMedia(),
        utterances: [makeUtterance('u1', 0, 1, '你好')],
        layers: [defaultTrc, ipaTrc],
        translations: [makeTranslation('u1', 'l_ipa', 'ni˧˥ xaʊ˧˩˧')],
      };
      const xml = exportToEaf(input);
      // Default transcription is in the first tier
      expect(xml).toContain('TIER_ID="default"');
      // IPA transcription layer appears as an additional tier
      expect(xml).toContain('TIER_ID="trc_ipa"');
      expect(xml).toContain('ni˧˥ xaʊ˧˩˧');
    });

    it('excludes default transcription layer from additional tiers (implicit default)', () => {
      // When no isDefault flag, the first transcription layer is the default
      const trc1 = makeLayer('l1', 'trc_first', 'transcription');
      const trc2 = makeLayer('l2', 'trc_second', 'transcription');
      const input: EafExportInput = {
        mediaItem: makeMedia(),
        utterances: [makeUtterance('u1', 0, 1, '你好')],
        layers: [trc1, trc2],
        translations: [makeTranslation('u1', 'l2', 'IPA text')],
      };
      const xml = exportToEaf(input);
      // First transcription layer (implicit default) should NOT appear as additional tier
      expect(xml).not.toContain('TIER_ID="trc_first"');
      // Second transcription layer should appear
      expect(xml).toContain('TIER_ID="trc_second"');
    });

    it('exports without MEDIA_DESCRIPTOR when mediaItem is omitted', () => {
      const input: EafExportInput = {
        utterances: [makeUtterance('u1', 0, 1, 'Hello')],
        layers: [],
        translations: [],
      };
      const xml = exportToEaf(input);
      expect(xml).not.toContain('MEDIA_DESCRIPTOR');
      expect(xml).toContain('<HEADER');
      expect(xml).toContain('Hello');
    });
  });

  describe('EAF round-trip', () => {
    it('export → import preserves utterances and tier data', () => {
      const layer = makeLayer('l1', 'English', 'translation');
      const input: EafExportInput = {
        mediaItem: makeMedia(),
        utterances: [
          makeUtterance('u1', 0, 1.5, '你好'),
          makeUtterance('u2', 1.5, 3, '世界'),
        ],
        layers: [layer],
        translations: [
          makeTranslation('u1', 'l1', 'Hello'),
          makeTranslation('u2', 'l1', 'World'),
        ],
      };

      const xml = exportToEaf(input);
      const result = importFromEaf(xml);

      expect(result.utterances).toHaveLength(2);
      expect(result.utterances[0]!.transcription).toBe('你好');
      expect(result.utterances[0]!.startTime).toBe(0);
      expect(result.utterances[0]!.endTime).toBe(1.5);
      expect(result.utterances[1]!.transcription).toBe('世界');

      expect(result.translationTiers.size).toBe(1);
      const eng = result.translationTiers.get('English')!;
      expect(eng).toHaveLength(2);
      expect(eng[0]!.text).toBe('Hello');
      expect(eng[1]!.text).toBe('World');
    });

    it('export → import round-trip preserves non-default transcription layers', () => {
      const defaultTrc = makeLayer('ld', 'trc_default', 'transcription', { isDefault: true });
      const ipaTrc = makeLayer('li', 'IPA', 'transcription');
      const input: EafExportInput = {
        mediaItem: makeMedia(),
        utterances: [makeUtterance('u1', 0, 2, '你好世界')],
        layers: [defaultTrc, ipaTrc],
        translations: [makeTranslation('u1', 'li', 'ni˧˥ xaʊ˧˩˧ ʂɨ˥˩ tɕjɛ˥˩')],
      };

      const xml = exportToEaf(input);
      const result = importFromEaf(xml);

      expect(result.utterances[0]!.transcription).toBe('你好世界');
      expect(result.translationTiers.size).toBe(1);
      const ipa = result.translationTiers.get('IPA')!;
      expect(ipa[0]!.text).toBe('ni˧˥ xaʊ˧˩˧ ʂɨ˥˩ tɕjɛ˥˩');
    });
  });
});
