// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import type { UtteranceDocType, TranslationLayerDocType } from '../../db';
import { useAiToolCallHandler } from './useAiToolCallHandler';

afterEach(cleanup);

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

function makeTranslationLayer(id: string, zhoName: string): TranslationLayerDocType {
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
  } as TranslationLayerDocType;
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
    deleteUtterance: vi.fn(),
    deleteLayer: vi.fn(),
    toggleLayerLink: vi.fn(),
    saveUtteranceText: vi.fn(),
    saveTextTranslationForUtterance: vi.fn(),
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
      response = await result.current({ name: 'clear_translation_segment', arguments: {} });
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
      response = await result.current({ name: 'clear_translation_segment', arguments: {} });
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
      response = await result.current({ name: 'clear_translation_segment', arguments: {} });
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
      await result.current({ name: 'clear_translation_segment', arguments: { utteranceId: 'target-u' } });
    });

    expect(saveSpy).toHaveBeenCalledWith('target-u', '', 'layer1');
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
        arguments: {},
      });
    });

    // When no utterance is available, it should return an error
    expect(response?.ok).toBe(false);
    expect(response?.message).toContain('没有可标注的句段');
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
        arguments: {},
      });
    });

    // The service will find 0 tokens for this utterance (they're in IndexedDB, not mocked here)
    expect(response?.ok).toBe(true);
    expect(response?.message).toContain('token');
  });
});
