// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useTranscriptionLayerActions } from './useTranscriptionLayerActions';

const {
  mockGetDb,
  mockDeleteLayer,
  mockRemoveUtterancesBatch,
  mockUtteranceTextsWhereTierToArray,
  mockUtteranceTextsWhereUtteranceAnyOfToArray,
  mockLayerSegmentContentsDelete,
  mockLayerSegmentsPrimaryKeys,
  mockLayerSegmentsDelete,
  mockSegmentLinksWhereSourcePrimaryKeys,
  mockSegmentLinksWhereTargetPrimaryKeys,
  mockSegmentLinksBulkDelete,
  mockRemoveBySelectorUtteranceTexts,
  mockRemoveBySelectorLayerLinks,
} = vi.hoisted(() => ({
  mockGetDb: vi.fn(),
  mockDeleteLayer: vi.fn(async () => undefined),
  mockRemoveUtterancesBatch: vi.fn(async () => undefined),
  mockUtteranceTextsWhereTierToArray: vi.fn(async () => []),
  mockUtteranceTextsWhereUtteranceAnyOfToArray: vi.fn(async () => []),
  mockLayerSegmentContentsDelete: vi.fn(async () => undefined),
  mockLayerSegmentsPrimaryKeys: vi.fn<() => Promise<string[]>>(async () => []),
  mockLayerSegmentsDelete: vi.fn(async () => undefined),
  mockSegmentLinksWhereSourcePrimaryKeys: vi.fn<() => Promise<string[]>>(async () => []),
  mockSegmentLinksWhereTargetPrimaryKeys: vi.fn<() => Promise<string[]>>(async () => []),
  mockSegmentLinksBulkDelete: vi.fn(async () => undefined),
  mockRemoveBySelectorUtteranceTexts: vi.fn(async () => undefined),
  mockRemoveBySelectorLayerLinks: vi.fn(async () => undefined),
}));

vi.mock('../db', async () => {
  const actual = await vi.importActual('../db');
  return {
    ...actual,
    getDb: mockGetDb,
  };
});

vi.mock('../services/LayerTierUnifiedService', () => ({
  LayerTierUnifiedService: {
    createLayer: vi.fn(async () => undefined),
    deleteLayer: mockDeleteLayer,
  },
}));

vi.mock('../services/LinguisticService', () => ({
  LinguisticService: {
    removeUtterancesBatch: mockRemoveUtterancesBatch,
  },
}));

describe('useTranscriptionLayerActions v2 cleanup', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockLayerSegmentsPrimaryKeys.mockResolvedValue(['seg_1', 'seg_2']);
    mockSegmentLinksWhereSourcePrimaryKeys.mockResolvedValue(['link_source']);
    mockSegmentLinksWhereTargetPrimaryKeys.mockResolvedValue(['link_target']);

    mockGetDb.mockResolvedValue({
      collections: {
        utterance_texts: {
          removeBySelector: mockRemoveBySelectorUtteranceTexts,
        },
        layer_links: {
          removeBySelector: mockRemoveBySelectorLayerLinks,
          insert: vi.fn(async () => undefined),
        },
      },
      dexie: {
        utterance_texts: {
          where: (field: string) => {
            if (field === 'layerId') {
              return {
                equals: () => ({
                  toArray: mockUtteranceTextsWhereTierToArray,
                }),
              };
            }
            if (field === 'utteranceId') {
              return {
                anyOf: () => ({
                  toArray: mockUtteranceTextsWhereUtteranceAnyOfToArray,
                }),
              };
            }
            throw new Error(`Unexpected utterance_texts.where field: ${field}`);
          },
        },
        layer_segment_contents: {
          where: () => ({
            equals: () => ({
              delete: mockLayerSegmentContentsDelete,
            }),
          }),
        },
        layer_segments: {
          where: () => ({
            equals: () => ({
              primaryKeys: mockLayerSegmentsPrimaryKeys,
              delete: mockLayerSegmentsDelete,
            }),
          }),
        },
        segment_links: {
          where: (field: string) => {
            if (field === 'sourceSegmentId') {
              return {
                anyOf: () => ({
                  primaryKeys: mockSegmentLinksWhereSourcePrimaryKeys,
                }),
              };
            }
            if (field === 'targetSegmentId') {
              return {
                anyOf: () => ({
                  primaryKeys: mockSegmentLinksWhereTargetPrimaryKeys,
                }),
              };
            }
            throw new Error(`Unexpected segment_links.where field: ${field}`);
          },
          bulkDelete: mockSegmentLinksBulkDelete,
        },
        layer_links: {
          toArray: vi.fn(async () => []),
        },
      },
    });
  });

  it('removes segment_links via source/target indexes when deleting a layer', async () => {
    const now = '2026-03-25T00:00:00.000Z';
    const layer = {
      id: 'layer_trl_1',
      textId: 'text_1',
      key: 'trl_en_1',
      name: { zho: '翻译层1' },
      layerType: 'translation',
      languageId: 'en',
      modality: 'text',
      acceptsAudio: false,
      sortOrder: 1,
      createdAt: now,
      updatedAt: now,
    };

    const { result } = renderHook(() => useTranscriptionLayerActions({
      layers: [layer as never],
      layerLinks: [],
      layerToDeleteId: '',
      selectedLayerId: '',
      utterancesRef: { current: [] },
      pushUndo: vi.fn(),
      setLayerCreateMessage: vi.fn(),
      setLayers: vi.fn(),
      setLayerLinks: vi.fn(),
      setLayerToDeleteId: vi.fn(),
      setShowLayerManager: vi.fn(),
      setSelectedLayerId: vi.fn(),
      setSelectedMediaId: vi.fn(),
      setMediaItems: vi.fn(),
      setSelectedUtteranceId: vi.fn(),
      setTranslations: vi.fn(),
      setUtterances: vi.fn(),
    }));

    await act(async () => {
      await result.current.deleteLayer('layer_trl_1', { keepUtterances: true });
    });

    expect(mockLayerSegmentContentsDelete).toHaveBeenCalledTimes(1);
    expect(mockLayerSegmentsDelete).toHaveBeenCalledTimes(1);
    expect(mockSegmentLinksBulkDelete).toHaveBeenCalledWith(['link_source', 'link_target']);
    expect(mockDeleteLayer).toHaveBeenCalledTimes(1);
    expect(mockRemoveBySelectorUtteranceTexts).toHaveBeenCalledWith({ layerId: 'layer_trl_1' });
    expect(mockRemoveUtterancesBatch).not.toHaveBeenCalled();
  });
});
