import '../styles/transcription-timeline.css';
import { TranscriptionTimelineWorkspaceHost } from './TranscriptionTimelineWorkspaceHost';
import type { TranscriptionPageTimelineContentProps } from './TranscriptionPage.TimelineContent.types';
export type {
  TranscriptionPageTimelineContentProps,
  TranscriptionPageTimelineEmptyStateProps,
  TranscriptionPageTimelineHorizontalMediaLanesProps,
  TranscriptionPageTimelineTextOnlyProps,
} from './TranscriptionPage.TimelineContent.types';

export function TranscriptionPageTimelineContent({
  workspaceShell,
  workspaceAcousticPending: _workspaceAcousticPending,
  workspaceAcousticChromeState,
  verticalComparisonEnabled,
  mediaLanesProps,
  textOnlyProps,
  emptyStateProps,
}: TranscriptionPageTimelineContentProps) {
  return (
    <TranscriptionTimelineWorkspaceHost
      verticalComparisonEnabled={verticalComparisonEnabled}
      shell={workspaceShell}
      workspaceAcousticChromeState={workspaceAcousticChromeState}
      mediaLanesProps={mediaLanesProps}
      textOnlyProps={textOnlyProps}
      emptyStateProps={emptyStateProps}
    />
  );
}
