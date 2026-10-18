export interface ByteSlice {
  status: 200 | 206 | 416;
  start: number;
  end: number;
}

export function sliceForRange(total: number, rangeHeader: string | null): ByteSlice {
  if (!rangeHeader) return { status: 200, start: 0, end: Math.max(0, total - 1) };
  const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim());
  const startRaw = match?.[1] ?? '';
  const endRaw = match?.[2] ?? '';
  if (!match || total <= 0 || (startRaw === '' && endRaw === '')) {
    return { status: 416, start: 0, end: 0 };
  }
  const suffix = startRaw === '';
  const start = suffix ? total - Number.parseInt(endRaw, 10) : Number.parseInt(startRaw, 10);
  const end = suffix || endRaw === '' ? total - 1 : Number.parseInt(endRaw, 10);
  if (
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    start < 0 ||
    start > end ||
    start >= total
  ) {
    return { status: 416, start: 0, end: 0 };
  }
  return { status: 206, start, end: Math.min(end, total - 1) };
}
