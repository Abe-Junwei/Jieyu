/**
 * Shared numeric preview for Project Hub time-mapping hints (logical ↔ acoustic span).
 * Keeps one formula for menu preview, dialog preview, and any future call sites (P3 / G3).
 */

export type SemanticTimelineMappingPreview = {
  docStart: number;
  docEnd: number;
  realStart: number;
  realEnd: number;
};

export function computeSemanticTimelineMappingPreview(input: {
  offsetSec: number;
  scale: number;
  logicalDurationSec?: number | null;
  /** Used when logical duration is unknown or non-positive. */
  fallbackDocumentSpanSec?: number;
}): SemanticTimelineMappingPreview {
  const fallbackSpan = input.fallbackDocumentSpanSec ?? 10;
  const docStart = 0;
  const docEnd =
    typeof input.logicalDurationSec === 'number'
    && Number.isFinite(input.logicalDurationSec)
    && input.logicalDurationSec > 0
      ? input.logicalDurationSec
      : fallbackSpan;
  const { offsetSec, scale } = input;
  const realStart = Math.max(0, offsetSec + scale * docStart);
  const realEnd = Math.max(realStart, offsetSec + scale * docEnd);
  return { docStart, docEnd, realStart, realEnd };
}
