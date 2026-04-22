import { useMemo, type RefObject } from 'react';
import type { Locale } from '../i18n';
import type { TranscriptionPageTimelineContentProps, TranscriptionPageTimelineEmptyStateProps, TranscriptionPageTimelineHorizontalMediaLanesProps, TranscriptionPageTimelineTextOnlyProps } from './TranscriptionPage.TimelineContent';
import type {
  TimelineVerticalProjectionProps,
  TranscriptionPageTimelineWorkspacePanelPropsWithoutVertical,
} from './timelineHostProjectionTypes';
import { dropUndefinedKeys } from './transcriptionReadyWorkspacePropsBuilders';
import {
  computeEffectiveTimelineShellLayersCount,
  resolveTimelineShellMode,
  timelineShellModeResultToAcousticState,
} from '../utils/timelineShellMode';

const FALLBACK_VERTICAL_PROJECTION: TimelineVerticalProjectionProps = {};

interface UseTranscriptionTimelineContentViewModelInput {
  selectedMediaUrl: string | null;
  playerIsReady: boolean;
  playerDuration: number;
  timelineExtentSec: number;
  layersCount: number;
  locale: Locale;
  importFileRef: RefObject<HTMLInputElement | null>;
  layerActionSetCreateTranscription: () => void;
  mediaLanesPropsInput: Omit<TranscriptionPageTimelineHorizontalMediaLanesProps, 'playerDuration' | 'timelineExtentSec'>;
  /** 工作区 panel 合同，不含纵向投影字段（见 `verticalProjection`）。 */
  textOnlyPropsInput: TranscriptionPageTimelineWorkspacePanelPropsWithoutVertical;
  /** 纵向布局投影；与 panel 其余字段并列进入 view-model 后再合并为宿主 `textOnlyProps`。 */
  verticalProjection?: TimelineVerticalProjectionProps;
}

export function useTranscriptionTimelineContentViewModel(
  input: UseTranscriptionTimelineContentViewModelInput,
): TranscriptionPageTimelineContentProps {
  const mediaLanesProps = useMemo<TranscriptionPageTimelineHorizontalMediaLanesProps>(() => ({
    playerDuration: input.playerDuration,
    timelineExtentSec: input.timelineExtentSec,
    ...input.mediaLanesPropsInput,
  }), [input.mediaLanesPropsInput, input.playerDuration, input.timelineExtentSec]);

  const verticalProjection = input.verticalProjection ?? FALLBACK_VERTICAL_PROJECTION;

  const textOnlyProps = useMemo<TranscriptionPageTimelineTextOnlyProps>(
    () => dropUndefinedKeys({
      ...input.textOnlyPropsInput,
      ...verticalProjection,
    }) as TranscriptionPageTimelineTextOnlyProps,
    [
      input.textOnlyPropsInput,
      verticalProjection.verticalViewEnabled,
      verticalProjection.verticalPaneFocus,
      verticalProjection.updateVerticalPaneFocus,
    ],
  );

  const effectiveLayersCount = computeEffectiveTimelineShellLayersCount({
    orchestratorLayersCount: input.layersCount,
    transcriptionLayerCount: input.textOnlyPropsInput.transcriptionLayers?.length ?? 0,
    translationLayerCount: input.textOnlyPropsInput.translationLayers?.length ?? 0,
  });

  const verticalComparisonEnabled = Boolean(
    verticalProjection.verticalViewEnabled && effectiveLayersCount > 0,
  );

  const contractShellMode = resolveTimelineShellMode({
    selectedMediaUrl: input.selectedMediaUrl,
    playerIsReady: input.playerIsReady,
    playerDuration: input.playerDuration,
    layersCount: effectiveLayersCount,
    ...(typeof verticalProjection.verticalViewEnabled === 'boolean'
      ? { verticalViewEnabled: verticalProjection.verticalViewEnabled }
      : {}),
  });
  /** 忽略纵向短路，与 `TimelineReadModel` 的 `globalShellMode` / `acoustic.globalState` 同源。 */
  const globalShellMode = resolveTimelineShellMode({
    selectedMediaUrl: input.selectedMediaUrl,
    playerIsReady: input.playerIsReady,
    playerDuration: input.playerDuration,
    layersCount: effectiveLayersCount,
  });

  const { shell: workspaceShell, acousticPending: workspaceAcousticPending } = contractShellMode;
  const workspaceAcousticChromeState = timelineShellModeResultToAcousticState(globalShellMode);

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
    workspaceAcousticChromeState,
    verticalComparisonEnabled,
    mediaLanesProps,
    textOnlyProps,
    emptyStateProps,
  }), [
    emptyStateProps,
    mediaLanesProps,
    textOnlyProps,
    verticalComparisonEnabled,
    workspaceAcousticChromeState,
    workspaceAcousticPending,
    workspaceShell,
  ]);
}