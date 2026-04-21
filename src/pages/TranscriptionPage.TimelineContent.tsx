import '../styles/transcription-timeline.css';
import type { ComponentProps } from 'react';
import { TranscriptionPageTimelineEmptyState } from './TranscriptionPage.TimelineEmptyState';
import { TranscriptionTimelineWorkspaceHost, type TimelineWorkspaceHostShell } from './TranscriptionTimelineWorkspaceHost';
import type { TranscriptionTimelineWorkspacePanelProps } from './transcriptionTimelineWorkspacePanelTypes';

export type TranscriptionPageTimelineHorizontalMediaLanesProps = ComponentProps<typeof import('../components/TranscriptionTimelineHorizontalMediaLanes').TranscriptionTimelineHorizontalMediaLanes>;
/** 纵向对读 / 编排透传；与 `TranscriptionTimelineWorkspacePanelProps` 同形 */
export type TranscriptionPageTimelineTextOnlyProps = TranscriptionTimelineWorkspacePanelProps;
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
