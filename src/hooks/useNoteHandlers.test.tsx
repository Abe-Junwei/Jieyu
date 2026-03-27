// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useNoteHandlers } from './useNoteHandlers';

vi.mock('./useNotes', () => ({
  useNotes: () => ({
    notes: [],
    addNote: vi.fn(),
    updateNote: vi.fn(),
    deleteNote: vi.fn(),
    version: 0,
  }),
  useNoteCounts: () => ({}),
}));

describe('useNoteHandlers error reporting', () => {
  it('maps conflict-like POS save error to conflict-aware message', async () => {
    const setSaveState = vi.fn();
    const updateTokenPos = vi.fn(async () => {
      throw new Error('row changed externally');
    });

    const { result } = renderHook(() => useNoteHandlers({
      activeUtteranceUnitId: 'utt-1',
      focusedLayerRowId: 'layer-1',
      utterances: [{ id: 'utt-1' }],
      transcriptionLayers: [{ id: 'layer-1' }],
      translationLayers: [],
      updateTokenPos,
      batchUpdateTokenPosByForm: vi.fn(async () => 0),
      selectUtterance: vi.fn(),
      setSaveState,
    }));

    await act(async () => {
      await result.current.handleUpdateTokenPos('utt-1::tok-1', 'NOUN');
    });

    expect(setSaveState).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'error',
      message: 'POS 保存失败：检测到数据已被其他操作更新，请刷新后重试',
      errorMeta: expect.objectContaining({ category: 'conflict', action: 'POS 保存' }),
    }));
  });

  it('keeps original fallback message for non-conflict POS save error', async () => {
    const setSaveState = vi.fn();
    const updateTokenPos = vi.fn(async () => {
      throw new Error('boom');
    });

    const { result } = renderHook(() => useNoteHandlers({
      activeUtteranceUnitId: 'utt-1',
      focusedLayerRowId: 'layer-1',
      utterances: [{ id: 'utt-1' }],
      transcriptionLayers: [{ id: 'layer-1' }],
      translationLayers: [],
      updateTokenPos,
      batchUpdateTokenPosByForm: vi.fn(async () => 0),
      selectUtterance: vi.fn(),
      setSaveState,
    }));

    await act(async () => {
      await result.current.handleUpdateTokenPos('utt-1::tok-1', 'NOUN');
    });

    expect(setSaveState).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'error',
      message: 'boom',
      errorMeta: expect.objectContaining({ category: 'action', action: 'POS 保存' }),
    }));
  });
});
