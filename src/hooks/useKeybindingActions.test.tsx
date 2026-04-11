// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useRef } from 'react';
import { useKeybindingActions } from './useKeybindingActions';

describe('useKeybindingActions segment routing', () => {
  it('routes delete/merge/split shortcuts to selected segment when utterance is empty', () => {
    const runDeleteSelection = vi.fn();
    const runMergePrev = vi.fn();
    const runMergeNext = vi.fn();
    const runSplitAtTime = vi.fn();

    const { result } = renderHook(() => {
      const waveformAreaRef = useRef<HTMLDivElement | null>(null);
      return useKeybindingActions({
        player: {
          isReady: true,
          isPlaying: false,
          playbackRate: 1,
          instanceRef: { current: { getCurrentTime: () => 1.25 } as unknown as import('wavesurfer.js').default },
          stop: vi.fn(),
          playRegion: vi.fn(),
          togglePlayback: vi.fn(),
          seekBySeconds: vi.fn(),
        },
        subSelectionRange: null,
        setSubSelectionRange: vi.fn(),
        selectedUtterance: undefined,
        selectedTimelineUnit: { layerId: 'layer-1', unitId: 'seg_42', kind: 'segment' as const },
        selectedUtteranceIds: new Set<string>(),
        selectedMediaUrl: 'blob:test',
        segMarkStart: null,
        setSegMarkStart: vi.fn(),
        segmentLoopPlayback: false,
        setSegmentLoopPlayback: vi.fn(),
        utterancesOnCurrentMedia: [],
        markingModeRef: { current: false },
        skipSeekForIdRef: { current: null },
        creatingSegmentRef: { current: false },
        manualSelectTsRef: { current: 0 },
        waveformAreaRef,
        createUtteranceFromSelection: vi.fn(async () => undefined),
        selectUtterance: vi.fn(),
        selectAllUtterances: vi.fn(),
        runDeleteSelection,
        runMergePrev,
        runMergeNext,
        runSplitAtTime,
        runSelectBefore: vi.fn(),
        runSelectAfter: vi.fn(),
        undo: vi.fn(async () => undefined),
        redo: vi.fn(async () => undefined),
        setShowSearch: vi.fn(),
        toggleNotes: vi.fn(),
      });
    });

    act(() => {
      result.current.executeAction('deleteSegment');
      result.current.executeAction('mergePrev');
      result.current.executeAction('mergeNext');
      result.current.executeAction('splitSegment');
    });

    expect(runDeleteSelection).toHaveBeenCalledWith('seg_42', expect.any(Set));
    expect(runMergePrev).toHaveBeenCalledWith('seg_42');
    expect(runMergeNext).toHaveBeenCalledWith('seg_42');
    expect(runSplitAtTime).toHaveBeenCalledWith('seg_42', 1.25);
  });

  it('plays the selected segment range when no utterance is selected', () => {
    const playRegion = vi.fn();

    const { result } = renderHook(() => {
      const waveformAreaRef = useRef<HTMLDivElement | null>(null);
      return useKeybindingActions({
        player: {
          isReady: true,
          isPlaying: false,
          playbackRate: 1,
          instanceRef: { current: { getCurrentTime: () => 1.25 } as unknown as import('wavesurfer.js').default },
          stop: vi.fn(),
          playRegion,
          togglePlayback: vi.fn(),
          seekBySeconds: vi.fn(),
        },
        subSelectionRange: null,
        setSubSelectionRange: vi.fn(),
        selectedUtterance: undefined,
        selectedPlayableRange: { startTime: 3, endTime: 4.5 },
        selectedTimelineUnit: { layerId: 'layer-1', unitId: 'seg_42', kind: 'segment' as const },
        selectedUtteranceIds: new Set<string>(),
        selectedMediaUrl: 'blob:test',
        segMarkStart: null,
        setSegMarkStart: vi.fn(),
        segmentLoopPlayback: false,
        setSegmentLoopPlayback: vi.fn(),
        utterancesOnCurrentMedia: [],
        markingModeRef: { current: false },
        skipSeekForIdRef: { current: null },
        creatingSegmentRef: { current: false },
        manualSelectTsRef: { current: 0 },
        waveformAreaRef,
        createUtteranceFromSelection: vi.fn(async () => undefined),
        selectUtterance: vi.fn(),
        selectAllUtterances: vi.fn(),
        runDeleteSelection: vi.fn(),
        runMergePrev: vi.fn(),
        runMergeNext: vi.fn(),
        runSplitAtTime: vi.fn(),
        runSelectBefore: vi.fn(),
        runSelectAfter: vi.fn(),
        undo: vi.fn(async () => undefined),
        redo: vi.fn(async () => undefined),
        setShowSearch: vi.fn(),
        toggleNotes: vi.fn(),
      });
    });

    act(() => {
      result.current.executeAction('playPause');
    });

    expect(playRegion).toHaveBeenCalledWith(3, 4.5, true);
  });

  it('markSegment completes creation with keep-current behavior and avoids post-create reselection race', async () => {
    const setSegMarkStart = vi.fn();
    const selectTimelineUnit = vi.fn();
    const createUtteranceFromSelection = vi.fn(async () => undefined);

    const { result } = renderHook(() => {
      const waveformAreaRef = useRef<HTMLDivElement | null>(null);
      return useKeybindingActions({
        player: {
          isReady: true,
          isPlaying: false,
          playbackRate: 1,
          instanceRef: { current: { getCurrentTime: () => 2.4 } as unknown as import('wavesurfer.js').default },
          stop: vi.fn(),
          playRegion: vi.fn(),
          togglePlayback: vi.fn(),
          seekBySeconds: vi.fn(),
        },
        subSelectionRange: null,
        setSubSelectionRange: vi.fn(),
        selectedUtterance: undefined,
        selectedTimelineUnit: { layerId: 'layer-1', unitId: 'seg_42', kind: 'segment' as const },
        selectedUtteranceIds: new Set<string>(),
        selectedMediaUrl: 'blob:test',
        segMarkStart: 1.1,
        setSegMarkStart,
        segmentLoopPlayback: false,
        setSegmentLoopPlayback: vi.fn(),
        utterancesOnCurrentMedia: [],
        markingModeRef: { current: true },
        skipSeekForIdRef: { current: null },
        creatingSegmentRef: { current: false },
        manualSelectTsRef: { current: 0 },
        waveformAreaRef,
        createUtteranceFromSelection,
        selectTimelineUnit,
        selectUtterance: vi.fn(),
        selectAllUtterances: vi.fn(),
        runDeleteSelection: vi.fn(),
        runMergePrev: vi.fn(),
        runMergeNext: vi.fn(),
        runSplitAtTime: vi.fn(),
        runSelectBefore: vi.fn(),
        runSelectAfter: vi.fn(),
        undo: vi.fn(async () => undefined),
        redo: vi.fn(async () => undefined),
        setShowSearch: vi.fn(),
        toggleNotes: vi.fn(),
      });
    });

    await act(async () => {
      result.current.executeAction('markSegment');
      await Promise.resolve();
    });

    expect(createUtteranceFromSelection).toHaveBeenCalledWith(1.1, 2.4, {
      selectionBehavior: 'keep-current',
    });
    expect(selectTimelineUnit).toHaveBeenCalledTimes(1);
    expect(selectTimelineUnit).toHaveBeenCalledWith(null);
    expect(setSegMarkStart).toHaveBeenCalledWith(null);
  });
});
