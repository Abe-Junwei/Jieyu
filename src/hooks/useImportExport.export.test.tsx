// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from 'vitest';
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
    selectedUtteranceMedia: media,
    utterancesOnCurrentMedia: [utterance],
    anchors: [],
    layers: [trc, independentTrl, symbolicTrl],
    translations,
    defaultTranscriptionLayerId: 'trc-1',
    loadSnapshot: vi.fn(async () => undefined),
    setSaveState: vi.fn(),
  };
}

describe('useImportExport - export eaf behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetDb.mockResolvedValue({
      dexie: {
        user_notes: {
          where: vi.fn(() => ({
            anyOf: vi.fn(() => ({
              toArray: vi.fn(async () => []),
            })),
          })),
        },
        layer_segments: {
          where: vi.fn((indexName: string) => {
            if (indexName !== '[layerId+mediaId]') {
              throw new Error(`Unexpected index: ${indexName}`);
            }
            return {
              equals: vi.fn(([layerId, mediaId]: [string, string]) => ({
                toArray: vi.fn(async () => {
                  if (layerId === 'trl-ind' && mediaId === 'media-1') {
                    return [{
                      id: 'seg-1',
                      textId: 'text-1',
                      mediaId: 'media-1',
                      layerId: 'trl-ind',
                      utteranceId: 'utt-1',
                      startTime: 0.2,
                      endTime: 0.9,
                      createdAt: '2026-03-26T00:00:00.000Z',
                      updatedAt: '2026-03-26T00:00:00.000Z',
                    }];
                  }
                  return [];
                }),
              })),
            };
          }),
        },
        layer_segment_contents: {
          where: vi.fn(() => ({
            anyOf: vi.fn(() => ({
              toArray: vi.fn(async () => []),
            })),
          })),
        },
      },
    });
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
    expect(callArg?.layerSegments?.has('trl-sym')).toBe(false);

    expect(mockDownloadEaf).toHaveBeenCalledWith('<ANNOTATION_DOCUMENT/>', 'demo');
  });
});

describe('useImportExport - export TextGrid/FLEx/Toolbox with V2 segment data', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // 与 EAF 测试共用同一 DB mock 结构 | Reuse the same DB mock structure as EAF test
    mockGetDb.mockResolvedValue({
      dexie: {
        user_notes: {
          where: vi.fn(() => ({
            anyOf: vi.fn(() => ({
              toArray: vi.fn(async () => []),
            })),
          })),
        },
        layer_segments: {
          where: vi.fn((indexName: string) => {
            if (indexName !== '[layerId+mediaId]') throw new Error(`Unexpected index: ${indexName}`);
            return {
              equals: vi.fn(([layerId, mediaId]: [string, string]) => ({
                toArray: vi.fn(async () => {
                  // independent_boundary 翻译层有一个 segment | independent_boundary translation layer has one segment
                  if ((layerId === 'trl-ind' || layerId === 'trl-sub') && mediaId === 'media-1') {
                    return [{
                      id: `seg-${layerId}`,
                      textId: 'text-1',
                      mediaId: 'media-1',
                      layerId,
                      startTime: 0.2,
                      endTime: 0.9,
                      createdAt: '2026-03-26T00:00:00.000Z',
                      updatedAt: '2026-03-26T00:00:00.000Z',
                    }];
                  }
                  return [];
                }),
              })),
            };
          }),
        },
        layer_segment_contents: {
          where: vi.fn(() => ({
            anyOf: vi.fn(() => ({
              toArray: vi.fn(async () => []),
            })),
          })),
        },
      },
    });
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
