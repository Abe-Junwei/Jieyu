import type { TranscriptionPageTimelineMediaLanesProps } from './TranscriptionPage.TimelineContent';

type MediaLanesProps = TranscriptionPageTimelineMediaLanesProps;

type SharedLaneFields = Pick<
  MediaLanesProps,
  | 'transcriptionLayers'
  | 'translationLayers'
  | 'segmentsByLayer'
  | 'segmentContentByLayer'
  | 'saveSegmentContentForLayer'
  | 'selectedTimelineUnit'
  | 'flashLayerRowId'
  | 'focusedLayerRowId'
  | 'deletableLayers'
  | 'layerLinks'
  | 'speakerLayerLayout'
  | 'speakerFocusMode'
  | 'activeSpeakerFilterKey'
  | 'speakerQuickActions'
  | 'translationAudioByLayer'
  | 'mediaItems'
  | 'recording'
  | 'recordingUtteranceId'
  | 'recordingLayerId'
  | 'startRecordingForUtterance'
  | 'stopRecording'
  | 'deleteVoiceTranslation'
  | 'displayStyleControl'
>;

/**
 * ReadyWorkspace 侧字段名与 TranscriptionTimelineMediaLanes  props 的对应关系
 * （避免 any，并保持与 buildSharedLaneProps 映射一致）。
 */
export type BuildSharedLanePropsInput = SharedLaneFields & {
  selectedTimelineUtteranceId: string;
  orderedLayers: MediaLanesProps['allLayersOrdered'];
  reorderLayers: MediaLanesProps['onReorderLayers'];
  handleFocusLayerRow: MediaLanesProps['onFocusLayer'];
  showAllLayerConnectors: boolean;
  activeTextPrimaryLanguageId: string | null;
  activeTextPrimaryOrthographyId: string | null;
  handleToggleAllLayerConnectors: MediaLanesProps['onToggleConnectors'];
  timelineLaneHeights: MediaLanesProps['laneHeights'];
  handleTimelineLaneHeightChange: MediaLanesProps['onLaneHeightChange'];
  transcriptionTrackMode: MediaLanesProps['trackDisplayMode'];
  handleToggleTrackDisplayMode: MediaLanesProps['onToggleTrackDisplayMode'];
  setTrackDisplayMode: MediaLanesProps['onSetTrackDisplayMode'];
  effectiveLaneLockMap: MediaLanesProps['laneLockMap'];
  handleLockSelectedSpeakersToLane: MediaLanesProps['onLockSelectedSpeakersToLane'];
  handleUnlockSelectedSpeakers: MediaLanesProps['onUnlockSelectedSpeakers'];
  handleResetTrackAutoLayout: MediaLanesProps['onResetTrackAutoLayout'];
  selectedSpeakerNamesForTrackLock: MediaLanesProps['selectedSpeakerNamesForLock'];
  resolvedSpeakerFocusTargetKey: string | null;
  handleLaneLabelWidthResizeStart: MediaLanesProps['onLaneLabelWidthResize'];
};

export type BuiltSharedLaneProps = Omit<
  MediaLanesProps,
  | 'playerDuration'
  | 'zoomPxPerSec'
  | 'lassoRect'
  | 'timelineRenderUtterances'
  | 'defaultTranscriptionLayerId'
  | 'renderAnnotationItem'
  | 'speakerSortKeyById'
>;

/** exactOptionalPropertyTypes：去掉显式 undefined，避免把可选键写成 undefined。 */
export function dropUndefinedKeys<T extends Record<string, unknown>>(obj: T): T {
  const next = { ...obj } as Record<string, unknown>;
  for (const key of Object.keys(next)) {
    if (next[key] === undefined) delete next[key];
  }
  return next as T;
}

export function buildSharedLaneProps(input: BuildSharedLanePropsInput): BuiltSharedLaneProps {
  return dropUndefinedKeys({
    transcriptionLayers: input.transcriptionLayers,
    translationLayers: input.translationLayers,
    segmentsByLayer: input.segmentsByLayer,
    segmentContentByLayer: input.segmentContentByLayer,
    saveSegmentContentForLayer: input.saveSegmentContentForLayer,
    selectedTimelineUnit: input.selectedTimelineUnit,
    flashLayerRowId: input.flashLayerRowId,
    focusedLayerRowId: input.focusedLayerRowId,
    activeUtteranceUnitId: input.selectedTimelineUtteranceId,
    allLayersOrdered: input.orderedLayers,
    onReorderLayers: input.reorderLayers,
    deletableLayers: input.deletableLayers,
    onFocusLayer: input.handleFocusLayerRow,
    layerLinks: input.layerLinks,
    showConnectors: input.showAllLayerConnectors,
    ...(input.activeTextPrimaryLanguageId ? { defaultLanguageId: input.activeTextPrimaryLanguageId } : {}),
    ...(input.activeTextPrimaryOrthographyId ? { defaultOrthographyId: input.activeTextPrimaryOrthographyId } : {}),
    onToggleConnectors: input.handleToggleAllLayerConnectors,
    laneHeights: input.timelineLaneHeights,
    onLaneHeightChange: input.handleTimelineLaneHeightChange,
    trackDisplayMode: input.transcriptionTrackMode,
    onToggleTrackDisplayMode: input.handleToggleTrackDisplayMode,
    onSetTrackDisplayMode: input.setTrackDisplayMode,
    laneLockMap: input.effectiveLaneLockMap,
    onLockSelectedSpeakersToLane: input.handleLockSelectedSpeakersToLane,
    onUnlockSelectedSpeakers: input.handleUnlockSelectedSpeakers,
    onResetTrackAutoLayout: input.handleResetTrackAutoLayout,
    selectedSpeakerNamesForLock: input.selectedSpeakerNamesForTrackLock,
    speakerLayerLayout: input.speakerLayerLayout,
    speakerFocusMode: input.speakerFocusMode,
    ...(input.resolvedSpeakerFocusTargetKey ? { speakerFocusSpeakerKey: input.resolvedSpeakerFocusTargetKey } : {}),
    activeSpeakerFilterKey: input.activeSpeakerFilterKey,
    speakerQuickActions: input.speakerQuickActions,
    onLaneLabelWidthResize: input.handleLaneLabelWidthResizeStart,
    translationAudioByLayer: input.translationAudioByLayer,
    mediaItems: input.mediaItems,
    recording: input.recording,
    recordingUtteranceId: input.recordingUtteranceId,
    recordingLayerId: input.recordingLayerId,
    startRecordingForUtterance: input.startRecordingForUtterance,
    stopRecording: input.stopRecording,
    deleteVoiceTranslation: input.deleteVoiceTranslation,
    displayStyleControl: input.displayStyleControl,
  }) as BuiltSharedLaneProps;
}
