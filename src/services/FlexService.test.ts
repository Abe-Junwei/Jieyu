// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { LayerDocType, LayerUnitContentDocType, LayerUnitDocType } from '../db';
import { exportToFlextext, importFromFlextext } from './FlexService';

const GOLDEN_DIR = join(dirname(fileURLToPath(import.meta.url)), '../../tests/golden/flextext');
const NOW = '2026-06-01T00:00:00.000Z';

function readGolden(name: string): string {
  return readFileSync(join(GOLDEN_DIR, name), 'utf8');
}

function makeDefaultLayer(): LayerDocType {
  return {
    id: 'layer_trc',
    textId: 'text_1',
    key: 'trc_default',
    name: { zho: '转写' },
    layerType: 'transcription',
    languageId: 'bod',
    modality: 'text',
    acceptsAudio: false,
    isDefault: true,
    sortOrder: 0,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function buildExportInputFromImport(
  imported: ReturnType<typeof importFromFlextext>,
  layer: LayerDocType,
): {
  units: LayerUnitDocType[];
  layers: LayerDocType[];
  translations: LayerUnitContentDocType[];
} {
  const units: LayerUnitDocType[] = imported.units.map((unit, index) => ({
    id: `utt_${index + 1}`,
    textId: 'text_1',
    mediaId: 'media_1',
    layerId: layer.id,
    unitType: 'unit',
    startTime: unit.startTime,
    endTime: unit.endTime,
    transcription: { default: unit.transcription },
    createdAt: NOW,
    updatedAt: NOW,
  }));

  const translations: LayerUnitContentDocType[] = units.map((unit, index) => ({
    id: `utr_${index + 1}`,
    unitId: unit.id,
    layerId: layer.id,
    modality: 'text',
    text: imported.units[index]?.transcription ?? '',
    sourceType: 'human',
    createdAt: NOW,
    updatedAt: NOW,
  }));

  return { units, layers: [layer], translations };
}

describe('FlexService golden round-trip', () => {
  it.each(['minimal.flextext', 'interlinear-ipa.flextext', 'xml-escaping.flextext'] as const)(
    'import → export preserves phrase text for %s',
    (fixtureName) => {
      const imported = importFromFlextext(readGolden(fixtureName));
      expect(imported.units.length).toBeGreaterThan(0);

      const layer = makeDefaultLayer();
      const { units, layers, translations } = buildExportInputFromImport(imported, layer);
      const reExported = exportToFlextext({ units, layers, translations, languageTag: 'bod' });
      const reImported = importFromFlextext(reExported);

      expect(reImported.units.map((u) => u.transcription)).toEqual(
        imported.units.map((u) => u.transcription),
      );
      expect(reImported.units.map((u) => u.startTime)).toEqual(
        imported.units.map((u) => u.startTime),
      );
      expect(reImported.units.map((u) => u.endTime)).toEqual(imported.units.map((u) => u.endTime));
    },
  );

  it('imports empty flextext without phrases', () => {
    const imported = importFromFlextext(readGolden('empty.flextext'));
    expect(imported.units).toEqual([]);
  });
});

describe('FlexService RTL phrase round-trip', () => {
  it('preserves Arabic phrase text through export and import', () => {
    const arabic = 'مرحبا بالعالم';
    const layer = makeDefaultLayer();
    layer.languageId = 'ara';
    const units: LayerUnitDocType[] = [
      {
        id: 'utt_ar',
        textId: 'text_1',
        mediaId: 'media_1',
        layerId: layer.id,
        unitType: 'unit',
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
        layerId: layer.id,
        modality: 'text',
        text: arabic,
        sourceType: 'human',
        createdAt: NOW,
        updatedAt: NOW,
      },
    ];

    const flex = exportToFlextext({
      units,
      layers: [layer],
      translations,
      languageTag: 'ara',
    });
    const imported = importFromFlextext(flex);
    expect(imported.units[0]?.transcription).toBe(arabic);
  });

  it('preserves mixed RTL phrase gloss text without leaking bidi isolation markers', () => {
    const arabic = 'مرحبا بالعالم';
    const gloss = 'hello world';
    const sourceLayer = makeDefaultLayer();
    sourceLayer.languageId = 'ara';
    const glossLayer: LayerDocType = {
      id: 'layer_gls',
      textId: 'text_1',
      key: 'gls_en',
      name: { eng: 'Gloss' },
      layerType: 'translation',
      languageId: 'eng',
      modality: 'text',
      acceptsAudio: false,
      sortOrder: 1,
      createdAt: NOW,
      updatedAt: NOW,
    };
    const units: LayerUnitDocType[] = [
      {
        id: 'utt_ar_gloss',
        textId: 'text_1',
        mediaId: 'media_1',
        layerId: sourceLayer.id,
        unitType: 'unit',
        startTime: 0,
        endTime: 2,
        transcription: { default: arabic },
        createdAt: NOW,
        updatedAt: NOW,
      },
    ];
    const translations: LayerUnitContentDocType[] = [
      {
        id: 'utr_ar_source',
        unitId: 'utt_ar_gloss',
        layerId: sourceLayer.id,
        modality: 'text',
        text: arabic,
        sourceType: 'human',
        createdAt: NOW,
        updatedAt: NOW,
      },
      {
        id: 'utr_ar_gloss',
        unitId: 'utt_ar_gloss',
        layerId: glossLayer.id,
        modality: 'text',
        text: gloss,
        sourceType: 'human',
        createdAt: NOW,
        updatedAt: NOW,
      },
    ];

    const flex = exportToFlextext({
      units,
      layers: [sourceLayer, glossLayer],
      translations,
      languageTag: 'ara',
    });
    const imported = importFromFlextext(flex);
    expect(imported.units[0]?.transcription).toBe(arabic);
    expect(imported.phraseGlosses.get('p1')).toBe(gloss);
    expect(imported.units[0]?.phraseId).toBe('p1');
  });

  it('aligns phrase glosses by phrase guid, not array index', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<document version="2">
  <interlinear-text guid="it1">
    <paragraphs>
      <paragraph guid="pg1">
        <phrases>
          <phrase guid="phrase-b" begin-time-offset="1" end-time-offset="2">
            <item type="txt" lang="en">second</item>
            <item type="gls" lang="en">GLOSS-B</item>
          </phrase>
          <phrase guid="phrase-a" begin-time-offset="0" end-time-offset="1">
            <item type="txt" lang="en">first</item>
            <item type="gls" lang="en">GLOSS-A</item>
          </phrase>
        </phrases>
      </paragraph>
    </paragraphs>
  </interlinear-text>
</document>`;
    const imported = importFromFlextext(xml);
    expect(imported.units.map((u) => u.phraseId)).toEqual(['phrase-b', 'phrase-a']);
    expect(imported.phraseGlosses.get('phrase-b')).toBe('GLOSS-B');
    expect(imported.phraseGlosses.get('phrase-a')).toBe('GLOSS-A');
  });

  it('keeps secondary interlinear-text blocks in additionalTiers', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<document version="2">
  <interlinear-text guid="it1">
    <item type="title" lang="en">Primary</item>
    <paragraphs>
      <paragraph guid="pg1">
        <phrases>
          <phrase guid="p1" begin-time-offset="0" end-time-offset="1">
            <item type="txt" lang="en">hello</item>
          </phrase>
        </phrases>
      </paragraph>
    </paragraphs>
  </interlinear-text>
  <interlinear-text guid="it2">
    <item type="title" lang="en">Extra Layer</item>
    <paragraphs>
      <paragraph guid="pg2">
        <phrases>
          <phrase guid="p2" begin-time-offset="0" end-time-offset="1">
            <item type="txt" lang="en">extra word</item>
            <words>
              <word guid="w1">
                <item type="txt" lang="en">extra</item>
                <item type="gls" lang="en">EXTRA</item>
                <morphemes>
                  <morph guid="m1">
                    <item type="txt" lang="en">ex</item>
                    <item type="gls" lang="en">EX</item>
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
    const imported = importFromFlextext(xml);
    expect(imported.units).toHaveLength(1);
    expect(imported.units[0]?.transcription).toBe('hello');
    const extra = imported.additionalTiers.get('Extra Layer');
    expect(extra).toHaveLength(1);
    expect(extra?.[0]?.text).toBe('extra word');
    expect(extra?.[0]?.tokens).toEqual([
      {
        form: { default: 'extra' },
        gloss: { eng: 'EXTRA' },
        morphemes: [{ form: { default: 'ex' }, gloss: { eng: 'EX' } }],
      },
    ]);
  });
});
