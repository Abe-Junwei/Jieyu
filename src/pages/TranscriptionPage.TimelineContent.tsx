import '../styles/transcription-timeline.css';
import type { ComponentProps } from 'react';
import { TranscriptionTimelineTextOnly } from '../components/TranscriptionTimelineTextOnly';
import { TranscriptionTimelineHorizontalMediaLanes } from '../components/TranscriptionTimelineHorizontalMediaLanes';
import { TranscriptionPageTimelineEmptyState } from './TranscriptionPage.TimelineEmptyState';
import { TranscriptionTimelineWorkspaceHost, type TimelineWorkspaceHostShell } from './TranscriptionTimelineWorkspaceHost';

export type TranscriptionPageTimelineHorizontalMediaLanesProps = ComponentProps<typeof TranscriptionTimelineHorizontalMediaLanes>;
export type TranscriptionPageTimelineTextOnlyProps = ComponentProps<typeof TranscriptionTimelineTextOnly>;
export type TranscriptionPageTimelineEmptyStateProps = ComponentProps<typeof TranscriptionPageTimelineEmptyState>;

export interface TranscriptionPageTimelineContentProps {
  workspaceShell: TimelineWorkspaceHostShell;
  workspaceAcousticPending: boolean;
  verticalComparisonEnabled: boolean;
  mediaLanesProps: TranscriptionPageTimelineHorizontalMediaLanesProps;
  textOnlyProps: TranscriptionPageTimelineTextOnlyProps;
  emptyStateProps: TranscriptionPageTimelineEmptyStateProps;
}

export function TranscriptionPageTimelineContent({
  workspaceShell,
  workspaceAcousticPending,
  verticalComparisonEnabled,
  mediaLanesProps,
  textOnlyProps,
  emptyStateProps,
}: TranscriptionPageTimelineContentProps) {
  return (
    <TranscriptionTimelineWorkspaceHost
      verticalComparisonEnabled={verticalComparisonEnabled}
      shell={workspaceShell}
      acousticPending={workspaceAcousticPending}
      mediaLanesProps={mediaLanesProps}
      textOnlyProps={textOnlyProps}
      emptyStateProps={emptyStateProps}
    />
  );
}
