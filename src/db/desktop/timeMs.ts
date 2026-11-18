/** Seconds ↔ integer milliseconds. The only conversion for desktop project time. */

/** Half a millisecond rounds toward the positive direction on the timeline. */
export function secondsToMs(seconds: number): number {
  if (!Number.isFinite(seconds)) throw new Error('time is invalid');
  return Math.round(seconds * 1000);
}

export function msToSeconds(ms: number): number {
  if (!Number.isInteger(ms)) throw new Error('time is invalid');
  return ms / 1000;
}
