import { useMemo, type RefObject } from 'react';
import type { Locale } from '../i18n';
import type { TranscriptionPageTimelineContentProps, TranscriptionPageTimelineEmptyStateProps, TranscriptionPageTimelineHorizontalMediaLanesProps, TranscriptionPageTimelineTextOnlyProps } from './TranscriptionPage.TimelineContent';
import { resolveTimelineShellMode } from '../utils/timelineShellMode';

interface UseTranscriptionTimelineContentViewModelInput {
  selectedMediaUrl: string | null;
  playerIsReady: boolean;
  playerDuration: number;
  layersCount: number;
  locale: Locale;
  importFileRef: RefObject<HTMLInputElement | null>;
  layerActionSetCreateTranscription: () => void;
  mediaLanesPropsInput: Omit<TranscriptionPageTimelineHorizontalMediaLanesProps, 'playerDuration'>;
  textOnlyPropsInput: TranscriptionPageTimelineTextOnlyProps;
}

export function useTranscriptionTimelineContentViewModel(
  input: UseTranscriptionTimelineContentViewModelInput,
): TranscriptionPageTimelineContentProps {
  const mediaLanesProps = useMemo<TranscriptionPageTimelineHorizontalMediaLanesProps>(() => ({
    playerDuration: input.playerDuration,
    ...input.mediaLanesPropsInput,
  }), [input.mediaLanesPropsInput, input.playerDuration]);

  const verticalViewToggleDep = 'verticalViewEnabled' in input.textOnlyPropsInput
    ? input.textOnlyPropsInput.verticalViewEnabled
    : undefined;

  const textOnlyProps = useMemo<TranscriptionPageTimelineTextOnlyProps>(
    () => input.textOnlyPropsInput,
    [input.textOnlyPropsInput, verticalViewToggleDep],
  );

  const effectiveLayersCount = Math.max(
    input.layersCount,
    input.textOnlyPropsInput.transcriptionLayers?.length ?? 0,
    input.textOnlyPropsInput.translationLayers?.length ?? 0,
  );

  const verticalComparisonEnabled = Boolean(
    input.textOnlyPropsInput.verticalViewEnabled && effectiveLayersCount > 0,
  );

  const { shell: workspaceShell, acousticPending: workspaceAcousticPending } = resolveTimelineShellMode({
    selectedMediaUrl: input.selectedMediaUrl,
    playerIsReady: input.playerIsReady,
    playerDuration: input.playerDuration,
    layersCount: effectiveLayersCount,
    ...(input.textOnlyPropsInput.activeTextTimelineMode !== undefined
      ? { timelineMode: input.textOnlyPropsInput.activeTextTimelineMode }
      : {}),
    ...(input.textOnlyPropsInput.logicalDurationSec !== undefined
      ? { fallbackDurationSec: input.textOnlyPropsInput.logicalDurationSec }
      : {}),
    ...(('verticalViewEnabled' in input.textOnlyPropsInput && typeof input.textOnlyPropsInput.verticalViewEnabled === 'boolean')
      ? { verticalViewEnabled: input.textOnlyPropsInput.verticalViewEnabled }
      : {}),
  });

  const emptyStateProps = useMemo<TranscriptionPageTimelineEmptyStateProps>(() => ({
    locale: input.locale,
    layersCount: input.layersCount,
    hasSelectedMedia: Boolean(input.selectedMediaUrl),
    onCreateTranscriptionLayer: input.layerActionSetCreateTranscription,
    onOpenImportFile: () => input.importFileRef.current?.click(),
  }), [input.importFileRef, input.layerActionSetCreateTranscription, input.layersCount, input.locale, input.selectedMediaUrl]);

  return useMemo<TranscriptionPageTimelineContentProps>(() => ({
    workspaceShell,
    workspaceAcousticPending,
    verticalComparisonEnabled,
    mediaLanesProps,
    textOnlyProps,
    emptyStateProps,
  }), [
    emptyStateProps,
    mediaLanesProps,
    textOnlyProps,
    verticalComparisonEnabled,
    workspaceAcousticPending,
    workspaceShell,
  ]);
}