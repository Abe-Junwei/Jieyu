/** Player seconds become integer milliseconds. A tie at half a millisecond rounds toward later time (ADR-0122). */
export function secToMs(seconds: number): number {
  if (!Number.isFinite(seconds)) throw new Error('time is not finite');
  return Math.round(seconds * 1000);
}

export function msToSec(milliseconds: number): number {
  if (!Number.isInteger(milliseconds)) throw new Error('time is not a whole millisecond');
  return milliseconds / 1000;
}

/** Seconds label for a span edge. One decimal when the edge sits on a 100 ms step, otherwise just enough decimals to tell 10 ms apart from 0. */
export function formatMsAsSeconds(milliseconds: number): string {
  const seconds = msToSec(milliseconds);
  if (milliseconds % 100 === 0) return seconds.toFixed(1);
  return seconds.toFixed(3).replace(/0+$/, '');
}

export function formatMsSpan(startMs: number, endMs: number): string {
  return `${formatMsAsSeconds(startMs)}–${formatMsAsSeconds(endMs)}`;
}
