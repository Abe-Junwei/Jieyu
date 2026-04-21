// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LayerDocType } from '../db';
import { useTranscriptionLayerActions } from './useTranscriptionLayerActions';

const {
  mockCountSegmentContentsByLayerId,
  mockGetDb,
  mockCreateLayer,
  mockDeleteLayer,
  mockInsertLayerLink,
  mockRemoveLayerLink,
  mockUpdateLayerLink,
  mockUpdateLayer,
  mockUpdateLayerSortOrder,
  mockDeleteLayerSegmentGraphByLayerId,
  mockRemoveUnitsBatch,
  mockLayerSegmentsWhereLayerIdToArray,
  mockRemoveBySelectorLayerLinks,
  mockLayerLinksToArray,
  mockUnitsWhereTextIdPrimaryKeys,
  mockListUnitTextsByUnits,
  mockSaveUnit,
  mockCreateSegment,
} = vi.hoisted(() => ({
  mockCountSegmentContentsByLayerId: vi.fn(async () => 0),
  mockGetDb: vi.fn(),
  mockCreateLayer: vi.fn(async () => undefined),
  mockDeleteLayer: vi.fn(async () => undefined),
  mockInsertLayerLink: vi.fn(async () => undefined),
  mockRemoveLayerLink: vi.fn(async () => undefined),
  mockUpdateLayerLink: vi.fn(async () => undefined),
  mockUpdateLayer: vi.fn(async () => undefined),
  mockUpdateLayerSortOrder: vi.fn(async () => undefined),
  mockDeleteLayerSegmentGraphByLayerId: vi.fn(async () => ({
    affectedUnitIds: [],
    deletedSegmentIds: [],
  })),
  mockRemoveUnitsBatch: vi.fn(async () => undefined),
  mockLayerSegmentsWhereLayerIdToArray: vi.fn(async () => []),
  mockRemoveBySelectorLayerLinks: vi.fn(async () => undefined),
  mockLayerLinksToArray: vi.fn(async () => []),
  mockUnitsWhereTextIdPrimaryKeys: vi.fn<() => Promise<string[]>>(async () => []),
  mockListUnitTextsByUnits: vi.fn(async () => []),
  mockSaveUnit: vi.fn(async () => 'utt_1'),
  mockCreateSegment: vi.fn(async () => undefined),
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
    updateLayer: mockUpdateLayer,
    updateLayerSortOrder: mockUpdateLayerSortOrder,
  },
}));

vi.mock('../services/LinguisticService', () => ({
  LinguisticService: {
    removeUnitsBatch: mockRemoveUnitsBatch,
    saveUnit: mockSaveUnit,
  },
}));

vi.mock('../services/LayerSegmentationV2Service', () => ({
  LayerSegmentationV2Service: {
    createSegment: mockCreateSegment,
  },
}));

vi.mock('../services/LayerSegmentationTextService', () => ({
  listUnitTextsByUnits: mockListUnitTextsByUnits,
}));

vi.mock('../services/LayerSegmentQueryService', () => ({
  LayerSegmentQueryService: {
    countSegmentContentsByLayerId: mockCountSegmentContentsByLayerId,
  },
}));

vi.mock('../services/LayerSegmentGraphService', () => ({
  deleteLayerSegmentGraphByLayerId: mockDeleteLayerSegmentGraphByLayerId,
  listUnitUnitPrimaryKeysByTextId: (_db: unknown, _textId: string) => mockUnitsWhereTextIdPrimaryKeys(),
}));

describe('useTranscriptionLayerActions v2 cleanup', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockGetDb.mockResolvedValue({
      collections: {
        layer_links: {
          remove: mockRemoveLayerLink,
          removeBySelector: mockRemoveBySelectorLayerLinks,
          insert: mockInsertLayerLink,
          update: mockUpdateLayerLink,
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
      unitsRef: { current: [] },
      pushUndo: vi.fn(),
      setLayerCreateMessage: vi.fn(),
      setLayers: vi.fn(),
      setLayerLinks: vi.fn(),
      setLayerToDeleteId: vi.fn(),
      setShowLayerManager: vi.fn(),
      setSelectedLayerId: vi.fn(),
      setSelectedMediaId: vi.fn(),
      setMediaItems: vi.fn(),
      setSelectedUnitIds: vi.fn(),
      setTranslations: vi.fn(),
      setUnits: vi.fn(),
    }));

    await act(async () => {
      await result.current.deleteLayer('layer_trl_1', { keepUnits: true });
    });

    expect(mockDeleteLayerSegmentGraphByLayerId).toHaveBeenCalledWith(expect.anything(), 'layer_trl_1');
    expect(mockDeleteLayer).toHaveBeenCalledTimes(1);
    expect(mockRemoveUnitsBatch).not.toHaveBeenCalled();
  });

  it('delegates layer content counting to the canonical query helper', async () => {
    mockCountSegmentContentsByLayerId.mockResolvedValueOnce(4);

    const { result } = renderHook(() => useTranscriptionLayerActions({
      layers: [],
      layerLinks: [],
      layerToDeleteId: '',
      selectedLayerId: '',
      unitsRef: { current: [] },
      pushUndo: vi.fn(),
      setLayerCreateMessage: vi.fn(),
      setLayers: vi.fn(),
      setLayerLinks: vi.fn(),
      setLayerToDeleteId: vi.fn(),
      setShowLayerManager: vi.fn(),
      setSelectedLayerId: vi.fn(),
      setSelectedMediaId: vi.fn(),
      setMediaItems: vi.fn(),
      setSelectedUnitIds: vi.fn(),
      setTranslations: vi.fn(),
      setUnits: vi.fn(),
    }));

    await expect(result.current.checkLayerHasContent('layer_count_1')).resolves.toBe(4);
    expect(mockCountSegmentContentsByLayerId).toHaveBeenCalledWith('layer_count_1');
  });

  it('replaces an existing media item with the same id instead of appending a duplicate', () => {
    const setMediaItems = vi.fn();
    const setSelectedMediaId = vi.fn();

    const { result } = renderHook(() => useTranscriptionLayerActions({
      layers: [],
      layerLinks: [],
      layerToDeleteId: '',
      selectedLayerId: '',
      unitsRef: { current: [] },
      pushUndo: vi.fn(),
      setLayerCreateMessage: vi.fn(),
      setLayers: vi.fn(),
      setLayerLinks: vi.fn(),
      setLayerToDeleteId: vi.fn(),
      setShowLayerManager: vi.fn(),
      setSelectedLayerId: vi.fn(),
      setSelectedMediaId,
      setMediaItems,
      setSelectedUnitIds: vi.fn(),
      setTranslations: vi.fn(),
      setUnits: vi.fn(),
    }));

    const existing = {
      id: 'media_1',
      textId: 'text_1',
      filename: 'document-placeholder.track',
      duration: 10,
      details: { placeholder: true, timelineMode: 'document' },
      isOfflineCached: true,
      createdAt: '2026-03-25T00:00:00.000Z',
    };
    const other = {
      id: 'media_2',
      textId: 'text_1',
      filename: 'other.wav',
      duration: 5,
      details: {},
      isOfflineCached: true,
      createdAt: '2026-03-25T00:00:00.000Z',
    };
    const replacement = {
      ...existing,
      filename: 'updated.wav',
      duration: 18,
      details: { audioBlob: new Blob(['updated'], { type: 'audio/wav' }) },
    };

    act(() => {
      result.current.addMediaItem(replacement as never);
    });

    expect(setSelectedMediaId).toHaveBeenCalledWith('media_1');
    expect(setMediaItems).toHaveBeenCalledTimes(1);
    const updater = setMediaItems.mock.calls[0]?.[0] as ((items: Array<typeof existing | typeof other>) => Array<typeof existing | typeof other>);
    const next = updater([existing, other]);
    expect(next).toHaveLength(2);
    expect(next[0]).toEqual(replacement);
    expect(next[1]).toEqual(other);
  });

  it('creates host link when creating a translation layer', async () => {
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
      unitsRef: { current: [{ id: 'utt_1', textId: 'text_1' }] as never[] },
      pushUndo: vi.fn(),
      setLayerCreateMessage: vi.fn(),
      setLayers: vi.fn(),
      setLayerLinks: vi.fn(),
      setLayerToDeleteId: vi.fn(),
      setShowLayerManager: vi.fn(),
      setSelectedLayerId: vi.fn(),
      setSelectedMediaId: vi.fn(),
      setMediaItems: vi.fn(),
      setSelectedUnitIds: vi.fn(),
      setTranslations: vi.fn(),
      setUnits: vi.fn(),
    }));

    await act(async () => {
      await result.current.createLayer('translation', { languageId: 'eng', textId: 'text_1' }, 'text');
    });

    expect(mockCreateLayer).toHaveBeenCalled();
    expect(mockInsertLayerLink).toHaveBeenCalledWith(expect.objectContaining({
      transcriptionLayerKey: 'trc_zh_1',
      layerId: expect.any(String),
    }));
  });

  it('passes through supported translation constraints that remain enabled', async () => {
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
      unitsRef: { current: [{ id: 'utt_1', textId: 'text_1' }] as never[] },
      pushUndo: vi.fn(),
      setLayerCreateMessage: vi.fn(),
      setLayers: vi.fn(),
      setLayerLinks: vi.fn(),
      setLayerToDeleteId: vi.fn(),
      setShowLayerManager: vi.fn(),
      setSelectedLayerId: vi.fn(),
      setSelectedMediaId: vi.fn(),
      setMediaItems: vi.fn(),
      setSelectedUnitIds: vi.fn(),
      setTranslations: vi.fn(),
      setUnits: vi.fn(),
    }));

    const constraintInputs = [
      { constraint: 'symbolic_association' as const, languageId: 'eng' },
      { constraint: 'time_subdivision' as const, languageId: 'fra' },
    ];
    for (const { constraint, languageId } of constraintInputs) {
      await act(async () => {
        await result.current.createLayer('translation', { languageId, textId: 'text_1', constraint }, 'text');
      });
    }

    const createCalls = mockCreateLayer.mock.calls as unknown[][];
    const createdConstraints = createCalls
      .map((call) => call[0] as { constraint?: string })
      .map((doc) => doc.constraint)
      .filter((value): value is string => typeof value === 'string');

    expect(createdConstraints).toEqual(expect.arrayContaining(['symbolic_association', 'time_subdivision']));
  });

  it('blocks translation independent_boundary creation in the action layer', async () => {
    const now = '2026-03-25T00:00:00.000Z';
    const trcLayer = {
      id: 'layer_trc_ind',
      textId: 'text_1',
      key: 'trc_base',
      name: { zho: '转写基底层' },
      layerType: 'transcription',
      languageId: 'zho',
      modality: 'text',
      acceptsAudio: false,
      constraint: 'independent_boundary',
      sortOrder: 0,
      createdAt: now,
      updatedAt: now,
    };

    const setLayerCreateMessage = vi.fn();
    const { result } = renderHook(() => useTranscriptionLayerActions({
      layers: [trcLayer as never],
      layerLinks: [],
      layerToDeleteId: '',
      selectedLayerId: trcLayer.id,
      unitsRef: { current: [{ id: 'utt_1', textId: 'text_1' }] as never[] },
      pushUndo: vi.fn(),
      setLayerCreateMessage,
      setLayers: vi.fn(),
      setLayerLinks: vi.fn(),
      setLayerToDeleteId: vi.fn(),
      setShowLayerManager: vi.fn(),
      setSelectedLayerId: vi.fn(),
      setSelectedMediaId: vi.fn(),
      setMediaItems: vi.fn(),
      setSelectedUnitIds: vi.fn(),
      setTranslations: vi.fn(),
      setUnits: vi.fn(),
    }));

    await act(async () => {
      await result.current.createLayer('translation', {
        languageId: 'eng',
        textId: 'text_1',
        constraint: 'independent_boundary',
      }, 'text');
    });

    expect(mockCreateLayer).not.toHaveBeenCalled();
    expect(setLayerCreateMessage).toHaveBeenCalledWith(expect.stringContaining('翻译层不支持独立边界'));
  });

  it('requires explicit parent selection when multiple independent transcription parents exist', async () => {
    const now = '2026-03-25T00:00:00.000Z';
    const parentA = {
      id: 'layer_trc_a',
      textId: 'text_1',
      key: 'trc_a',
      name: { zho: '转写层A' },
      layerType: 'transcription',
      languageId: 'zho',
      modality: 'text',
      acceptsAudio: false,
      constraint: 'independent_boundary',
      sortOrder: 0,
      createdAt: now,
      updatedAt: now,
    };
    const parentB = {
      id: 'layer_trc_b',
      textId: 'text_1',
      key: 'trc_b',
      name: { zho: '转写层B' },
      layerType: 'transcription',
      languageId: 'eng',
      modality: 'text',
      acceptsAudio: false,
      constraint: 'independent_boundary',
      sortOrder: 1,
      createdAt: now,
      updatedAt: now,
    };

    const setLayerCreateMessage = vi.fn();
    const { result } = renderHook(() => useTranscriptionLayerActions({
      layers: [parentA as never, parentB as never],
      layerLinks: [],
      layerToDeleteId: '',
      selectedLayerId: parentA.id,
      unitsRef: { current: [{ id: 'utt_1', textId: 'text_1' }] as never[] },
      pushUndo: vi.fn(),
      setLayerCreateMessage,
      setLayers: vi.fn(),
      setLayerLinks: vi.fn(),
      setLayerToDeleteId: vi.fn(),
      setShowLayerManager: vi.fn(),
      setSelectedLayerId: vi.fn(),
      setSelectedMediaId: vi.fn(),
      setMediaItems: vi.fn(),
      setSelectedUnitIds: vi.fn(),
      setTranslations: vi.fn(),
      setUnits: vi.fn(),
    }));

    await act(async () => {
      await result.current.createLayer('translation', { languageId: 'fra', textId: 'text_1' }, 'text');
    });

    expect(mockCreateLayer).not.toHaveBeenCalled();
    expect(setLayerCreateMessage.mock.calls[setLayerCreateMessage.mock.calls.length - 1]?.[0]).toContain('请先选择要依赖的边界层');

    await act(async () => {
      await result.current.createLayer('translation', {
        languageId: 'fra',
        textId: 'text_1',
        hostTranscriptionLayerIds: ['layer_trc_b'],
        preferredHostTranscriptionLayerId: 'layer_trc_b',
      }, 'text');
    });

    expect(mockInsertLayerLink).toHaveBeenCalledWith(expect.objectContaining({
      transcriptionLayerKey: 'trc_b',
      layerId: expect.any(String),
    }));
  });

  it('creates first transcription layer with explicit independent_boundary constraint', async () => {
    const { result } = renderHook(() => useTranscriptionLayerActions({
      layers: [],
      layerLinks: [],
      layerToDeleteId: '',
      selectedLayerId: '',
      unitsRef: { current: [{ id: 'utt_1', textId: 'text_1' }] as never[] },
      pushUndo: vi.fn(),
      setLayerCreateMessage: vi.fn(),
      setLayers: vi.fn(),
      setLayerLinks: vi.fn(),
      setLayerToDeleteId: vi.fn(),
      setShowLayerManager: vi.fn(),
      setSelectedLayerId: vi.fn(),
      setSelectedMediaId: vi.fn(),
      setMediaItems: vi.fn(),
      setSelectedUnitIds: vi.fn(),
      setTranslations: vi.fn(),
      setUnits: vi.fn(),
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
    expect(mockSaveUnit).toHaveBeenCalledTimes(1);
    expect(mockCreateSegment).not.toHaveBeenCalled();
  });

  it('when adding the first transcription layer, persists pending units and creates parent-linked segments for audio rows', async () => {
    mockSaveUnit.mockResolvedValue('utt_pre');
    const pendingUnit = {
      id: 'utt_pre',
      textId: 'text_1',
      mediaId: 'media_wav',
      startTime: 1.2,
      endTime: 3.4,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    const { result } = renderHook(() => useTranscriptionLayerActions({
      layers: [],
      layerLinks: [],
      layerToDeleteId: '',
      selectedLayerId: '',
      unitsRef: { current: [pendingUnit as never] },
      pushUndo: vi.fn(),
      setLayerCreateMessage: vi.fn(),
      setLayers: vi.fn(),
      setLayerLinks: vi.fn(),
      setLayerToDeleteId: vi.fn(),
      setShowLayerManager: vi.fn(),
      setSelectedLayerId: vi.fn(),
      setSelectedMediaId: vi.fn(),
      setMediaItems: vi.fn(),
      setSelectedUnitIds: vi.fn(),
      setTranslations: vi.fn(),
      setUnits: vi.fn(),
    }));

    await act(async () => {
      await result.current.createLayer('transcription', { languageId: 'zho', textId: 'text_1' }, 'text');
    });

    expect(mockSaveUnit).toHaveBeenCalledWith(pendingUnit);
    expect(mockCreateSegment).toHaveBeenCalledTimes(1);
    const layerCalls = mockCreateLayer.mock.calls as unknown[][];
    const createdLayer = (layerCalls[0]?.[0] ?? {}) as { id: string; constraint?: string };
    const segCalls = mockCreateSegment.mock.calls as unknown[][];
    const seg = segCalls[0]?.[0] as {
      layerId: string;
      unitId: string;
      mediaId: string;
      startTime: number;
      endTime: number;
    };
    expect(createdLayer.constraint).toBe('independent_boundary');
    expect(seg.layerId).toBe(createdLayer.id);
    expect(seg.unitId).toBe('utt_pre');
    expect(seg.mediaId).toBe('media_wav');
    expect(seg.startTime).toBe(1.2);
    expect(seg.endTime).toBe(3.4);
  });

  it('still updates React layer list when adopting pending units fails (DB layer already inserted)', async () => {
    mockSaveUnit.mockRejectedValueOnce(new Error('simulated persist failure'));
    const pendingUnit = {
      id: 'utt_pre',
      textId: 'text_1',
      mediaId: 'media_wav',
      startTime: 0,
      endTime: 1,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    const setLayers = vi.fn();
    const { result } = renderHook(() => useTranscriptionLayerActions({
      layers: [],
      layerLinks: [],
      layerToDeleteId: '',
      selectedLayerId: '',
      unitsRef: { current: [pendingUnit as never] },
      pushUndo: vi.fn(),
      setLayerCreateMessage: vi.fn(),
      setLayers,
      setLayerLinks: vi.fn(),
      setLayerToDeleteId: vi.fn(),
      setShowLayerManager: vi.fn(),
      setSelectedLayerId: vi.fn(),
      setSelectedMediaId: vi.fn(),
      setMediaItems: vi.fn(),
      setSelectedUnitIds: vi.fn(),
      setTranslations: vi.fn(),
      setUnits: vi.fn(),
    }));

    await act(async () => {
      const ok = await result.current.createLayer('transcription', { languageId: 'zho', textId: 'text_1' }, 'text');
      expect(ok).toBe(true);
    });

    expect(setLayers).toHaveBeenCalled();
    expect(mockCreateSegment).not.toHaveBeenCalled();
  });

  it('canonicalizes sort order after creating a dependent translation layer', async () => {
    const now = '2026-03-25T00:00:00.000Z';
    const rootA = {
      id: 'layer_trc_a',
      textId: 'text_1',
      key: 'trc_a',
      name: { zho: '转写层A' },
      layerType: 'transcription',
      languageId: 'zho',
      modality: 'text',
      acceptsAudio: false,
      constraint: 'independent_boundary',
      sortOrder: 0,
      createdAt: now,
      updatedAt: now,
    };
    const rootB = {
      id: 'layer_trc_b',
      textId: 'text_1',
      key: 'trc_b',
      name: { zho: '转写层B' },
      layerType: 'transcription',
      languageId: 'eng',
      modality: 'text',
      acceptsAudio: false,
      constraint: 'independent_boundary',
      sortOrder: 1,
      createdAt: now,
      updatedAt: now,
    };

    const { result } = renderHook(() => useTranscriptionLayerActions({
      layers: [rootA as never, rootB as never],
      layerLinks: [],
      layerToDeleteId: '',
      selectedLayerId: rootB.id,
      unitsRef: { current: [{ id: 'utt_1', textId: 'text_1' }] as never[] },
      pushUndo: vi.fn(),
      setLayerCreateMessage: vi.fn(),
      setLayers: vi.fn(),
      setLayerLinks: vi.fn(),
      setLayerToDeleteId: vi.fn(),
      setShowLayerManager: vi.fn(),
      setSelectedLayerId: vi.fn(),
      setSelectedMediaId: vi.fn(),
      setMediaItems: vi.fn(),
      setSelectedUnitIds: vi.fn(),
      setTranslations: vi.fn(),
      setUnits: vi.fn(),
    }));

    await act(async () => {
      await result.current.createLayer('translation', {
        languageId: 'fra',
        textId: 'text_1',
        hostTranscriptionLayerIds: [rootA.id],
        preferredHostTranscriptionLayerId: rootA.id,
      }, 'text');
    });

    expect(mockUpdateLayerSortOrder).toHaveBeenCalledWith(expect.any(String), 1, expect.anything());
  });

  it('moves an independent root together with its bundle when reordered', async () => {
    const now = '2026-03-25T00:00:00.000Z';
    const rootA = {
      id: 'layer_trc_a',
      textId: 'text_1',
      key: 'trc_a',
      name: { zho: '转写层A' },
      layerType: 'transcription',
      languageId: 'zho',
      modality: 'text',
      acceptsAudio: false,
      constraint: 'independent_boundary',
      sortOrder: 0,
      createdAt: now,
      updatedAt: now,
    };
    const translationA = {
      id: 'layer_trl_a',
      textId: 'text_1',
      key: 'trl_a',
      name: { zho: '翻译层A' },
      layerType: 'translation',
      languageId: 'fra',
      modality: 'text',
      acceptsAudio: false,
      parentLayerId: rootA.id,
      sortOrder: 1,
      createdAt: now,
      updatedAt: now,
    };
    const rootB = {
      id: 'layer_trc_b',
      textId: 'text_1',
      key: 'trc_b',
      name: { zho: '转写层B' },
      layerType: 'transcription',
      languageId: 'eng',
      modality: 'text',
      acceptsAudio: false,
      constraint: 'independent_boundary',
      sortOrder: 2,
      createdAt: now,
      updatedAt: now,
    };

    const layerLinks = [{
      id: 'link_trl_a_root_a',
      layerId: translationA.id,
      transcriptionLayerKey: rootA.key,
      hostTranscriptionLayerId: rootA.id,
      linkType: 'free' as const,
      isPreferred: true,
      createdAt: now,
      updatedAt: now,
    }];
    const setLayers = vi.fn();
    const { result } = renderHook(() => useTranscriptionLayerActions({
      layers: [rootA as never, translationA as never, rootB as never],
      layerLinks,
      layerToDeleteId: '',
      selectedLayerId: rootA.id,
      unitsRef: { current: [{ id: 'utt_1', textId: 'text_1' }] as never[] },
      pushUndo: vi.fn(),
      setLayerCreateMessage: vi.fn(),
      setLayers,
      setLayerLinks: vi.fn(),
      setLayerToDeleteId: vi.fn(),
      setShowLayerManager: vi.fn(),
      setSelectedLayerId: vi.fn(),
      setSelectedMediaId: vi.fn(),
      setMediaItems: vi.fn(),
      setSelectedUnitIds: vi.fn(),
      setTranslations: vi.fn(),
      setUnits: vi.fn(),
    }));

    await act(async () => {
      await result.current.reorderLayers(rootA.id, 3);
    });

    const reordered = setLayers.mock.calls[setLayers.mock.calls.length - 1]?.[0] as LayerDocType[] | undefined;
    expect(reordered?.map((layer) => layer.id)).toEqual(['layer_trc_b', 'layer_trc_a', 'layer_trl_a']);
    expect(mockUpdateLayerSortOrder).toHaveBeenCalledWith('layer_trc_b', 0, expect.anything());
    expect(mockUpdateLayerSortOrder).toHaveBeenCalledWith('layer_trc_a', 1, expect.anything());
    expect(mockUpdateLayerSortOrder).toHaveBeenCalledWith('layer_trl_a', 2, expect.anything());
  });

  it('rewires host links when moving a dependent translation layer into another root bundle', async () => {
    const now = '2026-03-25T00:00:00.000Z';
    const rootA = {
      id: 'layer_trc_a',
      textId: 'text_1',
      key: 'trc_a',
      name: { zho: '转写层A' },
      layerType: 'transcription',
      languageId: 'zho',
      modality: 'text',
      acceptsAudio: false,
      constraint: 'independent_boundary',
      sortOrder: 0,
      createdAt: now,
      updatedAt: now,
    };
    const rootB = {
      id: 'layer_trc_b',
      textId: 'text_1',
      key: 'trc_b',
      name: { zho: '转写层B' },
      layerType: 'transcription',
      languageId: 'eng',
      modality: 'text',
      acceptsAudio: false,
      constraint: 'independent_boundary',
      sortOrder: 1,
      createdAt: now,
      updatedAt: now,
    };
    const translation = {
      id: 'layer_trl_a',
      textId: 'text_1',
      key: 'trl_a',
      name: { zho: '翻译层A' },
      layerType: 'translation',
      languageId: 'fra',
      modality: 'text',
      acceptsAudio: false,
      parentLayerId: rootA.id,
      sortOrder: 2,
      createdAt: now,
      updatedAt: now,
    };
    const retainedLink = {
      id: 'link_extra',
      transcriptionLayerKey: 'trc_shared',
      layerId: 'layer_trl_a',
      linkType: 'free',
      isPreferred: false,
      createdAt: now,
    };
    const structuralLink = {
      id: 'link_old_parent',
      transcriptionLayerKey: 'trc_a',
      layerId: 'layer_trl_a',
      linkType: 'free',
      isPreferred: false,
      createdAt: now,
    };

    const setLayers = vi.fn();
    const setLayerLinks = vi.fn();
    const setLayerCreateMessage = vi.fn();
    const setSaveState = vi.fn();
    const { result } = renderHook(() => useTranscriptionLayerActions({
      layers: [rootA as never, rootB as never, translation as never],
      layerLinks: [structuralLink as never, retainedLink as never],
      layerToDeleteId: '',
      selectedLayerId: translation.id,
      unitsRef: { current: [{ id: 'utt_1', textId: 'text_1' }] as never[] },
      pushUndo: vi.fn(),
      setLayerCreateMessage,
      setSaveState,
      setLayers,
      setLayerLinks,
      setLayerToDeleteId: vi.fn(),
      setShowLayerManager: vi.fn(),
      setSelectedLayerId: vi.fn(),
      setSelectedMediaId: vi.fn(),
      setMediaItems: vi.fn(),
      setSelectedUnitIds: vi.fn(),
      setTranslations: vi.fn(),
      setUnits: vi.fn(),
    }));

    await act(async () => {
      await result.current.reorderLayers(translation.id, 3);
    });

    expect(mockRemoveLayerLink).toHaveBeenCalledWith('link_old_parent');
    expect(mockRemoveLayerLink).toHaveBeenCalledWith('link_extra');
    expect(mockInsertLayerLink).toHaveBeenCalledWith(expect.objectContaining({
      transcriptionLayerKey: 'trc_b',
      layerId: 'layer_trl_a',
    }));
    expect(setLayerCreateMessage).toHaveBeenCalledWith(expect.stringContaining('已将翻译'));
    expect(setSaveState).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'done',
      message: expect.stringContaining('依赖 转写'),
    }));

    const reordered = setLayers.mock.calls[setLayers.mock.calls.length - 1]?.[0] as LayerDocType[] | undefined;
    expect(reordered?.map((layer) => layer.id)).toEqual(['layer_trc_a', 'layer_trc_b', 'layer_trl_a']);
    const linkedLayers = setLayerLinks.mock.calls[setLayerLinks.mock.calls.length - 1]?.[0] as Array<{ transcriptionLayerKey: string; layerId: string }> | undefined;
    expect(linkedLayers).toEqual([
      expect.objectContaining({ transcriptionLayerKey: 'trc_b', layerId: 'layer_trl_a' }),
    ]);
    expect(linkedLayers?.some((link) => link.transcriptionLayerKey === 'trc_shared')).toBe(false);
    expect(linkedLayers?.some((link) => link.transcriptionLayerKey === 'trc_a')).toBe(false);
  });

  it('re-canonicalizes sort order after toggling translation host link', async () => {
    const now = '2026-03-25T00:00:00.000Z';
    const rootA = {
      id: 'layer_trc_a',
      textId: 'text_1',
      key: 'trc_a',
      name: { zho: '转写层A' },
      layerType: 'transcription',
      languageId: 'zho',
      modality: 'text',
      acceptsAudio: false,
      constraint: 'independent_boundary',
      sortOrder: 0,
      createdAt: now,
      updatedAt: now,
    };
    const translationA = {
      id: 'layer_trl_a',
      textId: 'text_1',
      key: 'trl_a',
      name: { zho: '翻译层A' },
      layerType: 'translation',
      languageId: 'fra',
      modality: 'text',
      acceptsAudio: false,
      parentLayerId: rootA.id,
      sortOrder: 1,
      createdAt: now,
      updatedAt: now,
    };
    const rootB = {
      id: 'layer_trc_b',
      textId: 'text_1',
      key: 'trc_b',
      name: { zho: '转写层B' },
      layerType: 'transcription',
      languageId: 'eng',
      modality: 'text',
      acceptsAudio: false,
      constraint: 'independent_boundary',
      sortOrder: 2,
      createdAt: now,
      updatedAt: now,
    };
    const translationB = {
      id: 'layer_trl_b',
      textId: 'text_1',
      key: 'trl_b',
      name: { zho: '翻译层B' },
      layerType: 'translation',
      languageId: 'spa',
      modality: 'text',
      acceptsAudio: false,
      parentLayerId: rootB.id,
      sortOrder: 3,
      createdAt: now,
      updatedAt: now,
    };

    const initialLinks = [
      {
        id: 'link_trl_a_a',
        layerId: translationA.id,
        transcriptionLayerKey: rootA.key,
        hostTranscriptionLayerId: rootA.id,
        linkType: 'free' as const,
        isPreferred: true,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'link_trl_b_b',
        layerId: translationB.id,
        transcriptionLayerKey: rootB.key,
        hostTranscriptionLayerId: rootB.id,
        linkType: 'free' as const,
        isPreferred: true,
        createdAt: now,
        updatedAt: now,
      },
    ];
    const setLayers = vi.fn();
    const setLayerLinks = vi.fn();
    const { result } = renderHook(() => useTranscriptionLayerActions({
      layers: [rootA as never, translationA as never, rootB as never, translationB as never],
      layerLinks: initialLinks,
      layerToDeleteId: '',
      selectedLayerId: translationA.id,
      unitsRef: { current: [{ id: 'utt_1', textId: 'text_1' }] as never[] },
      pushUndo: vi.fn(),
      setLayerCreateMessage: vi.fn(),
      setLayers,
      setLayerLinks,
      setLayerToDeleteId: vi.fn(),
      setShowLayerManager: vi.fn(),
      setSelectedLayerId: vi.fn(),
      setSelectedMediaId: vi.fn(),
      setMediaItems: vi.fn(),
      setSelectedUnitIds: vi.fn(),
      setTranslations: vi.fn(),
      setUnits: vi.fn(),
    }));

    await act(async () => {
      await result.current.toggleLayerLink('trc_b', translationA.id);
    });

    expect(mockInsertLayerLink).toHaveBeenCalledWith(expect.objectContaining({
      transcriptionLayerKey: 'trc_b',
      layerId: 'layer_trl_a',
    }));

    const nextLayers = setLayers.mock.calls[setLayers.mock.calls.length - 1]?.[0] as LayerDocType[] | undefined;
    // 主宿主仍在 trc_a 时 canonical 顺序保持译文紧邻首选根；link-only 下由 computeCanonicalLayerOrder 决定 |
    expect(nextLayers?.map((layer) => layer.id)).toEqual(['layer_trc_a', 'layer_trl_a', 'layer_trc_b', 'layer_trl_b']);
    expect(nextLayers?.map((layer) => layer.sortOrder)).toEqual([0, 1, 2, 3]);

    const lastSetLayerLinksArg = setLayerLinks.mock.calls[setLayerLinks.mock.calls.length - 1]?.[0] as
      | Array<{ transcriptionLayerKey: string; layerId: string }>
      | undefined;
    expect(lastSetLayerLinksArg).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ transcriptionLayerKey: 'trc_a', layerId: 'layer_trl_a' }),
        expect.objectContaining({ transcriptionLayerKey: 'trc_b', layerId: 'layer_trl_a' }),
        expect.objectContaining({ transcriptionLayerKey: 'trc_b', layerId: 'layer_trl_b' }),
      ]),
    );
    expect(lastSetLayerLinksArg?.length).toBe(3);
  });

  it('toggleLayerLink appends a second host link without removing existing host links', async () => {
    const now = '2026-04-20T12:00:00.000Z';
    const rootA = {
      id: 'layer_trc_a',
      textId: 'text_1',
      key: 'trc_a',
      name: { zho: '转写层A' },
      layerType: 'transcription',
      languageId: 'zho',
      modality: 'text',
      acceptsAudio: false,
      constraint: 'independent_boundary',
      sortOrder: 0,
      createdAt: now,
      updatedAt: now,
    };
    const rootB = {
      id: 'layer_trc_b',
      textId: 'text_1',
      key: 'trc_b',
      name: { zho: '转写层B' },
      layerType: 'transcription',
      languageId: 'eng',
      modality: 'text',
      acceptsAudio: false,
      constraint: 'independent_boundary',
      sortOrder: 1,
      createdAt: now,
      updatedAt: now,
    };
    const translationA = {
      id: 'layer_trl_a',
      textId: 'text_1',
      key: 'trl_a',
      name: { zho: '翻译层A' },
      layerType: 'translation',
      languageId: 'fra',
      modality: 'text',
      acceptsAudio: false,
      parentLayerId: rootA.id,
      sortOrder: 2,
      createdAt: now,
      updatedAt: now,
    };
    const linkToA = {
      id: 'link_to_a',
      transcriptionLayerKey: 'trc_a',
      hostTranscriptionLayerId: 'layer_trc_a',
      layerId: 'layer_trl_a',
      linkType: 'free',
      isPreferred: true,
      createdAt: now,
    };

    const setLayers = vi.fn();
    const setLayerLinks = vi.fn();
    const { result } = renderHook(() => useTranscriptionLayerActions({
      layers: [rootA as never, rootB as never, translationA as never],
      layerLinks: [linkToA as never],
      layerToDeleteId: '',
      selectedLayerId: translationA.id,
      unitsRef: { current: [{ id: 'utt_1', textId: 'text_1' }] as never[] },
      pushUndo: vi.fn(),
      setLayerCreateMessage: vi.fn(),
      setLayers,
      setLayerLinks,
      setLayerToDeleteId: vi.fn(),
      setShowLayerManager: vi.fn(),
      setSelectedLayerId: vi.fn(),
      setSelectedMediaId: vi.fn(),
      setMediaItems: vi.fn(),
      setSelectedUnitIds: vi.fn(),
      setTranslations: vi.fn(),
      setUnits: vi.fn(),
    }));

    await act(async () => {
      await result.current.toggleLayerLink('trc_b', translationA.id);
    });

    expect(mockRemoveLayerLink).not.toHaveBeenCalled();
    expect(mockInsertLayerLink).toHaveBeenCalledTimes(1);
    expect(mockInsertLayerLink).toHaveBeenCalledWith(expect.objectContaining({
      layerId: 'layer_trl_a',
      hostTranscriptionLayerId: 'layer_trc_b',
      isPreferred: false,
    }));

    const nextLinks = setLayerLinks.mock.calls[setLayerLinks.mock.calls.length - 1]?.[0] as Array<{ id: string; hostTranscriptionLayerId?: string }> | undefined;
    expect(nextLinks).toHaveLength(2);
    expect(nextLinks?.some((l) => l.id === 'link_to_a')).toBe(true);
    expect(nextLinks?.map((l) => l.hostTranscriptionLayerId).sort()).toEqual(['layer_trc_a', 'layer_trc_b']);
  });

  it('toggleLayerLink switches preferred host when a host link already exists', async () => {
    const now = '2026-04-20T12:00:00.000Z';
    const rootA = {
      id: 'layer_trc_a',
      textId: 'text_1',
      key: 'trc_a',
      name: { zho: '转写层A' },
      layerType: 'transcription',
      languageId: 'zho',
      modality: 'text',
      acceptsAudio: false,
      constraint: 'independent_boundary',
      sortOrder: 0,
      createdAt: now,
      updatedAt: now,
    };
    const rootB = {
      id: 'layer_trc_b',
      textId: 'text_1',
      key: 'trc_b',
      name: { zho: '转写层B' },
      layerType: 'transcription',
      languageId: 'eng',
      modality: 'text',
      acceptsAudio: false,
      constraint: 'independent_boundary',
      sortOrder: 1,
      createdAt: now,
      updatedAt: now,
    };
    const translationA = {
      id: 'layer_trl_a',
      textId: 'text_1',
      key: 'trl_a',
      name: { zho: '翻译层A' },
      layerType: 'translation',
      languageId: 'fra',
      modality: 'text',
      acceptsAudio: false,
      parentLayerId: rootA.id,
      sortOrder: 2,
      createdAt: now,
      updatedAt: now,
    };
    const linkToA = {
      id: 'link_to_a',
      transcriptionLayerKey: 'trc_a',
      hostTranscriptionLayerId: 'layer_trc_a',
      layerId: 'layer_trl_a',
      linkType: 'free',
      isPreferred: true,
      createdAt: now,
    };
    const linkToB = {
      id: 'link_to_b',
      transcriptionLayerKey: 'trc_b',
      hostTranscriptionLayerId: 'layer_trc_b',
      layerId: 'layer_trl_a',
      linkType: 'free',
      isPreferred: false,
      createdAt: now,
    };

    const setLayerLinks = vi.fn();
    const { result } = renderHook(() => useTranscriptionLayerActions({
      layers: [rootA as never, rootB as never, translationA as never],
      layerLinks: [linkToA as never, linkToB as never],
      layerToDeleteId: '',
      selectedLayerId: translationA.id,
      unitsRef: { current: [{ id: 'utt_1', textId: 'text_1' }] as never[] },
      pushUndo: vi.fn(),
      setLayerCreateMessage: vi.fn(),
      setLayers: vi.fn(),
      setLayerLinks,
      setLayerToDeleteId: vi.fn(),
      setShowLayerManager: vi.fn(),
      setSelectedLayerId: vi.fn(),
      setSelectedMediaId: vi.fn(),
      setMediaItems: vi.fn(),
      setSelectedUnitIds: vi.fn(),
      setTranslations: vi.fn(),
      setUnits: vi.fn(),
    }));

    await act(async () => {
      await result.current.toggleLayerLink('trc_b', translationA.id);
    });

    expect(mockRemoveLayerLink).not.toHaveBeenCalled();
    expect(mockInsertLayerLink).not.toHaveBeenCalled();
    expect(mockUpdateLayerLink).toHaveBeenCalledWith('link_to_a', { isPreferred: false });
    expect(mockUpdateLayerLink).toHaveBeenCalledWith('link_to_b', { isPreferred: true });

    const nextLinks = setLayerLinks.mock.calls[setLayerLinks.mock.calls.length - 1]?.[0] as Array<{ id: string; isPreferred?: boolean }> | undefined;
    const prefB = nextLinks?.find((l) => l.id === 'link_to_b');
    const prefA = nextLinks?.find((l) => l.id === 'link_to_a');
    expect(prefB?.isPreferred).toBe(true);
    expect(prefA?.isPreferred).toBe(false);
  });

  it('toggleLayerLink appends a second host link without removing existing host links', async () => {
    const now = '2026-04-20T12:00:00.000Z';
    const rootA = {
      id: 'layer_trc_a',
      textId: 'text_1',
      key: 'trc_a',
      name: { zho: '转写层A' },
      layerType: 'transcription',
      languageId: 'zho',
      modality: 'text',
      acceptsAudio: false,
      constraint: 'independent_boundary',
      sortOrder: 0,
      createdAt: now,
      updatedAt: now,
    };
    const rootB = {
      id: 'layer_trc_b',
      textId: 'text_1',
      key: 'trc_b',
      name: { zho: '转写层B' },
      layerType: 'transcription',
      languageId: 'eng',
      modality: 'text',
      acceptsAudio: false,
      constraint: 'independent_boundary',
      sortOrder: 1,
      createdAt: now,
      updatedAt: now,
    };
    const translationA = {
      id: 'layer_trl_a',
      textId: 'text_1',
      key: 'trl_a',
      name: { zho: '翻译层A' },
      layerType: 'translation',
      languageId: 'fra',
      modality: 'text',
      acceptsAudio: false,
      parentLayerId: rootA.id,
      sortOrder: 2,
      createdAt: now,
      updatedAt: now,
    };
    const linkToA = {
      id: 'link_to_a',
      transcriptionLayerKey: 'trc_a',
      hostTranscriptionLayerId: 'layer_trc_a',
      layerId: 'layer_trl_a',
      linkType: 'free',
      isPreferred: true,
      createdAt: now,
    };

    const setLayers = vi.fn();
    const setLayerLinks = vi.fn();
    const { result } = renderHook(() => useTranscriptionLayerActions({
      layers: [rootA as never, rootB as never, translationA as never],
      layerLinks: [linkToA as never],
      layerToDeleteId: '',
      selectedLayerId: translationA.id,
      unitsRef: { current: [{ id: 'utt_1', textId: 'text_1' }] as never[] },
      pushUndo: vi.fn(),
      setLayerCreateMessage: vi.fn(),
      setLayers,
      setLayerLinks,
      setLayerToDeleteId: vi.fn(),
      setShowLayerManager: vi.fn(),
      setSelectedLayerId: vi.fn(),
      setSelectedMediaId: vi.fn(),
      setMediaItems: vi.fn(),
      setSelectedUnitIds: vi.fn(),
      setTranslations: vi.fn(),
      setUnits: vi.fn(),
    }));

    await act(async () => {
      await result.current.toggleLayerLink('trc_b', translationA.id);
    });

    expect(mockRemoveLayerLink).not.toHaveBeenCalled();
    expect(mockInsertLayerLink).toHaveBeenCalledTimes(1);
    expect(mockInsertLayerLink).toHaveBeenCalledWith(expect.objectContaining({
      layerId: 'layer_trl_a',
      hostTranscriptionLayerId: 'layer_trc_b',
      isPreferred: false,
    }));

    const nextLinks = setLayerLinks.mock.calls[setLayerLinks.mock.calls.length - 1]?.[0] as Array<{ id: string; hostTranscriptionLayerId?: string }> | undefined;
    expect(nextLinks).toHaveLength(2);
    expect(nextLinks?.some((l) => l.id === 'link_to_a')).toBe(true);
    expect(nextLinks?.map((l) => l.hostTranscriptionLayerId).sort()).toEqual(['layer_trc_a', 'layer_trc_b']);
  });

  it('toggleLayerLink switches preferred host when a host link already exists', async () => {
    const now = '2026-04-20T12:00:00.000Z';
    const rootA = {
      id: 'layer_trc_a',
      textId: 'text_1',
      key: 'trc_a',
      name: { zho: '转写层A' },
      layerType: 'transcription',
      languageId: 'zho',
      modality: 'text',
      acceptsAudio: false,
      constraint: 'independent_boundary',
      sortOrder: 0,
      createdAt: now,
      updatedAt: now,
    };
    const rootB = {
      id: 'layer_trc_b',
      textId: 'text_1',
      key: 'trc_b',
      name: { zho: '转写层B' },
      layerType: 'transcription',
      languageId: 'eng',
      modality: 'text',
      acceptsAudio: false,
      constraint: 'independent_boundary',
      sortOrder: 1,
      createdAt: now,
      updatedAt: now,
    };
    const translationA = {
      id: 'layer_trl_a',
      textId: 'text_1',
      key: 'trl_a',
      name: { zho: '翻译层A' },
      layerType: 'translation',
      languageId: 'fra',
      modality: 'text',
      acceptsAudio: false,
      parentLayerId: rootA.id,
      sortOrder: 2,
      createdAt: now,
      updatedAt: now,
    };
    const linkToA = {
      id: 'link_to_a',
      transcriptionLayerKey: 'trc_a',
      hostTranscriptionLayerId: 'layer_trc_a',
      layerId: 'layer_trl_a',
      linkType: 'free',
      isPreferred: true,
      createdAt: now,
    };
    const linkToB = {
      id: 'link_to_b',
      transcriptionLayerKey: 'trc_b',
      hostTranscriptionLayerId: 'layer_trc_b',
      layerId: 'layer_trl_a',
      linkType: 'free',
      isPreferred: false,
      createdAt: now,
    };

    const setLayerLinks = vi.fn();
    const { result } = renderHook(() => useTranscriptionLayerActions({
      layers: [rootA as never, rootB as never, translationA as never],
      layerLinks: [linkToA as never, linkToB as never],
      layerToDeleteId: '',
      selectedLayerId: translationA.id,
      unitsRef: { current: [{ id: 'utt_1', textId: 'text_1' }] as never[] },
      pushUndo: vi.fn(),
      setLayerCreateMessage: vi.fn(),
      setLayers: vi.fn(),
      setLayerLinks,
      setLayerToDeleteId: vi.fn(),
      setShowLayerManager: vi.fn(),
      setSelectedLayerId: vi.fn(),
      setSelectedMediaId: vi.fn(),
      setMediaItems: vi.fn(),
      setSelectedUnitIds: vi.fn(),
      setTranslations: vi.fn(),
      setUnits: vi.fn(),
    }));

    await act(async () => {
      await result.current.toggleLayerLink('trc_b', translationA.id);
    });

    expect(mockRemoveLayerLink).not.toHaveBeenCalled();
    expect(mockInsertLayerLink).not.toHaveBeenCalled();
    expect(mockUpdateLayerLink).toHaveBeenCalledWith('link_to_a', { isPreferred: false });
    expect(mockUpdateLayerLink).toHaveBeenCalledWith('link_to_b', { isPreferred: true });

    const nextLinks = setLayerLinks.mock.calls[setLayerLinks.mock.calls.length - 1]?.[0] as Array<{ id: string; isPreferred?: boolean }> | undefined;
    const prefB = nextLinks?.find((l) => l.id === 'link_to_b');
    const prefA = nextLinks?.find((l) => l.id === 'link_to_a');
    expect(prefB?.isPreferred).toBe(true);
    expect(prefA?.isPreferred).toBe(false);
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
        hostTranscriptionLayerId: 'layer_trc_1',
        layerId: 'layer_trl_1',
        linkType: 'direct',
        isPreferred: true,
        createdAt: now,
      },
    ] as never[]);

    const setLayerCreateMessage = vi.fn();
    const { result } = renderHook(() => useTranscriptionLayerActions({
      layers: [trcLayer as never, trlLayer as never],
      layerLinks: [{
        id: 'link_1',
        transcriptionLayerKey: 'trc_zh_1',
        hostTranscriptionLayerId: 'layer_trc_1',
        layerId: 'layer_trl_1',
        linkType: 'direct',
        isPreferred: true,
        createdAt: now,
        updatedAt: now,
      } as never],
      layerToDeleteId: '',
      selectedLayerId: '',
      unitsRef: { current: [] },
      pushUndo: vi.fn(),
      setLayerCreateMessage,
      setLayers: vi.fn(),
      setLayerLinks: vi.fn(),
      setLayerToDeleteId: vi.fn(),
      setShowLayerManager: vi.fn(),
      setSelectedLayerId: vi.fn(),
      setSelectedMediaId: vi.fn(),
      setMediaItems: vi.fn(),
      setSelectedUnitIds: vi.fn(),
      setTranslations: vi.fn(),
      setUnits: vi.fn(),
    }));

    await act(async () => {
      await result.current.deleteLayer('layer_trc_1', { keepUnits: true });
    });

    expect(mockDeleteLayer).toHaveBeenCalledTimes(2);
    expect(mockDeleteLayer).toHaveBeenNthCalledWith(1, expect.objectContaining({ id: 'layer_trl_1' }));
    expect(mockDeleteLayer).toHaveBeenNthCalledWith(2, expect.objectContaining({ id: 'layer_trc_1' }));
    expect(setLayerCreateMessage).toHaveBeenCalledWith(expect.stringContaining('自动级联删除 1 个依赖翻译层'));
  });

  it('removes project unit boundaries when deleting the last transcription layer with keepUnits=false', async () => {
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
    mockUnitsWhereTextIdPrimaryKeys.mockResolvedValue(['utt_100', 'utt_101']);
    mockListUnitTextsByUnits.mockResolvedValue([]);

    const { result } = renderHook(() => useTranscriptionLayerActions({
      layers: [trcLayer as never],
      layerLinks: [],
      layerToDeleteId: '',
      selectedLayerId: '',
      unitsRef: { current: [] },
      pushUndo: vi.fn(),
      setLayerCreateMessage: vi.fn(),
      setLayers: vi.fn(),
      setLayerLinks: vi.fn(),
      setLayerToDeleteId: vi.fn(),
      setShowLayerManager: vi.fn(),
      setSelectedLayerId: vi.fn(),
      setSelectedMediaId: vi.fn(),
      setMediaItems: vi.fn(),
      setSelectedUnitIds: vi.fn(),
      setTranslations: vi.fn(),
      setUnits: vi.fn(),
    }));

    await act(async () => {
      await result.current.deleteLayer('layer_trc_last', { keepUnits: false });
    });

    expect(mockUnitsWhereTextIdPrimaryKeys).toHaveBeenCalledTimes(1);
    expect(mockRemoveUnitsBatch).toHaveBeenCalledWith(['utt_100', 'utt_101']);
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
      unitsRef: { current: [{ id: 'utt_1', textId: 'text_1' }] as never[] },
      pushUndo: vi.fn(),
      setLayerCreateMessage,
      setLayers: vi.fn(),
      setLayerLinks: vi.fn(),
      setLayerToDeleteId: vi.fn(),
      setShowLayerManager: vi.fn(),
      setSelectedLayerId: vi.fn(),
      setSelectedMediaId: vi.fn(),
      setMediaItems: vi.fn(),
      setSelectedUnitIds: vi.fn(),
      setTranslations: vi.fn(),
      setUnits: vi.fn(),
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
      unitsRef: { current: [{ id: 'utt_1', textId: 'text_1' }] as never[] },
      pushUndo: vi.fn(),
      setLayerCreateMessage,
      setLayers: vi.fn(),
      setLayerLinks: vi.fn(),
      setLayerToDeleteId: vi.fn(),
      setShowLayerManager: vi.fn(),
      setSelectedLayerId: vi.fn(),
      setSelectedMediaId: vi.fn(),
      setMediaItems: vi.fn(),
      setSelectedUnitIds: vi.fn(),
      setTranslations: vi.fn(),
      setUnits: vi.fn(),
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
      unitsRef: { current: [{ id: 'utt_1', textId: 'text_1' }] as never[] },
      pushUndo: vi.fn(),
      setLayerCreateMessage,
      setLayers: vi.fn(),
      setLayerLinks: vi.fn(),
      setLayerToDeleteId: vi.fn(),
      setShowLayerManager: vi.fn(),
      setSelectedLayerId: vi.fn(),
      setSelectedMediaId: vi.fn(),
      setMediaItems: vi.fn(),
      setSelectedUnitIds: vi.fn(),
      setTranslations: vi.fn(),
      setUnits: vi.fn(),
    }));

    await act(async () => {
      await result.current.createLayer('transcription', { languageId: 'CMN', textId: 'text_1' }, 'text');
    });

    expect(mockCreateLayer).not.toHaveBeenCalled();
    expect(setLayerCreateMessage).toHaveBeenCalledWith(expect.stringContaining('该语言已存在转写层'));
  });
});
