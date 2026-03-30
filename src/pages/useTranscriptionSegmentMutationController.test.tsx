// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LayerDocType, LayerSegmentDocType, UtteranceDocType } from '../db';
import type { SaveState } from '../hooks/transcriptionTypes';
import { useTranscriptionSegmentMutationController } from './useTranscriptionSegmentMutationController';

const {
  mockSplitSegment,
  mockMergeAdjacentSegments,
  mockDeleteSegment,
} = vi.hoisted(() => ({
  mockSplitSegment: vi.fn<(segmentId: string, splitTime: number) => Promise<{ second: { id: string } }>>(async () => ({ second: { id: 'seg-right' } })),
  mockMergeAdjacentSegments: vi.fn<(leftId: string, rightId: string) => Promise<void>>(async () => undefined),
  mockDeleteSegment: vi.fn<(segmentId: string) => Promise<void>>(async () => undefined),
}));

vi.mock('../services/LayerSegmentationV2Service', () => ({
  LayerSegmentationV2Service: {
    splitSegment: (segmentId: string, splitTime: number) => mockSplitSegment(segmentId, splitTime),
    mergeAdjacentSegments: (leftId: string, rightId: string) => mockMergeAdjacentSegments(leftId, rightId),
    deleteSegment: (segmentId: string) => mockDeleteSegment(segmentId),
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

function makeSegment(id: string, layerId: string, startTime: number, endTime: number): LayerSegmentDocType {
  return {
    id,
    layerId,
    mediaId: 'media-1',
    textId: 'text-1',
    startTime,
    endTime,
    createdAt: '2026-04-01T00:00:00.000Z',
    updatedAt: '2026-04-01T00:00:00.000Z',
  } as LayerSegmentDocType;
}

function makeUtterance(id: string, startTime: number, endTime: number): UtteranceDocType {
  return {
    id,
    mediaId: 'media-1',
    textId: 'text-1',
    startTime,
    endTime,
    createdAt: '2026-04-01T00:00:00.000Z',
    updatedAt: '2026-04-01T00:00:00.000Z',
  } as UtteranceDocType;
}

type HookInput = Parameters<typeof useTranscriptionSegmentMutationController>[0];

function createBaseInput(overrides: Partial<HookInput> = {}): HookInput {
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
    segmentsByLayer: new Map([['layer-seg', [makeSegment('seg-1', 'layer-seg', 0, 1), makeSegment('seg-2', 'layer-seg', 1, 2), makeSegment('seg-3', 'layer-seg', 2, 4)]]]),
    utterancesOnCurrentMedia: [makeUtterance('utt-1', 1.5, 2.5)],
    setSaveState: vi.fn() as unknown as (state: SaveState) => void,
    splitUtterance: vi.fn(async () => undefined),
    mergeWithPrevious: vi.fn(async () => undefined),
    mergeWithNext: vi.fn(async () => undefined),
    deleteUtterance: vi.fn(async () => undefined),
    deleteSelectedUtterances: vi.fn(async () => undefined),
    ...overrides,
  };
}

describe('useTranscriptionSegmentMutationController', () => {
  beforeEach(() => {
    mockSplitSegment.mockClear();
    mockMergeAdjacentSegments.mockClear();
    mockDeleteSegment.mockClear();
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

  it('blocks time-subdivision merge when merged range exceeds parent utterance', async () => {
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
      segmentsByLayer: new Map([['layer-sub', [makeSegment('seg-1', 'layer-sub', 1, 2), makeSegment('seg-2', 'layer-sub', 2, 3)]]]),
      utterancesOnCurrentMedia: [makeUtterance('utt-1', 1.5, 3.0)],
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

  it('reloads segments and surfaces error when batch segment delete fails', async () => {
    mockDeleteSegment.mockImplementationOnce(async () => undefined).mockImplementationOnce(async () => {
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
      await result.current.deleteSelectedUtterancesRouted(new Set(['seg-1', 'seg-2']));
    });

    expect(pushUndo).toHaveBeenCalledWith('删除 2 个句段');
    expect(mockDeleteSegment).toHaveBeenNthCalledWith(1, 'seg-1');
    expect(mockDeleteSegment).toHaveBeenNthCalledWith(2, 'seg-2');
    expect(reloadSegments).toHaveBeenCalledTimes(1);
    expect(setSaveState).toHaveBeenCalledWith({ kind: 'error', message: 'delete failed' });
  });

  it('falls back to utterance mutations when current layer does not use segment timeline', async () => {
    const splitUtterance = vi.fn(async () => undefined);
    const mergeWithPrevious = vi.fn(async () => undefined);
    const mergeWithNext = vi.fn(async () => undefined);
    const deleteUtterance = vi.fn(async () => undefined);
    const deleteSelectedUtterances = vi.fn(async () => undefined);
    const { result } = renderHook(() => useTranscriptionSegmentMutationController(createBaseInput({
      resolveSegmentRoutingForLayer: () => ({
        layer: makeLayer('layer-main'),
        segmentSourceLayer: undefined,
        sourceLayerId: '',
        editMode: 'utterance',
      }),
      splitUtterance,
      mergeWithPrevious,
      mergeWithNext,
      deleteUtterance,
      deleteSelectedUtterances,
    })));

    await act(async () => {
      await result.current.splitRouted('utt-1', 1.2);
      await result.current.mergeWithPreviousRouted('utt-1');
      await result.current.mergeWithNextRouted('utt-1');
      await result.current.deleteUtteranceRouted('utt-1');
      await result.current.deleteSelectedUtterancesRouted(new Set(['utt-1', 'utt-2']));
    });

    expect(splitUtterance).toHaveBeenCalledWith('utt-1', 1.2);
    expect(mergeWithPrevious).toHaveBeenCalledWith('utt-1');
    expect(mergeWithNext).toHaveBeenCalledWith('utt-1');
    expect(deleteUtterance).toHaveBeenCalledWith('utt-1');
    expect(deleteSelectedUtterances).toHaveBeenCalledWith(new Set(['utt-1', 'utt-2']));
  });
});