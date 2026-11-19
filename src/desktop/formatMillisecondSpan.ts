/** Display one stored integer millisecond as seconds, keeping every millisecond. */
export function formatMillisecondInstant(ms: number): string {
  if (!Number.isInteger(ms)) throw new Error('time is invalid');
  const sign = ms < 0 ? '-' : '';
  const abs = Math.abs(ms);
  const seconds = Math.floor(abs / 1000);
  const fraction = abs % 1000;
  return `${sign}${seconds}.${String(fraction).padStart(3, '0')}`;
}

/** Span label. A missing endpoint stays blank so the list does not invent a zero. */
export function formatMillisecondSpan(startMs: number | null, endMs: number | null): string {
  if (startMs === null || endMs === null) return '';
  return `${formatMillisecondInstant(startMs)}\u2013${formatMillisecondInstant(endMs)}`;
}
