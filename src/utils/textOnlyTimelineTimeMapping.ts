import { LinguisticService } from '../services/LinguisticService';
import type { PreviewTextTimeMappingInput, TextTimeMapping } from '../services/LinguisticService';

export type TextOnlyTimeMappingLike = Pick<TextTimeMapping, 'offsetSec' | 'scale'> | null | undefined;

function buildPreviewInputForFullDocumentAxis(
  logicalDurationSec: number,
  timeMapping?: TextOnlyTimeMappingLike,
): PreviewTextTimeMappingInput {
  const dur = logicalDurationSec > 0 ? logicalDurationSec : 1;
  const input: PreviewTextTimeMappingInput = { startTime: 0, endTime: dur };
  if (timeMapping) {
    if (typeof timeMapping.offsetSec === 'number' && Number.isFinite(timeMapping.offsetSec)) {
      input.offsetSec = timeMapping.offsetSec;
    }
    if (typeof timeMapping.scale === 'number' && Number.isFinite(timeMapping.scale)) {
      input.scale = timeMapping.scale;
    }
  }
  return input;
}

/**
 * 纯文本壳层：轨道 X → 文献秒（主存坐标）。无映射或默认 1:1 时与线性 `x/w*L` 一致。
 * Text-only shell: track X → document seconds (canonical). Matches linear x/w*L when mapping is identity.
 */
export function documentTimeFromTextOnlyTrackX(
  xInTrack: number,
  trackWidthPx: number,
  logicalDurationSec: number,
  timeMapping?: TextOnlyTimeMappingLike,
): number {
  const w = Math.max(trackWidthPx, 1e-9);
  const offsetSec = timeMapping?.offsetSec ?? 0;
  const scale = timeMapping?.scale ?? 1;
  const preview = LinguisticService.previewTextTimeMapping(buildPreviewInputForFullDocumentAxis(logicalDurationSec, timeMapping));
  const realStart = preview.realStartTime;
  const realEnd = preview.realEndTime;
  const realSpan = Math.max(realEnd - realStart, 1e-9);
  const clampedX = Math.min(Math.max(xInTrack, 0), w);
  const real = realStart + (clampedX / w) * realSpan;
  return LinguisticService.invertTextTimeMapping(real, { offsetSec, scale });
}

/**
 * 供 `useTimelineResize` 使用：像素 / 文献秒（与波形壳 `zoomPxPerSec` 语义一致，但按映射视口缩放）。
 */
export function computeTextOnlyZoomPxPerDocSec(
  trackWidthPx: number,
  logicalDurationSec: number,
  timeMapping?: TextOnlyTimeMappingLike,
): number | undefined {
  const w = trackWidthPx;
  if (!(w > 0)) return undefined;
  const scale = timeMapping?.scale ?? 1;
  if (!Number.isFinite(scale) || scale <= 0) return undefined;
  const preview = LinguisticService.previewTextTimeMapping(buildPreviewInputForFullDocumentAxis(logicalDurationSec, timeMapping));
  const realSpan = Math.max(preview.realEndTime - preview.realStartTime, 1e-9);
  return (w * scale) / realSpan;
}
