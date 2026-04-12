interface BuildSharedLanePropsInput {
  transcriptionLayers: any;
  translationLayers: any;
  segmentsByLayer: any;
  segmentContentByLayer: any;
  saveSegmentContentForLayer: any;
  selectedTimelineUnit: any;
  flashLayerRowId: any;
  focusedLayerRowId: any;
  selectedTimelineUtteranceId: string;
  orderedLayers: any;
  reorderLayers: any;
  deletableLayers: any;
  handleFocusLayerRow: any;
  layerLinks: any;
  showAllLayerConnectors: boolean;
  activeTextPrimaryLanguageId: string | null;
  activeTextPrimaryOrthographyId: string | null;
  handleToggleAllLayerConnectors: any;
  timelineLaneHeights: any;
  handleTimelineLaneHeightChange: any;
  transcriptionTrackMode: any;
  handleToggleTrackDisplayMode: any;
  setTrackDisplayMode: any;
  effectiveLaneLockMap: any;
  handleLockSelectedSpeakersToLane: any;
  handleUnlockSelectedSpeakers: any;
  handleResetTrackAutoLayout: any;
  selectedSpeakerNamesForTrackLock: any;
  speakerLayerLayout: any;
  speakerFocusMode: any;
  resolvedSpeakerFocusTargetKey: string | null;
  activeSpeakerFilterKey: any;
  speakerQuickActions: any;
  handleLaneLabelWidthResizeStart: any;
  translationAudioByLayer: any;
  mediaItems: any;
  recording: any;
  recordingUtteranceId: any;
  recordingLayerId: any;
  startRecordingForUtterance: any;
  stopRecording: any;
  deleteVoiceTranslation: any;
  displayStyleControl: any;
}

export function buildSharedLaneProps(input: BuildSharedLanePropsInput) {
  return {
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
  };
}
