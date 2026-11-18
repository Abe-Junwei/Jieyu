export interface PlaybackFollowInterval {
  id: string;
  startTime: number;
  endTime: number;
}

/**
 * Interval covering `time`, preferring the shortest span and then the latest start.
 * A binary search that discards the left half when `time` is past the midpoint's end
 * misses a longer interval that still covers the playhead.
 */
export function findPlaybackFollowInterval<T extends PlaybackFollowInterval>(
  items: readonly T[],
  time: number,
): T | undefined {
  let best: T | undefined;
  for (const current of items) {
    if (time < current.startTime || time > current.endTime) continue;
    if (best === undefined) {
      best = current;
      continue;
    }
    const bestSpan = best.endTime - best.startTime;
    const span = current.endTime - current.startTime;
    if (span < bestSpan || (span === bestSpan && current.startTime >= best.startTime)) {
      best = current;
    }
  }
  return best;
}
