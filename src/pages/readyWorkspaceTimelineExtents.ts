import { resolveTimelineExtentSec } from '../utils/timelineExtent';
import { computeLogicalTimelineDurationForZoom } from './readyWorkspaceLogicalTimelineDuration';

export interface ReadyWorkspaceDocumentSpanInput {
  activeTextTimeLogicalDurationSec?: number | undefined;
  unitsOnCurrentMedia: ReadonlyArray<{ endTime?: number }>;
  acousticTimelineAnchorSec?: number | undefined;
}

/** 文献轴秒跨度（不含声学 max）；与 `buildTimelineReadModel` 的 `zoom.documentSpanSec` 同源。 */
export function resolveReadyWorkspaceDocumentSpanSec(
  input: ReadyWorkspaceDocumentSpanInput,
): number {
  const anchor = input.acousticTimelineAnchorSec;
  return computeLogicalTimelineDurationForZoom(
    input.activeTextTimeLogicalDurationSec,
    input.unitsOnCurrentMedia,
    typeof anchor === 'number' && Number.isFinite(anchor) && anchor > 0
      ? { acousticTimelineAnchorSec: anchor }
      : undefined,
  );
}

export function resolveReadyWorkspaceGlobalPlayableAcoustic(input: {
  selectedMediaUrl?: string | null | undefined;
  playerIsReady: boolean;
  playerDuration: number;
}): boolean {
  return (
    typeof input.selectedMediaUrl === 'string' &&
    input.selectedMediaUrl.trim().length > 0 &&
    input.playerIsReady &&
    input.playerDuration > 0
  );
}

export interface ReadyWorkspaceTimelineExtentInput {
  documentSpanSec: number;
  selectedMediaUrl?: string | null | undefined;
  globalPlayableAcoustic: boolean;
  playerDuration: number;
}

/**
 * 显示 / fit / lanes 宽度共用跨度；与 `buildTimelineReadModel` → `timeline.extentSec` 同源。
 */
export function resolveReadyWorkspaceTimelineExtentSec(
  input: ReadyWorkspaceTimelineExtentInput,
): number {
  return resolveTimelineExtentSec({
    documentSpanSec: input.documentSpanSec,
    selectedMediaUrl: input.selectedMediaUrl ?? null,
    globalPlaybackReady: input.globalPlayableAcoustic,
    playerDuration: input.playerDuration,
  });
}
