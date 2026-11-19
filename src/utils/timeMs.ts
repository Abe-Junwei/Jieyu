/** Player seconds become integer milliseconds. A tie at half a millisecond rounds toward later time (ADR-0122). */
export function secToMs(seconds: number): number {
  if (!Number.isFinite(seconds)) throw new Error('time is not finite');
  return Math.round(seconds * 1000);
}

export function msToSec(milliseconds: number): number {
  if (!Number.isInteger(milliseconds)) throw new Error('time is not a whole millisecond');
  return milliseconds / 1000;
}
