import type { BuildReadyWorkspaceWaveformContentPropsInput } from './transcriptionReadyWorkspacePropsBuilders';

/**
 * Waveform 输入构建器 | Waveform props input builder
 *
 * 负责聚合 ReadyWorkspace 中与波形显示相关的所有参数，包括
 * 播放器、快照指南、音频学覆盖层、VAD 缓存等。
 */

type TimelineUnitForDuration = {
  startTime: number;
  endTime: number;
};

export type BuildReadyWorkspaceWaveformContentPropsInputFromControllers = Omit<
  BuildReadyWorkspaceWaveformContentPropsInput,
  | 'selectedUnitDuration'
  | 'acousticRuntimeStatus'
  | 'vadCacheStatus'
  | 'snapGuideVisible'
  | 'snapGuideLeft'
  | 'snapGuideRight'
  | 'snapGuideNearSideValue'
  | 'playerSpectrogramRef'
  | 'playerWaveformRef'
  | 'playerSeekTo'
  | 'playerPlayRegion'
  | 'playerDuration'
  | 'rulerView'
  | 'playerIsReady'
  | 'playerIsPlaying'
  | 'zoomPxPerSec'
  | 'mediaFileInputRef'
> & {
  selectedTimelineUnitForTime?: TimelineUnitForDuration | null;
  runtimeStatus: {
    acousticRuntimeStatus: BuildReadyWorkspaceWaveformContentPropsInput['acousticRuntimeStatus'];
    vadCacheStatus: BuildReadyWorkspaceWaveformContentPropsInput['vadCacheStatus'];
  };
  snapGuide: {
    visible: BuildReadyWorkspaceWaveformContentPropsInput['snapGuideVisible'];
    left: BuildReadyWorkspaceWaveformContentPropsInput['snapGuideLeft'];
    right: BuildReadyWorkspaceWaveformContentPropsInput['snapGuideRight'];
    nearSide: BuildReadyWorkspaceWaveformContentPropsInput['snapGuideNearSideValue'];
  };
  playerBridge: {
    spectrogramRef: BuildReadyWorkspaceWaveformContentPropsInput['playerSpectrogramRef'];
    waveformRef: BuildReadyWorkspaceWaveformContentPropsInput['playerWaveformRef'];
    seekTo: BuildReadyWorkspaceWaveformContentPropsInput['playerSeekTo'];
    playRegion: BuildReadyWorkspaceWaveformContentPropsInput['playerPlayRegion'];
    duration: BuildReadyWorkspaceWaveformContentPropsInput['playerDuration'];
    isReady: BuildReadyWorkspaceWaveformContentPropsInput['playerIsReady'];
    isPlaying: BuildReadyWorkspaceWaveformContentPropsInput['playerIsPlaying'];
  };
  timelineViewportProjection: {
    rulerView: BuildReadyWorkspaceWaveformContentPropsInput['rulerView'];
    zoomPxPerSec: BuildReadyWorkspaceWaveformContentPropsInput['zoomPxPerSec'];
  };
  mediaFileInputRef: BuildReadyWorkspaceWaveformContentPropsInput['mediaFileInputRef'];
};

/**
 * 构建波形内容 props 输入 | Build waveform content props input
 *
 * 聚合波形显示所需的所有参数，包括音频单元时长、播放器状态、
 * 快照指南、音频学覆盖层状态等，生成合并后的输入对象供 waveform content props builder 使用。
 */
export function buildReadyWorkspaceWaveformContentPropsInput(
  input: BuildReadyWorkspaceWaveformContentPropsInputFromControllers,
): BuildReadyWorkspaceWaveformContentPropsInput {
  return {
    ...input,
    selectedUnitDuration: input.selectedTimelineUnitForTime
      ? input.selectedTimelineUnitForTime.endTime - input.selectedTimelineUnitForTime.startTime
      : null,
    acousticRuntimeStatus: input.runtimeStatus.acousticRuntimeStatus,
    vadCacheStatus: input.runtimeStatus.vadCacheStatus,
    snapGuideVisible: input.snapGuide.visible,
    snapGuideLeft: input.snapGuide.left,
    snapGuideRight: input.snapGuide.right,
    snapGuideNearSideValue: input.snapGuide.nearSide,
    playerSpectrogramRef: input.playerBridge.spectrogramRef,
    playerWaveformRef: input.playerBridge.waveformRef,
    playerSeekTo: input.playerBridge.seekTo,
    playerPlayRegion: input.playerBridge.playRegion,
    playerDuration: input.playerBridge.duration,
    rulerView: input.timelineViewportProjection.rulerView,
    playerIsReady: input.playerBridge.isReady,
    playerIsPlaying: input.playerBridge.isPlaying,
    zoomPxPerSec: input.timelineViewportProjection.zoomPxPerSec,
    mediaFileInputRef: input.mediaFileInputRef,
  };
}
