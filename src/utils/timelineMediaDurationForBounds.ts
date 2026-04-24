import type { MediaItemDocType } from '../db';
import { isMediaItemPlaceholderRow } from './mediaItemTimelineKind';

/** 建段钳制：需能识别占位行（正 `duration` 的占位仍视为无声学上界）。 */
export type MediaDurationBoundsInput = Pick<MediaItemDocType, 'duration' | 'details' | 'filename'>;

/**
 * 建段/拖选钳制用的媒体时长上界。
 * 占位行（文献/逻辑轴）始终视为**无声学上界**，与 `duration` 数值无关。
 * 非占位时：`duration: 0`/无效/未定义 表示「尚无声学上界」，返回无穷上界。
 */
export function mediaDurationSecForTimeBounds(
  media: MediaDurationBoundsInput | null | undefined,
): number {
  if (!media) return Number.POSITIVE_INFINITY;
  if (isMediaItemPlaceholderRow(media)) return Number.POSITIVE_INFINITY;
  const d = media.duration;
  if (typeof d !== 'number' || !Number.isFinite(d) || d <= 0) {
    return Number.POSITIVE_INFINITY;
  }
  return d;
}

/**
 * 独立语段拖建/「下一段」间隙钳制上界：在有限媒体时长下，与当前文献逻辑轴跨度取 max，
 * 避免「时间轴像素轴 = logicalDuration」而 `media.duration` 更短时，选区被压到已有语段上误报重叠。
 */
export function independentSegmentInsertionUpperBoundSec(
  media: MediaDurationBoundsInput | null | undefined,
  documentSpanSec?: number | null,
): number {
  const mediaCap = mediaDurationSecForTimeBounds(media);
  const logicalCap = typeof documentSpanSec === 'number'
    && Number.isFinite(documentSpanSec)
    && documentSpanSec > 0
    ? documentSpanSec
    : 0;
  if (mediaCap === Number.POSITIVE_INFINITY) {
    return Number.POSITIVE_INFINITY;
  }
  return Math.max(mediaCap, logicalCap);
}
