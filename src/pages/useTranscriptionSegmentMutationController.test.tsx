// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LayerDocType, LayerUnitDocType } from '../db';
import type { SaveState } from '../hooks/transcriptionTypes';
import { segmentToView, unitToView } from '../hooks/timelineUnitView';
import { LOCALE_PREFERENCE_STORAGE_KEY } from '../i18n';
import { useTranscriptionSegmentMutationController } from './useTranscriptionSegmentMutationController';

const {
  mockSplitSegment,
  mockMergeAdjacentSegments,
  mockDeleteSegment,
  mockDeleteSegmentsBatch,
} = vi.hoisted(() => ({
  mockSplitSegment: vi.fn<(segmentId: string, splitTime: number) => Promise<{ second: { id: string } }>>(async () => ({ second: { id: 'seg-right' } })),
  mockMergeAdjacentSegments: vi.fn<(leftId: string, rightId: string) => Promise<void>>(async () => undefined),
  mockDeleteSegment: vi.fn<(segmentId: string) => Promise<void>>(async () => undefined),
  mockDeleteSegmentsBatch: vi.fn<(segmentIds: readonly string[]) => Promise<void>>(async () => undefined),
}));

vi.mock('../services/LayerSegmentationV2Service', () => ({
  LayerSegmentationV2Service: {
    splitSegment: (segmentId: string, splitTime: number) => mockSplitSegment(segmentId, splitTime),
    mergeAdjacentSegments: (leftId: string, rightId: string) => mockMergeAdjacentSegments(leftId, rightId),
    deleteSegment: (segmentId: string) => mockDeleteSegment(segmentId),
    deleteSegmentsBatch: (segmentIds: readonly string[]) => mockDeleteSegmentsBatch(segmentIds),
  },
}));

function makeLayer(id: string, constraint?: LayerDocType['constraint']): LayerDocType {
  return {
    id,
    textId: 'text-1',
    key: id,
    name: { 'zh-CN': id },
    layerType: 'transcription',
    languageId: 'zh-CN',
    modality: 'text',
    ...(constraint ? { constraint } : {}),
    createdAt: '2026-04-01T00:00:00.000Z',
    updatedAt: '2026-04-01T00:00:00.000Z',
  } as LayerDocType;
}

function makeSegment(id: string, layerId: string, startTime: number, endTime: number): LayerUnitDocType {
  return {
    id,
    layerId,
    mediaId: 'media-1',
    textId: 'text-1',
    startTime,
    endTime,
    createdAt: '2026-04-01T00:00:00.000Z',
    updatedAt: '2026-04-01T00:00:00.000Z',
  } as LayerUnitDocType;
}

function makeUnit(id: string, startTime: number, endTime: number): LayerUnitDocType {
  return {
    id,
    mediaId: 'media-1',
    textId: 'text-1',
    startTime,
    endTime,
    createdAt: '2026-04-01T00:00:00.000Z',
    updatedAt: '2026-04-01T00:00:00.000Z',
  } as LayerUnitDocType;
}

type HookInput = Parameters<typeof useTranscriptionSegmentMutationController>[0];

function createUnitsOnCurrentMedia(
  segments: LayerUnitDocType[],
  units: LayerUnitDocType[],
  unitLayerId = 'layer-seg',
) {
  return [
    ...segments.map((segment) => segmentToView(segment, () => '')),
    ...units.map((unit) => unitToView(unit, unitLayerId)),
  ];
}

function createBaseInput(overrides: Partial<HookInput> = {}): HookInput {
  const defaultSegments = [
    makeSegment('seg-1', 'layer-seg', 0, 1),
    makeSegment('seg-2', 'layer-seg', 1, 2),
    makeSegment('seg-3', 'layer-seg', 2, 4),
  ];
  const defaultUnits = [makeUnit('utt-1', 1.5, 2.5)];
  return {
    activeLayerIdForEdits: 'layer-seg',
    resolveSegmentRoutingForLayer: () => ({
      layer: makeLayer('layer-seg', 'independent_boundary'),
      segmentSourceLayer: makeLayer('layer-seg', 'independent_boundary'),
      sourceLayerId: 'layer-seg',
      editMode: 'independent-segment',
    }),
    pushUndo: vi.fn(),
    reloadSegments: vi.fn(async () => undefined),
    refreshSegmentUndoSnapshot: vi.fn(async () => undefined),
    selectTimelineUnit: vi.fn(),
    unitsOnCurrentMedia: createUnitsOnCurrentMedia(defaultSegments, defaultUnits),
    getUnitDocById: (id: string) => defaultUnits.find((u) => u.id === id),
    findUnitDocContainingRange: (start: number, end: number) => defaultUnits.find(
      (u) => u.startTime <= start + 0.01 && u.endTime >= end - 0.01,
    ),
    setSaveState: vi.fn() as unknown as (state: SaveState) => void,
    splitUnit: vi.fn(async () => undefined),
    mergeSelectedUnits: vi.fn(async () => undefined),
    mergeWithPrevious: vi.fn(async () => undefined),
    mergeWithNext: vi.fn(async () => undefined),
    deleteUnit: vi.fn(async () => undefined),
    deleteSelectedUnits: vi.fn(async () => undefined),
    ...overrides,
  };
}

describe('useTranscriptionSegmentMutationController', () => {
  beforeEach(() => {
    window.localStorage.setItem(LOCALE_PREFERENCE_STORAGE_KEY, 'zh-CN');
    mockSplitSegment.mockClear();
    mockMergeAdjacentSegments.mockClear();
    mockDeleteSegment.mockClear();
    mockDeleteSegmentsBatch.mockClear();
  });

  afterEach(() => {
    window.localStorage.removeItem(LOCALE_PREFERENCE_STORAGE_KEY);
  });

  it('routes segment split through LayerSegmentationV2Service and selects the right segment', async () => {
    const pushUndo = vi.fn();
    const reloadSegments = vi.fn(async () => undefined);
    const refreshSegmentUndoSnapshot = vi.fn(async () => undefined);
    const selectTimelineUnit = vi.fn();
    const { result } = renderHook(() => useTranscriptionSegmentMutationController(createBaseInput({
      pushUndo,
      reloadSegments,
      refreshSegmentUndoSnapshot,
      selectTimelineUnit,
    })));

    await act(async () => {
      await result.current.splitRouted('seg-2', 1.5);
    });

    expect(pushUndo).toHaveBeenCalledWith('拆分句段');
    expect(mockSplitSegment).toHaveBeenCalledWith('seg-2', 1.5);
    expect(reloadSegments).toHaveBeenCalled();
    expect(refreshSegmentUndoSnapshot).toHaveBeenCalled();
    expect(selectTimelineUnit).toHaveBeenCalledWith({ layerId: 'layer-seg', unitId: 'seg-right', kind: 'segment' });
  });

  it('surfaces structured error when segment split fails', async () => {
    mockSplitSegment.mockRejectedValueOnce(new Error('split failed'));
    const setSaveState = vi.fn() as unknown as (state: SaveState) => void;
    const reloadSegments = vi.fn(async () => undefined);
    const refreshSegmentUndoSnapshot = vi.fn(async () => undefined);
    const selectTimelineUnit = vi.fn();
    const { result } = renderHook(() => useTranscriptionSegmentMutationController(createBaseInput({
      setSaveState,
      reloadSegments,
      refreshSegmentUndoSnapshot,
      selectTimelineUnit,
    })));

    await act(async () => {
      await result.current.splitRouted('seg-2', 1.5);
    });

    expect(reloadSegments).not.toHaveBeenCalled();
    expect(refreshSegmentUndoSnapshot).not.toHaveBeenCalled();
    expect(selectTimelineUnit).not.toHaveBeenCalled();
    expect(setSaveState).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'error',
      message: '拆分句段失败：split failed',
      errorMeta: expect.objectContaining({
        category: 'action',
        action: '拆分句段',
        detail: 'split failed',
      }),
    }));
  });

  it('uses explicit layer override when overlay action targets another segment layer', async () => {
    const resolveSegmentRoutingForLayer = vi.fn((layerId?: string) => ({
      layer: makeLayer(layerId ?? 'layer-seg', 'independent_boundary'),
      segmentSourceLayer: makeLayer(layerId ?? 'layer-seg', 'independent_boundary'),
      sourceLayerId: layerId ?? 'layer-seg',
      editMode: 'independent-segment' as const,
    }));
    const selectTimelineUnit = vi.fn();
    const { result } = renderHook(() => useTranscriptionSegmentMutationController(createBaseInput({
      resolveSegmentRoutingForLayer,
      selectTimelineUnit,
    })));

    await act(async () => {
      await result.current.splitRouted('seg-foreign', 1.5, 'layer-foreign');
    });

    expect(resolveSegmentRoutingForLayer).toHaveBeenCalledWith('layer-foreign');
    expect(selectTimelineUnit).toHaveBeenCalledWith({ layerId: 'layer-foreign', unitId: 'seg-right', kind: 'segment' });
  });

  it('blocks time-subdivision merge when merged range exceeds parent unit', async () => {
    const setSaveState = vi.fn() as unknown as (state: SaveState) => void;
    const pushUndo = vi.fn();
    const utt = makeUnit('utt-1', 1.5, 3.0);
    const { result } = renderHook(() => useTranscriptionSegmentMutationController(createBaseInput({
      activeLayerIdForEdits: 'layer-sub',
      resolveSegmentRoutingForLayer: () => ({
        layer: makeLayer('layer-sub', 'time_subdivision'),
        segmentSourceLayer: makeLayer('layer-sub', 'time_subdivision'),
        sourceLayerId: 'layer-sub',
        editMode: 'time-subdivision',
      }),
      unitsOnCurrentMedia: createUnitsOnCurrentMedia(
        [makeSegment('seg-1', 'layer-sub', 1, 2), makeSegment('seg-2', 'layer-sub', 2, 3)],
        [utt],
        'layer-sub',
      ),
      getUnitDocById: (id: string) => (id === 'utt-1' ? utt : undefined),
      findUnitDocContainingRange: (start: number, end: number) => (
        utt.startTime <= start + 0.01 && utt.endTime >= end - 0.01 ? utt : undefined
      ),
      setSaveState,
      pushUndo,
    })));

    await act(async () => {
      await result.current.mergeWithPreviousRouted('seg-2');
    });

    expect(mockMergeAdjacentSegments).not.toHaveBeenCalled();
    expect(pushUndo).not.toHaveBeenCalled();
    expect(setSaveState).toHaveBeenCalledWith({ kind: 'error', message: '合并后会超出父句段范围，无法完成。' });
  });

  it('blocks time-subdivision merge when parent unit cannot be resolved from raw resolver', async () => {
    const setSaveState = vi.fn() as unknown as (state: SaveState) => void;
    const pushUndo = vi.fn();
    const { result } = renderHook(() => useTranscriptionSegmentMutationController(createBaseInput({
      activeLayerIdForEdits: 'layer-sub',
      resolveSegmentRoutingForLayer: () => ({
        layer: makeLayer('layer-sub', 'time_subdivision'),
        segmentSourceLayer: makeLayer('layer-sub', 'time_subdivision'),
        sourceLayerId: 'layer-sub',
        editMode: 'time-subdivision',
      }),
      unitsOnCurrentMedia: createUnitsOnCurrentMedia(
        [makeSegment('seg-1', 'layer-sub', 1, 2), makeSegment('seg-2', 'layer-sub', 2, 3)],
        [],
        'layer-sub',
      ),
      getUnitDocById: () => undefined,
      findUnitDocContainingRange: () => undefined,
      setSaveState,
      pushUndo,
    })));

    await act(async () => {
      await result.current.mergeWithPreviousRouted('seg-2');
    });

    expect(mockMergeAdjacentSegments).not.toHaveBeenCalled();
    expect(pushUndo).not.toHaveBeenCalled();
    expect(setSaveState).toHaveBeenCalledWith({ kind: 'error', message: '合并后会超出父句段范围，无法完成。' });
  });

  it('allows independent-segment merge even when linked unit would not fully contain merged range', async () => {
    const setSaveState = vi.fn() as unknown as (state: SaveState) => void;
    const pushUndo = vi.fn();
    const reloadSegments = vi.fn(async () => undefined);
    const refreshSegmentUndoSnapshot = vi.fn(async () => undefined);
    const selectTimelineUnit = vi.fn();
    const utt = makeUnit('utt-1', 1.5, 3.0);
    const { result } = renderHook(() => useTranscriptionSegmentMutationController(createBaseInput({
      unitsOnCurrentMedia: createUnitsOnCurrentMedia(
        [makeSegment('seg-1', 'layer-seg', 1, 2), makeSegment('seg-2', 'layer-seg', 2, 3)],
        [utt],
      ),
      getUnitDocById: (id: string) => (id === 'utt-1' ? utt : undefined),
      findUnitDocContainingRange: (start: number, end: number) => (
        utt.startTime <= start + 0.01 && utt.endTime >= end - 0.01 ? utt : undefined
      ),
      setSaveState,
      pushUndo,
      reloadSegments,
      refreshSegmentUndoSnapshot,
      selectTimelineUnit,
    })));

    await act(async () => {
      await result.current.mergeWithPreviousRouted('seg-2');
    });

    expect(pushUndo).toHaveBeenCalledWith('向前合并句段');
    expect(mockMergeAdjacentSegments).toHaveBeenCalledWith('seg-1', 'seg-2');
    expect(reloadSegments).toHaveBeenCalled();
    expect(refreshSegmentUndoSnapshot).toHaveBeenCalled();
    expect(selectTimelineUnit).toHaveBeenCalledWith({ layerId: 'layer-seg', unitId: 'seg-1', kind: 'segment' });
    expect(setSaveState).not.toHaveBeenCalledWith({ kind: 'error', message: '合并后会超出父句段范围，无法完成。' });
  });

  it('merges selected independent segments in order and keeps the first segment selected', async () => {
    const pushUndo = vi.fn();
    const reloadSegments = vi.fn(async () => undefined);
    const refreshSegmentUndoSnapshot = vi.fn(async () => undefined);
    const selectTimelineUnit = vi.fn();
    const { result } = renderHook(() => useTranscriptionSegmentMutationController(createBaseInput({
      pushUndo,
      reloadSegments,
      refreshSegmentUndoSnapshot,
      selectTimelineUnit,
    })));

    await act(async () => {
      await result.current.mergeSelectedSegmentsRouted(new Set(['seg-1', 'seg-2', 'seg-3']));
    });

    expect(pushUndo).toHaveBeenCalledWith('批量合并句段');
    expect(mockMergeAdjacentSegments).toHaveBeenNthCalledWith(1, 'seg-1', 'seg-2');
    expect(mockMergeAdjacentSegments).toHaveBeenNthCalledWith(2, 'seg-1', 'seg-3');
    expect(reloadSegments).toHaveBeenCalled();
    expect(refreshSegmentUndoSnapshot).toHaveBeenCalled();
    expect(selectTimelineUnit).toHaveBeenCalledWith({ layerId: 'layer-seg', unitId: 'seg-1', kind: 'segment' });
  });

  it('rejects non-adjacent selected segments before batch merge', async () => {
    const setSaveState = vi.fn() as unknown as (state: SaveState) => void;
    const pushUndo = vi.fn();
    const { result } = renderHook(() => useTranscriptionSegmentMutationController(createBaseInput({
      setSaveState,
      pushUndo,
    })));

    await expect(result.current.mergeSelectedSegmentsRouted(new Set(['seg-1', 'seg-3']))).rejects.toThrow('请先选择相邻句段再执行合并。');

    expect(mockMergeAdjacentSegments).not.toHaveBeenCalled();
    expect(pushUndo).not.toHaveBeenCalled();
    expect(setSaveState).toHaveBeenCalledWith({ kind: 'error', message: '请先选择相邻句段再执行合并。' });
  });

  it('reloads segments and surfaces error when batch segment delete fails', async () => {
    mockDeleteSegmentsBatch.mockImplementationOnce(async () => {
      throw new Error('delete failed');
    });
    const pushUndo = vi.fn();
    const reloadSegments = vi.fn(async () => undefined);
    const setSaveState = vi.fn() as unknown as (state: SaveState) => void;
    const { result } = renderHook(() => useTranscriptionSegmentMutationController(createBaseInput({
      pushUndo,
      reloadSegments,
      setSaveState,
    })));

    await act(async () => {
      await result.current.deleteSelectedUnitsRouted(new Set(['seg-1', 'seg-2']));
    });

    expect(pushUndo).toHaveBeenCalledWith('批量删除句段');
    expect(mockDeleteSegmentsBatch).toHaveBeenCalledWith(['seg-1', 'seg-2']);
    expect(mockDeleteSegment).not.toHaveBeenCalled();
    expect(reloadSegments).toHaveBeenCalledTimes(1);
    expect(setSaveState).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'error',
      message: '批量删除句段失败：delete failed',
      errorMeta: expect.objectContaining({
        category: 'action',
        action: '批量删除句段',
        detail: 'delete failed',
      }),
    }));
  });

  it('falls back to unit mutations when current layer does not use segment timeline', async () => {
    const splitUnit = vi.fn(async () => undefined);
    const mergeSelectedUnits = vi.fn(async () => undefined);
    const mergeWithPrevious = vi.fn(async () => undefined);
    const mergeWithNext = vi.fn(async () => undefined);
    const deleteUnit = vi.fn(async () => undefined);
    const deleteSelectedUnits = vi.fn(async () => undefined);
    const { result } = renderHook(() => useTranscriptionSegmentMutationController(createBaseInput({
      resolveSegmentRoutingForLayer: () => ({
        layer: makeLayer('layer-main'),
        segmentSourceLayer: undefined,
        sourceLayerId: '',
        editMode: 'unit',
      }),
      splitUnit: splitUnit,
      mergeSelectedUnits: mergeSelectedUnits,
      mergeWithPrevious,
      mergeWithNext,
      deleteUnit: deleteUnit,
      deleteSelectedUnits: deleteSelectedUnits,
    })));

    await act(async () => {
      await result.current.splitRouted('utt-1', 1.2);
      await result.current.mergeSelectedSegmentsRouted(new Set(['utt-1', 'utt-2']));
      await result.current.mergeWithPreviousRouted('utt-1');
      await result.current.mergeWithNextRouted('utt-1');
      await result.current.deleteUnitRouted('utt-1');
      await result.current.deleteSelectedUnitsRouted(new Set(['utt-1', 'utt-2']));
    });

    expect(splitUnit).toHaveBeenCalledWith('utt-1', 1.2);
    expect(mergeSelectedUnits).toHaveBeenCalledWith(new Set(['utt-1', 'utt-2']));
    expect(mergeWithPrevious).toHaveBeenCalledWith('utt-1');
    expect(mergeWithNext).toHaveBeenCalledWith('utt-1');
    expect(deleteUnit).toHaveBeenCalledWith('utt-1');
    expect(deleteSelectedUnits).toHaveBeenCalledWith(new Set(['utt-1', 'utt-2']));
  });
});