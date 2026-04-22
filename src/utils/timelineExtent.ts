export interface TimelineExtentInput {
  selectedMediaUrl?: string | null;
  /** 与 read model `acoustic.globalState === 'playable'` 同源：仅在为真时用媒体时长参与 min(·) 组合。 */
  globalPlaybackReady: boolean;
  playerDuration: number;
  logicalTimelineDurationSec?: number;
}

function normalizePositiveFinite(value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return 0;
  return value;
}

/**
 * 统一时间轴内容区 / 标尺共用的跨度（秒）| Unified timeline extent in seconds (phase A single source)
 */
export function resolveTimelineExtentSec(input: TimelineExtentInput): number {
  const logical = normalizePositiveFinite(input.logicalTimelineDurationSec);
  const media = normalizePositiveFinite(input.playerDuration);
  const hasMedia = typeof input.selectedMediaUrl === 'string' && input.selectedMediaUrl.trim().length > 0;

  if (!hasMedia) {
    return logical;
  }
  if (input.globalPlaybackReady && media > 0) {
    if (logical > 0) return Math.min(media, logical);
    return media;
  }
  if (logical > 0) return logical;
  return media;
}
