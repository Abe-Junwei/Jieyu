/**
 * 独立转写层拖选建段：与 `transcriptionSegmentCreationActions` 相同的间隙钳制，
 * 供套索预览与写库共用，避免预览区间与最终落库区间不一致。
 */
export const INDEPENDENT_SEGMENT_INSERT_MIN_SPAN_SEC = 0.05;
export const INDEPENDENT_SEGMENT_INSERT_GAP_SEC = 0.02;

export type IndependentSegmentInsertionSpan = { startTime: number; endTime: number };

export type IndependentSegmentInsertionClampResult =
  | { ok: true; start: number; end: number }
  | { ok: false };

export function clampIndependentSegmentInsertionRange(
  rawStart: number,
  rawEnd: number,
  existingSegments: ReadonlyArray<IndependentSegmentInsertionSpan>,
  mediaDurationSec: number = Number.POSITIVE_INFINITY,
  minSpanSec: number = INDEPENDENT_SEGMENT_INSERT_MIN_SPAN_SEC,
  gapSec: number = INDEPENDENT_SEGMENT_INSERT_GAP_SEC,
): IndependentSegmentInsertionClampResult {
  const siblings = [...existingSegments].sort((a, b) => a.startTime - b.startTime);
  const rawLo = Math.max(0, Math.min(rawStart, rawEnd));
  const rawHi = Math.max(rawStart, rawEnd);

  const insertionIndex = siblings.findIndex((item) => item.startTime > rawLo);
  const prev = insertionIndex < 0
    ? siblings[siblings.length - 1]
    : insertionIndex === 0
      ? undefined
      : siblings[insertionIndex - 1];
  const next = insertionIndex < 0 ? undefined : siblings[insertionIndex];

  const lowerBound = Math.max(0, prev ? prev.endTime + gapSec : 0);
  const upperBound = Math.min(
    mediaDurationSec,
    next ? next.startTime - gapSec : Number.POSITIVE_INFINITY,
  );
  const boundedStart = Math.max(lowerBound, rawLo);
  const normalizedEnd = Math.max(boundedStart + minSpanSec, rawHi);
  const boundedEnd = Math.min(upperBound, normalizedEnd);

  if (!Number.isFinite(boundedEnd) || boundedEnd - boundedStart < minSpanSec) {
    return { ok: false };
  }
  return {
    ok: true,
    start: Number(boundedStart.toFixed(3)),
    end: Number(boundedEnd.toFixed(3)),
  };
}
