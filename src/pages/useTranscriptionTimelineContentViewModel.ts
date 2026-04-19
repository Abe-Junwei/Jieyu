import { useMemo, type RefObject } from 'react';
import type { Locale } from '../i18n';
import type { TranscriptionPageTimelineContentProps, TranscriptionPageTimelineEmptyStateProps, TranscriptionPageTimelineMediaLanesProps, TranscriptionPageTimelineTextOnlyProps } from './TranscriptionPage.TimelineContent';

interface UseTranscriptionTimelineContentViewModelInput {
  selectedMediaUrl: string | null;
  playerIsReady: boolean;
  playerDuration: number;
  layersCount: number;
  locale: Locale;
  importFileRef: RefObject<HTMLInputElement | null>;
  layerActionSetCreateTranscription: () => void;
  mediaLanesPropsInput: Omit<TranscriptionPageTimelineMediaLanesProps, 'playerDuration'>;
  textOnlyPropsInput: TranscriptionPageTimelineTextOnlyProps;
}

export function useTranscriptionTimelineContentViewModel(
  input: UseTranscriptionTimelineContentViewModelInput,
): TranscriptionPageTimelineContentProps {
  const mediaLanesProps = useMemo<TranscriptionPageTimelineMediaLanesProps>(() => ({
    playerDuration: input.playerDuration,
    ...input.mediaLanesPropsInput,
  }), [input.mediaLanesPropsInput, input.playerDuration]);

  const comparisonViewToggleDep = 'comparisonViewEnabled' in input.textOnlyPropsInput
    ? input.textOnlyPropsInput.comparisonViewEnabled
    : undefined;

  const textOnlyProps = useMemo<TranscriptionPageTimelineTextOnlyProps>(
    () => input.textOnlyPropsInput,
    [input.textOnlyPropsInput, comparisonViewToggleDep],
  );

  const emptyStateProps = useMemo<TranscriptionPageTimelineEmptyStateProps>(() => ({
    locale: input.locale,
    layersCount: input.layersCount,
    hasSelectedMedia: Boolean(input.selectedMediaUrl),
    onCreateTranscriptionLayer: input.layerActionSetCreateTranscription,
    onOpenImportFile: () => input.importFileRef.current?.click(),
  }), [input.importFileRef, input.layerActionSetCreateTranscription, input.layersCount, input.locale, input.selectedMediaUrl]);

  return useMemo<TranscriptionPageTimelineContentProps>(() => ({
    selectedMediaUrl: input.selectedMediaUrl,
    playerIsReady: input.playerIsReady,
    playerDuration: input.playerDuration,
    layersCount: input.layersCount,
    mediaLanesProps,
    textOnlyProps,
    emptyStateProps,
  }), [emptyStateProps, input.layersCount, input.playerDuration, input.playerIsReady, input.selectedMediaUrl, mediaLanesProps, textOnlyProps]);
}