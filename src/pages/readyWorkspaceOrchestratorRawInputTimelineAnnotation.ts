import type { TextTimeMapping } from '../types/textTimeMapping';
import type { TranscriptionReadyWorkspaceOrchestratorRawInput } from './transcriptionReadyWorkspaceOrchestratorInput';

type Raw = Omit<TranscriptionReadyWorkspaceOrchestratorRawInput, 'sharedLaneProps'>;

type TimelineAnnotationPick = Pick<
  Raw,
  | 'timelineRenderUnits'
  | 'defaultTranscriptionLayerId'
  | 'createUnitFromSelectionRouted'
  | 'renderAnnotationItem'
  | 'speakerSortKeyById'
  | 'filteredUnitsOnCurrentMedia'
  | 'tierContainerRef'
  | 'handleAnnotationClick'
  | 'handleAnnotationContextMenu'
  | 'handleNoteClick'
  | 'resolveNoteIndicatorTarget'
  | 'startTimelineResizeDrag'
  | 'navigateUnitFromInput'
  | 'speakerVisualByTimelineUnitId'
  | 'resolveSelfCertaintyForUnit'
  | 'resolveSelfCertaintyAmbiguityForUnit'
  | 'verticalViewEnabled'
  | 'verticalPaneFocus'
  | 'updateVerticalPaneFocus'
>;

export type BuildOrchestratorRawTimelineAnnotationClusterInput = TimelineAnnotationPick & {
  activeTextTimeMapping?:
    | (Pick<TextTimeMapping, 'offsetSec' | 'scale'> & { logicalDurationSec?: number })
    | null
    | undefined;
};

export function buildOrchestratorRawTimelineAnnotationCluster(
  args: BuildOrchestratorRawTimelineAnnotationClusterInput,
): TimelineAnnotationPick & Partial<Pick<Raw, 'textOnlyLogicalDurationSec' | 'textOnlyTimeMapping'>> {
  const { activeTextTimeMapping, ...rest } = args;
  return {
    ...rest,
    ...(activeTextTimeMapping?.logicalDurationSec !== undefined
      ? { textOnlyLogicalDurationSec: activeTextTimeMapping.logicalDurationSec }
      : {}),
    ...(activeTextTimeMapping
      ? {
        textOnlyTimeMapping: {
          offsetSec: activeTextTimeMapping.offsetSec,
          scale: activeTextTimeMapping.scale,
        },
      }
      : {}),
  };
}
