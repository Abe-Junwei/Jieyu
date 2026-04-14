// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useNoteHandlers } from './useNoteHandlers';

const { mockUseNoteCounts } = vi.hoisted(() => ({
  mockUseNoteCounts: vi.fn(),
}));

vi.mock('./useNotes', () => ({
  useNotes: () => ({
    notes: [],
    addNote: vi.fn(),
    updateNote: vi.fn(),
    deleteNote: vi.fn(),
    version: 0,
  }),
  useNoteCounts: (...args: unknown[]) => mockUseNoteCounts(...args),
}));

describe('useNoteHandlers error reporting', () => {
  it('resolves note indicator targets for segment-layer notes and utterance notes', () => {
    mockUseNoteCounts.mockImplementation((targetType: string) => {
      if (targetType === 'tier_annotation') {
        return new Map([['seg-1::layer-1', 2]]);
      }
      if (targetType === 'utterance') {
        return new Map([['utt-1', 1]]);
      }
      return new Map();
    });

    const { result } = renderHook(() => useNoteHandlers({
      activeUnitId: 'utt-1',
      focusedLayerRowId: 'layer-1',
      utterances: [{ id: 'utt-1' }],
      timelineUnitIds: ['utt-1', 'seg-1'],
      transcriptionLayers: [{ id: 'layer-1' }],
      translationLayers: [],
      updateTokenPos: vi.fn(),
      batchUpdateTokenPosByForm: vi.fn(async () => 0),
      selectUnit: vi.fn(),
      setSaveState: vi.fn(),
    }));

    expect(result.current.resolveNoteIndicatorTarget('seg-1', 'layer-1')).toEqual({ count: 2, layerId: 'layer-1' });
    expect(result.current.resolveNoteIndicatorTarget('utt-1', 'layer-1')).toEqual({ count: 1 });
  });

  it('isolates waveform note indicators from timeline note indicators', () => {
    mockUseNoteCounts.mockImplementation((targetType: string) => {
      if (targetType === 'tier_annotation') {
        return new Map([
          ['seg-1::layer-1', 2],
          ['seg-1::layer-1::@waveform', 1],
        ]);
      }
      if (targetType === 'utterance') {
        return new Map([['seg-1', 5]]);
      }
      return new Map();
    });

    const { result } = renderHook(() => useNoteHandlers({
      activeUnitId: 'utt-1',
      focusedLayerRowId: 'layer-1',
      utterances: [{ id: 'utt-1' }],
      timelineUnitIds: ['utt-1', 'seg-1'],
      transcriptionLayers: [{ id: 'layer-1' }],
      translationLayers: [],
      updateTokenPos: vi.fn(),
      batchUpdateTokenPosByForm: vi.fn(async () => 0),
      selectUnit: vi.fn(),
      setSaveState: vi.fn(),
    }));

    expect(result.current.resolveNoteIndicatorTarget('seg-1', 'layer-1', 'timeline')).toEqual({ count: 2, layerId: 'layer-1' });
    expect(result.current.resolveNoteIndicatorTarget('seg-1', 'layer-1', 'waveform')).toEqual({ count: 1, layerId: 'layer-1' });
    expect(result.current.resolveNoteIndicatorTarget('seg-1', 'layer-1')).toEqual({ count: 2, layerId: 'layer-1' });
  });

  it('maps conflict-like POS save error to conflict-aware message', async () => {
    mockUseNoteCounts.mockImplementation(() => new Map());
    const setSaveState = vi.fn();
    const updateTokenPos = vi.fn(async () => {
      throw new Error('row changed externally');
    });

    const { result } = renderHook(() => useNoteHandlers({
      activeUnitId: 'utt-1',
      focusedLayerRowId: 'layer-1',
      utterances: [{ id: 'utt-1' }],
      timelineUnitIds: ['utt-1'],
      transcriptionLayers: [{ id: 'layer-1' }],
      translationLayers: [],
      updateTokenPos,
      batchUpdateTokenPosByForm: vi.fn(async () => 0),
      selectUnit: vi.fn(),
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
    mockUseNoteCounts.mockImplementation(() => new Map());
    const setSaveState = vi.fn();
    const updateTokenPos = vi.fn(async () => {
      throw new Error('boom');
    });

    const { result } = renderHook(() => useNoteHandlers({
      activeUnitId: 'utt-1',
      focusedLayerRowId: 'layer-1',
      utterances: [{ id: 'utt-1' }],
      timelineUnitIds: ['utt-1'],
      transcriptionLayers: [{ id: 'layer-1' }],
      translationLayers: [],
      updateTokenPos,
      batchUpdateTokenPosByForm: vi.fn(async () => 0),
      selectUnit: vi.fn(),
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

  it('executes batch_pos recommendation and keeps selection/save-state in sync', async () => {
    mockUseNoteCounts.mockImplementation(() => new Map());
    const setSaveState = vi.fn();
    const selectUnit = vi.fn();
    const batchUpdateTokenPosByForm = vi.fn(async () => 3);

    const { result } = renderHook(() => useNoteHandlers({
      activeUnitId: 'utt-1',
      focusedLayerRowId: 'layer-1',
      utterances: [{ id: 'utt-1' }],
      timelineUnitIds: ['utt-1'],
      transcriptionLayers: [{ id: 'layer-1' }],
      translationLayers: [],
      updateTokenPos: vi.fn(),
      batchUpdateTokenPosByForm,
      selectUnit,
      setSaveState,
    }));

    await act(async () => {
      await result.current.handleExecuteRecommendation({
        actionType: 'batch_pos',
        targetUtteranceId: 'utt-1',
        targetForm: 'walk',
        targetPos: 'VERB',
      } as Parameters<typeof result.current.handleExecuteRecommendation>[0]);
    });

    expect(batchUpdateTokenPosByForm).toHaveBeenCalledWith('utt-1', 'walk', 'VERB');
    expect(selectUnit).toHaveBeenCalledWith('utt-1');
    expect(setSaveState).toHaveBeenCalledWith({ kind: 'done', message: '已批量赋值 3 个 token（walk → VERB）' });
  });
});
