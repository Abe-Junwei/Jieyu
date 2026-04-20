import '../styles/transcription-timeline.css';
import type { ComponentProps } from 'react';
import { TranscriptionTimelineTextOnly } from '../components/TranscriptionTimelineTextOnly';
import { TranscriptionTimelineComparison } from '../components/TranscriptionTimelineComparison';
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
  /** 与轨条 props 对齐，避免 layersCount 与 transcription/translation 列表短暂不一致时挡住对照视图 */
  const effectiveLayersCount = Math.max(
    layersCount,
    textOnlyProps.transcriptionLayers?.length ?? 0,
    textOnlyProps.translationLayers?.length ?? 0,
  );

  const { shell, acousticPending } = resolveTimelineShellMode({
    selectedMediaUrl,
    playerIsReady,
    playerDuration,
    layersCount: effectiveLayersCount,
    ...(textOnlyProps.activeTextTimelineMode !== undefined
      ? { timelineMode: textOnlyProps.activeTextTimelineMode }
      : {}),
    ...(textOnlyProps.logicalDurationSec !== undefined
      ? { fallbackDurationSec: textOnlyProps.logicalDurationSec }
      : {}),
    ...(('comparisonViewEnabled' in textOnlyProps && typeof textOnlyProps.comparisonViewEnabled === 'boolean')
      ? { comparisonViewEnabled: textOnlyProps.comparisonViewEnabled }
      : {}),
  });

  if (textOnlyProps.comparisonViewEnabled && effectiveLayersCount > 0) {
    return <TranscriptionTimelineComparison {...textOnlyProps} />;
  }

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
