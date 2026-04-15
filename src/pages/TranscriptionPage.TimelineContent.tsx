import '../styles/transcription-timeline.css';
import type { ComponentProps } from 'react';
import { TranscriptionTimelineTextOnly } from '../components/TranscriptionTimelineTextOnly';
import { TranscriptionTimelineMediaLanes } from '../components/TranscriptionTimelineMediaLanes';
import { TranscriptionPageTimelineEmptyState } from './TranscriptionPage.TimelineEmptyState';

export type TranscriptionPageTimelineMediaLanesProps = ComponentProps<typeof TranscriptionTimelineMediaLanes>;
export type TranscriptionPageTimelineTextOnlyProps = ComponentProps<typeof TranscriptionTimelineTextOnly>;
export type TranscriptionPageTimelineEmptyStateProps = ComponentProps<typeof TranscriptionPageTimelineEmptyState>;

export interface TranscriptionPageTimelineContentProps {
  selectedMediaUrl: string | null;
  playerIsReady: boolean;
  playerDuration: number;
  layersCount: number;
  mediaLanesProps: TranscriptionPageTimelineMediaLanesProps;
  textOnlyProps: TranscriptionPageTimelineTextOnlyProps;
  emptyStateProps: TranscriptionPageTimelineEmptyStateProps;
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
