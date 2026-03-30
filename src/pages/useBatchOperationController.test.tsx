// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { act } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { UtteranceDocType } from '../db';
import { useBatchOperationController } from './useBatchOperationController';

function makeUtterance(id: string, startTime: number, endTime: number, speakerId?: string): UtteranceDocType {
  return {
    id,
    mediaId: 'media-1',
    textId: 'text-1',
    startTime,
    endTime,
    createdAt: '2026-03-29T00:00:00.000Z',
    updatedAt: '2026-03-29T00:00:00.000Z',
    ...(speakerId ? { speakerId } : {}),
  } as UtteranceDocType;
}

describe('useBatchOperationController', () => {
  it('maps selection to utterances and sorts selected batch utterances', () => {
    const { result } = renderHook(() => useBatchOperationController({
      selectedUtteranceIds: new Set(['seg-b', 'seg-a']),
      selectedTimelineUnit: null,
      unitToUtteranceId: new Map([
        ['seg-a', 'utt-2'],
        ['seg-b', 'utt-1'],
      ]),
      utterancesOnCurrentMedia: [
        makeUtterance('utt-2', 3, 4),
        makeUtterance('utt-1', 1, 2),
      ],
      setSaveState: vi.fn(),
      offsetSelectedTimes: vi.fn(async () => undefined),
      scaleSelectedTimes: vi.fn(async () => undefined),
      splitByRegex: vi.fn(async () => undefined),
      mergeSelectedUtterances: vi.fn(async () => undefined),
    }));

    expect(Array.from(result.current.selectedUtteranceIdsForSpeakerActionsSet).sort()).toEqual(['utt-1', 'utt-2']);
    expect(result.current.selectedBatchUtterances.map((item) => item.id)).toEqual(['utt-1', 'utt-2']);
  });

  it('surfaces partial mapping feedback and executes batch action on valid utterances', async () => {
    const setSaveState = vi.fn();
    const offsetSelectedTimes = vi.fn(async () => undefined);

    const { result } = renderHook(() => useBatchOperationController({
      selectedUtteranceIds: new Set(['seg-a', 'missing']),
      selectedTimelineUnit: null,
      unitToUtteranceId: new Map([['seg-a', 'utt-1']]),
      utterancesOnCurrentMedia: [makeUtterance('utt-1', 1, 2)],
      setSaveState,
      offsetSelectedTimes,
      scaleSelectedTimes: vi.fn(async () => undefined),
      splitByRegex: vi.fn(async () => undefined),
      mergeSelectedUtterances: vi.fn(async () => undefined),
    }));

    await act(async () => {
      await result.current.handleBatchOffset(1.5);
    });

    expect(setSaveState).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'done',
      message: expect.stringContaining('已忽略 1 个不可映射选中项'),
    }));
    expect(offsetSelectedTimes).toHaveBeenCalledWith(result.current.selectedUtteranceIdsForSpeakerActionsSet, 1.5);
  });

  it('surfaces explicit error when selection exists but maps to no editable utterances', async () => {
    const setSaveState = vi.fn();
    const mergeSelectedUtterances = vi.fn(async () => undefined);

    const { result } = renderHook(() => useBatchOperationController({
      selectedUtteranceIds: new Set(['seg-missing']),
      selectedTimelineUnit: null,
      unitToUtteranceId: new Map(),
      utterancesOnCurrentMedia: [],
      setSaveState,
      offsetSelectedTimes: vi.fn(async () => undefined),
      scaleSelectedTimes: vi.fn(async () => undefined),
      splitByRegex: vi.fn(async () => undefined),
      mergeSelectedUtterances,
    }));

    await act(async () => {
      await result.current.handleBatchMerge();
    });

    expect(setSaveState).toHaveBeenCalledWith({
      kind: 'error',
      message: '当前选中的语段无法映射到可编辑句段，请先选择可编辑句段后再试。',
    });
    expect(mergeSelectedUtterances).not.toHaveBeenCalled();
  });

  it('maps single selected timeline unit through segment-to-utterance fallback for batch actions', async () => {
    const scaleSelectedTimes = vi.fn(async () => undefined);

    const { result } = renderHook(() => useBatchOperationController({
      selectedUtteranceIds: new Set(),
      selectedTimelineUnit: { layerId: 'layer-seg', unitId: 'seg-a', kind: 'segment' },
      unitToUtteranceId: new Map([['seg-a', 'utt-2']]),
      utterancesOnCurrentMedia: [
        makeUtterance('utt-1', 1, 2),
        makeUtterance('utt-2', 3, 4),
      ],
      setSaveState: vi.fn(),
      offsetSelectedTimes: vi.fn(async () => undefined),
      scaleSelectedTimes,
      splitByRegex: vi.fn(async () => undefined),
      mergeSelectedUtterances: vi.fn(async () => undefined),
    }));

    expect(Array.from(result.current.selectedUtteranceIdsForSpeakerActionsSet)).toEqual(['utt-2']);
    expect(result.current.selectedBatchUtterances.map((item) => item.id)).toEqual(['utt-2']);

    await act(async () => {
      await result.current.handleBatchScale(1.25, 3);
    });

    expect(scaleSelectedTimes).toHaveBeenCalledWith(new Set(['utt-2']), 1.25, 3);
  });
});