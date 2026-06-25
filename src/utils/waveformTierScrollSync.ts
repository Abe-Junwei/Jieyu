import type WaveSurfer from 'wavesurfer.js';

/** 文献秒轴长于已解码媒体时，tier 为横向主滚动容器。 */
export function isExtendedDocumentTimeline(documentSpanSec: number, mediaDurSec: number): boolean {
  return mediaDurSec > 0 && documentSpanSec > mediaDurSec;
}

/** 文献秒轴 > 已解码媒体时长时：tier 为横向主滚动，把 WaveSurfer 像素滚动钳在有效波形范围内 */
export function syncWaveScrollToTier(
  ws: WaveSurfer,
  tierScrollLeftPx: number,
  zoomPxPerSec: number,
  mediaDurSec: number,
): void {
  if (mediaDurSec <= 0 || zoomPxPerSec <= 0) return;
  const w = ws.getWidth();
  const wrapper = ws.getWrapper();
  if (!(wrapper instanceof HTMLElement)) return;
  const tSec = tierScrollLeftPx / zoomPxPerSec;
  const maxWsScroll = Math.max(0, wrapper.scrollWidth - w);
  if (tSec >= mediaDurSec) {
    ws.setScroll(maxWsScroll);
  } else {
    const desired = Math.min(tSec * zoomPxPerSec, maxWsScroll);
    ws.setScroll(Math.max(0, desired));
  }
}

/** 将 tier 横向滚动同步到 WaveSurfer；返回波形 overlay 应使用的 scrollLeft（像素）。 */
export function applyTierScrollToWaveSurfer(input: {
  ws: WaveSurfer;
  tierScrollLeftPx: number;
  zoomPxPerSec: number;
  mediaDurSec: number;
  documentSpanSec: number;
}): number {
  const { ws, tierScrollLeftPx, zoomPxPerSec, mediaDurSec, documentSpanSec } = input;
  if (isExtendedDocumentTimeline(documentSpanSec, mediaDurSec)) {
    syncWaveScrollToTier(ws, tierScrollLeftPx, zoomPxPerSec, mediaDurSec);
    return ws.getScroll();
  }
  ws.setScroll(tierScrollLeftPx);
  return tierScrollLeftPx;
}
