// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useRef } from 'react';
import type { TimelineUnitView } from './timelineUnitView';
import { useKeybindingActions } from './useKeybindingActions';

function makeTimelineUnit(overrides: Partial<TimelineUnitView> & Pick<TimelineUnitView, 'id' | 'startTime' | 'endTime' | 'kind'>): TimelineUnitView {
  return {
    mediaId: 'media-1',
    layerId: 'layer-1',
    text: '',
    ...overrides,
  };
}

describe('useKeybindingActions segment routing', () => {
  it('does not trigger global shortcuts while typing in input elements', () => {
    const setShowSearch = vi.fn();

    renderHook(() => {
      const waveformAreaRef = useRef<HTMLDivElement | null>(null);
      return useKeybindingActions({
        player: {
          isReady: true,
          isPlaying: false,
          playbackRate: 1,
          instanceRef: { current: { getCurrentTime: () => 0 } as unknown as import('wavesurfer.js').default },
          stop: vi.fn(),
          playRegion: vi.fn(),
          togglePlayback: vi.fn(),
          seekBySeconds: vi.fn(),
        },
        subSelectionRange: null,
        setSubSelectionRange: vi.fn(),
        selectedUnit: undefined,
        selectedTimelineUnit: null,
        selectedUnitIds: new Set<string>(),
        selectedMediaUrl: 'blob:test',
        segMarkStart: null,
        setSegMarkStart: vi.fn(),
        segmentLoopPlayback: false,
        setSegmentLoopPlayback: vi.fn(),
        timelineUnitsOnCurrentMedia: [],
        markingModeRef: { current: false },
        skipSeekForIdRef: { current: null },
        creatingSegmentRef: { current: false },
        manualSelectTsRef: { current: 0 },
        waveformAreaRef,
        createUnitFromSelection: vi.fn(async () => undefined),
        selectUnit: vi.fn(),
        selectAllUnits: vi.fn(),
        runDeleteSelection: vi.fn(),
        runMergePrev: vi.fn(),
        runMergeNext: vi.fn(),
        runSplitAtTime: vi.fn(),
        runSelectBefore: vi.fn(),
        runSelectAfter: vi.fn(),
        undo: vi.fn(async () => undefined),
        redo: vi.fn(async () => undefined),
        setShowSearch,
        toggleNotes: vi.fn(),
      });
    });

    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();

    const event = new KeyboardEvent('keydown', {
      key: 'f',
      metaKey: true,
      bubbles: true,
      cancelable: true,
    });
    const notCanceled = input.dispatchEvent(event);

    expect(notCanceled).toBe(true);
    expect(event.defaultPrevented).toBe(false);
    expect(setShowSearch).not.toHaveBeenCalled();

    input.remove();
  });

  it('routes delete/merge/split shortcuts to selected segment when unit is empty', () => {
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
        selectedUnit: undefined,
        selectedTimelineUnit: { layerId: 'layer-1', unitId: 'seg_42', kind: 'segment' as const },
        selectedUnitIds: new Set<string>(),
        selectedMediaUrl: 'blob:test',
        segMarkStart: null,
        setSegMarkStart: vi.fn(),
        segmentLoopPlayback: false,
        setSegmentLoopPlayback: vi.fn(),
        timelineUnitsOnCurrentMedia: [],
        markingModeRef: { current: false },
        skipSeekForIdRef: { current: null },
        creatingSegmentRef: { current: false },
        manualSelectTsRef: { current: 0 },
        waveformAreaRef,
        createUnitFromSelection: vi.fn(async () => undefined),
        selectUnit: vi.fn(),
        selectAllUnits: vi.fn(),
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

  it('plays the selected segment range when no unit is selected', () => {
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
        selectedUnit: undefined,
        selectedPlayableRange: { startTime: 3, endTime: 4.5 },
        selectedTimelineUnit: { layerId: 'layer-1', unitId: 'seg_42', kind: 'segment' as const },
        selectedUnitIds: new Set<string>(),
        selectedMediaUrl: 'blob:test',
        segMarkStart: null,
        setSegMarkStart: vi.fn(),
        segmentLoopPlayback: false,
        setSegmentLoopPlayback: vi.fn(),
        timelineUnitsOnCurrentMedia: [],
        markingModeRef: { current: false },
        skipSeekForIdRef: { current: null },
        creatingSegmentRef: { current: false },
        manualSelectTsRef: { current: 0 },
        waveformAreaRef,
        createUnitFromSelection: vi.fn(async () => undefined),
        selectUnit: vi.fn(),
        selectAllUnits: vi.fn(),
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
    const createUnitFromSelection = vi.fn(async () => undefined);

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
        selectedUnit: undefined,
        selectedTimelineUnit: { layerId: 'layer-1', unitId: 'seg_42', kind: 'segment' as const },
        selectedUnitIds: new Set<string>(),
        selectedMediaUrl: 'blob:test',
        segMarkStart: 1.1,
        setSegMarkStart,
        segmentLoopPlayback: false,
        setSegmentLoopPlayback: vi.fn(),
        timelineUnitsOnCurrentMedia: [],
        markingModeRef: { current: true },
        skipSeekForIdRef: { current: null },
        creatingSegmentRef: { current: false },
        manualSelectTsRef: { current: 0 },
        waveformAreaRef,
        createUnitFromSelection,
        selectTimelineUnit,
        selectUnit: vi.fn(),
        selectAllUnits: vi.fn(),
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

    expect(createUnitFromSelection).toHaveBeenCalledWith(1.1, 2.4, {
      selectionBehavior: 'keep-current',
    });
    expect(selectTimelineUnit).toHaveBeenCalledTimes(1);
    expect(selectTimelineUnit).toHaveBeenCalledWith(null);
    expect(setSegMarkStart).toHaveBeenCalledWith(null);
  });

  it('navigates prev/next using unified timeline units when selection is a segment', () => {
    const selectUnit = vi.fn();
    const units: TimelineUnitView[] = [
      makeTimelineUnit({ id: 'seg-a', kind: 'segment', startTime: 0, endTime: 1 }),
      makeTimelineUnit({ id: 'seg-b', kind: 'segment', startTime: 1, endTime: 2 }),
    ];

    const { result } = renderHook(() => {
      const waveformAreaRef = useRef<HTMLDivElement | null>(null);
      return useKeybindingActions({
        player: {
          isReady: true,
          isPlaying: false,
          playbackRate: 1,
          instanceRef: { current: { getCurrentTime: () => 0 } as unknown as import('wavesurfer.js').default },
          stop: vi.fn(),
          playRegion: vi.fn(),
          togglePlayback: vi.fn(),
          seekBySeconds: vi.fn(),
        },
        subSelectionRange: null,
        setSubSelectionRange: vi.fn(),
        selectedUnit: undefined,
        selectedTimelineUnit: { layerId: 'layer-1', unitId: 'seg-a', kind: 'segment' as const },
        selectedUnitIds: new Set<string>(['seg-a']),
        selectedMediaUrl: 'blob:test',
        segMarkStart: null,
        setSegMarkStart: vi.fn(),
        segmentLoopPlayback: false,
        setSegmentLoopPlayback: vi.fn(),
        timelineUnitsOnCurrentMedia: units,
        markingModeRef: { current: false },
        skipSeekForIdRef: { current: null },
        creatingSegmentRef: { current: false },
        manualSelectTsRef: { current: 0 },
        waveformAreaRef,
        createUnitFromSelection: vi.fn(async () => undefined),
        selectUnit,
        selectAllUnits: vi.fn(),
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
      result.current.executeAction('navNext');
    });
    expect(selectUnit).toHaveBeenCalledWith('seg-b');
  });
});
