/**
 * 统一宿主下「共享 lane 合同 vs 横向投影 vs 纵向投影」的类型切片（§5.6 L 表第一阶段：只拆类型、不改行为）。
 * @see docs/execution/plans/模式架构与平级评估-2026-04-21.md §5.6 L
 */

import type {
  TranscriptionPageTimelineHorizontalMediaLanesProps,
  TranscriptionPageTimelineTextOnlyProps,
} from './TranscriptionPage.TimelineContent';
import type { TranscriptionTimelineWorkspacePanelProps } from './transcriptionTimelineWorkspacePanelTypes';

/** 规划表中的「TimelineHostSharedProps」：与像素标尺/套索无关的 lane 共享字段（ReadyWorkspace `buildSharedLaneProps` 母集）。 */
export type TimelineHostSharedLaneProps = Pick<
  TranscriptionPageTimelineHorizontalMediaLanesProps,
  | 'transcriptionLayers'
  | 'translationLayers'
  | 'activeTextTimelineMode'
  | 'timelineUnitViewIndex'
  | 'segmentParentUnitLookup'
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
  | 'recordingUnitId'
  | 'recordingLayerId'
  | 'startRecordingForUnit'
  | 'stopRecording'
  | 'deleteVoiceTranslation'
  | 'transcribeVoiceTranslation'
  | 'displayStyleControl'
>;

/** 多轨横向宿主上由标尺/视窗/注解渲染承担的字段（与 `BuiltSharedLaneProps` 的 Omit 列表一致）。 */
export type TimelineHorizontalProjectionLaneProps = Pick<
  TranscriptionPageTimelineHorizontalMediaLanesProps,
  | 'playerDuration'
  | 'zoomPxPerSec'
  | 'lassoRect'
  | 'timelineRenderUnits'
  | 'defaultTranscriptionLayerId'
  | 'renderAnnotationItem'
  | 'speakerSortKeyById'
>;

/** 纵向对读布局开关与焦点（当前仍经 `textOnlyProps` / panel 管道透传）。 */
export type TimelineVerticalProjectionProps = Pick<
  TranscriptionTimelineWorkspacePanelProps,
  'verticalViewEnabled' | 'verticalPaneFocus' | 'updateVerticalPaneFocus'
>;

/** 与 `TranscriptionPageTimelineTextOnlyProps` 同形但不含纵向投影字段（编排入口与纵向合同解耦）。 */
export type TranscriptionPageTimelineWorkspacePanelPropsWithoutVertical = Omit<
  TranscriptionPageTimelineTextOnlyProps,
  keyof TimelineVerticalProjectionProps
>;
