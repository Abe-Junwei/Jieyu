// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { exportToTextGrid, importFromTextGrid } from './TextGridService';
import type { LayerDocType, OrthographyDocType, UtteranceDocType, UtteranceTextDocType } from '../db';

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

function makeUtterance(): UtteranceDocType {
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
  } as UtteranceDocType;
}

function makeTranslation(overrides: Partial<UtteranceTextDocType> & { id: string; layerId: string; utteranceId: string; text: string }): UtteranceTextDocType {
  const now = '2026-03-31T00:00:00.000Z';
  return {
    ...overrides,
    id: overrides.id,
    utteranceId: overrides.utteranceId,
    layerId: overrides.layerId,
    modality: 'text',
    text: overrides.text,
    sourceType: 'human',
    createdAt: now,
    updatedAt: now,
  } as UtteranceTextDocType;
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
      utterances: [makeUtterance()],
      layers: [trc, trl],
      orthographies: [
        makeOrthography({ id: 'ortho-ar', languageId: 'ara', scriptTag: 'Arab', regionTag: 'EG', variantTag: 'fonipa' }),
        makeOrthography({ id: 'ortho-eng', languageId: 'eng', scriptTag: 'Latn' }),
      ],
      translations: [
        makeTranslation({ id: 'utr_trc', layerId: trc.id, utteranceId: 'utt_1', text: 'مرحبا' }),
        makeTranslation({ id: 'utr_trl', layerId: trl.id, utteranceId: 'utt_1', text: 'hello' }),
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
      utterances: [makeUtterance()],
      layers: [trc, trl],
      translations: [
        makeTranslation({ id: 'utr_trc', layerId: trc.id, utteranceId: 'utt_1', text: '你好' }),
        makeTranslation({ id: 'utr_trl', layerId: trl.id, utteranceId: 'utt_1', text: 'hello' }),
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
});
