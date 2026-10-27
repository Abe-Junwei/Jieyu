import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LayerDocType, LayerUnitDocType } from '../../db';
import { importAdditionalTiers } from './useImportExport.additionalTierHandlers';
import { createImportedTokenGraphWriter } from './persistImportedTokenGraph';

const {
  mockSaveTokensBatch,
  mockSyncUnitText,
  mockCreateSegmentWithContentAtomic,
  mockCreateSegment,
  mockInsertSegmentContents,
} = vi.hoisted(() => ({
  mockSaveTokensBatch: vi.fn(async (_rows?: unknown) => undefined),
  mockSyncUnitText: vi.fn(async (_db?: unknown, _unit?: unknown, _doc?: unknown) => undefined),
  mockCreateSegmentWithContentAtomic: vi.fn(
    async (_segment?: unknown, _content?: unknown) => undefined,
  ),
  mockCreateSegment: vi.fn(async (_segment?: unknown) => undefined),
  mockInsertSegmentContents: vi.fn(async (_db?: unknown, _rows?: unknown) => undefined),
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
    createSegmentWithContentAtomic: (segment: unknown, content: unknown) =>
      mockCreateSegmentWithContentAtomic(segment, content),
    createSegment: (segment: unknown) => mockCreateSegment(segment),
  },
}));

vi.mock('../../services/LayerUnitSegmentWriteService', () => ({
  LayerUnitSegmentWriteService: {
    insertSegmentContents: (db: unknown, rows: unknown) => mockInsertSegmentContents(db, rows),
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
        token_lexeme_links: {
          bulkPut: vi.fn(async () => undefined),
          where: () => ({ anyOf: () => ({ delete: async () => 0 }) }),
        },
        unit_tokens: {
          where: () => ({
            equals: () => ({ toArray: async () => [], delete: async () => 0 }),
          }),
        },
        unit_morphemes: {
          where: () => ({
            equals: () => ({ toArray: async () => [], delete: async () => 0 }),
          }),
        },
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
    mockCreateSegmentWithContentAtomic.mockClear();
    mockInsertSegmentContents.mockClear();
    mockCreateSegment.mockClear();
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
      tokenGraph: createImportedTokenGraphWriter({ textId: 'text-import' }),
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

  it('independent_boundary translation writes parentUnitId and content on the new segment id', async () => {
    const defaultLayer = makeLayer('trc-default', 'transcription');
    const glossLayer = {
      ...makeLayer('trl-gloss', 'translation'),
      name: { eng: 'Gloss Tier' },
      constraint: 'independent_boundary',
    } as LayerDocType;
    const unit = makeUnit('utt-1', 0, 10);

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
              startTime: 2,
              endTime: 4,
              text: '独立译文',
              annotationId: 'a1',
            },
          ],
        ],
      ]),
      insertedUnits: [{ id: unit.id, startTime: 0, endTime: 10, unit }],
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
      planImportedWrites: vi.fn(async () => [{ layerId: glossLayer.id, text: '独立译文' }]),
      rememberLayer: vi.fn(),
      tokenGraph: createImportedTokenGraphWriter({ textId: 'text-import' }),
    });

    expect(mockCreateSegmentWithContentAtomic).toHaveBeenCalledTimes(1);
    const call = mockCreateSegmentWithContentAtomic.mock.calls.at(0);
    expect(call).toBeDefined();
    const segment = call?.[0] as { id: string; parentUnitId?: string; unitId?: string };
    const content = call?.[1] as { unitId: string; layerId: string; text: string };
    expect(segment).toBeDefined();
    expect(content).toBeDefined();
    expect(segment).toEqual(
      expect.objectContaining({
        parentUnitId: 'utt-1',
        layerId: glossLayer.id,
        startTime: 2,
        endTime: 4,
      }),
    );
    expect(segment.unitId).toBeUndefined();
    expect(typeof segment.id).toBe('string');
    expect(segment.id.length).toBeGreaterThan(0);
    expect(content).toEqual(
      expect.objectContaining({
        unitId: segment.id,
        layerId: glossLayer.id,
        text: '独立译文',
      }),
    );
    expect(mockCreateSegment).not.toHaveBeenCalled();
  });

  it('without media, independent_boundary translation keeps content on the host unit', async () => {
    const defaultLayer = makeLayer('trc-default', 'transcription');
    const glossLayer = {
      ...makeLayer('trl-gloss', 'translation'),
      name: { eng: 'Gloss Tier' },
      constraint: 'independent_boundary',
    } as LayerDocType;
    const unit = { ...makeUnit('utt-1', 0, 10), mediaId: undefined };

    await importAdditionalTiers({
      db: {} as never,
      now: NOW,
      textId: 'text-import',
      mediaId: undefined,
      layers: [defaultLayer, glossLayer],
      additionalTiers: new Map([
        [
          'Gloss Tier',
          [
            {
              startTime: 2,
              endTime: 4,
              text: 'host fallback',
              annotationId: 'a1',
            },
          ],
        ],
      ]),
      insertedUnits: [{ id: unit.id, startTime: 0, endTime: 10, unit }],
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
      planImportedWrites: vi.fn(async () => [{ layerId: glossLayer.id, text: 'host fallback' }]),
      rememberLayer: vi.fn(),
      tokenGraph: createImportedTokenGraphWriter({ textId: 'text-import' }),
    });

    expect(mockCreateSegmentWithContentAtomic).not.toHaveBeenCalled();
    expect(mockInsertSegmentContents).toHaveBeenCalledTimes(1);
    const rows = mockInsertSegmentContents.mock.calls.at(0)?.[1] as Array<{
      unitId: string;
      text: string;
      layerId: string;
    }>;
    expect(rows).toEqual([
      expect.objectContaining({
        unitId: 'utt-1',
        layerId: glossLayer.id,
        text: 'host fallback',
      }),
    ]);
  });

});
