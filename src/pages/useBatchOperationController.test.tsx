// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { UtteranceDocType } from '../db';
import type { TimelineUnitView } from '../hooks/timelineUnitView';
import { utteranceToView } from '../hooks/timelineUnitView';
import { LOCALE_PREFERENCE_STORAGE_KEY } from '../i18n';
import { useBatchOperationController } from './useBatchOperationController';

function unitsWithResolver(utterances: UtteranceDocType[], layerId = 'layer-default') {
  const unitsOnCurrentMedia = utterances.map((u) => utteranceToView(u, layerId));
  return {
    unitsOnCurrentMedia,
    getUtteranceDocById: (id: string) => utterances.find((u) => u.id === id),
  };
}

function segmentView(
  segmentId: string,
  parentUtteranceId: string,
  layerId: string,
  mediaId: string,
): TimelineUnitView {
  return {
    id: segmentId,
    kind: 'segment',
    mediaId,
    layerId,
    startTime: 0,
    endTime: 1,
    text: '',
    parentUtteranceId,
  };
}

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
  beforeEach(() => {
    window.localStorage.setItem(LOCALE_PREFERENCE_STORAGE_KEY, 'zh-CN');
  });

  afterEach(() => {
    window.localStorage.removeItem(LOCALE_PREFERENCE_STORAGE_KEY);
  });

  it('maps selection to utterances and sorts selected batch utterances', () => {
    const utt1 = makeUtterance('utt-1', 1, 2);
    const utt2 = makeUtterance('utt-2', 3, 4);
    const { unitsOnCurrentMedia, getUtteranceDocById } = unitsWithResolver([utt2, utt1]);
    const unitViewById = new Map<string, TimelineUnitView>([
      ...unitsOnCurrentMedia.map((u) => [u.id, u] as const),
      ['seg-b', segmentView('seg-b', 'utt-1', 'layer-default', 'media-1')],
      ['seg-a', segmentView('seg-a', 'utt-2', 'layer-default', 'media-1')],
    ]);
    const { result } = renderHook(() => useBatchOperationController({
      selectedUnitIds: new Set(['seg-b', 'seg-a']),
      selectedTimelineUnit: null,
      unitViewById,
      unitsOnCurrentMedia,
      getUtteranceDocById,
      setSaveState: vi.fn(),
      offsetSelectedTimes: vi.fn(async () => undefined),
      scaleSelectedTimes: vi.fn(async () => undefined),
      splitByRegex: vi.fn(async () => undefined),
      mergeSelectedUtterances: vi.fn(async () => undefined),
    }));

    expect(Array.from(result.current.selectedUnitIdsForSpeakerActionsSet).sort()).toEqual(['utt-1', 'utt-2']);
    expect(result.current.selectedBatchUtterances.map((item) => item.id)).toEqual(['utt-1', 'utt-2']);
  });

  it('surfaces partial mapping feedback and executes batch action on valid utterances', async () => {
    const setSaveState = vi.fn();
    const offsetSelectedTimes = vi.fn(async () => undefined);

    const { unitsOnCurrentMedia, getUtteranceDocById } = unitsWithResolver([makeUtterance('utt-1', 1, 2)]);
    const unitViewById = new Map<string, TimelineUnitView>([
      ...unitsOnCurrentMedia.map((u) => [u.id, u] as const),
      ['seg-a', segmentView('seg-a', 'utt-1', 'layer-default', 'media-1')],
    ]);
    const { result } = renderHook(() => useBatchOperationController({
      selectedUnitIds: new Set(['seg-a', 'missing']),
      selectedTimelineUnit: null,
      unitViewById,
      unitsOnCurrentMedia,
      getUtteranceDocById,
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
    expect(offsetSelectedTimes).toHaveBeenCalledWith(result.current.selectedUnitIdsForSpeakerActionsSet, 1.5);
  });

  it('closes batch action failures into saveState error after partial mapping feedback', async () => {
    const setSaveState = vi.fn();
    const offsetSelectedTimes = vi.fn(async () => {
      throw new Error('disk full');
    });

    const { unitsOnCurrentMedia, getUtteranceDocById } = unitsWithResolver([makeUtterance('utt-1', 1, 2)]);
    const unitViewById = new Map<string, TimelineUnitView>([
      ...unitsOnCurrentMedia.map((u) => [u.id, u] as const),
      ['seg-a', segmentView('seg-a', 'utt-1', 'layer-default', 'media-1')],
    ]);
    const { result } = renderHook(() => useBatchOperationController({
      selectedUnitIds: new Set(['seg-a', 'missing']),
      selectedTimelineUnit: null,
      unitViewById,
      unitsOnCurrentMedia,
      getUtteranceDocById,
      setSaveState,
      offsetSelectedTimes,
      scaleSelectedTimes: vi.fn(async () => undefined),
      splitByRegex: vi.fn(async () => undefined),
      mergeSelectedUtterances: vi.fn(async () => undefined),
    }));

    await act(async () => {
      await expect(result.current.handleBatchOffset(1.5)).resolves.toBeUndefined();
    });

    expect(setSaveState).toHaveBeenNthCalledWith(1, expect.objectContaining({
      kind: 'done',
      message: expect.stringContaining('已忽略 1 个不可映射选中项'),
    }));
    expect(setSaveState).toHaveBeenNthCalledWith(2, expect.objectContaining({
      kind: 'error',
      message: '批量时间偏移失败：disk full',
      errorMeta: expect.objectContaining({
        category: 'action',
        action: '批量时间偏移',
        detail: 'disk full',
      }),
    }));
  });

  it('surfaces explicit error when selection exists but maps to no editable utterances', async () => {
    const setSaveState = vi.fn();
    const mergeSelectedUtterances = vi.fn(async () => undefined);

    const { result } = renderHook(() => useBatchOperationController({
      selectedUnitIds: new Set(['seg-missing']),
      selectedTimelineUnit: null,
      unitViewById: new Map<string, TimelineUnitView>(),
      unitsOnCurrentMedia: [],
      getUtteranceDocById: () => undefined,
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

    const { unitsOnCurrentMedia, getUtteranceDocById } = unitsWithResolver([
      makeUtterance('utt-1', 1, 2),
      makeUtterance('utt-2', 3, 4),
    ], 'layer-seg');
    const unitViewById = new Map<string, TimelineUnitView>([
      ...unitsOnCurrentMedia.map((u) => [u.id, u] as const),
      ['seg-a', segmentView('seg-a', 'utt-2', 'layer-seg', 'media-1')],
    ]);
    const { result } = renderHook(() => useBatchOperationController({
      selectedUnitIds: new Set(),
      selectedTimelineUnit: { layerId: 'layer-seg', unitId: 'seg-a', kind: 'segment' },
      unitViewById,
      unitsOnCurrentMedia,
      getUtteranceDocById,
      setSaveState: vi.fn(),
      offsetSelectedTimes: vi.fn(async () => undefined),
      scaleSelectedTimes,
      splitByRegex: vi.fn(async () => undefined),
      mergeSelectedUtterances: vi.fn(async () => undefined),
    }));

    expect(Array.from(result.current.selectedUnitIdsForSpeakerActionsSet)).toEqual(['utt-2']);
    expect(result.current.selectedBatchUtterances.map((item) => item.id)).toEqual(['utt-2']);

    await act(async () => {
      await result.current.handleBatchScale(1.25, 3);
    });

    expect(scaleSelectedTimes).toHaveBeenCalledWith(new Set(['utt-2']), 1.25, 3);
  });
});