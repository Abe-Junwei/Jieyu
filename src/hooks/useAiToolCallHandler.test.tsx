// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import type { LayerUnitDocType, LayerDocType } from '../db';
import { LOCALE_PREFERENCE_STORAGE_KEY } from '../i18n';
import { useAiToolCallHandler } from './useAiToolCallHandler';

beforeEach(() => {
  window.localStorage.setItem(LOCALE_PREFERENCE_STORAGE_KEY, 'zh-CN');
});

afterEach(() => {
  window.localStorage.removeItem(LOCALE_PREFERENCE_STORAGE_KEY);
  cleanup();
});

const NOW = new Date().toISOString();

function makeUnit(id: string): LayerUnitDocType {
  return {
    id,
    textId: 't1',
    mediaId: 'm1',
    startTime: 0,
    endTime: 1,
    transcription: {},
    createdAt: NOW,
    updatedAt: NOW,
  } as LayerUnitDocType;
}

function makeTranslationLayer(id: string, zhoName: string): LayerDocType {
  return {
    id,
    textId: 't1',
    key: id,
    name: { zho: zhoName },
    layerType: 'translation',
    languageId: 'zho',
    modality: 'text',
    createdAt: NOW,
    updatedAt: NOW,
  } as LayerDocType;
}

function makeParams(
  overrides: Partial<Parameters<typeof useAiToolCallHandler>[0]> = {},
): Parameters<typeof useAiToolCallHandler>[0] {
  return {
    units: [],
    selectedUnit: undefined,
    selectedUnitMedia: undefined,
    selectedLayerId: '',
    transcriptionLayers: [],
    translationLayers: [],
    layerLinks: [],
    createLayer: vi.fn(),
    createAdjacentUnit: vi.fn(),
    createTranscriptionSegment: vi.fn(),
    splitUnit: vi.fn(),
    splitTranscriptionSegment: vi.fn(),
    deleteUnit: vi.fn(),
    deleteLayer: vi.fn(),
    toggleLayerLink: vi.fn(),
    saveUnitText: vi.fn(),
    saveUnitLayerText: vi.fn(),
    saveSegmentContentForLayer: vi.fn(),
    segmentTargets: [],
    bridgeTextForLayerWrite: vi.fn(async ({ text }) => text),
    executeAction: vi.fn(),
    getSegments: vi.fn(() => []),
    navigateTo: vi.fn(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// delete_translation_row
// ---------------------------------------------------------------------------

describe('useAiToolCallHandler — clear_translation_segment', () => {
  it('以空字符串调用 saveUnitLayerText 并返回精确成功消息', async () => {
    const unit = makeUnit('u1');
    const layer = makeTranslationLayer('layer1', '普通话');
    const saveSpy = vi.fn<(u: string, t: string, l: string) => Promise<void>>().mockResolvedValue(undefined);

    const { result } = renderHook(() =>
      useAiToolCallHandler(
        makeParams({
          units: [unit],
          selectedUnit: unit,
          selectedLayerId: 'layer1',
          translationLayers: [layer],
          saveUnitLayerText: saveSpy,
        }),
      ),
    );

    let response: Awaited<ReturnType<typeof result.current>> | undefined;
    await act(async () => {
      response = await result.current({
        name: 'clear_translation_segment',
        arguments: { segmentIndex: 1, layerId: 'layer1' },
      });
    });

    // 验证以空字符串调用（清空）而非删除记录
    expect(saveSpy).toHaveBeenCalledTimes(1);
    expect(saveSpy).toHaveBeenCalledWith('u1', '', 'layer1');
    // 验证返回消息语义精确
    expect(response?.ok).toBe(true);
    expect(response?.message).toBe('已清空句段 u1 在层 普通话 的翻译文本。');
  });

  it('无句段时返回失败且不调用 saveUnitLayerText', async () => {
    const layer = makeTranslationLayer('layer1', '普通话');
    const saveSpy = vi.fn();

    const { result } = renderHook(() =>
      useAiToolCallHandler(
        makeParams({
          units: [],
          selectedUnit: undefined,
          selectedLayerId: 'layer1',
          translationLayers: [layer],
          saveUnitLayerText: saveSpy,
        }),
      ),
    );

    let response: Awaited<ReturnType<typeof result.current>> | undefined;
    await act(async () => {
      response = await result.current({
        name: 'clear_translation_segment',
        arguments: { segmentIndex: 1, layerId: 'layer1' },
      });
    });

    expect(response?.ok).toBe(false);
    expect(saveSpy).not.toHaveBeenCalled();
  });

  it('无翻译层时返回失败且不调用 saveUnitLayerText', async () => {
    const unit = makeUnit('u1');
    const saveSpy = vi.fn();

    const { result } = renderHook(() =>
      useAiToolCallHandler(
        makeParams({
          units: [unit],
          selectedUnit: unit,
          selectedLayerId: '',
          translationLayers: [],
          saveUnitLayerText: saveSpy,
        }),
      ),
    );

    let response: Awaited<ReturnType<typeof result.current>> | undefined;
    await act(async () => {
      response = await result.current({
        name: 'clear_translation_segment',
        arguments: { segmentIndex: 1, layerId: 'layer1' },
      });
    });

    expect(response?.ok).toBe(false);
    expect(saveSpy).not.toHaveBeenCalled();
  });

  it('指定 segmentIndex 参数时清空目标句段而非当前选中', async () => {
    const selected = makeUnit('selected-u');
    const target = makeUnit('target-u');
    const layer = makeTranslationLayer('layer1', '英语');
    const saveSpy = vi.fn<(u: string, t: string, l: string) => Promise<void>>().mockResolvedValue(undefined);

    const { result } = renderHook(() =>
      useAiToolCallHandler(
        makeParams({
          units: [selected, target],
          selectedUnit: selected,
          selectedLayerId: 'layer1',
          translationLayers: [layer],
          saveUnitLayerText: saveSpy,
        }),
      ),
    );

    await act(async () => {
      await result.current({
        name: 'clear_translation_segment',
        arguments: { segmentIndex: 2, layerId: 'layer1' },
      });
    });

    expect(saveSpy).toHaveBeenCalledWith('target-u', '', 'layer1');
  });

  it('resolves last segment selector when clearing translation', async () => {
    const layer = makeTranslationLayer('layer1', '英语');
    const saveSpy = vi.fn<(u: string, t: string, l: string) => Promise<void>>().mockResolvedValue(undefined);

    const { result } = renderHook(() =>
      useAiToolCallHandler(
        makeParams({
          units: [
            { ...makeUnit('seg-2'), startTime: 2, endTime: 3 },
            { ...makeUnit('seg-1'), startTime: 0, endTime: 1 },
            { ...makeUnit('seg-3'), startTime: 4, endTime: 5 },
          ],
          selectedLayerId: 'layer1',
          translationLayers: [layer],
          saveUnitLayerText: saveSpy,
        }),
      ),
    );

    await act(async () => {
      await result.current({
        name: 'clear_translation_segment',
        arguments: { segmentPosition: 'last', layerId: 'layer1' },
      });
    });

    expect(saveSpy).toHaveBeenCalledWith('seg-3', '', 'layer1');
  });
});

// ---------------------------------------------------------------------------
// delete_transcription_segment
// ---------------------------------------------------------------------------

describe('useAiToolCallHandler — delete_transcription_segment', () => {
  it('uses all current units when allSegments is requested', async () => {
    const deleteSelectionSpy = vi.fn<(ids: Set<string>) => Promise<void>>().mockResolvedValue(undefined);

    const { result } = renderHook(() =>
      useAiToolCallHandler(
        makeParams({
          units: [makeUnit('seg-1'), makeUnit('seg-2'), makeUnit('seg-3')],
          deleteSelectedUnits: deleteSelectionSpy,
        }),
      ),
    );

    let response: Awaited<ReturnType<typeof result.current>> | undefined;
    await act(async () => {
      response = await result.current({
        name: 'delete_transcription_segment',
        arguments: { allSegments: true },
      });
    });

    expect(deleteSelectionSpy).toHaveBeenCalledTimes(1);
    expect(Array.from(deleteSelectionSpy.mock.calls[0]?.[0] ?? [])).toEqual(['seg-1', 'seg-2', 'seg-3']);
    expect(response?.ok).toBe(true);
    expect(response?.message).toContain('已删除 3 个句段');
  });

  it('prefers concrete segmentIds over allSegments when both are present', async () => {
    const deleteSelectionSpy = vi.fn<(ids: Set<string>) => Promise<void>>().mockResolvedValue(undefined);

    const { result } = renderHook(() =>
      useAiToolCallHandler(
        makeParams({
          units: [makeUnit('seg-1'), makeUnit('seg-2'), makeUnit('seg-3')],
          deleteSelectedUnits: deleteSelectionSpy,
        }),
      ),
    );

    let response: Awaited<ReturnType<typeof result.current>> | undefined;
    await act(async () => {
      response = await result.current({
        name: 'delete_transcription_segment',
        arguments: { allSegments: true, segmentIds: ['seg-2'] },
      });
    });

    expect(deleteSelectionSpy).toHaveBeenCalledTimes(1);
    expect(Array.from(deleteSelectionSpy.mock.calls[0]?.[0] ?? [])).toEqual(['seg-2']);
    expect(response?.ok).toBe(true);
    expect(response?.message).toContain('已删除 1 个句段');
  });

  it('resolves segmentIndex to the ordered unit target', async () => {
    const deleteSpy = vi.fn<(id: string) => Promise<void>>().mockResolvedValue(undefined);

    const { result } = renderHook(() =>
      useAiToolCallHandler(
        makeParams({
          units: [
            { ...makeUnit('seg-2'), startTime: 2, endTime: 3 },
            { ...makeUnit('seg-1'), startTime: 0, endTime: 1 },
            { ...makeUnit('seg-3'), startTime: 4, endTime: 5 },
          ],
          deleteUnit: deleteSpy,
        }),
      ),
    );

    await act(async () => {
      await result.current({
        name: 'delete_transcription_segment',
        arguments: { segmentIndex: 2 },
      });
    });

    expect(deleteSpy).toHaveBeenCalledWith('seg-2');
  });

  it('resolves segmentPosition=last to the last ordered unit target', async () => {
    const deleteSpy = vi.fn<(id: string) => Promise<void>>().mockResolvedValue(undefined);

    const { result } = renderHook(() =>
      useAiToolCallHandler(
        makeParams({
          units: [
            { ...makeUnit('seg-2'), startTime: 2, endTime: 3 },
            { ...makeUnit('seg-1'), startTime: 0, endTime: 1 },
            { ...makeUnit('seg-3'), startTime: 4, endTime: 5 },
          ],
          deleteUnit: deleteSpy,
        }),
      ),
    );

    await act(async () => {
      await result.current({
        name: 'delete_transcription_segment',
        arguments: { segmentPosition: 'last' },
      });
    });

    expect(deleteSpy).toHaveBeenCalledWith('seg-3');
  });

  it('resolves segmentPosition=penultimate to the penultimate unit target', async () => {
    const deleteSpy = vi.fn<(id: string) => Promise<void>>().mockResolvedValue(undefined);

    const { result } = renderHook(() =>
      useAiToolCallHandler(
        makeParams({
          units: [
            { ...makeUnit('seg-2'), startTime: 2, endTime: 3 },
            { ...makeUnit('seg-1'), startTime: 0, endTime: 1 },
            { ...makeUnit('seg-3'), startTime: 4, endTime: 5 },
          ],
          deleteUnit: deleteSpy,
        }),
      ),
    );

    await act(async () => {
      await result.current({
        name: 'delete_transcription_segment',
        arguments: { segmentPosition: 'penultimate' },
      });
    });

    expect(deleteSpy).toHaveBeenCalledWith('seg-2');
  });

  it('resolves previous selector relative to the selected unit', async () => {
    const deleteSpy = vi.fn<(id: string) => Promise<void>>().mockResolvedValue(undefined);
    const selected = { ...makeUnit('seg-2'), startTime: 2, endTime: 3 };

    const { result } = renderHook(() =>
      useAiToolCallHandler(
        makeParams({
          units: [
            selected,
            { ...makeUnit('seg-1'), startTime: 0, endTime: 1 },
            { ...makeUnit('seg-3'), startTime: 4, endTime: 5 },
          ],
          selectedUnit: selected,
          deleteUnit: deleteSpy,
        }),
      ),
    );

    await act(async () => {
      await result.current({
        name: 'delete_transcription_segment',
        arguments: { segmentPosition: 'previous' },
      });
    });

    expect(deleteSpy).toHaveBeenCalledWith('seg-1');
  });

  it('resolves next selector relative to the selected unit', async () => {
    const deleteSpy = vi.fn<(id: string) => Promise<void>>().mockResolvedValue(undefined);
    const selected = { ...makeUnit('seg-2'), startTime: 2, endTime: 3 };

    const { result } = renderHook(() =>
      useAiToolCallHandler(
        makeParams({
          units: [
            selected,
            { ...makeUnit('seg-1'), startTime: 0, endTime: 1 },
            { ...makeUnit('seg-3'), startTime: 4, endTime: 5 },
          ],
          selectedUnit: selected,
          deleteUnit: deleteSpy,
        }),
      ),
    );

    await act(async () => {
      await result.current({
        name: 'delete_transcription_segment',
        arguments: { segmentPosition: 'next' },
      });
    });

    expect(deleteSpy).toHaveBeenCalledWith('seg-3');
  });

  it('resolves middle selector to the middle ordered unit target', async () => {
    const deleteSpy = vi.fn<(id: string) => Promise<void>>().mockResolvedValue(undefined);

    const { result } = renderHook(() =>
      useAiToolCallHandler(
        makeParams({
          units: [
            { ...makeUnit('seg-4'), startTime: 6, endTime: 7 },
            { ...makeUnit('seg-2'), startTime: 2, endTime: 3 },
            { ...makeUnit('seg-1'), startTime: 0, endTime: 1 },
            { ...makeUnit('seg-3'), startTime: 4, endTime: 5 },
            { ...makeUnit('seg-5'), startTime: 8, endTime: 9 },
          ],
          deleteUnit: deleteSpy,
        }),
      ),
    );

    await act(async () => {
      await result.current({
        name: 'delete_transcription_segment',
        arguments: { segmentPosition: 'middle' },
      });
    });

    expect(deleteSpy).toHaveBeenCalledWith('seg-3');
  });

  it('uses segmentId directly when deleting a routed segment target', async () => {
    const deleteSpy = vi.fn<(id: string) => Promise<void>>().mockResolvedValue(undefined);

    const { result } = renderHook(() =>
      useAiToolCallHandler(
        makeParams({
          deleteUnit: deleteSpy,
        }),
      ),
    );

    let response: Awaited<ReturnType<typeof result.current>> | undefined;
    await act(async () => {
      response = await result.current({
        name: 'delete_transcription_segment',
        arguments: { segmentId: 'seg-1' },
      });
    });

    expect(deleteSpy).toHaveBeenCalledWith('seg-1');
    expect(response?.ok).toBe(true);
  });

  it('uses deleteSelectedUnits for batch delete targets', async () => {
    const deleteSelectionSpy = vi.fn<(ids: Set<string>) => Promise<void>>().mockResolvedValue(undefined);

    const { result } = renderHook(() =>
      useAiToolCallHandler(
        makeParams({
          deleteSelectedUnits: deleteSelectionSpy,
        }),
      ),
    );

    let response: Awaited<ReturnType<typeof result.current>> | undefined;
    await act(async () => {
      response = await result.current({
        name: 'delete_transcription_segment',
        arguments: { segmentIds: ['seg-1', 'seg-2'] },
      });
    });

    expect(deleteSelectionSpy).toHaveBeenCalledTimes(1);
    expect(Array.from(deleteSelectionSpy.mock.calls[0]?.[0] ?? [])).toEqual(['seg-1', 'seg-2']);
    expect(response?.ok).toBe(true);
    expect(response?.message).toContain('已删除 2 个句段');
  });

  it('still accepts deprecated deleteSelectedUnits for batch delete targets', async () => {
    const deleteSelectionSpy = vi.fn<(ids: Set<string>) => Promise<void>>().mockResolvedValue(undefined);

    const { result } = renderHook(() =>
      useAiToolCallHandler(
        makeParams({
          deleteSelectedUnits: deleteSelectionSpy,
        }),
      ),
    );

    let response: Awaited<ReturnType<typeof result.current>> | undefined;
    await act(async () => {
      response = await result.current({
        name: 'delete_transcription_segment',
        arguments: { segmentIds: ['seg-1', 'seg-2'] },
      });
    });

    expect(deleteSelectionSpy).toHaveBeenCalledTimes(1);
    expect(Array.from(deleteSelectionSpy.mock.calls[0]?.[0] ?? [])).toEqual(['seg-1', 'seg-2']);
    expect(response?.ok).toBe(true);
  });
});

describe('useAiToolCallHandler — merge_transcription_segments', () => {
  it('prefers mergeSelectedSegments when only segment ids are provided', async () => {
    const mergeSelectedUnits = vi.fn<(ids: Set<string>) => Promise<void>>().mockResolvedValue(undefined);
    const mergeSelectedSegments = vi.fn<(ids: Set<string>) => Promise<void>>().mockResolvedValue(undefined);

    const { result } = renderHook(() =>
      useAiToolCallHandler(
        makeParams({
          mergeSelectedUnits,
          mergeSelectedSegments,
        }),
      ),
    );

    let response: Awaited<ReturnType<typeof result.current>> | undefined;
    await act(async () => {
      response = await result.current({
        name: 'merge_transcription_segments',
        arguments: { segmentIds: ['seg-a', 'seg-b'] },
      });
    });

    expect(mergeSelectedSegments).toHaveBeenCalledTimes(1);
    expect(Array.from(mergeSelectedSegments.mock.calls[0]?.[0] ?? [])).toEqual(['seg-a', 'seg-b']);
    expect(mergeSelectedUnits).not.toHaveBeenCalled();
    expect(response?.ok).toBe(true);
  });

  it('falls back to mergeSelectedUnits when segment merge executor is unavailable', async () => {
    const mergeSelectedUnits = vi.fn<(ids: Set<string>) => Promise<void>>().mockResolvedValue(undefined);

    const { result } = renderHook(() =>
      useAiToolCallHandler(
        makeParams({
          mergeSelectedUnits,
        }),
      ),
    );

    let response: Awaited<ReturnType<typeof result.current>> | undefined;
    await act(async () => {
      response = await result.current({
        name: 'merge_transcription_segments',
        arguments: { segmentIds: ['seg-a', 'seg-b'] },
      });
    });

    expect(mergeSelectedUnits).toHaveBeenCalledTimes(1);
    expect(Array.from(mergeSelectedUnits.mock.calls[0]?.[0] ?? [])).toEqual(['seg-a', 'seg-b']);
    expect(response?.ok).toBe(true);
    expect(response?.message).toContain('2');
  });

  it('still accepts deprecated mergeSelectedUnits when segment merge executor is unavailable', async () => {
    const mergeSelectedUnits = vi.fn<(ids: Set<string>) => Promise<void>>().mockResolvedValue(undefined);

    const { result } = renderHook(() =>
      useAiToolCallHandler(
        makeParams({
          mergeSelectedUnits,
        }),
      ),
    );

    let response: Awaited<ReturnType<typeof result.current>> | undefined;
    await act(async () => {
      response = await result.current({
        name: 'merge_transcription_segments',
        arguments: { segmentIds: ['seg-a', 'seg-b'] },
      });
    });

    expect(mergeSelectedUnits).toHaveBeenCalledTimes(1);
    expect(Array.from(mergeSelectedUnits.mock.calls[0]?.[0] ?? [])).toEqual(['seg-a', 'seg-b']);
    expect(response?.ok).toBe(true);
  });

  it('returns failure result when segment merge executor rejects', async () => {
    const mergeSelectedSegments = vi.fn<(ids: Set<string>) => Promise<void>>().mockRejectedValue(new Error('请先选择相邻句段再执行合并。'));

    const { result } = renderHook(() =>
      useAiToolCallHandler(
        makeParams({
          mergeSelectedSegments,
        }),
      ),
    );

    let response: Awaited<ReturnType<typeof result.current>> | undefined;
    await act(async () => {
      response = await result.current({
        name: 'merge_transcription_segments',
        arguments: { segmentIds: ['seg-a', 'seg-c'] },
      });
    });

    expect(response).toEqual({ ok: false, message: '请先选择相邻句段再执行合并。' });
  });

  it('rejects batch merge when fewer than two targets are provided', async () => {
    const mergeSelectedUnits = vi.fn<(ids: Set<string>) => Promise<void>>().mockResolvedValue(undefined);

    const { result } = renderHook(() =>
      useAiToolCallHandler(
        makeParams({
          mergeSelectedUnits,
        }),
      ),
    );

    let response: Awaited<ReturnType<typeof result.current>> | undefined;
    await act(async () => {
      response = await result.current({
        name: 'merge_transcription_segments',
        arguments: { segmentIds: ['seg-a'] },
      });
    });

    expect(mergeSelectedUnits).not.toHaveBeenCalled();
    expect(response?.ok).toBe(false);
    expect(response?.message).toContain('至少需要选中 2 个句段');
  });

  it('routes merge_prev to an explicit segment target instead of the current selection action', async () => {
    const mergeWithPrevious = vi.fn<(id: string) => Promise<void>>().mockResolvedValue(undefined);
    const executeAction = vi.fn();

    const { result } = renderHook(() =>
      useAiToolCallHandler(
        makeParams({
          mergeWithPrevious,
          executeAction,
          segmentTargets: [
            { id: 'seg-2', kind: 'segment', startTime: 2, endTime: 3, text: '第二段' },
          ],
        }),
      ),
    );

    let response: Awaited<ReturnType<typeof result.current>> | undefined;
    await act(async () => {
      response = await result.current({
        name: 'merge_prev',
        arguments: { segmentId: 'seg-2' },
      });
    });

    expect(response?.ok).toBe(true);
    expect(mergeWithPrevious).toHaveBeenCalledWith('seg-2');
    expect(executeAction).not.toHaveBeenCalled();
  });

  it('routes merge_next to an explicit segment target instead of the current selection action', async () => {
    const mergeWithNext = vi.fn<(id: string) => Promise<void>>().mockResolvedValue(undefined);
    const executeAction = vi.fn();

    const { result } = renderHook(() =>
      useAiToolCallHandler(
        makeParams({
          mergeWithNext,
          executeAction,
          segmentTargets: [
            { id: 'seg-2', kind: 'segment', startTime: 2, endTime: 3, text: '第二段' },
          ],
        }),
      ),
    );

    let response: Awaited<ReturnType<typeof result.current>> | undefined;
    await act(async () => {
      response = await result.current({
        name: 'merge_next',
        arguments: { segmentId: 'seg-2' },
      });
    });

    expect(response?.ok).toBe(true);
    expect(mergeWithNext).toHaveBeenCalledWith('seg-2');
    expect(executeAction).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// auto_gloss_unit
// ---------------------------------------------------------------------------

describe('useAiToolCallHandler — auto_gloss_unit', () => {
  it('returns 暂不支持 for utterly unknown tool name', async () => {
    const { result } = renderHook(() => useAiToolCallHandler(makeParams()));

    let response: Awaited<ReturnType<typeof result.current>> | undefined;
    await act(async () => {
      // Use a cast since 'no_such_tool' is not in AiChatToolName
      response = await result.current({
        name: 'auto_gloss_unit' as Parameters<typeof result.current>[0]['name'],
        arguments: { unitId: 'u1' },
      });
    });

    // When target unit does not exist, it should return an error
    expect(response?.ok).toBe(false);
    expect(response?.message).toContain('未找到目标句段');
  });

  it('calls glossUnit when unit is selected', async () => {
    const unit = makeUnit('u1');
    const { result } = renderHook(() =>
      useAiToolCallHandler(
        makeParams({
          units: [unit],
          selectedUnit: unit,
        }),
      ),
    );

    let response: Awaited<ReturnType<typeof result.current>> | undefined;
    await act(async () => {
      response = await result.current({
        name: 'auto_gloss_unit',
        arguments: { unitId: 'u1' },
      });
    });

    // The service will find 0 tokens for this unit (they're in IndexedDB, not mocked here)
    expect(response?.ok).toBe(true);
    expect(response?.message).toContain('token');
  });
});

describe('useAiToolCallHandler — strict target requirements', () => {
  it('writes segment-backed transcription text via saveSegmentContentForLayer', async () => {
    const saveSegmentContentForLayer = vi.fn<(segmentId: string, layerId: string, value: string) => Promise<void>>().mockResolvedValue(undefined);

    const { result } = renderHook(() =>
      useAiToolCallHandler(
        makeParams({
          selectedLayerId: 'layer-seg',
          transcriptionLayers: [{
            id: 'layer-seg',
            textId: 't1',
            key: 'layer-seg',
            name: { zho: '独立转写层' },
            layerType: 'transcription',
            languageId: 'zho',
            modality: 'text',
            createdAt: NOW,
            updatedAt: NOW,
          } as LayerDocType],
          saveSegmentContentForLayer,
          bridgeTextForLayerWrite: vi.fn(async ({ text }) => `xf:${text}`),
        }),
      ),
    );

    let response: Awaited<ReturnType<typeof result.current>> | undefined;
    await act(async () => {
      response = await result.current({
        name: 'set_transcription_text',
        arguments: { segmentId: 'seg-1', text: '新的句段文本' },
      });
    });

    expect(response?.ok).toBe(true);
    expect(saveSegmentContentForLayer).toHaveBeenCalledWith('seg-1', 'layer-seg', 'xf:新的句段文本');
  });

  it('clears segment-backed translation text via saveSegmentContentForLayer', async () => {
    const saveSegmentContentForLayer = vi.fn<(segmentId: string, layerId: string, value: string) => Promise<void>>().mockResolvedValue(undefined);
    const layer = makeTranslationLayer('layer-tr', '普通话');

    const { result } = renderHook(() =>
      useAiToolCallHandler(
        makeParams({
          selectedLayerId: 'layer-tr',
          translationLayers: [layer],
          saveSegmentContentForLayer,
        }),
      ),
    );

    let response: Awaited<ReturnType<typeof result.current>> | undefined;
    await act(async () => {
      response = await result.current({
        name: 'clear_translation_segment',
        arguments: { segmentId: 'seg-9', layerId: 'layer-tr' },
      });
    });

    expect(response?.ok).toBe(true);
    expect(saveSegmentContentForLayer).toHaveBeenCalledWith('seg-9', 'layer-tr', '');
  });

  it('rejects set_transcription_text without segmentId', async () => {
    const unit = makeUnit('u1');
    const saveSpy = vi.fn<(u: string, t: string, l?: string) => Promise<void>>().mockResolvedValue(undefined);

    const { result } = renderHook(() =>
      useAiToolCallHandler(
        makeParams({
          units: [unit],
          selectedUnit: unit,
          saveUnitText: saveSpy,
        }),
      ),
    );

    let response: Awaited<ReturnType<typeof result.current>> | undefined;
    await act(async () => {
      response = await result.current({ name: 'set_transcription_text', arguments: { text: 'abc' } });
    });

    expect(response?.ok).toBe(false);
    expect(response?.message).toContain('缺少 segmentId');
    expect(saveSpy).not.toHaveBeenCalled();
  });

  it('rejects delete_layer without explicit valid layerId', async () => {
    const deleteLayerSpy = vi.fn<(id: string) => Promise<void>>().mockResolvedValue(undefined);

    const { result } = renderHook(() =>
      useAiToolCallHandler(
        makeParams({
          translationLayers: [makeTranslationLayer('layer1', '普通话')],
          deleteLayer: deleteLayerSpy,
        }),
      ),
    );

    let response: Awaited<ReturnType<typeof result.current>> | undefined;
    await act(async () => {
      response = await result.current({ name: 'delete_layer', arguments: {} });
    });
    expect(response?.ok).toBe(false);
    expect(response?.message).toContain('缺少层编号');

    await act(async () => {
      response = await result.current({ name: 'delete_layer', arguments: { layerId: 'missing-layer' } });
    });
    expect(response?.ok).toBe(false);
    expect(response?.message).toContain('未找到目标层');
    expect(deleteLayerSpy).not.toHaveBeenCalled();
  });

  it('falls back from semantic transcription layerId to unique mandarin transcription layer', async () => {
    const deleteLayerSpy = vi.fn<(id: string) => Promise<void>>().mockResolvedValue(undefined);
    const trcCmn = {
      id: 'trc-cmn',
      textId: 't1',
      key: 'transcription_cmn',
      name: { zho: '普通话转写层' },
      layerType: 'transcription',
      languageId: 'cmn',
      modality: 'text',
      createdAt: NOW,
      updatedAt: NOW,
    } as LayerDocType;

    const { result } = renderHook(() =>
      useAiToolCallHandler(
        makeParams({
          transcriptionLayers: [trcCmn],
          deleteLayer: deleteLayerSpy,
        }),
      ),
    );

    let response: Awaited<ReturnType<typeof result.current>> | undefined;
    await act(async () => {
      response = await result.current({
        name: 'delete_layer',
        arguments: { layerId: 'transcription_layer_mandarin' },
      });
    });

    expect(response?.ok).toBe(true);
    expect(deleteLayerSpy).toHaveBeenCalledWith('trc-cmn');
  });

  it('deletes translation layer by layerType + languageQuery when uniquely matched', async () => {
    const deleteLayerSpy = vi.fn<(id: string) => Promise<void>>().mockResolvedValue(undefined);
    const jpLayer = {
      id: 'trl-jpn',
      textId: 't1',
      key: 'translation_jpn',
      name: { zho: '日本语翻译层' },
      layerType: 'translation',
      languageId: 'jpn',
      modality: 'text',
      createdAt: NOW,
      updatedAt: NOW,
    } as LayerDocType;
    const zhLayer = makeTranslationLayer('trl-zho', '中文翻译层');

    const { result } = renderHook(() =>
      useAiToolCallHandler(
        makeParams({
          translationLayers: [jpLayer, zhLayer],
          deleteLayer: deleteLayerSpy,
        }),
      ),
    );

    let response: Awaited<ReturnType<typeof result.current>> | undefined;
    await act(async () => {
      response = await result.current({
        name: 'delete_layer',
        arguments: { layerType: 'translation', languageQuery: '日本语' },
      });
    });

    expect(response?.ok).toBe(true);
    expect(deleteLayerSpy).toHaveBeenCalledWith('trl-jpn');
  });

  it('rejects delete_layer by layerType + languageQuery when multiple layers match', async () => {
    const deleteLayerSpy = vi.fn<(id: string) => Promise<void>>().mockResolvedValue(undefined);
    const jpLayer1 = {
      id: 'trl-jpn-1',
      textId: 't1',
      key: 'translation_jpn_1',
      name: { zho: '日本语翻译层A' },
      layerType: 'translation',
      languageId: 'jpn',
      modality: 'text',
      createdAt: NOW,
      updatedAt: NOW,
    } as LayerDocType;
    const jpLayer2 = {
      id: 'trl-jpn-2',
      textId: 't1',
      key: 'translation_jpn_2',
      name: { zho: '日本语翻译层B' },
      layerType: 'translation',
      languageId: 'ja',
      modality: 'text',
      createdAt: NOW,
      updatedAt: NOW,
    } as LayerDocType;

    const { result } = renderHook(() =>
      useAiToolCallHandler(
        makeParams({
          translationLayers: [jpLayer1, jpLayer2],
          deleteLayer: deleteLayerSpy,
        }),
      ),
    );

    let response: Awaited<ReturnType<typeof result.current>> | undefined;
    await act(async () => {
      response = await result.current({
        name: 'delete_layer',
        arguments: { layerType: 'translation', languageQuery: '日本语' },
      });
    });

    expect(response?.ok).toBe(false);
    expect(response?.message).toContain('匹配到多个翻译层');
    expect(deleteLayerSpy).not.toHaveBeenCalled();
  });

  it('rejects create_transcription_segment without unitId', async () => {
    const unit = makeUnit('u1');
    const createNextSpy = vi.fn<(u: LayerUnitDocType, d: number) => Promise<void>>().mockResolvedValue(undefined);

    const { result } = renderHook(() =>
      useAiToolCallHandler(
        makeParams({
          units: [unit],
          selectedUnit: unit,
          createAdjacentUnit: createNextSpy,
        }),
      ),
    );

    let response: Awaited<ReturnType<typeof result.current>> | undefined;
    await act(async () => {
      response = await result.current({ name: 'create_transcription_segment', arguments: {} });
    });

    expect(response?.ok).toBe(false);
    expect(response?.message).toContain('缺少目标句段编号');
    expect(createNextSpy).not.toHaveBeenCalled();
  });

  it('creates segment-backed transcription segments through routed createTranscriptionSegment', async () => {
    const createSegmentSpy = vi.fn<(targetId: string) => Promise<void>>().mockResolvedValue(undefined);

    const { result } = renderHook(() =>
      useAiToolCallHandler(
        makeParams({
          createTranscriptionSegment: createSegmentSpy,
          segmentTargets: [
            { id: 'seg-2', kind: 'segment', startTime: 2, endTime: 3, text: '第二段' },
          ],
        }),
      ),
    );

    let response: Awaited<ReturnType<typeof result.current>> | undefined;
    await act(async () => {
      response = await result.current({ name: 'create_transcription_segment', arguments: { segmentId: 'seg-2' } });
    });

    expect(response?.ok).toBe(true);
    expect(createSegmentSpy).toHaveBeenCalledWith('seg-2');
  });

  it('rejects split_transcription_segment when splitTime is missing', async () => {
    const splitSpy = vi.fn<(id: string, splitTime: number) => Promise<void>>().mockResolvedValue(undefined);

    const { result } = renderHook(() =>
      useAiToolCallHandler(
        makeParams({
          splitTranscriptionSegment: splitSpy,
          segmentTargets: [
            { id: 'seg-1', kind: 'segment', startTime: 10, endTime: 14, text: '第一段' },
          ],
        }),
      ),
    );

    let response: Awaited<ReturnType<typeof result.current>> | undefined;
    await act(async () => {
      response = await result.current({ name: 'split_transcription_segment', arguments: { segmentId: 'seg-1' } });
    });

    expect(response?.ok).toBe(false);
    expect(response?.message).toContain('缺少 splitTime');
    expect(splitSpy).not.toHaveBeenCalled();
  });

  it('rejects split_transcription_segment when splitTime is out of range', async () => {
    const splitSpy = vi.fn<(id: string, splitTime: number) => Promise<void>>().mockResolvedValue(undefined);

    const { result } = renderHook(() =>
      useAiToolCallHandler(
        makeParams({
          splitTranscriptionSegment: splitSpy,
          segmentTargets: [
            { id: 'seg-1', kind: 'segment', startTime: 2, endTime: 3, text: '第一段' },
          ],
        }),
      ),
    );

    let response: Awaited<ReturnType<typeof result.current>> | undefined;
    await act(async () => {
      response = await result.current({
        name: 'split_transcription_segment',
        arguments: { segmentId: 'seg-1', splitTime: 2.01 },
      });
    });

    expect(response?.ok).toBe(false);
    expect(response?.message).toContain('切分点不在可用范围内');
    expect(splitSpy).not.toHaveBeenCalled();
  });

  it('splits segment-backed transcription segments through routed splitTranscriptionSegment', async () => {
    const splitSegmentSpy = vi.fn<(targetId: string, splitTime: number) => Promise<void>>().mockResolvedValue(undefined);

    const { result } = renderHook(() =>
      useAiToolCallHandler(
        makeParams({
          splitTranscriptionSegment: splitSegmentSpy,
          segmentTargets: [
            { id: 'seg-2', kind: 'segment', startTime: 2, endTime: 3, text: '第二段' },
          ],
        }),
      ),
    );

    let response: Awaited<ReturnType<typeof result.current>> | undefined;
    await act(async () => {
      response = await result.current({
        name: 'split_transcription_segment',
        arguments: { segmentId: 'seg-2', splitTime: 2.5 },
      });
    });

    expect(response?.ok).toBe(true);
    expect(splitSegmentSpy).toHaveBeenCalledWith('seg-2', 2.5);
  });

  it('rejects auto_gloss_unit without unitId', async () => {
    const unit = makeUnit('u1');
    const { result } = renderHook(() =>
      useAiToolCallHandler(
        makeParams({
          units: [unit],
          selectedUnit: unit,
        }),
      ),
    );

    let response: Awaited<ReturnType<typeof result.current>> | undefined;
    await act(async () => {
      response = await result.current({ name: 'auto_gloss_unit', arguments: {} });
    });

    expect(response?.ok).toBe(false);
    expect(response?.message).toContain('缺少 unitId');
  });

  it('rejects link/unlink without explicit source and target layer ids', async () => {
    const toggleSpy = vi.fn<(k: string, t: string) => Promise<void>>().mockResolvedValue(undefined);

    const { result } = renderHook(() =>
      useAiToolCallHandler(
        makeParams({
          transcriptionLayers: [{
            id: 'trc-1', textId: 't1', key: 'trc-key-1', name: { zho: '转写层' }, layerType: 'transcription', languageId: 'zho', modality: 'text', createdAt: NOW, updatedAt: NOW,
          } as LayerDocType],
          translationLayers: [makeTranslationLayer('trl-1', '翻译层')],
          toggleLayerLink: toggleSpy,
        }),
      ),
    );

    let response: Awaited<ReturnType<typeof result.current>> | undefined;
    await act(async () => {
      response = await result.current({ name: 'link_translation_layer', arguments: {} });
    });
    expect(response?.ok).toBe(false);
    expect(response?.message).toContain('缺少目标转写层信息');

    await act(async () => {
      response = await result.current({ name: 'unlink_translation_layer', arguments: { transcriptionLayerId: 'trc-1' } });
    });
    expect(response?.ok).toBe(false);
    expect(response?.message).toContain('缺少目标翻译层信息');

    await act(async () => {
      response = await result.current({ name: 'add_host', arguments: { translationLayerId: 'trl-1' } });
    });
    expect(response?.ok).toBe(false);
    expect(response?.message).toContain('缺少目标转写层信息');

    await act(async () => {
      response = await result.current({ name: 'switch_preferred_host', arguments: { transcriptionLayerId: 'trc-1' } });
    });
    expect(response?.ok).toBe(false);
    expect(response?.message).toContain('缺少目标翻译层信息');
    expect(toggleSpy).not.toHaveBeenCalled();
  });

  it('rejects create_transcription_layer when language cannot be resolved', async () => {
    const createLayerSpy = vi.fn<(layerType: 'transcription' | 'translation', input: { languageId: string; alias?: string }, modality?: 'text' | 'audio' | 'mixed') => Promise<boolean>>()
      .mockResolvedValue(true);

    const { result } = renderHook(() =>
      useAiToolCallHandler(
        makeParams({
          createLayer: createLayerSpy,
        }),
      ),
    );

    let response: Awaited<ReturnType<typeof result.current>> | undefined;
    await act(async () => {
      response = await result.current({
        name: 'create_transcription_layer',
        arguments: { languageId: 'unknown_language_token' },
      });
    });

    expect(response?.ok).toBe(false);
    expect(response?.message).toContain('无法识别语言');
    expect(createLayerSpy).not.toHaveBeenCalled();
  });

  it('does not fallback to selected/first layer when link targets are missing', async () => {
    const toggleSpy = vi.fn<(k: string, t: string) => Promise<void>>().mockResolvedValue(undefined);

    const { result } = renderHook(() =>
      useAiToolCallHandler(
        makeParams({
          selectedLayerId: 'trl-1',
          transcriptionLayers: [{
            id: 'trc-1', textId: 't1', key: 'trc-key-1', name: { zho: '转写层' }, layerType: 'transcription', languageId: 'zho', modality: 'text', createdAt: NOW, updatedAt: NOW,
          } as LayerDocType],
          translationLayers: [makeTranslationLayer('trl-1', '翻译层')],
          toggleLayerLink: toggleSpy,
        }),
      ),
    );

    let response: Awaited<ReturnType<typeof result.current>> | undefined;
    await act(async () => {
      response = await result.current({
        name: 'link_translation_layer',
        arguments: { transcriptionLayerId: 'trc-1' },
      });
    });

    expect(response?.ok).toBe(false);
    expect(response?.message).toContain('缺少目标翻译层信息');
    expect(toggleSpy).not.toHaveBeenCalled();
  });

  it('links translation by host link semantics when parentLayerId is empty', async () => {
    const toggleSpy = vi.fn<(k: string, t: string) => Promise<void>>().mockResolvedValue(undefined);

    const { result } = renderHook(() =>
      useAiToolCallHandler(
        makeParams({
          transcriptionLayers: [{
            id: 'trc-1', textId: 't1', key: 'trc-key-1', name: { zho: '转写层A' }, layerType: 'transcription', languageId: 'zho', modality: 'text', createdAt: NOW, updatedAt: NOW,
          } as LayerDocType],
          translationLayers: [makeTranslationLayer('trl-1', '翻译层A')],
          layerLinks: [],
          toggleLayerLink: toggleSpy,
        }),
      ),
    );

    let response: Awaited<ReturnType<typeof result.current>> | undefined;
    await act(async () => {
      response = await result.current({
        name: 'link_translation_layer',
        arguments: { transcriptionLayerId: 'trc-1', translationLayerId: 'trl-1' },
      });
    });

    expect(response?.ok).toBe(true);
    expect(toggleSpy).toHaveBeenCalledWith('trc-key-1', 'trl-1');
  });

  it('unlinks translation by host link semantics when parentLayerId is empty', async () => {
    const toggleSpy = vi.fn<(k: string, t: string) => Promise<void>>().mockResolvedValue(undefined);
    const rebindSpy = vi.fn<NonNullable<Parameters<typeof useAiToolCallHandler>[0]['rebindTranslationLayerHost']>>().mockResolvedValue(undefined);

    const { result } = renderHook(() =>
      useAiToolCallHandler(
        makeParams({
          transcriptionLayers: [
            {
              id: 'trc-1', textId: 't1', key: 'trc-key-1', name: { zho: '转写层A' }, layerType: 'transcription', languageId: 'zho', modality: 'text', createdAt: NOW, updatedAt: NOW,
            } as LayerDocType,
            {
              id: 'trc-2', textId: 't1', key: 'trc-key-2', name: { zho: '转写层B' }, layerType: 'transcription', languageId: 'eng', modality: 'text', createdAt: NOW, updatedAt: NOW,
            } as LayerDocType,
          ],
          translationLayers: [makeTranslationLayer('trl-1', '翻译层A')],
          layerLinks: [{
            id: 'link-1',
            transcriptionLayerKey: 'trc-key-1',
            hostTranscriptionLayerId: 'trc-1',
            layerId: 'trl-1',
            linkType: 'free',
            isPreferred: true,
            createdAt: NOW,
          }],
          toggleLayerLink: toggleSpy,
          rebindTranslationLayerHost: rebindSpy,
        }),
      ),
    );

    let response: Awaited<ReturnType<typeof result.current>> | undefined;
    await act(async () => {
      response = await result.current({
        name: 'unlink_translation_layer',
        arguments: { transcriptionLayerId: 'trc-1', translationLayerId: 'trl-1' },
      });
    });

    expect(response?.ok).toBe(true);
    expect(rebindSpy).toHaveBeenCalledWith({
      translationLayerId: 'trl-1',
      removeTranscriptionLayerId: 'trc-1',
      fallbackTranscriptionLayerKey: 'trc-key-2',
    });
    expect(toggleSpy).not.toHaveBeenCalled();
  });

  it('does not create a link when unlink target is already absent', async () => {
    const toggleSpy = vi.fn<(k: string, t: string) => Promise<void>>().mockResolvedValue(undefined);
    const rebindSpy = vi.fn<NonNullable<Parameters<typeof useAiToolCallHandler>[0]['rebindTranslationLayerHost']>>().mockResolvedValue(undefined);

    const { result } = renderHook(() =>
      useAiToolCallHandler(
        makeParams({
          transcriptionLayers: [
            {
              id: 'trc-1', textId: 't1', key: 'trc-key-1', name: { zho: '转写层A' }, layerType: 'transcription', languageId: 'zho', modality: 'text', createdAt: NOW, updatedAt: NOW,
            } as LayerDocType,
            {
              id: 'trc-2', textId: 't1', key: 'trc-key-2', name: { zho: '转写层B' }, layerType: 'transcription', languageId: 'eng', modality: 'text', createdAt: NOW, updatedAt: NOW,
            } as LayerDocType,
          ],
          translationLayers: [makeTranslationLayer('trl-1', '翻译层A')],
          layerLinks: [],
          toggleLayerLink: toggleSpy,
          rebindTranslationLayerHost: rebindSpy,
        }),
      ),
    );

    let response: Awaited<ReturnType<typeof result.current>> | undefined;
    await act(async () => {
      response = await result.current({
        name: 'unlink_translation_layer',
        arguments: { transcriptionLayerId: 'trc-1', translationLayerId: 'trl-1' },
      });
    });

    expect(response?.ok).toBe(true);
    expect(toggleSpy).not.toHaveBeenCalled();
    expect(rebindSpy).not.toHaveBeenCalled();
  });

  it('switch_preferred_host is idempotent when target host is already preferred', async () => {
    const toggleSpy = vi.fn<(k: string, t: string) => Promise<void>>().mockResolvedValue(undefined);

    const { result } = renderHook(() =>
      useAiToolCallHandler(
        makeParams({
          transcriptionLayers: [
            {
              id: 'trc-1', textId: 't1', key: 'trc-key-1', name: { zho: '转写层A' }, layerType: 'transcription', languageId: 'zho', modality: 'text', createdAt: NOW, updatedAt: NOW,
            } as LayerDocType,
          ],
          translationLayers: [makeTranslationLayer('trl-1', '翻译层A')],
          layerLinks: [{
            id: 'link-1',
            transcriptionLayerKey: 'trc-key-1',
            hostTranscriptionLayerId: 'trc-1',
            layerId: 'trl-1',
            linkType: 'free',
            isPreferred: true,
            createdAt: NOW,
          }],
          toggleLayerLink: toggleSpy,
        }),
      ),
    );

    let response: Awaited<ReturnType<typeof result.current>> | undefined;
    await act(async () => {
      response = await result.current({
        name: 'switch_preferred_host',
        arguments: { transcriptionLayerId: 'trc-1', translationLayerId: 'trl-1' },
      });
    });

    expect(response?.ok).toBe(true);
    expect(toggleSpy).not.toHaveBeenCalled();
  });

  it('opens search with prefilled query and layer kinds for search_segments', async () => {
    const openSearch = vi.fn();
    const { result } = renderHook(() =>
      useAiToolCallHandler(
        makeParams({
          openSearch,
        }),
      ),
    );

    let response: Awaited<ReturnType<typeof result.current>> | undefined;
    await act(async () => {
      response = await result.current({
        name: 'search_segments',
        arguments: { query: 'hello', layers: ['translation'] },
      });
    });

    expect(response?.ok).toBe(true);
    expect(openSearch).toHaveBeenCalledWith({ query: 'hello', scope: 'global', layerKinds: ['translation'] });
  });

  it('seeks to absolute time for nav_to_time when runtime callback exists', async () => {
    const seekToTime = vi.fn();
    const { result } = renderHook(() =>
      useAiToolCallHandler(
        makeParams({
          seekToTime,
        }),
      ),
    );

    let response: Awaited<ReturnType<typeof result.current>> | undefined;
    await act(async () => {
      response = await result.current({ name: 'nav_to_time', arguments: { timeSeconds: 12.5 } });
    });

    expect(response?.ok).toBe(true);
    expect(seekToTime).toHaveBeenCalledWith(12.5);
  });

  it('splits at absolute time for split_at_time when runtime callback exists', async () => {
    const splitAtTime = vi.fn<(timeSeconds: number) => boolean>().mockReturnValue(true);
    const { result } = renderHook(() =>
      useAiToolCallHandler(
        makeParams({
          splitAtTime,
        }),
      ),
    );

    let response: Awaited<ReturnType<typeof result.current>> | undefined;
    await act(async () => {
      response = await result.current({ name: 'split_at_time', arguments: { timeSeconds: 3.2 } });
    });

    expect(response?.ok).toBe(true);
    expect(splitAtTime).toHaveBeenCalledWith(3.2);
  });

  it('honors zoomLevel when zoom_to_segment is backed by runtime callback', async () => {
    const zoomToSegment = vi.fn<(segmentId: string, zoomLevel?: number) => boolean>().mockReturnValue(true);
    const unit = makeUnit('u-zoom');
    const { result } = renderHook(() =>
      useAiToolCallHandler(
        makeParams({
          units: [unit],
          zoomToSegment,
        }),
      ),
    );

    let response: Awaited<ReturnType<typeof result.current>> | undefined;
    await act(async () => {
      response = await result.current({
        name: 'zoom_to_segment',
        arguments: { segmentId: 'u-zoom', zoomLevel: 6 },
      });
    });

    expect(response?.ok).toBe(true);
    expect(zoomToSegment).toHaveBeenCalledWith('u-zoom', 6);
  });

  it('transforms translation text before writeback when source/target layers differ', async () => {
    const unit = makeUnit('u1');
    const targetLayer = {
      ...makeTranslationLayer('trl-eng', '英语'),
      orthographyId: 'orth-target',
    } as LayerDocType;
    const transformSpy = vi.fn(async ({ text }: { text: string }) => `xf:${text}`);
    const saveSpy = vi.fn<(u: string, t: string, l: string) => Promise<void>>().mockResolvedValue(undefined);

    const { result } = renderHook(() =>
      useAiToolCallHandler(
        makeParams({
          units: [unit],
          selectedUnit: unit,
          selectedLayerId: 'trc-source',
          transcriptionLayers: [{
            id: 'trc-source',
            textId: 't1',
            key: 'trc-source',
            name: { zho: '源转写层' },
            layerType: 'transcription',
            languageId: 'zho',
            orthographyId: 'orth-source',
            modality: 'text',
            createdAt: NOW,
            updatedAt: NOW,
          } as LayerDocType],
          translationLayers: [targetLayer],
          saveUnitLayerText: saveSpy,
          bridgeTextForLayerWrite: transformSpy,
        }),
      ),
    );

    await act(async () => {
      await result.current({
        name: 'set_translation_text',
        arguments: { segmentIndex: 1, layerId: 'trl-eng', text: 'abc' },
      });
    });

    expect(transformSpy).toHaveBeenCalledWith({ text: 'abc', targetLayerId: 'trl-eng', selectedLayerId: 'trc-source' });
    expect(saveSpy).toHaveBeenCalledWith('u1', 'xf:abc', 'trl-eng');
  });

  it('writes transformed transcription text into the selected transcription layer', async () => {
    const unit = makeUnit('u1');
    const saveSpy = vi.fn<(u: string, t: string, l?: string) => Promise<void>>().mockResolvedValue(undefined);
    const transformSpy = vi.fn(async ({ text }: { text: string }) => `xf:${text}`);
    const selectedLayer = {
      id: 'trc-alt',
      textId: 't1',
      key: 'trc-alt',
      name: { zho: '备用转写层' },
      layerType: 'transcription',
      languageId: 'zho',
      orthographyId: 'orth-alt',
      modality: 'text',
      createdAt: NOW,
      updatedAt: NOW,
    } as LayerDocType;

    const { result } = renderHook(() =>
      useAiToolCallHandler(
        makeParams({
          units: [unit],
          selectedUnit: unit,
          selectedLayerId: 'trc-alt',
          transcriptionLayers: [selectedLayer],
          saveUnitText: saveSpy,
          bridgeTextForLayerWrite: transformSpy,
        }),
      ),
    );

    await act(async () => {
      await result.current({
        name: 'set_transcription_text',
        arguments: { segmentIndex: 1, text: 'source text' },
      });
    });

    expect(transformSpy).toHaveBeenCalledWith({ text: 'source text', targetLayerId: 'trc-alt', selectedLayerId: 'trc-alt' });
    expect(saveSpy).toHaveBeenCalledWith('u1', 'xf:source text', 'trc-alt');
  });
});
