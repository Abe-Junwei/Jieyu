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
});
