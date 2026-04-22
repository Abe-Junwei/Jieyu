export type TimelineAcousticShell = 'waveform' | 'text-only' | 'empty';
export type TimelineAcousticState = 'no_media' | 'pending_decode' | 'playable';

export interface TimelineAcousticChromeInput {
  shell: TimelineAcousticShell;
  state: TimelineAcousticState;
}

export interface TimelineAcousticChromeOutput {
  timelineContentClassNames: string[];
  acousticShellPending: boolean;
  waveformAreaAttrs: {
    ariaBusy: boolean | undefined;
    dataTimelineAcousticShell: TimelineAcousticShell;
  };
}

/**
 * 声学切片到时间轴壳层展示映射 | Map acoustic slice to timeline chrome presentation
 */
export function mapAcousticToTimelineChrome(input: TimelineAcousticChromeInput): TimelineAcousticChromeOutput {
  const acousticShellPending = input.shell === 'text-only' && input.state === 'pending_decode';
  return {
    timelineContentClassNames: acousticShellPending
      ? ['timeline-content-text-only', 'timeline-content-acoustic-pending']
      : [],
    acousticShellPending,
    waveformAreaAttrs: {
      ariaBusy: input.state === 'pending_decode' ? true : undefined,
      dataTimelineAcousticShell: input.shell,
    },
  };
}
