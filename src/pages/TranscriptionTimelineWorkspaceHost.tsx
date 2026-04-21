import type { TranscriptionPageTimelineEmptyStateProps, TranscriptionPageTimelineHorizontalMediaLanesProps } from './TranscriptionPage.TimelineContent';
import type { TranscriptionTimelineWorkspacePanelProps } from './transcriptionTimelineWorkspacePanelTypes';
import { TranscriptionTimelineHorizontalMediaLanes } from '../components/TranscriptionTimelineHorizontalMediaLanes';
import { TranscriptionTimelineVerticalView } from '../components/TranscriptionTimelineVerticalView';
import { TranscriptionPageTimelineEmptyState } from './TranscriptionPage.TimelineEmptyState';

export type TimelineWorkspaceHostShell = 'waveform' | 'text-only' | 'empty';

export interface TranscriptionTimelineWorkspaceHostProps {
  verticalComparisonEnabled: boolean;
  shell: TimelineWorkspaceHostShell;
  acousticPending: boolean;
  mediaLanesProps: TranscriptionPageTimelineHorizontalMediaLanesProps;
  textOnlyProps: TranscriptionTimelineWorkspacePanelProps;
  emptyStateProps: TranscriptionPageTimelineEmptyStateProps;
}

/**
 * Unified timeline workspace host: central place for waveform/text-only/empty shell routing.
 */
export function TranscriptionTimelineWorkspaceHost({
  verticalComparisonEnabled,
  shell,
  acousticPending,
  mediaLanesProps,
  textOnlyProps,
  emptyStateProps,
}: TranscriptionTimelineWorkspaceHostProps) {
  if (verticalComparisonEnabled) {
    return <TranscriptionTimelineVerticalView {...textOnlyProps} />;
  }

  if (shell === 'waveform' || shell === 'text-only') {
    return (
      <TranscriptionTimelineHorizontalMediaLanes
        {...mediaLanesProps}
        acousticShellPending={shell === 'text-only' && acousticPending}
      />
    );
  }
  return (
    <div className="timeline-empty-state">
      <TranscriptionPageTimelineEmptyState {...emptyStateProps} />
    </div>
  );
}
