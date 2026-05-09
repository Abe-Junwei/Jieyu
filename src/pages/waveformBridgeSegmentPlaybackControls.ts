import { useCallback, useEffect, useRef, type MutableRefObject } from 'react';
import { useLatest } from '../hooks/useLatest';
import { DEFAULT_PLAYBACK_RATE_KEY, readDefaultPlaybackRate } from './useWaveformViewportSizing';
import type { useWaveSurfer } from '../hooks/useWaveSurfer';
import type { UseTranscriptionWaveformBridgeControllerInput } from './transcriptionWaveformBridge.types';

type WaveformTimelineItemLike = {
  startTime: number;
  endTime: number;
  tags?: { skipProcessing?: boolean };
} | null;

type PlayerSlice = Pick<
  ReturnType<typeof useWaveSurfer>,
  'instanceRef' | 'isReady' | 'isPlaying' | 'seekTo' | 'stop' | 'playRegion'
>;

export function useWaveformBridgeSegmentPlaybackControls(input: {
  player: PlayerSlice;
  segmentLoopPlayback: boolean;
  setSegmentLoopPlayback: (v: boolean | ((p: boolean) => boolean)) => void;
  setSegmentPlaybackRate: (v: number | ((p: number) => number)) => void;
  selectedWaveformTimelineItem: WaveformTimelineItemLike;
  subSelectionRange: { start: number; end: number } | null;
  selectedTimelineUnitId: string | undefined;
  zoomMode: UseTranscriptionWaveformBridgeControllerInput['zoomMode'];
  selectedTimelineUnitForTime: UseTranscriptionWaveformBridgeControllerInput['selectedTimelineUnitForTime'];
  zoomToUnit: (start: number, end: number) => void;
  skipSeekForIdRef: MutableRefObject<string | null>;
}): {
  resolveSelectedPlaybackRange: () => { start: number; end: number } | null;
  handleSegmentPlaybackRateChange: (rate: number) => void;
  handleToggleSelectedWaveformLoop: () => void;
  handleToggleSelectedWaveformPlay: () => void;
} {
  const {
    player,
    segmentLoopPlayback,
    setSegmentLoopPlayback,
    setSegmentPlaybackRate,
    selectedWaveformTimelineItem,
    subSelectionRange,
    selectedTimelineUnitId,
    zoomMode,
    selectedTimelineUnitForTime,
    zoomToUnit,
    skipSeekForIdRef,
  } = input;

  const previousSelectedTimelineUnitIdRef = useRef(selectedTimelineUnitId ?? '');

  useEffect(() => {
    const currentSelectedTimelineUnitId = selectedTimelineUnitId ?? '';
    const prev = previousSelectedTimelineUnitIdRef.current;
    if (prev !== currentSelectedTimelineUnitId && segmentLoopPlayback) {
      setSegmentLoopPlayback(false);
    }
    if (prev !== currentSelectedTimelineUnitId) {
      setSegmentPlaybackRate(readDefaultPlaybackRate());
    }
    previousSelectedTimelineUnitIdRef.current = currentSelectedTimelineUnitId;
  }, [selectedTimelineUnitId, segmentLoopPlayback, setSegmentLoopPlayback, setSegmentPlaybackRate]);

  const isPlayingRef = useLatest(player.isPlaying);
  useEffect(() => {
    const selectedRange = selectedTimelineUnitForTime;
    if (!selectedRange || !player.isReady) return;
    if (skipSeekForIdRef.current) {
      skipSeekForIdRef.current = null;
      return;
    }
    if (isPlayingRef.current) return;
    if (zoomMode === 'fit-selection') {
      zoomToUnit(selectedRange.startTime, selectedRange.endTime);
      return;
    }
    player.seekTo(selectedRange.startTime);
  }, [
    selectedTimelineUnitForTime,
    zoomMode,
    isPlayingRef,
    player,
    player.isReady,
    player.seekTo,
    zoomToUnit,
    skipSeekForIdRef,
  ]);

  const resolveSelectedPlaybackRange = useCallback(() => {
    if (!selectedWaveformTimelineItem) return null;
    return (
      subSelectionRange ?? {
        start: selectedWaveformTimelineItem.startTime,
        end: selectedWaveformTimelineItem.endTime,
      }
    );
  }, [selectedWaveformTimelineItem, subSelectionRange]);

  const handleSegmentPlaybackRateChange = useCallback(
    (rate: number): void => {
      setSegmentPlaybackRate(rate);
      try {
        localStorage.setItem(DEFAULT_PLAYBACK_RATE_KEY, String(rate));
      } catch {
        // no-op
      }
      const ws = player.instanceRef.current;
      if (ws && player.isPlaying) {
        ws.setPlaybackRate(rate);
      }
    },
    [player.instanceRef, player.isPlaying, setSegmentPlaybackRate],
  );

  const handleToggleSelectedWaveformLoop = useCallback(() => {
    if (segmentLoopPlayback) {
      setSegmentLoopPlayback(false);
      player.stop();
      return;
    }
    if (selectedWaveformTimelineItem?.tags?.skipProcessing === true) return;
    const range = resolveSelectedPlaybackRange();
    if (!range) return;
    setSegmentLoopPlayback(true);
    player.playRegion(range.start, range.end, true);
  }, [
    player,
    resolveSelectedPlaybackRange,
    segmentLoopPlayback,
    selectedWaveformTimelineItem,
    setSegmentLoopPlayback,
  ]);

  const handleToggleSelectedWaveformPlay = useCallback(() => {
    if (player.isPlaying) {
      player.stop();
      return;
    }
    if (selectedWaveformTimelineItem?.tags?.skipProcessing === true) return;
    const range = resolveSelectedPlaybackRange();
    if (!range) return;
    player.playRegion(range.start, range.end, true);
  }, [player, resolveSelectedPlaybackRange, selectedWaveformTimelineItem]);

  return {
    resolveSelectedPlaybackRange,
    handleSegmentPlaybackRateChange,
    handleToggleSelectedWaveformLoop,
    handleToggleSelectedWaveformPlay,
  };
}
