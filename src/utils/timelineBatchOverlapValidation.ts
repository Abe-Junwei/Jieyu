import type { LayerUnitDocType } from '../db';

/**
 * Detects gap violations on a single-media timeline after per-unit time overrides.
 *
 * Callers should pass units in the same order as `unitsOnCurrentMedia` from
 * `useTranscriptionDerivedData` (sorted by `startTime` ascending). When
 * effective starts are still non-decreasing in that order, this is O(n) with
 * no full-array sort; otherwise it falls back to a sorted copy (legacy path).
 */
export function hasTimelineGapOverlapAfterTransforms(
  units: readonly LayerUnitDocType[],
  transformed: ReadonlyMap<string, { startTime: number; endTime: number }>,
  gap: number,
): boolean {
  const n = units.length;
  if (n < 2) {
    return false;
  }

  const effective: Array<{ startTime: number; endTime: number }> = new Array(n);
  for (let i = 0; i < n; i++) {
    const u = units[i]!;
    const next = transformed.get(u.id);
    effective[i] = next ?? { startTime: u.startTime, endTime: u.endTime };
  }

  let nonDecreasingByStart = true;
  for (let i = 1; i < n; i++) {
    if (effective[i]!.startTime < effective[i - 1]!.startTime) {
      nonDecreasingByStart = false;
      break;
    }
  }

  const ordered = nonDecreasingByStart
    ? effective
    : [...effective].sort((a, b) => a.startTime - b.startTime);

  for (let i = 1; i < ordered.length; i++) {
    if (ordered[i]!.startTime < ordered[i - 1]!.endTime + gap) {
      return true;
    }
  }
  return false;
}
