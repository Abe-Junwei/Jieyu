/**
 * 时间轴 lane 内「草稿防抖保存」使用的 timer key 前缀单点，避免横纵多文件硬编码分叉（G3）。
 */

import type { TimelineUnitKind } from '../hooks/transcriptionTypes';

export function timelineSegmentDraftAutoSaveKey(layerId: string, segmentOrUnitId: string): string {
  return `seg-${layerId}-${segmentOrUnitId}`;
}

export function timelineUnitLayerDraftAutoSaveKey(layerId: string, unitId: string): string {
  return `utt-${layerId}-${unitId}`;
}

/** 横向宿主语段行：`TranscriptionTimelineMediaTranscriptionRow` 与 segment / unit 分支对齐 */
export function transcriptionLaneRowDraftAutoSaveKey(
  unitKind: TimelineUnitKind,
  layerId: string,
  unitId: string,
): string {
  return unitKind === 'segment'
    ? timelineSegmentDraftAutoSaveKey(layerId, unitId)
    : timelineUnitLayerDraftAutoSaveKey(layerId, unitId);
}

export function timelineTranslationTextRowAutoSaveKey(layerId: string, unitId: string): string {
  return `tr-${layerId}-${unitId}`;
}

/**
 * 译文草稿防抖 timer key：翻译层「自带 segment」时按段用 `seg-`，否则按宿主单元一行用 `tr-`。
 * 与侧栏译文格、多轨 `TranscriptionTimelineMediaTranslationRow` 等约定一致。
 */
export function timelineTranslationHostDraftAutoSaveKey(
  usesOwnSegments: boolean,
  layerId: string,
  unitId: string,
): string {
  return usesOwnSegments
    ? timelineSegmentDraftAutoSaveKey(layerId, unitId)
    : timelineTranslationTextRowAutoSaveKey(layerId, unitId);
}

/** 纵向对读：源列单元草稿防抖（与 `TranscriptionTimelineVerticalViewGroupList` 一致） */
export function timelinePairedReadingSourceDraftAutoSaveKey(sourceLayerId: string, sourceUnitId: string): string {
  return `pr-src-${sourceLayerId}-${sourceUnitId}`;
}

/** 纵向对读：译文按段多行时，每段一行编辑器的防抖 key */
export function timelinePairedReadingTargetSegmentDraftAutoSaveKey(
  translationLayerId: string,
  readingGroupId: string,
  targetItemId: string,
): string {
  return `pr-seg-${translationLayerId}-${readingGroupId}-${targetItemId}`;
}

/** 纵向对读：译文合并为单一多行编辑器时的防抖 key */
export function timelinePairedReadingTargetMergedDraftAutoSaveKey(
  translationLayerId: string,
  readingGroupId: string,
): string {
  return `pr-${translationLayerId}-${readingGroupId}`;
}
