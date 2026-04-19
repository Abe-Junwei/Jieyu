// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { exportToTextGrid, importFromTextGrid } from './TextGridService';
import type { LayerDocType, OrthographyDocType, LayerUnitDocType, LayerUnitContentDocType } from '../db';

function makeLayer(overrides: Partial<LayerDocType> & { id: string; layerType: 'transcription' | 'translation'; key: string }): LayerDocType {
  const now = '2026-03-31T00:00:00.000Z';
  return {
    ...overrides,
    id: overrides.id,
    textId: 'text_1',
    key: overrides.key,
    name: overrides.name ?? { eng: overrides.key, zho: overrides.key },
    layerType: overrides.layerType,
    languageId: overrides.languageId ?? 'und',
    modality: 'text',
    acceptsAudio: false,
    sortOrder: 0,
    isDefault: overrides.layerType === 'transcription',
    createdAt: now,
    updatedAt: now,
  } as LayerDocType;
}

function makeUnit(): LayerUnitDocType {
  const now = '2026-03-31T00:00:00.000Z';
  return {
    id: 'utt_1',
    textId: 'text_1',
    mediaId: 'media_1',
    startTime: 0,
    endTime: 1,
    annotationStatus: 'raw',
    createdAt: now,
    updatedAt: now,
  } as LayerUnitDocType;
}

function makeTranslation(overrides: Partial<LayerUnitContentDocType> & { id: string; layerId: string; unitId: string; text: string }): LayerUnitContentDocType {
  const now = '2026-03-31T00:00:00.000Z';
  return {
    ...overrides,
    id: overrides.id,
    unitId: overrides.unitId,
    layerId: overrides.layerId,
    modality: 'text',
    text: overrides.text,
    sourceType: 'human',
    createdAt: now,
    updatedAt: now,
  } as LayerUnitContentDocType;
}

function makeOrthography(overrides: Partial<OrthographyDocType> & { id: string; languageId: string }): OrthographyDocType {
  const now = '2026-03-31T00:00:00.000Z';
  const { id, languageId, ...restOverrides } = overrides;
  return {
    id,
    languageId,
    name: overrides.name ?? { eng: id, zho: id },
    createdAt: now,
    updatedAt: now,
    ...restOverrides,
  } as OrthographyDocType;
}

describe('TextGridService tier metadata', () => {
  it('round-trips language and orthography identity via encoded tier names', () => {
    const trc = makeLayer({
      id: 'trc_default',
      layerType: 'transcription',
      key: 'trc_default',
      languageId: 'ara',
      orthographyId: 'ortho-ar',
      bridgeId: 'xf-ar-latn',
    });
    const trl = makeLayer({
      id: 'trl_gloss',
      layerType: 'translation',
      key: 'trl_gloss',
      name: { eng: 'Gloss Tier', zho: 'Gloss Tier' },
      languageId: 'eng',
      orthographyId: 'ortho-eng',
    });

    const textGrid = exportToTextGrid({
      units: [makeUnit()],
      layers: [trc, trl],
      orthographies: [
        makeOrthography({ id: 'ortho-ar', languageId: 'ara', scriptTag: 'Arab', regionTag: 'EG', variantTag: 'fonipa' }),
        makeOrthography({ id: 'ortho-eng', languageId: 'eng', scriptTag: 'Latn' }),
      ],
      translations: [
        makeTranslation({ id: 'utr_trc', layerId: trc.id, unitId: 'utt_1', text: 'مرحبا' }),
        makeTranslation({ id: 'utr_trl', layerId: trl.id, unitId: 'utt_1', text: 'hello' }),
      ],
    });

    expect(textGrid).toContain('__jieyu_meta_');
    expect(textGrid).toContain('%22bridgeId%22%3A%22xf-ar-latn%22');

    const imported = importFromTextGrid(textGrid);
    expect(imported.transcriptionTierName).toBe('transcription');
    expect(imported.additionalTiers.has('Gloss Tier')).toBe(true);
    expect(imported.tierMetadata.get('transcription')?.languageId).toBe('ara');
    expect(imported.tierMetadata.get('transcription')?.orthographyId).toBe('ortho-ar');
    expect(imported.tierMetadata.get('transcription')?.scriptTag).toBe('Arab');
    expect(imported.tierMetadata.get('transcription')?.regionTag).toBe('EG');
    expect(imported.tierMetadata.get('transcription')?.variantTag).toBe('fonipa');
    expect(imported.tierMetadata.get('transcription')?.bridgeId).toBe('xf-ar-latn');
    expect(imported.tierMetadata.get('Gloss Tier')?.languageId).toBe('eng');
    expect(imported.tierMetadata.get('Gloss Tier')?.orthographyId).toBe('ortho-eng');
  });

  it('prefers English fallback labels for exported additional tier names', () => {
    const trc = makeLayer({
      id: 'trc_default',
      layerType: 'transcription',
      key: 'trc_default',
      name: { zho: '默认转写', eng: 'Default Transcription' },
      languageId: 'zho',
    });
    const trl = makeLayer({
      id: 'trl_notes',
      layerType: 'translation',
      key: 'trl_notes',
      name: { zho: '中文层名', eng: 'English Tier Name' },
      languageId: 'eng',
    });

    const textGrid = exportToTextGrid({
      units: [makeUnit()],
      layers: [trc, trl],
      translations: [
        makeTranslation({ id: 'utr_trc', layerId: trc.id, unitId: 'utt_1', text: '你好' }),
        makeTranslation({ id: 'utr_trl', layerId: trl.id, unitId: 'utt_1', text: 'hello' }),
      ],
    });

    const imported = importFromTextGrid(textGrid);
    expect(imported.additionalTiers.has('English Tier Name')).toBe(true);
    expect(imported.additionalTiers.has('中文层名')).toBe(false);
  });

  it('drops unknown TextGrid metadata fields during import downgrade', () => {
    const textGrid = `File type = "ooTextFile"
Object class = "TextGrid"

xmin = 0
xmax = 1
tiers? <exists>
size = 1
item []:
    item [1]:
        class = "IntervalTier"
        name = "transcription__jieyu_meta_%7B%22languageId%22%3A%22ara%22%2C%22orthographyId%22%3A%22ortho-ar%22%2C%22scriptTag%22%3A%22Arab%22%2C%22unknownField%22%3A%22drop-me%22%2C%22bridgeId%22%3A%22xf-1%22%7D"
        xmin = 0
        xmax = 1
        intervals: size = 1
        intervals [1]:
            xmin = 0
            xmax = 1
            text = "مرحبا"
`;

    const imported = importFromTextGrid(textGrid);
    expect(imported.tierMetadata.get('transcription')).toEqual({
      languageId: 'ara',
      orthographyId: 'ortho-ar',
      scriptTag: 'Arab',
      bridgeId: 'xf-1',
    });
  });

  it('round-trips logical timeline project metadata for document-mode exports', () => {
    const trc = makeLayer({
      id: 'trc_default',
      layerType: 'transcription',
      key: 'trc_default',
      languageId: 'zho',
    });

    const textGrid = exportToTextGrid({
      units: [makeUnit()],
      layers: [trc],
      translations: [
        makeTranslation({ id: 'utr_trc', layerId: trc.id, unitId: 'utt_1', text: '你好' }),
      ],
      timelineMetadata: {
        timelineMode: 'document',
        logicalDurationSec: 1800,
        timebaseLabel: 'logical-second',
      },
    });

    const imported = importFromTextGrid(textGrid);
    expect(imported.timelineMetadata).toEqual({
      timelineMode: 'document',
      logicalDurationSec: 1800,
      timebaseLabel: 'logical-second',
    });
  });

  it('export→import preserves non-uniform interval times on the transcription tier (no acoustic)', () => {
    const trc = makeLayer({
      id: 'trc_default',
      layerType: 'transcription',
      key: 'trc_default',
      languageId: 'und',
    });
    const now = '2026-03-31T00:00:00.000Z';
    const units: LayerUnitDocType[] = [
      {
        id: 'u2',
        textId: 'text_1',
        mediaId: 'media_ph',
        startTime: 9.5,
        endTime: 11,
        annotationStatus: 'raw',
        createdAt: now,
        updatedAt: now,
      } as LayerUnitDocType,
      {
        id: 'u0',
        textId: 'text_1',
        mediaId: 'media_ph',
        startTime: 0.1,
        endTime: 0.4,
        annotationStatus: 'raw',
        createdAt: now,
        updatedAt: now,
      } as LayerUnitDocType,
      {
        id: 'u1',
        textId: 'text_1',
        mediaId: 'media_ph',
        startTime: 4,
        endTime: 4.75,
        annotationStatus: 'raw',
        createdAt: now,
        updatedAt: now,
      } as LayerUnitDocType,
    ];

    const textGrid = exportToTextGrid({
      units,
      layers: [trc],
      translations: [
        makeTranslation({ id: 't0', layerId: trc.id, unitId: 'u0', text: 'a' }),
        makeTranslation({ id: 't1', layerId: trc.id, unitId: 'u1', text: 'b' }),
        makeTranslation({ id: 't2', layerId: trc.id, unitId: 'u2', text: 'c' }),
      ],
      timelineMetadata: { timelineMode: 'document', logicalDurationSec: 15 },
    });

    const imported = importFromTextGrid(textGrid);
    const got = [...imported.units].sort((a, b) => a.startTime - b.startTime);
    expect(got.map((u) => [u.startTime, u.endTime, u.transcription])).toEqual([
      [0.1, 0.4, 'a'],
      [4, 4.75, 'b'],
      [9.5, 11, 'c'],
    ]);
  });
});
