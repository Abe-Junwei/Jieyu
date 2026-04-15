// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { LayerDocType, MediaItemDocType, UtteranceDocType, UtteranceTextDocType } from '../db';
import { useImportExport } from './useImportExport';

const mockExportToEaf = vi.hoisted(() => vi.fn(() => '<ANNOTATION_DOCUMENT/>'));
const mockDownloadEaf = vi.hoisted(() => vi.fn());
const mockExportToTextGrid = vi.hoisted(() => vi.fn(() => 'File type = "ooTextFile"'));
const mockDownloadTextGrid = vi.hoisted(() => vi.fn());
const mockExportToFlextext = vi.hoisted(() => vi.fn(() => '<?xml version="1.0"?>'));
const mockDownloadFlextext = vi.hoisted(() => vi.fn());
const mockExportToToolbox = vi.hoisted(() => vi.fn(() => '\\_sh v3.0'));
const mockDownloadToolbox = vi.hoisted(() => vi.fn());
const mockGetDb = vi.hoisted(() => vi.fn());
const mockUseOrthographies = vi.hoisted(() => vi.fn(() => []));
const mockApplyOrthographyBridgeIfNeeded = vi.hoisted(() => vi.fn(async ({ text }: { text: string }) => ({ text: `xf:${text}` })));

vi.mock('./useClickOutside', () => ({
  useClickOutside: vi.fn(),
}));

vi.mock('../services/EafService', async () => {
  const actual = await vi.importActual('../services/EafService');
  return {
    ...actual,
    exportToEaf: mockExportToEaf,
    downloadEaf: mockDownloadEaf,
  };
});

vi.mock('../services/TextGridService', async () => {
  const actual = await vi.importActual('../services/TextGridService');
  return {
    ...actual,
    exportToTextGrid: mockExportToTextGrid,
    downloadTextGrid: mockDownloadTextGrid,
  };
});

vi.mock('../services/FlexService', async () => {
  const actual = await vi.importActual('../services/FlexService');
  return {
    ...actual,
    exportToFlextext: mockExportToFlextext,
    downloadFlextext: mockDownloadFlextext,
  };
});

vi.mock('../services/ToolboxService', async () => {
  const actual = await vi.importActual('../services/ToolboxService');
  return {
    ...actual,
    exportToToolbox: mockExportToToolbox,
    downloadToolbox: mockDownloadToolbox,
  };
});

vi.mock('../db', async () => {
  const actual = await vi.importActual('../db');
  return {
    ...actual,
    getDb: mockGetDb,
  };
});

vi.mock('./useOrthographies', () => ({
  useOrthographies: mockUseOrthographies,
}));

vi.mock('../utils/orthographyRuntime', () => ({
  applyOrthographyBridgeIfNeeded: mockApplyOrthographyBridgeIfNeeded,
}));

const FIXED_NOW = '2026-03-26T00:00:00.000Z';

function makeLegacySegment(layerId: string) {
  return {
    id: `seg-${layerId}`,
    textId: 'text-1',
    mediaId: 'media-1',
    layerId,
    startTime: 0.2,
    endTime: 0.9,
    createdAt: FIXED_NOW,
    updatedAt: FIXED_NOW,
  };
}

function makeLayerUnitSegment(layerId: string) {
  return {
    id: `seg-${layerId}`,
    textId: 'text-1',
    mediaId: 'media-1',
    layerId,
    unitType: 'segment',
    startTime: 0.2,
    endTime: 0.9,
    createdAt: FIXED_NOW,
    updatedAt: FIXED_NOW,
  };
}

function makeLayerUnitContent(layerId: string) {
  return {
    id: `cnt-${layerId}`,
    textId: 'text-1',
    unitId: `seg-${layerId}`,
    layerId,
    contentRole: 'primary_text',
    modality: 'text',
    text: `layer-unit-${layerId}`,
    sourceType: 'human',
    createdAt: FIXED_NOW,
    updatedAt: FIXED_NOW,
  };
}

function buildMockDb(options?: { preferLayerUnits?: boolean }) {
  const preferLayerUnits = options?.preferLayerUnits === true;
  const supportedLayerIds = new Set(['trl-ind', 'trl-sub', 'trc-sub']);

  return {
    dexie: {
      user_notes: {
        where: vi.fn(() => ({
          anyOf: vi.fn(() => ({
            toArray: vi.fn(async () => []),
          })),
        })),
      },
      speakers: {
        toArray: vi.fn(async () => []),
      },
      texts: {
        get: vi.fn(async () => ({ metadata: { primaryOrthographyId: 'orth-project' } })),
      },
      layer_units: {
        bulkPut: vi.fn(async () => undefined),
        where: vi.fn((indexName: string) => {
          if (indexName !== '[layerId+mediaId]') {
            throw new Error(`Unexpected index: ${indexName}`);
          }
          return {
            equals: vi.fn(([layerId, mediaId]: [string, string]) => ({
              toArray: vi.fn(async () => {
                if (!preferLayerUnits || mediaId !== 'media-1' || !supportedLayerIds.has(layerId)) return [];
                return [makeLayerUnitSegment(layerId)];
              }),
            })),
          };
        }),
      },
      layer_segments: {
        where: vi.fn((indexName: string) => {
          if (indexName !== '[layerId+mediaId]') {
            throw new Error(`Unexpected index: ${indexName}`);
          }
          return {
            equals: vi.fn(([layerId, mediaId]: [string, string]) => ({
              toArray: vi.fn(async () => {
                if (preferLayerUnits || mediaId !== 'media-1' || !supportedLayerIds.has(layerId)) return [];
                return [makeLegacySegment(layerId)];
              }),
            })),
          };
        }),
      },
      layer_unit_contents: {
        bulkPut: vi.fn(async () => undefined),
        where: vi.fn((indexName: string) => {
          if (indexName !== 'unitId') {
            throw new Error(`Unexpected index: ${indexName}`);
          }
          return {
            anyOf: vi.fn((unitIds: string[]) => ({
              toArray: vi.fn(async () => {
                if (!preferLayerUnits) return [];
                return unitIds
                  .filter((unitId) => supportedLayerIds.has(unitId.replace(/^seg-/, '')))
                  .map((unitId) => makeLayerUnitContent(unitId.replace(/^seg-/, '')));
              }),
            })),
          };
        }),
      },
      layer_segment_contents: {
        where: vi.fn((indexName: string) => {
          if (indexName !== 'segmentId') {
            throw new Error(`Unexpected index: ${indexName}`);
          }
          return {
            anyOf: vi.fn(() => ({
              toArray: vi.fn(async () => []),
            })),
          };
        }),
      },
    },
  };
}

function makeInput() {
  const media = {
    id: 'media-1',
    textId: 'text-1',
    filename: 'demo.wav',
    isOfflineCached: true,
    details: { source: 'upload' },
    createdAt: '2026-03-26T00:00:00.000Z',
  } as MediaItemDocType;

  const utterance = {
    id: 'utt-1',
    textId: 'text-1',
    mediaId: 'media-1',
    startTime: 0,
    endTime: 1,
    createdAt: '2026-03-26T00:00:00.000Z',
    updatedAt: '2026-03-26T00:00:00.000Z',
  } as UtteranceDocType;

  const trc = {
    id: 'trc-1',
    textId: 'text-1',
    key: 'trc_1',
    name: { zho: '转写' },
    layerType: 'transcription',
    languageId: 'zho',
    orthographyId: 'orth-layer',
    modality: 'text',
    acceptsAudio: false,
    isDefault: true,
    createdAt: '2026-03-26T00:00:00.000Z',
    updatedAt: '2026-03-26T00:00:00.000Z',
  } as LayerDocType;

  const independentTrl = {
    id: 'trl-ind',
    textId: 'text-1',
    key: 'trl_ind',
    name: { zho: '独立边界翻译' },
    layerType: 'translation',
    languageId: 'eng',
    modality: 'text',
    acceptsAudio: false,
    constraint: 'independent_boundary',
    createdAt: '2026-03-26T00:00:00.000Z',
    updatedAt: '2026-03-26T00:00:00.000Z',
  } as LayerDocType;

  const symbolicTrl = {
    id: 'trl-sym',
    textId: 'text-1',
    key: 'trl_sym',
    name: { zho: '符号关联翻译' },
    layerType: 'translation',
    languageId: 'eng',
    modality: 'text',
    acceptsAudio: false,
    constraint: 'symbolic_association',
    parentLayerId: 'trc-1',
    createdAt: '2026-03-26T00:00:00.000Z',
    updatedAt: '2026-03-26T00:00:00.000Z',
  } as LayerDocType;

  const subdivisionTrc = {
    id: 'trc-sub',
    textId: 'text-1',
    key: 'trc_sub',
    name: { zho: '细分转写', eng: 'Subdivision Transcription' },
    layerType: 'transcription',
    languageId: 'zho',
    modality: 'text',
    acceptsAudio: false,
    constraint: 'time_subdivision',
    parentLayerId: 'trc-1',
    createdAt: '2026-03-26T00:00:00.000Z',
    updatedAt: '2026-03-26T00:00:00.000Z',
  } as LayerDocType;

  const translations: UtteranceTextDocType[] = [
    {
      id: 'utr-1',
      utteranceId: 'utt-1',
      layerId: 'trl-ind',
      modality: 'text',
      text: 'hello',
      sourceType: 'human',
      createdAt: '2026-03-26T00:00:00.000Z',
      updatedAt: '2026-03-26T00:00:00.000Z',
    } as UtteranceTextDocType,
  ];

  return {
    activeTextId: 'text-1',
    getActiveTextId: vi.fn(async () => 'text-1'),
    selectedUnitMedia: media,
    utterancesOnCurrentMedia: [utterance],
    anchors: [],
    layers: [trc, independentTrl, symbolicTrl, subdivisionTrc],
    translations,
    defaultTranscriptionLayerId: 'trc-1',
    loadSnapshot: vi.fn(async () => undefined),
    setSaveState: vi.fn(),
  };
}

describe('useImportExport - export eaf behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetDb.mockResolvedValue(buildMockDb({ preferLayerUnits: true }));
    mockUseOrthographies.mockReturnValue([]);
    mockApplyOrthographyBridgeIfNeeded.mockImplementation(async ({ text }: { text: string }) => ({ text: `xf:${text}` }));
  });

  afterEach(() => {
  });

  it('passes layerSegments to exportToEaf for time-aligned translation layers', async () => {
    const input = makeInput();
    const { result } = renderHook(() => useImportExport(input));

    await act(async () => {
      await result.current.handleExportEaf();
    });

    expect(mockExportToEaf).toHaveBeenCalledTimes(1);
    const callArg = (mockExportToEaf.mock.calls as any[])[0]?.[0] as unknown as { layerSegments?: Map<string, unknown[]> };
    expect(callArg?.layerSegments).toBeInstanceOf(Map);
    expect(callArg?.layerSegments?.has('trl-ind')).toBe(true);
    expect(callArg?.layerSegments?.get('trl-ind')?.length).toBe(1);
    expect(callArg?.layerSegments?.has('trc-sub')).toBe(true);
    expect(callArg?.layerSegments?.get('trc-sub')?.length).toBe(1);
    expect(callArg?.layerSegments?.has('trl-sym')).toBe(false);

    expect(mockDownloadEaf).toHaveBeenCalledWith('<ANNOTATION_DOCUMENT/>', 'demo');
  });

  it('prefers LayerUnit export data when legacy segment rows are absent', async () => {
    mockGetDb.mockResolvedValue(buildMockDb({ preferLayerUnits: true }));
    const input = makeInput();
    const { result } = renderHook(() => useImportExport(input));

    await act(async () => {
      await result.current.handleExportEaf();
    });

    const callArg = (mockExportToEaf.mock.calls as any[])[0]?.[0] as unknown as {
      layerSegments?: Map<string, Array<{ id: string }>>;
      layerSegmentContents?: Map<string, Map<string, { text?: string }>>;
    };
    expect(callArg?.layerSegments?.get('trl-ind')?.[0]?.id).toBe('seg-trl-ind');
    expect(callArg?.layerSegmentContents?.get('trl-ind')?.get('seg-trl-ind')?.text).toBe('layer-unit-trl-ind');
    expect(callArg?.layerSegmentContents?.get('trc-sub')?.get('seg-trc-sub')?.text).toBe('layer-unit-trc-sub');
  });

  it('exports EAF segment data from the canonical LayerUnit view', async () => {
    mockGetDb.mockResolvedValue(buildMockDb({ preferLayerUnits: true }));
    const input = makeInput();
    const { result } = renderHook(() => useImportExport(input));

    await act(async () => {
      await result.current.handleExportEaf();
    });

    const callArg = (mockExportToEaf.mock.calls as any[])[0]?.[0] as unknown as {
      layerSegments?: Map<string, Array<{ id: string }>>;
      layerSegmentContents?: Map<string, Map<string, { text?: string }>>;
    };
    expect(callArg?.layerSegments?.get('trl-ind')?.[0]?.id).toBe('seg-trl-ind');
    expect(callArg?.layerSegmentContents?.get('trl-ind')?.get('seg-trl-ind')?.text).toBe('layer-unit-trl-ind');
  });
});

describe('useImportExport - export TextGrid/FLEx/Toolbox with V2 segment data', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // stop-read 默认关闭后，导出基线应以 LayerUnit 视图为准 | With stop-read off, export baseline should use the LayerUnit view
    mockGetDb.mockResolvedValue(buildMockDb({ preferLayerUnits: true }));
    mockUseOrthographies.mockReturnValue([]);
  });

  function makeInputWithSegmentLayers() {
    const base = makeInput();
    // 追加一个 time_subdivision 翻译层（之前被过滤，现在应被包含）
    // Add a time_subdivision translation layer (was previously filtered out, should now be included)
    const timeSub: LayerDocType = {
      id: 'trl-sub',
      textId: 'text-1',
      key: 'trl_sub',
      name: { eng: 'Time Subdivision Translation' },
      layerType: 'translation',
      languageId: 'fra',
      modality: 'text',
      acceptsAudio: false,
      constraint: 'time_subdivision',
      createdAt: '2026-03-26T00:00:00.000Z',
      updatedAt: '2026-03-26T00:00:00.000Z',
    } as LayerDocType;
    return { ...base, layers: [...base.layers, timeSub] };
  }

  it('TextGrid: 导出包含 independent_boundary 翻译层的 segment 数据 | includes independent_boundary translation layer segments', async () => {
    const { result } = renderHook(() => useImportExport(makeInputWithSegmentLayers()));

    await act(async () => {
      await result.current.handleExportTextGrid();
    });

    expect(mockExportToTextGrid).toHaveBeenCalledTimes(1);
    const arg = (mockExportToTextGrid.mock.calls as any[])[0]?.[0] as unknown as {
      segmentsByLayer?: Map<string, unknown[]>;
    };
    expect(arg?.segmentsByLayer).toBeInstanceOf(Map);
    // independent_boundary 翻译层被包含 | independent_boundary translation layer is included
    expect(arg?.segmentsByLayer?.has('trl-ind')).toBe(true);
    expect(arg?.segmentsByLayer?.get('trl-ind')?.length).toBe(1);
    // symbolic_association 翻译层不被包含（无 segment 数据）| symbolic_association has no segment data
    expect(arg?.segmentsByLayer?.has('trl-sym')).toBe(false);
    expect(mockDownloadTextGrid).toHaveBeenCalledWith('File type = "ooTextFile"', 'demo');
  });

  it('TextGrid: 导出包含 time_subdivision 层的 segment 数据 | includes time_subdivision layer segments', async () => {
    const { result } = renderHook(() => useImportExport(makeInputWithSegmentLayers()));

    await act(async () => {
      await result.current.handleExportTextGrid();
    });

    const arg = (mockExportToTextGrid.mock.calls as any[])[0]?.[0] as unknown as {
      segmentsByLayer?: Map<string, unknown[]>;
    };
    expect(arg?.segmentsByLayer?.has('trl-sub')).toBe(true);
    expect(arg?.segmentsByLayer?.get('trl-sub')?.length).toBe(1);
  });

  it('TextGrid: 旧表为空时仍从 LayerUnit 导出 segment 与文本内容 | exports segment data from LayerUnit when legacy tables are empty', async () => {
    mockGetDb.mockResolvedValue(buildMockDb({ preferLayerUnits: true }));
    const { result } = renderHook(() => useImportExport(makeInputWithSegmentLayers()));

    await act(async () => {
      await result.current.handleExportTextGrid();
    });

    const arg = (mockExportToTextGrid.mock.calls as any[])[0]?.[0] as unknown as {
      segmentsByLayer?: Map<string, Array<{ id: string }>>;
      segmentContents?: Map<string, Map<string, { text?: string }>>;
    };
    expect(arg?.segmentsByLayer?.get('trl-ind')?.[0]?.id).toBe('seg-trl-ind');
    expect(arg?.segmentContents?.get('trl-sub')?.get('seg-trl-sub')?.text).toBe('layer-unit-trl-sub');
  });

  it('transforms legacy default transcription fallback before plain-text export', async () => {
    const input = makeInputWithSegmentLayers();
    input.layers = input.layers.map((layer) => (layer.id === 'trc-1'
      ? { ...layer, bridgeId: 'xf-explicit' }
      : layer));
    input.translations = input.translations.filter((item) => item.layerId !== 'trc-1');
    input.utterancesOnCurrentMedia = [{
      ...input.utterancesOnCurrentMedia[0]!,
      transcription: { default: 'legacy raw' },
    } as UtteranceDocType];
    const { result } = renderHook(() => useImportExport(input));

    await act(async () => {
      await result.current.handleExportTextGrid();
    });

    const arg = (mockExportToTextGrid.mock.calls as any[])[0]?.[0] as unknown as {
      utterances?: Array<{ transcription?: { default?: string } }>;
    };
    expect(mockApplyOrthographyBridgeIfNeeded).toHaveBeenCalledWith({
      text: 'legacy raw',
      sourceOrthographyId: 'orth-project',
      targetOrthographyId: 'orth-layer',
      bridgeId: 'xf-explicit',
    });
    expect(arg?.utterances?.[0]?.transcription?.default).toBe('xf:legacy raw');
  });

  it('FLEx: 导出包含 independent_boundary 翻译层的 segment 数据 | includes independent_boundary translation layer segments', async () => {
    const { result } = renderHook(() => useImportExport(makeInputWithSegmentLayers()));

    await act(async () => {
      await result.current.handleExportFlextext();
    });

    expect(mockExportToFlextext).toHaveBeenCalledTimes(1);
    const arg = (mockExportToFlextext.mock.calls as any[])[0]?.[0] as unknown as {
      segmentsByLayer?: Map<string, unknown[]>;
    };
    expect(arg?.segmentsByLayer).toBeInstanceOf(Map);
    expect(arg?.segmentsByLayer?.has('trl-ind')).toBe(true);
    expect(arg?.segmentsByLayer?.has('trl-sub')).toBe(true);
    expect(mockDownloadFlextext).toHaveBeenCalledWith('<?xml version="1.0"?>', 'demo');
  });

  it('Toolbox: 导出包含 independent_boundary 翻译层的 segment 数据 | includes independent_boundary translation layer segments', async () => {
    const { result } = renderHook(() => useImportExport(makeInputWithSegmentLayers()));

    await act(async () => {
      await result.current.handleExportToolbox();
    });

    expect(mockExportToToolbox).toHaveBeenCalledTimes(1);
    const arg = (mockExportToToolbox.mock.calls as any[])[0]?.[0] as unknown as {
      segmentsByLayer?: Map<string, unknown[]>;
    };
    expect(arg?.segmentsByLayer).toBeInstanceOf(Map);
    expect(arg?.segmentsByLayer?.has('trl-ind')).toBe(true);
    expect(arg?.segmentsByLayer?.has('trl-sub')).toBe(true);
    expect(mockDownloadToolbox).toHaveBeenCalledWith('\\_sh v3.0', 'demo');
  });
});
