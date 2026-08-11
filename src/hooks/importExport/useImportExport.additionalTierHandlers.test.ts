import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LayerDocType, LayerUnitDocType } from '../../db';
import { importAdditionalTiers } from './useImportExport.additionalTierHandlers';

const { mockSaveTokensBatch, mockSyncUnitText } = vi.hoisted(() => ({
  mockSaveTokensBatch: vi.fn(async (_rows?: unknown) => undefined),
  mockSyncUnitText: vi.fn(async (_db?: unknown, _unit?: unknown, _doc?: unknown) => undefined),
}));

vi.mock('../../services/LinguisticService', () => ({
  LinguisticService: {
    units: {
      saveTokensBatch: (rows: unknown) => mockSaveTokensBatch(rows),
      saveMorphemesBatch: vi.fn(async () => undefined),
    },
    lexemes: {
      matchOrCreateByForm: vi.fn(async () => 'lex-1'),
    },
  },
}));

vi.mock('../../services/LayerSegmentationV2Service', () => ({
  LayerSegmentationV2Service: {
    createSegmentWithContentAtomic: vi.fn(async () => undefined),
  },
}));

vi.mock('../../services/LayerSegmentationTextService', () => ({
  syncUnitTextToSegmentationV2: (db: unknown, unit: unknown, doc: unknown) =>
    mockSyncUnitText(db, unit, doc),
}));

vi.mock('../../db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../db')>();
  return {
    ...actual,
    getDb: vi.fn(async () => ({
      dexie: {
        token_lexeme_links: { bulkPut: vi.fn(async () => undefined) },
      },
    })),
  };
});

vi.mock('./useImportExport.importHelpers', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./useImportExport.importHelpers')>();
  return {
    ...actual,
    resolvePreferredHostTranscriptionLayerIdForTranslationImport: vi.fn(async () => 'trc-default'),
  };
});

const NOW = '2026-03-31T00:00:00.000Z';

function makeLayer(id: string, layerType: LayerDocType['layerType']): LayerDocType {
  return {
    id,
    textId: 'text-import',
    key: id,
    name: { eng: id },
    layerType,
    languageId: 'eng',
    modality: 'text',
    createdAt: NOW,
    updatedAt: NOW,
  } as LayerDocType;
}

function makeUnit(id: string, start: number, end: number): LayerUnitDocType {
  return {
    id,
    textId: 'text-import',
    mediaId: 'media-1',
    startTime: start,
    endTime: end,
    createdAt: NOW,
    updatedAt: NOW,
  } as LayerUnitDocType;
}

describe('importAdditionalTiers', () => {
  beforeEach(() => {
    mockSaveTokensBatch.mockClear();
    mockSyncUnitText.mockClear();
  });

  it('persists tokens from translation-tier annotations onto matched host units', async () => {
    const defaultLayer = makeLayer('trc-default', 'transcription');
    const glossLayer = {
      ...makeLayer('trl-gloss', 'translation'),
      name: { eng: 'Gloss Tier' },
    } as LayerDocType;
    const unit = makeUnit('utt-1', 0, 1);

    await importAdditionalTiers({
      db: {} as never,
      now: NOW,
      textId: 'text-import',
      mediaId: 'media-1',
      layers: [defaultLayer, glossLayer],
      additionalTiers: new Map([
        [
          'Gloss Tier',
          [
            {
              startTime: 0,
              endTime: 1,
              text: 'hello',
              tokens: [
                {
                  form: { default: 'hello' },
                  gloss: { eng: 'HELLO' },
                },
              ],
            },
          ],
        ],
      ]),
      insertedUnits: [{ id: unit.id, startTime: 0, endTime: 1, unit }],
      importedTierMetadata: new Map(),
      tierNameToLayerId: new Map(),
      effectiveTranscriptionLayerId: defaultLayer.id,
      eafResult: null,
      resolveDbLanguageName: () => undefined,
      resolveEafLanguageLabel: () => undefined,
      resolveLayerDisplayName: (_candidates, fallback) => ({
        label: fallback,
        source: 'fallback' as const,
      }),
      planImportedWrites: vi.fn(async () => [{ layerId: glossLayer.id, text: 'hello' }]),
      rememberLayer: vi.fn(),
      lexemeIdByFormKey: new Map(),
    });

    expect(mockSyncUnitText).toHaveBeenCalled();
    expect(mockSaveTokensBatch).toHaveBeenCalledWith([
      expect.objectContaining({
        unitId: 'utt-1',
        form: { default: 'hello' },
        gloss: { eng: 'HELLO' },
      }),
    ]);
  });
});
