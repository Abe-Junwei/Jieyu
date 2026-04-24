/** 与 `createProject` / 占位轨默认一致；用于铺轨宽，避免 extent=0 时无法滚到屏外建段 */
export const DEFAULT_DOCUMENT_TIMELINE_EXTENT_FALLBACK_SEC = 1800;

export interface TimelineExtentInput {
  selectedMediaUrl?: string | null;
  /** 与 read model `acoustic.globalState === 'playable'` 同源：仅在为真时用媒体时长参与 min(·) 组合。 */
  globalPlaybackReady: boolean;
  playerDuration: number;
  documentSpanSec?: number;
}

function normalizePositiveFinite(value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return 0;
  return value;
}

/**
 * 统一时间轴内容区 / 标尺共用的跨度（秒）| Unified timeline extent in seconds (phase A single source)
 */
export function resolveTimelineExtentSec(input: TimelineExtentInput): number {
  const logical = normalizePositiveFinite(input.documentSpanSec);
  const media = normalizePositiveFinite(input.playerDuration);
  const hasMedia = typeof input.selectedMediaUrl === 'string' && input.selectedMediaUrl.trim().length > 0;

  if (!hasMedia) {
    return logical > 0 ? logical : DEFAULT_DOCUMENT_TIMELINE_EXTENT_FALLBACK_SEC;
  }
  if (input.globalPlaybackReady && media > 0) {
    /** 铺轨取文献与声学跨度的并集，避免短音频 + 长文献轴时被 min 收短到一屏、无法屏外建段。 */
    if (logical > 0) return Math.max(media, logical);
    return media;
  }
  /** 已挂 URL（含占位 blob）但尚未可播或时长为 0：仍用语义轴铺宽，避免 `calc(0 * px)` 锁死在一屏内 */
  if (logical > 0) return logical;
  return media > 0 ? media : DEFAULT_DOCUMENT_TIMELINE_EXTENT_FALLBACK_SEC;
}
