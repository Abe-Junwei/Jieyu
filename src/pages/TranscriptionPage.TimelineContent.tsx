import '../styles/transcription-timeline.css';
import type { ComponentProps } from 'react';
import { TranscriptionTimelineTextOnly } from '../components/TranscriptionTimelineTextOnly';
import { TranscriptionTimelineMediaLanes } from '../components/TranscriptionTimelineMediaLanes';
import { TranscriptionPageTimelineEmptyState } from './TranscriptionPage.TimelineEmptyState';
import { resolveTimelineShellMode } from '../utils/timelineShellMode';

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
  const { shell, acousticPending } = resolveTimelineShellMode({
    selectedMediaUrl,
    playerIsReady,
    playerDuration,
    layersCount,
    ...(textOnlyProps.activeTextTimelineMode !== undefined
      ? { timelineMode: textOnlyProps.activeTextTimelineMode }
      : {}),
    ...(textOnlyProps.logicalDurationSec !== undefined
      ? { fallbackDurationSec: textOnlyProps.logicalDurationSec }
      : {}),
  });

  if (shell === 'waveform') {
    return <TranscriptionTimelineMediaLanes {...mediaLanesProps} />;
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
