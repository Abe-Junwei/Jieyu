import type { BuildSharedLanePropsInput } from './transcriptionReadyWorkspacePropsBuilders';

type TrackLanePick = Pick<
  BuildSharedLanePropsInput,
  | 'handleToggleTrackDisplayMode'
  | 'setTrackDisplayMode'
  | 'effectiveLaneLockMap'
  | 'handleLockSelectedSpeakersToLane'
  | 'handleUnlockSelectedSpeakers'
  | 'handleResetTrackAutoLayout'
  | 'speakerLayerLayout'
>;

type SpeakerLanePick = Pick<
  BuildSharedLanePropsInput,
  'selectedSpeakerNamesForTrackLock' | 'activeSpeakerFilterKey' | 'speakerQuickActions'
>;

type TimelineLanePick = Pick<BuildSharedLanePropsInput, 'translationAudioByLayer'>;

export type ReadyWorkspaceViewModelsLaneSliceInput = Omit<
  BuildSharedLanePropsInput,
  keyof TrackLanePick | keyof SpeakerLanePick | keyof TimelineLanePick
> & {
  trackDisplayController: TrackLanePick;
  speakerController: SpeakerLanePick;
  timelineController: TimelineLanePick;
};

/** Maps track / speaker / timeline controllers into `lane` props for `buildReadyWorkspaceViewModelsInput`. */
export function buildReadyWorkspaceViewModelsLaneSlice(
  input: ReadyWorkspaceViewModelsLaneSliceInput,
): BuildSharedLanePropsInput {
  const { trackDisplayController, speakerController, timelineController, ...rest } = input;
  return {
    ...rest,
    handleToggleTrackDisplayMode: trackDisplayController.handleToggleTrackDisplayMode,
    setTrackDisplayMode: trackDisplayController.setTrackDisplayMode,
    effectiveLaneLockMap: trackDisplayController.effectiveLaneLockMap,
    handleLockSelectedSpeakersToLane: trackDisplayController.handleLockSelectedSpeakersToLane,
    handleUnlockSelectedSpeakers: trackDisplayController.handleUnlockSelectedSpeakers,
    handleResetTrackAutoLayout: trackDisplayController.handleResetTrackAutoLayout,
    speakerLayerLayout: trackDisplayController.speakerLayerLayout,
    selectedSpeakerNamesForTrackLock: speakerController.selectedSpeakerNamesForTrackLock,
    ...(speakerController.activeSpeakerFilterKey !== undefined
      ? { activeSpeakerFilterKey: speakerController.activeSpeakerFilterKey }
      : {}),
    speakerQuickActions: speakerController.speakerQuickActions,
    translationAudioByLayer: timelineController.translationAudioByLayer,
  } as BuildSharedLanePropsInput;
}
