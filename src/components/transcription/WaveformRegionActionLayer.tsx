import React from 'react';

import { RegionActionOverlay } from './RegionActionOverlay';
import type { ViewportFrameScrollLike } from '../../utils/viewportFrameToScreenRange';

interface SelectedWaveformTimelineItem {
  startTime: number;
  endTime: number;
  tags?: Record<string, boolean>;
}

interface WaveformRegionActionLayerProps {
  selectedMediaIsVideo: boolean;
  selectedWaveformTimelineItem: SelectedWaveformTimelineItem | null;
  playerIsReady: boolean;
  regionActionViewportFrame: ViewportFrameScrollLike;
  playerInstanceGetWidth: () => number;
  playerIsPlaying: boolean;
  segmentPlaybackRate: number;
  segmentLoopPlayback: boolean;
  handleSegmentPlaybackRateChange: (rate: number) => void;
  handleToggleSelectedWaveformLoop: () => void;
  handleToggleSelectedWaveformPlay: () => void;
}

export const WaveformRegionActionLayer = React.memo(function WaveformRegionActionLayer(
  props: WaveformRegionActionLayerProps,
) {
  const {
    selectedMediaIsVideo,
    selectedWaveformTimelineItem,
    playerIsReady,
    regionActionViewportFrame,
    playerInstanceGetWidth,
    playerIsPlaying,
    segmentPlaybackRate,
    segmentLoopPlayback,
    handleSegmentPlaybackRateChange,
    handleToggleSelectedWaveformLoop,
    handleToggleSelectedWaveformPlay,
  } = props;

  if (selectedMediaIsVideo || !selectedWaveformTimelineItem || !playerIsReady) {
    return null;
  }

  return (
    <RegionActionOverlay
      unitStartTime={selectedWaveformTimelineItem.startTime}
      unitEndTime={selectedWaveformTimelineItem.endTime}
      viewportFrame={regionActionViewportFrame}
      waveAreaWidth={playerInstanceGetWidth()}
      isPlaying={playerIsPlaying}
      segmentPlaybackRate={segmentPlaybackRate}
      segmentLoopPlayback={segmentLoopPlayback}
      skipProcessing={selectedWaveformTimelineItem.tags?.skipProcessing === true}
      onPlaybackRateChange={handleSegmentPlaybackRateChange}
      onToggleLoop={handleToggleSelectedWaveformLoop}
      onTogglePlay={handleToggleSelectedWaveformPlay}
    />
  );
});
