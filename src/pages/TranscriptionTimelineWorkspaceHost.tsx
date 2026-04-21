import type { TranscriptionPageTimelineEmptyStateProps, TranscriptionPageTimelineHorizontalMediaLanesProps, TranscriptionPageTimelineTextOnlyProps } from './TranscriptionPage.TimelineContent';
import { TranscriptionTimelineTextOnly } from '../components/TranscriptionTimelineTextOnly';
import { TranscriptionTimelineHorizontalMediaLanes } from '../components/TranscriptionTimelineHorizontalMediaLanes';
import { TranscriptionTimelineVerticalView } from '../components/TranscriptionTimelineVerticalView';
import { TranscriptionPageTimelineEmptyState } from './TranscriptionPage.TimelineEmptyState';

export type TimelineWorkspaceHostShell = 'waveform' | 'text-only' | 'empty';

export interface TranscriptionTimelineWorkspaceHostProps {
  verticalComparisonEnabled: boolean;
  shell: TimelineWorkspaceHostShell;
  acousticPending: boolean;
  mediaLanesProps: TranscriptionPageTimelineHorizontalMediaLanesProps;
  textOnlyProps: TranscriptionPageTimelineTextOnlyProps;
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

  if (shell === 'waveform') {
    return <TranscriptionTimelineHorizontalMediaLanes {...mediaLanesProps} />;
  }
  if (shell === 'text-only') {
    return (
      <TranscriptionTimelineTextOnly
        {...textOnlyProps}
        {...(acousticPending ? { acousticPending: true } : {})}
      />
    );
  }
  return (
    <div className="timeline-empty-state">
      <TranscriptionPageTimelineEmptyState {...emptyStateProps} />
    </div>
  );
}
