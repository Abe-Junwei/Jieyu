// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import type { UtteranceDocType, LayerDocType } from '../db';
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

function makeUtterance(id: string): UtteranceDocType {
  return {
    id,
    textId: 't1',
    mediaId: 'm1',
    startTime: 0,
    endTime: 1,
    transcription: {},
    createdAt: NOW,
    updatedAt: NOW,
  } as UtteranceDocType;
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
    utterances: [],
    selectedUtterance: undefined,
    selectedUtteranceMedia: undefined,
    selectedLayerId: '',
    transcriptionLayers: [],
    translationLayers: [],
    layerLinks: [],
    createLayer: vi.fn(),
    createNextUtterance: vi.fn(),
    splitUtterance: vi.fn(),
    deleteUtterance: vi.fn(),
    deleteLayer: vi.fn(),
    toggleLayerLink: vi.fn(),
    saveUtteranceText: vi.fn(),
    saveTextTranslationForUtterance: vi.fn(),
    transformTextForLayerWrite: vi.fn(async ({ text }) => text),
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
  it('以空字符串调用 saveTextTranslationForUtterance 并返回精确成功消息', async () => {
    const utterance = makeUtterance('u1');
    const layer = makeTranslationLayer('layer1', '普通话');
    const saveSpy = vi.fn<(u: string, t: string, l: string) => Promise<void>>().mockResolvedValue(undefined);

    const { result } = renderHook(() =>
      useAiToolCallHandler(
        makeParams({
          utterances: [utterance],
          selectedUtterance: utterance,
          selectedLayerId: 'layer1',
          translationLayers: [layer],
          saveTextTranslationForUtterance: saveSpy,
        }),
      ),
    );

    let response: Awaited<ReturnType<typeof result.current>> | undefined;
    await act(async () => {
      response = await result.current({
        name: 'clear_translation_segment',
        arguments: { utteranceId: 'u1', layerId: 'layer1' },
      });
    });

    // 验证以空字符串调用（清空）而非删除记录
    expect(saveSpy).toHaveBeenCalledTimes(1);
    expect(saveSpy).toHaveBeenCalledWith('u1', '', 'layer1');
    // 验证返回消息语义精确
    expect(response?.ok).toBe(true);
    expect(response?.message).toBe('已清空句段 u1 在层 普通话 的翻译文本。');
  });

  it('无句段时返回失败且不调用 saveTextTranslationForUtterance', async () => {
    const layer = makeTranslationLayer('layer1', '普通话');
    const saveSpy = vi.fn();

    const { result } = renderHook(() =>
      useAiToolCallHandler(
        makeParams({
          utterances: [],
          selectedUtterance: undefined,
          selectedLayerId: 'layer1',
          translationLayers: [layer],
          saveTextTranslationForUtterance: saveSpy,
        }),
      ),
    );

    let response: Awaited<ReturnType<typeof result.current>> | undefined;
    await act(async () => {
      response = await result.current({
        name: 'clear_translation_segment',
        arguments: { utteranceId: 'u1', layerId: 'layer1' },
      });
    });

    expect(response?.ok).toBe(false);
    expect(saveSpy).not.toHaveBeenCalled();
  });

  it('无翻译层时返回失败且不调用 saveTextTranslationForUtterance', async () => {
    const utterance = makeUtterance('u1');
    const saveSpy = vi.fn();

    const { result } = renderHook(() =>
      useAiToolCallHandler(
        makeParams({
          utterances: [utterance],
          selectedUtterance: utterance,
          selectedLayerId: '',
          translationLayers: [],
          saveTextTranslationForUtterance: saveSpy,
        }),
      ),
    );

    let response: Awaited<ReturnType<typeof result.current>> | undefined;
    await act(async () => {
      response = await result.current({
        name: 'clear_translation_segment',
        arguments: { utteranceId: 'u1', layerId: 'layer1' },
      });
    });

    expect(response?.ok).toBe(false);
    expect(saveSpy).not.toHaveBeenCalled();
  });

  it('指定 utteranceId 参数时清空指定句段而非当前选中', async () => {
    const selected = makeUtterance('selected-u');
    const target = makeUtterance('target-u');
    const layer = makeTranslationLayer('layer1', '英语');
    const saveSpy = vi.fn<(u: string, t: string, l: string) => Promise<void>>().mockResolvedValue(undefined);

    const { result } = renderHook(() =>
      useAiToolCallHandler(
        makeParams({
          utterances: [selected, target],
          selectedUtterance: selected,
          selectedLayerId: 'layer1',
          translationLayers: [layer],
          saveTextTranslationForUtterance: saveSpy,
        }),
      ),
    );

    await act(async () => {
      await result.current({
        name: 'clear_translation_segment',
        arguments: { utteranceId: 'target-u', layerId: 'layer1' },
      });
    });

    expect(saveSpy).toHaveBeenCalledWith('target-u', '', 'layer1');
  });
});

// ---------------------------------------------------------------------------
// delete_transcription_segment
// ---------------------------------------------------------------------------

describe('useAiToolCallHandler — delete_transcription_segment', () => {
  it('uses segmentId directly when deleting a routed segment target', async () => {
    const deleteSpy = vi.fn<(id: string) => Promise<void>>().mockResolvedValue(undefined);

    const { result } = renderHook(() =>
      useAiToolCallHandler(
        makeParams({
          deleteUtterance: deleteSpy,
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

  it('uses deleteSelectedUtterances for batch delete targets', async () => {
    const deleteSelectionSpy = vi.fn<(ids: Set<string>) => Promise<void>>().mockResolvedValue(undefined);

    const { result } = renderHook(() =>
      useAiToolCallHandler(
        makeParams({
          deleteSelectedUtterances: deleteSelectionSpy,
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
});

// ---------------------------------------------------------------------------
// auto_gloss_utterance
// ---------------------------------------------------------------------------

describe('useAiToolCallHandler — auto_gloss_utterance', () => {
  it('returns 暂不支持 for utterly unknown tool name', async () => {
    const { result } = renderHook(() => useAiToolCallHandler(makeParams()));

    let response: Awaited<ReturnType<typeof result.current>> | undefined;
    await act(async () => {
      // Use a cast since 'no_such_tool' is not in AiChatToolName
      response = await result.current({
        name: 'auto_gloss_utterance' as Parameters<typeof result.current>[0]['name'],
        arguments: { utteranceId: 'u1' },
      });
    });

    // When target utterance does not exist, it should return an error
    expect(response?.ok).toBe(false);
    expect(response?.message).toContain('未找到目标句段');
  });

  it('calls glossUtterance when utterance is selected', async () => {
    const utterance = makeUtterance('u1');
    const { result } = renderHook(() =>
      useAiToolCallHandler(
        makeParams({
          utterances: [utterance],
          selectedUtterance: utterance,
        }),
      ),
    );

    let response: Awaited<ReturnType<typeof result.current>> | undefined;
    await act(async () => {
      response = await result.current({
        name: 'auto_gloss_utterance',
        arguments: { utteranceId: 'u1' },
      });
    });

    // The service will find 0 tokens for this utterance (they're in IndexedDB, not mocked here)
    expect(response?.ok).toBe(true);
    expect(response?.message).toContain('token');
  });
});

describe('useAiToolCallHandler — strict target requirements', () => {
  it('rejects set_transcription_text without utteranceId', async () => {
    const utterance = makeUtterance('u1');
    const saveSpy = vi.fn<(u: string, t: string, l?: string) => Promise<void>>().mockResolvedValue(undefined);

    const { result } = renderHook(() =>
      useAiToolCallHandler(
        makeParams({
          utterances: [utterance],
          selectedUtterance: utterance,
          saveUtteranceText: saveSpy,
        }),
      ),
    );

    let response: Awaited<ReturnType<typeof result.current>> | undefined;
    await act(async () => {
      response = await result.current({ name: 'set_transcription_text', arguments: { text: 'abc' } });
    });

    expect(response?.ok).toBe(false);
    expect(response?.message).toContain('缺少 utteranceId');
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
    expect(response?.message).toContain('缺少 layerId');

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

  it('rejects create_transcription_segment without utteranceId', async () => {
    const utterance = makeUtterance('u1');
    const createNextSpy = vi.fn<(u: UtteranceDocType, d: number) => Promise<void>>().mockResolvedValue(undefined);

    const { result } = renderHook(() =>
      useAiToolCallHandler(
        makeParams({
          utterances: [utterance],
          selectedUtterance: utterance,
          createNextUtterance: createNextSpy,
        }),
      ),
    );

    let response: Awaited<ReturnType<typeof result.current>> | undefined;
    await act(async () => {
      response = await result.current({ name: 'create_transcription_segment', arguments: {} });
    });

    expect(response?.ok).toBe(false);
    expect(response?.message).toContain('缺少 utteranceId');
    expect(createNextSpy).not.toHaveBeenCalled();
  });

  it('rejects split_transcription_segment when splitTime is missing', async () => {
    const utterance = {
      ...makeUtterance('u1'),
      startTime: 10,
      endTime: 14,
    } as UtteranceDocType;
    const splitSpy = vi.fn<(id: string, splitTime: number) => Promise<void>>().mockResolvedValue(undefined);

    const { result } = renderHook(() =>
      useAiToolCallHandler(
        makeParams({
          utterances: [utterance],
          selectedUtterance: utterance,
          splitUtterance: splitSpy,
        }),
      ),
    );

    let response: Awaited<ReturnType<typeof result.current>> | undefined;
    await act(async () => {
      response = await result.current({ name: 'split_transcription_segment', arguments: { utteranceId: 'u1' } });
    });

    expect(response?.ok).toBe(false);
    expect(response?.message).toContain('缺少 splitTime');
    expect(splitSpy).not.toHaveBeenCalled();
  });

  it('rejects split_transcription_segment when splitTime is out of range', async () => {
    const utterance = {
      ...makeUtterance('u1'),
      startTime: 2,
      endTime: 3,
    } as UtteranceDocType;
    const splitSpy = vi.fn<(id: string, splitTime: number) => Promise<void>>().mockResolvedValue(undefined);

    const { result } = renderHook(() =>
      useAiToolCallHandler(
        makeParams({
          utterances: [utterance],
          selectedUtterance: utterance,
          splitUtterance: splitSpy,
        }),
      ),
    );

    let response: Awaited<ReturnType<typeof result.current>> | undefined;
    await act(async () => {
      response = await result.current({
        name: 'split_transcription_segment',
        arguments: { utteranceId: 'u1', splitTime: 2.01 },
      });
    });

    expect(response?.ok).toBe(false);
    expect(response?.message).toContain('切分点不在可用范围内');
    expect(splitSpy).not.toHaveBeenCalled();
  });

  it('rejects auto_gloss_utterance without utteranceId', async () => {
    const utterance = makeUtterance('u1');
    const { result } = renderHook(() =>
      useAiToolCallHandler(
        makeParams({
          utterances: [utterance],
          selectedUtterance: utterance,
        }),
      ),
    );

    let response: Awaited<ReturnType<typeof result.current>> | undefined;
    await act(async () => {
      response = await result.current({ name: 'auto_gloss_utterance', arguments: {} });
    });

    expect(response?.ok).toBe(false);
    expect(response?.message).toContain('缺少 utteranceId');
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
    expect(response?.message).toContain('缺少 transcriptionLayerId/transcriptionLayerKey');

    await act(async () => {
      response = await result.current({ name: 'unlink_translation_layer', arguments: { transcriptionLayerId: 'trc-1' } });
    });
    expect(response?.ok).toBe(false);
    expect(response?.message).toContain('缺少 translationLayerId/layerId');
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
    expect(response?.message).toContain('缺少 translationLayerId/layerId');
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
    const utterance = makeUtterance('u-zoom');
    const { result } = renderHook(() =>
      useAiToolCallHandler(
        makeParams({
          utterances: [utterance],
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
    const utterance = makeUtterance('u1');
    const targetLayer = {
      ...makeTranslationLayer('trl-eng', '英语'),
      orthographyId: 'orth-target',
    } as LayerDocType;
    const transformSpy = vi.fn(async ({ text }: { text: string }) => `xf:${text}`);
    const saveSpy = vi.fn<(u: string, t: string, l: string) => Promise<void>>().mockResolvedValue(undefined);

    const { result } = renderHook(() =>
      useAiToolCallHandler(
        makeParams({
          utterances: [utterance],
          selectedUtterance: utterance,
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
          saveTextTranslationForUtterance: saveSpy,
          transformTextForLayerWrite: transformSpy,
        }),
      ),
    );

    await act(async () => {
      await result.current({
        name: 'set_translation_text',
        arguments: { utteranceId: 'u1', layerId: 'trl-eng', text: 'abc' },
      });
    });

    expect(transformSpy).toHaveBeenCalledWith({ text: 'abc', targetLayerId: 'trl-eng', selectedLayerId: 'trc-source' });
    expect(saveSpy).toHaveBeenCalledWith('u1', 'xf:abc', 'trl-eng');
  });

  it('writes transformed transcription text into the selected transcription layer', async () => {
    const utterance = makeUtterance('u1');
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
          utterances: [utterance],
          selectedUtterance: utterance,
          selectedLayerId: 'trc-alt',
          transcriptionLayers: [selectedLayer],
          saveUtteranceText: saveSpy,
          transformTextForLayerWrite: transformSpy,
        }),
      ),
    );

    await act(async () => {
      await result.current({
        name: 'set_transcription_text',
        arguments: { utteranceId: 'u1', text: 'source text' },
      });
    });

    expect(transformSpy).toHaveBeenCalledWith({ text: 'source text', targetLayerId: 'trc-alt', selectedLayerId: 'trc-alt' });
    expect(saveSpy).toHaveBeenCalledWith('u1', 'xf:source text', 'trc-alt');
  });
});
