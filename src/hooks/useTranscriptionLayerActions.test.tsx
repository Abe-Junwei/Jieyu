// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useTranscriptionLayerActions } from './useTranscriptionLayerActions';

const {
  mockCountSegmentContentsByLayerId,
  mockGetDb,
  mockCreateLayer,
  mockDeleteLayer,
  mockDeleteLayerSegmentGraphByLayerId,
  mockRemoveUtterancesBatch,
  mockLayerSegmentsWhereLayerIdToArray,
  mockRemoveBySelectorLayerLinks,
  mockLayerLinksToArray,
  mockUtterancesWhereTextIdPrimaryKeys,
  mockListUtteranceTextsByUtterances,
} = vi.hoisted(() => ({
  mockCountSegmentContentsByLayerId: vi.fn(async () => 0),
  mockGetDb: vi.fn(),
  mockCreateLayer: vi.fn(async () => undefined),
  mockDeleteLayer: vi.fn(async () => undefined),
  mockDeleteLayerSegmentGraphByLayerId: vi.fn(async () => ({
    affectedUtteranceIds: [],
    deletedSegmentIds: [],
  })),
  mockRemoveUtterancesBatch: vi.fn(async () => undefined),
  mockLayerSegmentsWhereLayerIdToArray: vi.fn(async () => []),
  mockRemoveBySelectorLayerLinks: vi.fn(async () => undefined),
  mockLayerLinksToArray: vi.fn(async () => []),
  mockUtterancesWhereTextIdPrimaryKeys: vi.fn<() => Promise<string[]>>(async () => []),
  mockListUtteranceTextsByUtterances: vi.fn(async () => []),
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
    createLayer: mockCreateLayer,
    deleteLayer: mockDeleteLayer,
  },
}));

vi.mock('../services/LinguisticService', () => ({
  LinguisticService: {
    removeUtterancesBatch: mockRemoveUtterancesBatch,
  },
}));

vi.mock('../services/LayerSegmentationTextService', () => ({
  listUtteranceTextsByUtterances: mockListUtteranceTextsByUtterances,
}));

vi.mock('../services/LayerSegmentQueryService', () => ({
  LayerSegmentQueryService: {
    countSegmentContentsByLayerId: mockCountSegmentContentsByLayerId,
  },
}));

vi.mock('../services/LayerUnitLegacyBridgeService', () => ({
  deleteLayerSegmentGraphByLayerId: mockDeleteLayerSegmentGraphByLayerId,
}));

describe('useTranscriptionLayerActions v2 cleanup', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockGetDb.mockResolvedValue({
      collections: {
        layer_links: {
          removeBySelector: mockRemoveBySelectorLayerLinks,
          insert: vi.fn(async () => undefined),
        },
      },
      dexie: {
        layer_segments: {
          where: () => ({
            equals: () => ({
              toArray: mockLayerSegmentsWhereLayerIdToArray,
            }),
          }),
        },
        layer_links: {
          toArray: mockLayerLinksToArray,
        },
        utterances: {
          where: (field: string) => {
            if (field === 'textId') {
              return {
                equals: () => ({
                  primaryKeys: mockUtterancesWhereTextIdPrimaryKeys,
                }),
              };
            }
            throw new Error(`Unexpected utterances.where field: ${field}`);
          },
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
      setSelectedUtteranceIds: vi.fn(),
      setTranslations: vi.fn(),
      setUtterances: vi.fn(),
    }));

    await act(async () => {
      await result.current.deleteLayer('layer_trl_1', { keepUtterances: true });
    });

    expect(mockDeleteLayerSegmentGraphByLayerId).toHaveBeenCalledWith(expect.anything(), 'layer_trl_1');
    expect(mockDeleteLayer).toHaveBeenCalledTimes(1);
    expect(mockRemoveUtterancesBatch).not.toHaveBeenCalled();
  });

  it('delegates layer content counting to the canonical query helper', async () => {
    mockCountSegmentContentsByLayerId.mockResolvedValueOnce(4);

    const { result } = renderHook(() => useTranscriptionLayerActions({
      layers: [],
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
      setSelectedUtteranceIds: vi.fn(),
      setTranslations: vi.fn(),
      setUtterances: vi.fn(),
    }));

    await expect(result.current.checkLayerHasContent('layer_count_1')).resolves.toBe(4);
    expect(mockCountSegmentContentsByLayerId).toHaveBeenCalledWith('layer_count_1');
  });

  it('sets parentLayerId when creating a translation layer', async () => {
    const now = '2026-03-25T00:00:00.000Z';
    const trcLayer = {
      id: 'layer_trc_1',
      textId: 'text_1',
      key: 'trc_zh_1',
      name: { zho: '转写层1' },
      layerType: 'transcription',
      languageId: 'zho',
      modality: 'text',
      acceptsAudio: false,
      sortOrder: 0,
      createdAt: now,
      updatedAt: now,
    };

    const { result } = renderHook(() => useTranscriptionLayerActions({
      layers: [trcLayer as never],
      layerLinks: [],
      layerToDeleteId: '',
      selectedLayerId: trcLayer.id,
      utterancesRef: { current: [{ id: 'utt_1', textId: 'text_1' }] as never[] },
      pushUndo: vi.fn(),
      setLayerCreateMessage: vi.fn(),
      setLayers: vi.fn(),
      setLayerLinks: vi.fn(),
      setLayerToDeleteId: vi.fn(),
      setShowLayerManager: vi.fn(),
      setSelectedLayerId: vi.fn(),
      setSelectedMediaId: vi.fn(),
      setMediaItems: vi.fn(),
      setSelectedUtteranceIds: vi.fn(),
      setTranslations: vi.fn(),
      setUtterances: vi.fn(),
    }));

    await act(async () => {
      await result.current.createLayer('translation', { languageId: 'eng', textId: 'text_1' }, 'text');
    });

    expect(mockCreateLayer).toHaveBeenCalled();
    const createCalls = mockCreateLayer.mock.calls as unknown[][];
    const lastCallIndex = createCalls.length - 1;
    const created = (lastCallIndex >= 0
      ? createCalls[lastCallIndex]?.[0]
      : undefined) as { parentLayerId?: string } | undefined;
    expect(created?.parentLayerId).toBe('layer_trc_1');
  });

  it('passes through translation constraints that are runtime-enabled', async () => {
    const now = '2026-03-25T00:00:00.000Z';
    const trcLayer = {
      id: 'layer_trc_c',
      textId: 'text_1',
      key: 'trc_base',
      name: { zho: '转写基底层' },
      layerType: 'transcription',
      languageId: 'zho',
      modality: 'text',
      acceptsAudio: false,
      sortOrder: 0,
      createdAt: now,
      updatedAt: now,
    };

    const { result } = renderHook(() => useTranscriptionLayerActions({
      layers: [trcLayer as never],
      layerLinks: [],
      layerToDeleteId: '',
      selectedLayerId: trcLayer.id,
      utterancesRef: { current: [{ id: 'utt_1', textId: 'text_1' }] as never[] },
      pushUndo: vi.fn(),
      setLayerCreateMessage: vi.fn(),
      setLayers: vi.fn(),
      setLayerLinks: vi.fn(),
      setLayerToDeleteId: vi.fn(),
      setShowLayerManager: vi.fn(),
      setSelectedLayerId: vi.fn(),
      setSelectedMediaId: vi.fn(),
      setMediaItems: vi.fn(),
      setSelectedUtteranceIds: vi.fn(),
      setTranslations: vi.fn(),
      setUtterances: vi.fn(),
    }));

    const constraints = ['symbolic_association', 'independent_boundary'] as const;
    for (const constraint of constraints) {
      await act(async () => {
        await result.current.createLayer('translation', { languageId: `lng_${constraint}`, textId: 'text_1', constraint }, 'text');
      });
    }

    await act(async () => {
      await result.current.createLayer('translation', { languageId: 'lng_sub', textId: 'text_1', constraint: 'time_subdivision' }, 'text');
    });

    const createCalls = mockCreateLayer.mock.calls as unknown[][];
    const createdConstraints = createCalls
      .map((call) => call[0] as { constraint?: string })
      .map((doc) => doc.constraint)
      .filter((value): value is string => typeof value === 'string');

    expect(createdConstraints).toEqual(expect.arrayContaining(['symbolic_association', 'independent_boundary', 'time_subdivision']));
  });

  it('creates first transcription layer with explicit independent_boundary constraint', async () => {
    const { result } = renderHook(() => useTranscriptionLayerActions({
      layers: [],
      layerLinks: [],
      layerToDeleteId: '',
      selectedLayerId: '',
      utterancesRef: { current: [{ id: 'utt_1', textId: 'text_1' }] as never[] },
      pushUndo: vi.fn(),
      setLayerCreateMessage: vi.fn(),
      setLayers: vi.fn(),
      setLayerLinks: vi.fn(),
      setLayerToDeleteId: vi.fn(),
      setShowLayerManager: vi.fn(),
      setSelectedLayerId: vi.fn(),
      setSelectedMediaId: vi.fn(),
      setMediaItems: vi.fn(),
      setSelectedUtteranceIds: vi.fn(),
      setTranslations: vi.fn(),
      setUtterances: vi.fn(),
    }));

    await act(async () => {
      await result.current.createLayer('transcription', { languageId: 'zho', textId: 'text_1' }, 'text');
    });

    const createCalls = mockCreateLayer.mock.calls as unknown[][];
    const lastCallIndex = createCalls.length - 1;
    const created = (lastCallIndex >= 0
      ? createCalls[lastCallIndex]?.[0]
      : undefined) as { constraint?: string } | undefined;
    expect(created?.constraint).toBe('independent_boundary');
  });

  it('cascade-deletes dependent translation layers when deleting the last transcription layer', async () => {
    const now = '2026-03-25T00:00:00.000Z';
    const trcLayer = {
      id: 'layer_trc_1',
      textId: 'text_1',
      key: 'trc_zh_1',
      name: { zho: '转写层1' },
      layerType: 'transcription',
      languageId: 'zho',
      modality: 'text',
      acceptsAudio: false,
      sortOrder: 0,
      createdAt: now,
      updatedAt: now,
    };
    const trlLayer = {
      id: 'layer_trl_1',
      textId: 'text_1',
      key: 'trl_en_1',
      name: { zho: '翻译层1' },
      layerType: 'translation',
      languageId: 'eng',
      modality: 'text',
      acceptsAudio: false,
      parentLayerId: 'layer_trc_1',
      sortOrder: 1,
      createdAt: now,
      updatedAt: now,
    };

    mockLayerLinksToArray.mockResolvedValue([
      {
        id: 'link_1',
        transcriptionLayerKey: 'trc_zh_1',
        layerId: 'layer_trl_1',
        linkType: 'direct',
        isPreferred: true,
        createdAt: now,
      },
    ] as never[]);

    const setLayerCreateMessage = vi.fn();
    const { result } = renderHook(() => useTranscriptionLayerActions({
      layers: [trcLayer as never, trlLayer as never],
      layerLinks: [],
      layerToDeleteId: '',
      selectedLayerId: '',
      utterancesRef: { current: [] },
      pushUndo: vi.fn(),
      setLayerCreateMessage,
      setLayers: vi.fn(),
      setLayerLinks: vi.fn(),
      setLayerToDeleteId: vi.fn(),
      setShowLayerManager: vi.fn(),
      setSelectedLayerId: vi.fn(),
      setSelectedMediaId: vi.fn(),
      setMediaItems: vi.fn(),
      setSelectedUtteranceIds: vi.fn(),
      setTranslations: vi.fn(),
      setUtterances: vi.fn(),
    }));

    await act(async () => {
      await result.current.deleteLayer('layer_trc_1', { keepUtterances: true });
    });

    expect(mockDeleteLayer).toHaveBeenCalledTimes(2);
    expect(mockDeleteLayer).toHaveBeenNthCalledWith(1, expect.objectContaining({ id: 'layer_trl_1' }));
    expect(mockDeleteLayer).toHaveBeenNthCalledWith(2, expect.objectContaining({ id: 'layer_trc_1' }));
    expect(setLayerCreateMessage).toHaveBeenCalledWith(expect.stringContaining('自动级联删除 1 个依赖翻译层'));
  });

  it('removes project utterance boundaries when deleting the last transcription layer with keepUtterances=false', async () => {
    const now = '2026-03-25T00:00:00.000Z';
    const trcLayer = {
      id: 'layer_trc_last',
      textId: 'text_1',
      key: 'trc_zh_last',
      name: { zho: '最后转写层' },
      layerType: 'transcription',
      languageId: 'zho',
      modality: 'text',
      acceptsAudio: false,
      sortOrder: 0,
      createdAt: now,
      updatedAt: now,
    };

    mockLayerLinksToArray.mockResolvedValue([]);
    mockLayerSegmentsWhereLayerIdToArray.mockResolvedValue([]);
    mockUtterancesWhereTextIdPrimaryKeys.mockResolvedValue(['utt_100', 'utt_101']);
    mockListUtteranceTextsByUtterances.mockResolvedValue([]);

    const { result } = renderHook(() => useTranscriptionLayerActions({
      layers: [trcLayer as never],
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
      setSelectedUtteranceIds: vi.fn(),
      setTranslations: vi.fn(),
      setUtterances: vi.fn(),
    }));

    await act(async () => {
      await result.current.deleteLayer('layer_trc_last', { keepUtterances: false });
    });

    expect(mockUtterancesWhereTextIdPrimaryKeys).toHaveBeenCalledTimes(1);
    expect(mockRemoveUtterancesBatch).toHaveBeenCalledWith(['utt_100', 'utt_101']);
  });

  it('blocks creating translation when same-language transcription exists', async () => {
    const now = '2026-03-25T00:00:00.000Z';
    const trcLayer = {
      id: 'layer_trc_conflict',
      textId: 'text_1',
      key: 'trc_zh_1',
      name: { zho: '转写层1' },
      layerType: 'transcription',
      languageId: 'zho',
      modality: 'text',
      acceptsAudio: false,
      sortOrder: 0,
      createdAt: now,
      updatedAt: now,
    };

    const setLayerCreateMessage = vi.fn();
    const { result } = renderHook(() => useTranscriptionLayerActions({
      layers: [trcLayer as never],
      layerLinks: [],
      layerToDeleteId: '',
      selectedLayerId: '',
      utterancesRef: { current: [{ id: 'utt_1', textId: 'text_1' }] as never[] },
      pushUndo: vi.fn(),
      setLayerCreateMessage,
      setLayers: vi.fn(),
      setLayerLinks: vi.fn(),
      setLayerToDeleteId: vi.fn(),
      setShowLayerManager: vi.fn(),
      setSelectedLayerId: vi.fn(),
      setSelectedMediaId: vi.fn(),
      setMediaItems: vi.fn(),
      setSelectedUtteranceIds: vi.fn(),
      setTranslations: vi.fn(),
      setUtterances: vi.fn(),
    }));

    await act(async () => {
      await result.current.createLayer('translation', { languageId: 'ZHO', textId: 'text_1' }, 'text');
    });

    expect(mockCreateLayer).not.toHaveBeenCalled();
    expect(setLayerCreateMessage).toHaveBeenCalledWith(expect.stringContaining('禁止与翻译层同语言'));
  });

  it('blocks creating transcription when same-language translation exists', async () => {
    const now = '2026-03-25T00:00:00.000Z';
    const trlLayer = {
      id: 'layer_trl_conflict',
      textId: 'text_1',
      key: 'trl_en_1',
      name: { zho: '翻译层1' },
      layerType: 'translation',
      languageId: 'eng',
      modality: 'text',
      acceptsAudio: false,
      sortOrder: 0,
      createdAt: now,
      updatedAt: now,
    };

    const setLayerCreateMessage = vi.fn();
    const { result } = renderHook(() => useTranscriptionLayerActions({
      layers: [trlLayer as never],
      layerLinks: [],
      layerToDeleteId: '',
      selectedLayerId: '',
      utterancesRef: { current: [{ id: 'utt_1', textId: 'text_1' }] as never[] },
      pushUndo: vi.fn(),
      setLayerCreateMessage,
      setLayers: vi.fn(),
      setLayerLinks: vi.fn(),
      setLayerToDeleteId: vi.fn(),
      setShowLayerManager: vi.fn(),
      setSelectedLayerId: vi.fn(),
      setSelectedMediaId: vi.fn(),
      setMediaItems: vi.fn(),
      setSelectedUtteranceIds: vi.fn(),
      setTranslations: vi.fn(),
      setUtterances: vi.fn(),
    }));

    await act(async () => {
      await result.current.createLayer('transcription', { languageId: 'ENG', textId: 'text_1' }, 'text');
    });

    expect(mockCreateLayer).not.toHaveBeenCalled();
    expect(setLayerCreateMessage).toHaveBeenCalledWith(expect.stringContaining('禁止与转写层同语言'));
  });

  it('blocks creating same-language transcription without alias (case-insensitive)', async () => {
    const now = '2026-03-25T00:00:00.000Z';
    const trcLayer = {
      id: 'layer_trc_dup',
      textId: 'text_1',
      key: 'trc_cmn_1',
      name: { zho: '转写层A' },
      layerType: 'transcription',
      languageId: 'cmn',
      modality: 'text',
      acceptsAudio: false,
      sortOrder: 0,
      createdAt: now,
      updatedAt: now,
    };

    const setLayerCreateMessage = vi.fn();
    const { result } = renderHook(() => useTranscriptionLayerActions({
      layers: [trcLayer as never],
      layerLinks: [],
      layerToDeleteId: '',
      selectedLayerId: '',
      utterancesRef: { current: [{ id: 'utt_1', textId: 'text_1' }] as never[] },
      pushUndo: vi.fn(),
      setLayerCreateMessage,
      setLayers: vi.fn(),
      setLayerLinks: vi.fn(),
      setLayerToDeleteId: vi.fn(),
      setShowLayerManager: vi.fn(),
      setSelectedLayerId: vi.fn(),
      setSelectedMediaId: vi.fn(),
      setMediaItems: vi.fn(),
      setSelectedUtteranceIds: vi.fn(),
      setTranslations: vi.fn(),
      setUtterances: vi.fn(),
    }));

    await act(async () => {
      await result.current.createLayer('transcription', { languageId: 'CMN', textId: 'text_1' }, 'text');
    });

    expect(mockCreateLayer).not.toHaveBeenCalled();
    expect(setLayerCreateMessage).toHaveBeenCalledWith(expect.stringContaining('该语言已存在转写层'));
  });
});
