// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LayerUnitDocType } from '../db';
import type { TimelineUnitView } from '../hooks/timelineUnitView';
import { unitToView } from '../hooks/timelineUnitView';
import { LOCALE_PREFERENCE_STORAGE_KEY } from '../i18n';
import { useBatchOperationController } from './useBatchOperationController';

function unitsWithResolver(units: LayerUnitDocType[], layerId = 'layer-default') {
  const unitsOnCurrentMedia = units.map((u) => unitToView(u, layerId));
  return {
    unitsOnCurrentMedia,
    getUnitDocById: (id: string) => units.find((u) => u.id === id),
  };
}

function segmentView(
  segmentId: string,
  parentUnitId: string,
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
    parentUnitId,
  };
}

function makeUnit(id: string, startTime: number, endTime: number, speakerId?: string): LayerUnitDocType {
  return {
    id,
    mediaId: 'media-1',
    textId: 'text-1',
    startTime,
    endTime,
    createdAt: '2026-03-29T00:00:00.000Z',
    updatedAt: '2026-03-29T00:00:00.000Z',
    ...(speakerId ? { speakerId } : {}),
  } as LayerUnitDocType;
}

describe('useBatchOperationController', () => {
  beforeEach(() => {
    window.localStorage.setItem(LOCALE_PREFERENCE_STORAGE_KEY, 'zh-CN');
  });

  afterEach(() => {
    window.localStorage.removeItem(LOCALE_PREFERENCE_STORAGE_KEY);
  });

  it('maps selection to units and sorts selected batch units', () => {
    const utt1 = makeUnit('utt-1', 1, 2);
    const utt2 = makeUnit('utt-2', 3, 4);
    const { unitsOnCurrentMedia, getUnitDocById } = unitsWithResolver([utt2, utt1]);
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
      getUnitDocById,
      setSaveState: vi.fn(),
      offsetSelectedTimes: vi.fn(async () => undefined),
      scaleSelectedTimes: vi.fn(async () => undefined),
      splitByRegex: vi.fn(async () => undefined),
      mergeSelectedUnits: vi.fn(async () => undefined),
    }));

    expect(Array.from(result.current.selectedBatchUnitIdsSet).sort()).toEqual(['utt-1', 'utt-2']);
    expect(result.current.selectedBatchUnits.map((item) => item.id)).toEqual(['utt-1', 'utt-2']);
  });

  it('surfaces partial mapping feedback and executes batch action on valid units', async () => {
    const setSaveState = vi.fn();
    const offsetSelectedTimes = vi.fn(async () => undefined);

    const { unitsOnCurrentMedia, getUnitDocById } = unitsWithResolver([makeUnit('utt-1', 1, 2)]);
    const unitViewById = new Map<string, TimelineUnitView>([
      ...unitsOnCurrentMedia.map((u) => [u.id, u] as const),
      ['seg-a', segmentView('seg-a', 'utt-1', 'layer-default', 'media-1')],
    ]);
    const { result } = renderHook(() => useBatchOperationController({
      selectedUnitIds: new Set(['seg-a', 'missing']),
      selectedTimelineUnit: null,
      unitViewById,
      unitsOnCurrentMedia,
      getUnitDocById,
      setSaveState,
      offsetSelectedTimes,
      scaleSelectedTimes: vi.fn(async () => undefined),
      splitByRegex: vi.fn(async () => undefined),
      mergeSelectedUnits: vi.fn(async () => undefined),
    }));

    await act(async () => {
      await result.current.handleBatchOffset(1.5);
    });

    expect(setSaveState).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'done',
      message: expect.stringContaining('已忽略 1 个不可映射选中项'),
    }));
    expect(offsetSelectedTimes).toHaveBeenCalledWith(result.current.selectedBatchUnitIdsSet, 1.5);
  });

  it('closes batch action failures into saveState error after partial mapping feedback', async () => {
    const setSaveState = vi.fn();
    const offsetSelectedTimes = vi.fn(async () => {
      throw new Error('disk full');
    });

    const { unitsOnCurrentMedia, getUnitDocById } = unitsWithResolver([makeUnit('utt-1', 1, 2)]);
    const unitViewById = new Map<string, TimelineUnitView>([
      ...unitsOnCurrentMedia.map((u) => [u.id, u] as const),
      ['seg-a', segmentView('seg-a', 'utt-1', 'layer-default', 'media-1')],
    ]);
    const { result } = renderHook(() => useBatchOperationController({
      selectedUnitIds: new Set(['seg-a', 'missing']),
      selectedTimelineUnit: null,
      unitViewById,
      unitsOnCurrentMedia,
      getUnitDocById,
      setSaveState,
      offsetSelectedTimes,
      scaleSelectedTimes: vi.fn(async () => undefined),
      splitByRegex: vi.fn(async () => undefined),
      mergeSelectedUnits: vi.fn(async () => undefined),
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

  it('surfaces explicit error when selection exists but maps to no editable units', async () => {
    const setSaveState = vi.fn();
    const mergeSelectedUnits = vi.fn(async () => undefined);

    const { result } = renderHook(() => useBatchOperationController({
      selectedUnitIds: new Set(['seg-missing']),
      selectedTimelineUnit: null,
      unitViewById: new Map<string, TimelineUnitView>(),
      unitsOnCurrentMedia: [],
      getUnitDocById: () => undefined,
      setSaveState,
      offsetSelectedTimes: vi.fn(async () => undefined),
      scaleSelectedTimes: vi.fn(async () => undefined),
      splitByRegex: vi.fn(async () => undefined),
      mergeSelectedUnits,
    }));

    await act(async () => {
      await result.current.handleBatchMerge();
    });

    expect(setSaveState).toHaveBeenCalledWith({
      kind: 'error',
      message: '当前选中的语段无法映射到可编辑句段，请先选择可编辑句段后再试。',
    });
    expect(mergeSelectedUnits).not.toHaveBeenCalled();
  });

  it('maps single selected timeline unit through segment-to-unit fallback for batch actions', async () => {
    const scaleSelectedTimes = vi.fn(async () => undefined);

    const { unitsOnCurrentMedia, getUnitDocById } = unitsWithResolver([
      makeUnit('utt-1', 1, 2),
      makeUnit('utt-2', 3, 4),
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
      getUnitDocById,
      setSaveState: vi.fn(),
      offsetSelectedTimes: vi.fn(async () => undefined),
      scaleSelectedTimes,
      splitByRegex: vi.fn(async () => undefined),
      mergeSelectedUnits: vi.fn(async () => undefined),
    }));

    expect(Array.from(result.current.selectedBatchUnitIdsSet)).toEqual(['utt-2']);
    expect(result.current.selectedBatchUnits.map((item) => item.id)).toEqual(['utt-2']);

    await act(async () => {
      await result.current.handleBatchScale(1.25, 3);
    });

    expect(scaleSelectedTimes).toHaveBeenCalledWith(new Set(['utt-2']), 1.25, 3);
  });
});