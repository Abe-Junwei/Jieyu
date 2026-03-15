export interface SegmentBounds {
  start: number;
  end: number;
}

export interface SegmentSeekGuard {
  pending: boolean;
}

/**
 * Decide whether a timeupdate tick should be ignored while waiting for a
 * segment seek to land inside the segment bounds.
 */
export function evaluateSegmentTimeUpdateGuard(
  time: number,
  bounds: SegmentBounds | null,
  guard: SegmentSeekGuard | null,
  epsilon = 0.01,
): { ignore: boolean; nextGuard: SegmentSeekGuard | null } {
  if (!bounds || !guard?.pending) {
    return { ignore: false, nextGuard: guard };
  }

  const inBounds = time >= bounds.start - epsilon && time <= bounds.end + epsilon;
  if (!inBounds) {
    // Stale tick before seek settles into the target segment.
    return { ignore: true, nextGuard: guard };
  }

  // First in-bounds tick means the seek has landed; disable pending mode.
  return { ignore: false, nextGuard: { pending: false } };
}
