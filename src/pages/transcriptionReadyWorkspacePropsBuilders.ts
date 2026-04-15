import type { TranscriptionPageTimelineMediaLanesProps } from './TranscriptionPage.TimelineContent';

type MediaLanesProps = TranscriptionPageTimelineMediaLanesProps;

type SharedLaneFields = Pick<
  MediaLanesProps,
  | 'transcriptionLayers'
  | 'translationLayers'
  | 'timelineUnitViewIndex'
  | 'segmentsByLayer'
  | 'segmentContentByLayer'
  | 'saveSegmentContentForLayer'
  | 'selectedTimelineUnit'
  | 'flashLayerRowId'
  | 'focusedLayerRowId'
  | 'deletableLayers'
  | 'layerLinks'
  | 'speakerLayerLayout'
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
 * ReadyWorkspace 侧字段名与 TranscriptionTimelineMediaLanes props 的对应关系
 * （避免 any，并保持与 buildSharedLaneProps 映射一致）。
 * 新建层弹窗的语言/正字法默认留空，不再从项目主语言注入。
 */
export type BuildSharedLanePropsInput = SharedLaneFields & {
  activeTimelineUnitId: string;
  orderedLayers: MediaLanesProps['allLayersOrdered'];
  reorderLayers: MediaLanesProps['onReorderLayers'];
  handleFocusLayerRow: MediaLanesProps['onFocusLayer'];
  showAllLayerConnectors: boolean;
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
    timelineUnitViewIndex: input.timelineUnitViewIndex,
    segmentsByLayer: input.segmentsByLayer,
    segmentContentByLayer: input.segmentContentByLayer,
    saveSegmentContentForLayer: input.saveSegmentContentForLayer,
    selectedTimelineUnit: input.selectedTimelineUnit,
    flashLayerRowId: input.flashLayerRowId,
    focusedLayerRowId: input.focusedLayerRowId,
    activeUnitId: input.activeTimelineUnitId,
    allLayersOrdered: input.orderedLayers,
    onReorderLayers: input.reorderLayers,
    deletableLayers: input.deletableLayers,
    onFocusLayer: input.handleFocusLayerRow,
    layerLinks: input.layerLinks,
    showConnectors: input.showAllLayerConnectors,
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
