import type { ComponentProps } from 'react';
import { TranscriptionTimelineTextOnly } from '../components/TranscriptionTimelineTextOnly';
import { TranscriptionTimelineMediaLanes } from '../components/TranscriptionTimelineMediaLanes';
import { TranscriptionPageTimelineEmptyState } from './TranscriptionPage.TimelineEmptyState';

type TimelineMediaLanesProps = ComponentProps<typeof TranscriptionTimelineMediaLanes>;
type TimelineTextOnlyProps = ComponentProps<typeof TranscriptionTimelineTextOnly>;
type TimelineEmptyStateProps = ComponentProps<typeof TranscriptionPageTimelineEmptyState>;

interface TranscriptionPageTimelineContentProps {
  selectedMediaUrl: string | null;
  playerIsReady: boolean;
  playerDuration: number;
  layersCount: number;
  mediaLanesProps: TimelineMediaLanesProps;
  textOnlyProps: TimelineTextOnlyProps;
  emptyStateProps: TimelineEmptyStateProps;
}

export function TranscriptionPageTimelineContent({
  selectedMediaUrl,
  playerIsReady,
  playerDuration,
  layersCount,
  mediaLanesProps,
  textOnlyProps,
  emptyStateProps,
}: TranscriptionPageTimelineContentProps) {
  if (selectedMediaUrl && playerIsReady && playerDuration > 0 && layersCount > 0) {
    return <TranscriptionTimelineMediaLanes {...mediaLanesProps} />;
  }
  if (layersCount > 0) {
    return <TranscriptionTimelineTextOnly {...textOnlyProps} />;
  }
  return (
    <div className="timeline-empty-state">
      <TranscriptionPageTimelineEmptyState {...emptyStateProps} />
    </div>
  );
}
