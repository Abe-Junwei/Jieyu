// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { exportToFlextext, importFromFlextext } from './FlexService';
import type { UtteranceDocType, TranslationLayerDocType, UtteranceTextDocType } from '../db';

function makeUtterance(id: string, start: number, end: number, text: string): UtteranceDocType {
  return {
    id,
    textId: 'text1',
    mediaId: 'media1',
    transcription: { default: text },
    startTime: start,
    endTime: end,
    annotationStatus: 'raw',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

function makeLayer(id: string, key: string): TranslationLayerDocType {
  return {
    id,
    textId: 'text1',
    key,
    name: { eng: key },
    layerType: 'translation',
    languageId: 'en',
    modality: 'text',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

function makeTranslation(id: string, utteranceId: string, layerId: string, text: string): UtteranceTextDocType {
  return {
    id,
    utteranceId,
    tierId: layerId,
    modality: 'text',
    text,
    sourceType: 'human',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

describe('FlexService', () => {
  it('exports transcription from utterance_texts default transcription layer when available', () => {
    const trcLayer: TranslationLayerDocType = {
      id: 'tl_trc',
      textId: 'text1',
      key: 'default_trc',
      name: { eng: 'Default Transcription' },
      layerType: 'transcription',
      languageId: 'und',
      modality: 'text',
      isDefault: true,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };

    const u1 = makeUtterance('u1', 0, 1, 'legacy-cache');
    const trcText = makeTranslation('utr1', 'u1', 'tl_trc', 'fresh-layer-text');

    const xml = exportToFlextext({
      utterances: [u1],
      layers: [trcLayer],
      translations: [trcText],
    });

    expect(xml).toContain('<item type="txt" lang="und">fresh-layer-text</item>');
    expect(xml).not.toContain('<item type="txt" lang="und">legacy-cache</item>');
  });

  it('imports phrase-level txt + gls from flextext', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<document version="2">
  <interlinear-text guid="it1">
    <paragraphs>
      <paragraph guid="pg1">
        <phrases>
          <phrase guid="p1" begin-time-offset="0" end-time-offset="2.5">
            <item type="txt" lang="und">tɕʰa mo</item>
            <item type="gls" lang="en">tea hot</item>
          </phrase>
        </phrases>
      </paragraph>
    </paragraphs>
  </interlinear-text>
</document>`;

    const result = importFromFlextext(xml);
    expect(result.utterances).toHaveLength(1);
    expect(result.utterances[0]!.transcription).toBe('tɕʰa mo');
    expect(result.utterances[0]!.startTime).toBeCloseTo(0);
    expect(result.utterances[0]!.endTime).toBeCloseTo(2.5);
    expect(result.phraseGlosses.get('p1')).toBe('tea hot');
  });

  it('imports word and morpheme hierarchy', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<document version="2">
  <interlinear-text guid="it1">
    <paragraphs>
      <paragraph guid="pg1">
        <phrases>
          <phrase guid="p1" begin-time-offset="1" end-time-offset="4">
            <item type="txt" lang="und">nga-jongs</item>
            <words>
              <word guid="w1">
                <item type="txt" lang="und">nga-jongs</item>
                <morphemes>
                  <morph guid="m1">
                    <item type="txt" lang="und">nga</item>
                    <item type="gls" lang="en">1SG</item>
                  </morph>
                  <morph guid="m2">
                    <item type="txt" lang="und">jongs</item>
                    <item type="gls" lang="en">come.PST</item>
                  </morph>
                </morphemes>
              </word>
            </words>
          </phrase>
        </phrases>
      </paragraph>
    </paragraphs>
  </interlinear-text>
</document>`;

    const result = importFromFlextext(xml);
    expect(result.utterances).toHaveLength(1);
    const tokens = result.utterances[0]!.tokens;
    expect(tokens).toBeDefined();
    expect(tokens).toHaveLength(1);
    expect(tokens![0]!.form.default).toBe('nga-jongs');
    expect(tokens![0]!.morphemes).toHaveLength(2);
    expect(tokens![0]!.morphemes![0]!.form.default).toBe('nga');
    expect(tokens![0]!.morphemes![0]!.gloss!.eng).toBe('1SG');
  });

  it('exports phrase text, optional phrase gloss, and morphemes', () => {
    const tLayer = makeLayer('tl_en', 'English');
    const u1: UtteranceDocType = makeUtterance('u1', 0, 3.4, 'nga-jongs');

    const tr1 = makeTranslation('tr1', 'u1', 'tl_en', 'I came');

    const xml = exportToFlextext({
      utterances: [u1],
      layers: [tLayer],
      translations: [tr1],
      tokens: [
        {
          id: 'tok_1',
          textId: 'text1',
          utteranceId: 'u1',
          form: { default: 'nga-jongs' },
          tokenIndex: 0,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
      morphemes: [
        {
          id: 'morph_1',
          textId: 'text1',
          utteranceId: 'u1',
          tokenId: 'tok_1',
          form: { default: 'nga' },
          gloss: { eng: '1SG' },
          morphemeIndex: 0,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
        {
          id: 'morph_2',
          textId: 'text1',
          utteranceId: 'u1',
          tokenId: 'tok_1',
          form: { default: 'jongs' },
          gloss: { eng: 'come.PST' },
          morphemeIndex: 1,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
      languageTag: 'und',
    });

    expect(xml).toContain('<phrase guid="p1"');
    expect(xml).toContain('<item type="txt" lang="und">nga-jongs</item>');
    expect(xml).toContain('<item type="gls" lang="en">I came</item>');
    expect(xml).toContain('<morph guid="p1_w1_m1">');
    expect(xml).toContain('<item type="gls" lang="en">1SG</item>');
  });

  it('round-trips exported flextext back into utterance structure', () => {
    const u1: UtteranceDocType = makeUtterance('u1', 0.125, 2.875, 'tɕʰa mo');

    const xml = exportToFlextext({
      utterances: [u1],
      layers: [],
      translations: [],
      tokens: [
        {
          id: 'tok_a',
          textId: 'text1',
          utteranceId: 'u1',
          form: { default: 'tɕʰa' },
          tokenIndex: 0,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
        {
          id: 'tok_b',
          textId: 'text1',
          utteranceId: 'u1',
          form: { default: 'mo' },
          tokenIndex: 1,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
      morphemes: [
        {
          id: 'morph_a',
          textId: 'text1',
          utteranceId: 'u1',
          tokenId: 'tok_a',
          form: { default: 'tɕʰa' },
          gloss: { eng: 'tea' },
          morphemeIndex: 0,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
        {
          id: 'morph_b',
          textId: 'text1',
          utteranceId: 'u1',
          tokenId: 'tok_b',
          form: { default: 'mo' },
          gloss: { eng: 'hot' },
          morphemeIndex: 0,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    });
    const imported = importFromFlextext(xml);

    expect(imported.utterances).toHaveLength(1);
    expect(imported.utterances[0]!.transcription).toBe('tɕʰa mo');
    expect(imported.utterances[0]!.startTime).toBeCloseTo(0.125, 3);
    expect(imported.utterances[0]!.endTime).toBeCloseTo(2.875, 3);
    expect(imported.utterances[0]!.tokens).toHaveLength(2);
    expect(imported.utterances[0]!.tokens![0]!.morphemes![0]!.gloss!.eng).toBe('tea');
  });

  it('throws on invalid XML', () => {
    expect(() => importFromFlextext('<document><broken')).toThrow(/flextext XML parse failed/);
  });
});
