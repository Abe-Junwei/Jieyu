import type { TranscriptionPageTimelineEmptyStateProps, TranscriptionPageTimelineHorizontalMediaLanesProps } from './TranscriptionPage.TimelineContent';
import type {
  TranscriptionTimelineWorkspacePanelProps,
  TranscriptionTimelineVerticalViewInput,
} from './transcriptionTimelineWorkspacePanelTypes';
import { TranscriptionTimelineHorizontalMediaLanes } from '../components/TranscriptionTimelineHorizontalMediaLanes';
import { TranscriptionTimelineVerticalView } from '../components/TranscriptionTimelineVerticalView';
import { TranscriptionPageTimelineEmptyState } from './TranscriptionPage.TimelineEmptyState';
import type { TimelineAcousticState } from '../utils/mapAcousticToTimelineChrome';
import { mapAcousticToTimelineChrome } from '../utils/mapAcousticToTimelineChrome';

export type TimelineWorkspaceHostShell = 'waveform' | 'text-only' | 'empty';

export interface TranscriptionTimelineWorkspaceHostProps {
  verticalComparisonEnabled: boolean;
  shell: TimelineWorkspaceHostShell;
  /** 与 read model `acoustic.globalState` 同源，传入 `mapAcousticToTimelineChrome` 的 `state`。 */
  workspaceAcousticChromeState: TimelineAcousticState;
  mediaLanesProps: TranscriptionPageTimelineHorizontalMediaLanesProps;
  textOnlyProps: TranscriptionTimelineWorkspacePanelProps;
  emptyStateProps: TranscriptionPageTimelineEmptyStateProps;
}

function omitUndefined<T extends Record<string, unknown>>(value: T): Partial<T> {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as Partial<T>;
}

function buildVerticalViewInput(props: TranscriptionTimelineWorkspacePanelProps): TranscriptionTimelineVerticalViewInput {
  return {
    transcriptionLayers: props.transcriptionLayers,
    translationLayers: props.translationLayers,
    unitsOnCurrentMedia: props.unitsOnCurrentMedia,
    focusedLayerRowId: props.focusedLayerRowId,
    onFocusLayer: props.onFocusLayer,
    handleAnnotationClick: props.handleAnnotationClick,
    ...omitUndefined({
      layerLinks: props.layerLinks,
      activeUnitId: props.activeUnitId,
      verticalPaneFocus: props.verticalPaneFocus,
      updateVerticalPaneFocus: props.updateVerticalPaneFocus,
      segmentContentByLayer: props.segmentContentByLayer,
      saveSegmentContentForLayer: props.saveSegmentContentForLayer,
      handleAnnotationContextMenu: props.handleAnnotationContextMenu,
      segmentsByLayer: props.segmentsByLayer,
      segmentParentUnitLookup: props.segmentParentUnitLookup,
      allLayersOrdered: props.allLayersOrdered,
      deletableLayers: props.deletableLayers,
      defaultLanguageId: props.defaultLanguageId,
      defaultOrthographyId: props.defaultOrthographyId,
      defaultTranscriptionLayerId: props.defaultTranscriptionLayerId,
      activeSpeakerFilterKey: props.activeSpeakerFilterKey,
      translationAudioByLayer: props.translationAudioByLayer,
      handleNoteClick: props.handleNoteClick,
      resolveNoteIndicatorTarget: props.resolveNoteIndicatorTarget,
      resolveSelfCertaintyForUnit: props.resolveSelfCertaintyForUnit,
      resolveSelfCertaintyAmbiguityForUnit: props.resolveSelfCertaintyAmbiguityForUnit,
      mediaItems: props.mediaItems,
      recording: props.recording,
      recordingUnitId: props.recordingUnitId,
      recordingLayerId: props.recordingLayerId,
      startRecordingForUnit: props.startRecordingForUnit,
      stopRecording: props.stopRecording,
      deleteVoiceTranslation: props.deleteVoiceTranslation,
      transcribeVoiceTranslation: props.transcribeVoiceTranslation,
      displayStyleControl: props.displayStyleControl,
      speakerVisualByUnitId: props.speakerVisualByUnitId,
      navigateUnitFromInput: props.navigateUnitFromInput,
    }),
  };
}

/**
 * Unified timeline workspace host: central place for waveform/text-only/empty shell routing.
 */
export function TranscriptionTimelineWorkspaceHost({
  verticalComparisonEnabled,
  shell,
  workspaceAcousticChromeState,
  mediaLanesProps,
  textOnlyProps,
  emptyStateProps,
}: TranscriptionTimelineWorkspaceHostProps) {
  const timelineChrome = mapAcousticToTimelineChrome({
    shell,
    state: workspaceAcousticChromeState,
  });
  const verticalViewInput = buildVerticalViewInput(textOnlyProps);

  if (verticalComparisonEnabled) {
    return <TranscriptionTimelineVerticalView {...verticalViewInput} />;
  }

  if (shell === 'waveform' || shell === 'text-only') {
    return (
      <TranscriptionTimelineHorizontalMediaLanes
        {...mediaLanesProps}
        acousticShellPending={timelineChrome.acousticShellPending}
        timelineChromeClassNames={timelineChrome.timelineContentClassNames}
      />
    );
  }
  return (
    <div className="timeline-empty-state">
      <TranscriptionPageTimelineEmptyState {...emptyStateProps} />
    </div>
  );
}
