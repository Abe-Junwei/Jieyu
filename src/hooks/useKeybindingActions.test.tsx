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
});
