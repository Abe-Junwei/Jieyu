import type { ActionId } from './IntentRouter';
import { getStoredLocalePreference, t, type DictKey, type Locale } from '../i18n';

const VOICE_ALIAS_LEARNING_LOG_KEY = 'jieyu.voice.intent.aliasLearningLog';
const MAX_VOICE_ALIAS_LOG_SIZE = 50;

const ACTION_LABEL_KEYS: Record<ActionId, DictKey> = {
  playPause: 'transcription.voiceAction.playPause',
  markSegment: 'transcription.voiceAction.markSegment',
  cancel: 'transcription.voiceAction.cancel',
  deleteSegment: 'transcription.voiceAction.deleteSegment',
  mergePrev: 'transcription.voiceAction.mergePrev',
  mergeNext: 'transcription.voiceAction.mergeNext',
  splitSegment: 'transcription.voiceAction.splitSegment',
  undo: 'transcription.voiceAction.undo',
  redo: 'transcription.voiceAction.redo',
  selectBefore: 'transcription.voiceAction.selectBefore',
  selectAfter: 'transcription.voiceAction.selectAfter',
  selectAll: 'transcription.voiceAction.selectAll',
  navPrev: 'transcription.voiceAction.navPrev',
  navNext: 'transcription.voiceAction.navNext',
  navToIndex: 'transcription.voiceAction.navToIndex',
  tabNext: 'transcription.voiceAction.tabNext',
  tabPrev: 'transcription.voiceAction.tabPrev',
  stepBack: 'transcription.voiceAction.stepBack',
  stepForward: 'transcription.voiceAction.stepForward',
  reviewNext: 'transcription.voiceAction.reviewNext',
  reviewPrev: 'transcription.voiceAction.reviewPrev',
  search: 'transcription.voiceAction.search',
  toggleNotes: 'transcription.voiceAction.toggleNotes',
  toggleVoice: 'transcription.voiceAction.toggleVoice',
  seekBack10Sec: 'transcription.voiceAction.seekBack10Sec',
  seekForward10Sec: 'transcription.voiceAction.seekForward10Sec',
  toggleGlobalLoop: 'transcription.voiceAction.toggleGlobalLoop',
  autoSegmentRun: 'transcription.voiceAction.autoSegmentRun',
  deleteTimelineAudio: 'transcription.voiceAction.deleteTimelineAudio',
  deleteTranscriptionProject: 'transcription.voiceAction.deleteTranscriptionProject',
  toolbarPlaybackRateChange: 'transcription.voiceAction.toolbarPlaybackRateChange',
  toolbarVolumeChange: 'transcription.voiceAction.toolbarVolumeChange',
  toolbarViewOptionsToggle: 'transcription.voiceAction.toolbarViewOptionsToggle',
  toolbarDisplayModeWaveform: 'transcription.voiceAction.toolbarDisplayModeWaveform',
  toolbarDisplayModeSpectrogram: 'transcription.voiceAction.toolbarDisplayModeSpectrogram',
  toolbarDisplayModeSplit: 'transcription.voiceAction.toolbarDisplayModeSplit',
  toolbarVisualStyleBalanced: 'transcription.voiceAction.toolbarVisualStyleBalanced',
  toolbarVisualStyleDense: 'transcription.voiceAction.toolbarVisualStyleDense',
  toolbarVisualStyleContrast: 'transcription.voiceAction.toolbarVisualStyleContrast',
  toolbarVisualStyleLine: 'transcription.voiceAction.toolbarVisualStyleLine',
  toolbarAcousticOverlayNone: 'transcription.voiceAction.toolbarAcousticOverlayNone',
  toolbarAcousticOverlayF0: 'transcription.voiceAction.toolbarAcousticOverlayF0',
  toolbarAcousticOverlayIntensity: 'transcription.voiceAction.toolbarAcousticOverlayIntensity',
  toolbarAcousticOverlayBoth: 'transcription.voiceAction.toolbarAcousticOverlayBoth',
  toolbarRefresh: 'transcription.voiceAction.toolbarRefresh',
  toolbarOpenProjectSetup: 'transcription.voiceAction.toolbarOpenProjectSetup',
  toolbarOpenAudioImport: 'transcription.voiceAction.toolbarOpenAudioImport',
  toolbarOpenUttOpsMenu: 'transcription.voiceAction.toolbarOpenUttOpsMenu',
  toolbarReviewMenuToggle: 'transcription.voiceAction.toolbarReviewMenuToggle',
  toolbarReviewPresetAll: 'transcription.voiceAction.toolbarReviewPresetAll',
  toolbarReviewPresetTime: 'transcription.voiceAction.toolbarReviewPresetTime',
  toolbarReviewPresetContentConcern: 'transcription.voiceAction.toolbarReviewPresetContentConcern',
  toolbarReviewPresetContentMissing: 'transcription.voiceAction.toolbarReviewPresetContentMissing',
  toolbarReviewPresetManualAttention: 'transcription.voiceAction.toolbarReviewPresetManualAttention',
  toolbarReviewPresetPendingReview: 'transcription.voiceAction.toolbarReviewPresetPendingReview',
  toolbarExportMenuToggle: 'transcription.voiceAction.toolbarExportMenuToggle',
  toolbarExportEaf: 'transcription.voiceAction.toolbarExportEaf',
  toolbarExportTextGrid: 'transcription.voiceAction.toolbarExportTextGrid',
  toolbarExportTrs: 'transcription.voiceAction.toolbarExportTrs',
  toolbarExportFlextext: 'transcription.voiceAction.toolbarExportFlextext',
  toolbarExportToolbox: 'transcription.voiceAction.toolbarExportToolbox',
  toolbarExportJyt: 'transcription.voiceAction.toolbarExportJyt',
  toolbarExportJym: 'transcription.voiceAction.toolbarExportJym',
  toolbarImportAnnotationFile: 'transcription.voiceAction.toolbarImportAnnotationFile',
  toolbarOpenSpeakerManagementPanel: 'transcription.voiceAction.toolbarOpenSpeakerManagementPanel',
  toolbarPreviewProjectArchiveImport: 'transcription.voiceAction.toolbarPreviewProjectArchiveImport',
  toolbarImportProjectArchive: 'transcription.voiceAction.toolbarImportProjectArchive',
  toolbarApplyTextTimeMapping: 'transcription.voiceAction.toolbarApplyTextTimeMapping',
  timelineLaneHeaderToggle: 'transcription.voiceAction.timelineLaneHeaderToggle',
  timelineSeek: 'transcription.voiceAction.timelineSeek',
  timelineWaveformResizeStart: 'transcription.voiceAction.timelineWaveformResizeStart',
  timelineSearchNavigateToUnit: 'transcription.voiceAction.timelineSearchNavigateToUnit',
  timelineSearchReplace: 'transcription.voiceAction.timelineSearchReplace',
  timelineSearchClose: 'transcription.voiceAction.timelineSearchClose',
  timelineZoomFitAll: 'transcription.voiceAction.timelineZoomFitAll',
  timelineZoomFitSelection: 'transcription.voiceAction.timelineZoomFitSelection',
  timelineZoomOneToOne: 'transcription.voiceAction.timelineZoomOneToOne',
  timelineZoomSliderChange: 'transcription.voiceAction.timelineZoomSliderChange',
  timelineZoomSnapToggle: 'transcription.voiceAction.timelineZoomSnapToggle',
  timelineZoomAutoScrollToggle: 'transcription.voiceAction.timelineZoomAutoScrollToggle',
  timelineHistoryPanelToggle: 'transcription.voiceAction.timelineHistoryPanelToggle',
  timelineHistoryJumpToIndex: 'transcription.voiceAction.timelineHistoryJumpToIndex',
  timelineHistoryRedo: 'transcription.voiceAction.timelineHistoryRedo',
  timelineAxisExpandLogicalDuration: 'transcription.voiceAction.timelineAxisExpandLogicalDuration',
  timelineWorkspaceLayoutHorizontal: 'transcription.voiceAction.timelineWorkspaceLayoutHorizontal',
  timelineWorkspaceLayoutVertical: 'transcription.voiceAction.timelineWorkspaceLayoutVertical',
  timelinePairedReadingColumnBoth: 'transcription.voiceAction.timelinePairedReadingColumnBoth',
  timelinePairedReadingColumnSource: 'transcription.voiceAction.timelinePairedReadingColumnSource',
  timelinePairedReadingColumnTarget: 'transcription.voiceAction.timelinePairedReadingColumnTarget',
  timelineVideoResizeHandle: 'transcription.voiceAction.timelineVideoResizeHandle',
  toolbarOpenTextTimeMappingDialog: 'transcription.voiceAction.toolbarOpenTextTimeMappingDialog',
  toolbarCloseTextTimeMappingDialog: 'transcription.voiceAction.toolbarCloseTextTimeMappingDialog',
  toolbarOpenProjectArchivePicker: 'transcription.voiceAction.toolbarOpenProjectArchivePicker',
  toolbarOpenAnnotationImportPicker: 'transcription.voiceAction.toolbarOpenAnnotationImportPicker',
  toolbarProjectHubMenuToggle: 'transcription.voiceAction.toolbarProjectHubMenuToggle',
  toolbarTimeMappingFormHistorySelect: 'transcription.voiceAction.toolbarTimeMappingFormHistorySelect',
  waveformAmplitudeSliderChange: 'transcription.voiceAction.waveformAmplitudeSliderChange',
  waveformAmplitudeReset: 'transcription.voiceAction.waveformAmplitudeReset',
  timelineVideoLayoutModeTop: 'transcription.voiceAction.timelineVideoLayoutModeTop',
  timelineVideoLayoutModeRight: 'transcription.voiceAction.timelineVideoLayoutModeRight',
  timelineVideoLayoutModeLeft: 'transcription.voiceAction.timelineVideoLayoutModeLeft',
  timelineLaneLabelResizeStart: 'transcription.voiceAction.timelineLaneLabelResizeStart',
  workspaceObserverRecommendationExecute: 'transcription.voiceAction.workspaceObserverRecommendationExecute',
  workspaceBatchOpsClose: 'transcription.voiceAction.workspaceBatchOpsClose',
  workspaceBatchOpsOffset: 'transcription.voiceAction.workspaceBatchOpsOffset',
  workspaceBatchOpsScale: 'transcription.voiceAction.workspaceBatchOpsScale',
  workspaceBatchOpsSplitByRegex: 'transcription.voiceAction.workspaceBatchOpsSplitByRegex',
  workspaceBatchOpsMerge: 'transcription.voiceAction.workspaceBatchOpsMerge',
  workspaceBatchOpsJumpToUnit: 'transcription.voiceAction.workspaceBatchOpsJumpToUnit',
  overlayCloseContextMenu: 'transcription.voiceAction.overlayCloseContextMenu',
  overlayCloseUttOpsMenu: 'transcription.voiceAction.overlayCloseUttOpsMenu',
  overlayMergeSelection: 'transcription.voiceAction.overlayMergeSelection',
  overlayOpenNoteFromMenu: 'transcription.voiceAction.overlayOpenNoteFromMenu',
  overlayDeleteDialogDismiss: 'transcription.voiceAction.overlayDeleteDialogDismiss',
  overlayDeleteDialogConfirm: 'transcription.voiceAction.overlayDeleteDialogConfirm',
  overlayCloseNotePopover: 'transcription.voiceAction.overlayCloseNotePopover',
  overlayNoteAdd: 'transcription.voiceAction.overlayNoteAdd',
  overlayNoteUpdate: 'transcription.voiceAction.overlayNoteUpdate',
  overlayNoteDelete: 'transcription.voiceAction.overlayNoteDelete',
  overlayAssignSpeaker: 'transcription.voiceAction.overlayAssignSpeaker',
  overlaySetSelfCertainty: 'transcription.voiceAction.overlaySetSelfCertainty',
  overlayToggleSkipProcessing: 'transcription.voiceAction.overlayToggleSkipProcessing',
  overlayLayerDisplayUpdate: 'transcription.voiceAction.overlayLayerDisplayUpdate',
  overlayLayerDisplayReset: 'transcription.voiceAction.overlayLayerDisplayReset',
  workspaceRecoveryApply: 'transcription.voiceAction.workspaceRecoveryApply',
  workspaceRecoveryDismiss: 'transcription.voiceAction.workspaceRecoveryDismiss',
  workspaceAiPanelToggle: 'transcription.voiceAction.workspaceAiPanelToggle',
  workspaceAiPanelResizeStart: 'transcription.voiceAction.workspaceAiPanelResizeStart',
  workspaceTimelineLassoPointerDown: 'transcription.voiceAction.workspaceTimelineLassoPointerDown',
  workspaceTimelineLassoPointerUp: 'transcription.voiceAction.workspaceTimelineLassoPointerUp',
  workspaceConflictApplyRemote: 'transcription.voiceAction.workspaceConflictApplyRemote',
  workspaceConflictKeepLocal: 'transcription.voiceAction.workspaceConflictKeepLocal',
  workspaceConflictPostpone: 'transcription.voiceAction.workspaceConflictPostpone',
  workspaceDirectMediaImportSelect: 'transcription.voiceAction.workspaceDirectMediaImportSelect',
};

export interface VoiceAliasLearningLogEntry {
  timestamp: number;
  phrase: string;
  actionId: ActionId;
  reason: 'empty' | 'updated' | 'unchanged' | 'conflict';
  previousActionId?: ActionId;
}

const VOICE_ALIAS_REASON_KEYS = {
  empty: 'transcription.voiceWidget.learningReason.new',
  updated: 'transcription.voiceWidget.learningReason.updated',
  unchanged: 'transcription.voiceWidget.learningReason.unchanged',
  conflict: 'transcription.voiceWidget.learningReason.conflict',
} as const satisfies Record<VoiceAliasLearningLogEntry['reason'], DictKey>;

function isVoiceAliasLearningLogEntry(entry: unknown): entry is VoiceAliasLearningLogEntry {
  if (!entry || typeof entry !== 'object') return false;
  const candidate = entry as Record<string, unknown>;
  return typeof candidate.timestamp === 'number'
    && typeof candidate.phrase === 'string'
    && typeof candidate.actionId === 'string'
    && candidate.actionId in ACTION_LABEL_KEYS
    && typeof candidate.reason === 'string';
}

function resolveVoiceIntentLocale(locale?: Locale): Locale {
  return locale ?? getStoredLocalePreference() ?? 'zh-CN';
}

export function getActionLabel(actionId: ActionId, locale?: Locale): string {
  return t(resolveVoiceIntentLocale(locale), ACTION_LABEL_KEYS[actionId]);
}

export function getVoiceAliasLearningReasonLabel(reason: VoiceAliasLearningLogEntry['reason'], locale?: Locale): string {
  return t(resolveVoiceIntentLocale(locale), VOICE_ALIAS_REASON_KEYS[reason]);
}

export function loadVoiceAliasLearningLog(): VoiceAliasLearningLogEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(VOICE_ALIAS_LEARNING_LOG_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isVoiceAliasLearningLogEntry);
  } catch (err) {
    console.debug('[voiceIntentUi] loadVoiceAliasLearningLog failed, using empty log:', err);
    return [];
  }
}

export function clearVoiceAliasLearningLog(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(VOICE_ALIAS_LEARNING_LOG_KEY);
}

export function appendVoiceAliasLearningLog(entry: VoiceAliasLearningLogEntry): void {
  if (typeof window === 'undefined') return;
  const current = loadVoiceAliasLearningLog();
  const next = [...current, entry];
  if (next.length > MAX_VOICE_ALIAS_LOG_SIZE) {
    next.splice(0, next.length - MAX_VOICE_ALIAS_LOG_SIZE);
  }
  window.localStorage.setItem(VOICE_ALIAS_LEARNING_LOG_KEY, JSON.stringify(next));
}
