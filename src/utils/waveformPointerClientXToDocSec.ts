import type WaveSurfer from 'wavesurfer.js';
import { isExtendedDocumentTimeline } from './waveformTierScrollSync';
import { readWaveformScrollParentScrollLeftPx } from './waveformScrollParentScrollPx';

type WaveSurferLike = Pick<WaveSurfer, 'getDuration' | 'getWrapper'>;

export type ResolveWaveformPointerClientXToDocSecInput = {
  clientX: number;
  viewportRectLeftPx: number;
  ws: WaveSurferLike | null | undefined;
  tierScrollLeftPx: number;
  documentSpanSec: number;
  pxPerDocSec: number;
  /** When decoded media duration is 0, fall back to this logical span. */
  logicalDurationSec?: number;
};

function readDecodedMediaDurationSec(ws: WaveSurferLike | null | undefined): number {
  const decoded = typeof ws?.getDuration === 'function' ? ws.getDuration() : 0;
  return typeof decoded === 'number' && Number.isFinite(decoded) && decoded > 0 ? decoded : 0;
}

/**
 * Map a waveform-surface pointer X to document seconds.
 * Extended-document timelines use tier scroll + pxPerDocSec; otherwise WaveSurfer layout.
 */
export function resolveWaveformPointerClientXToDocSec(
  input: ResolveWaveformPointerClientXToDocSecInput,
): number | null {
  const {
    clientX,
    viewportRectLeftPx,
    ws,
    tierScrollLeftPx,
    documentSpanSec,
    pxPerDocSec,
    logicalDurationSec,
  } = input;

  const mediaDurSec = readDecodedMediaDurationSec(ws);
  const tierPrimary = isExtendedDocumentTimeline(documentSpanSec, mediaDurSec);

  if (tierPrimary && pxPerDocSec > 0) {
    const time = (tierScrollLeftPx + (clientX - viewportRectLeftPx)) / pxPerDocSec;
    const upper = documentSpanSec > 0 ? documentSpanSec : mediaDurSec;
    if (upper <= 0) return Math.max(0, time);
    return Math.max(0, Math.min(time, upper));
  }

  const wrapper = ws?.getWrapper();
  const scrollParent = wrapper?.parentElement;
  if (!wrapper || !scrollParent) return null;
  const totalWidth = wrapper.scrollWidth;
  if (totalWidth <= 0) return null;

  let durSec = mediaDurSec;
  if (durSec <= 0) {
    const logical =
      typeof logicalDurationSec === 'number' &&
      Number.isFinite(logicalDurationSec) &&
      logicalDurationSec > 0
        ? logicalDurationSec
        : documentSpanSec;
    durSec = logical > 0 ? logical : 0;
  }
  if (durSec <= 0) return null;

  const scrollLeft = readWaveformScrollParentScrollLeftPx(scrollParent);
  const pxOffset = clientX - viewportRectLeftPx + scrollLeft;
  return Math.max(0, Math.min(durSec, (pxOffset / totalWidth) * durSec));
}
