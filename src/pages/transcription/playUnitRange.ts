export const PLAY_UNIT_RANGE_EVENT = 'jieyu:play-unit-range';

export type PlayUnitRangeDetail = {
  startTime: number;
  endTime: number;
};

export function requestPlayUnitRange(startTime: number, endTime: number): void {
  if (!Number.isFinite(startTime) || !Number.isFinite(endTime) || endTime <= startTime) return;
  window.dispatchEvent(
    new CustomEvent<PlayUnitRangeDetail>(PLAY_UNIT_RANGE_EVENT, {
      detail: { startTime, endTime },
    }),
  );
}

export function readPlayUnitRangeDetail(event: Event): PlayUnitRangeDetail | null {
  const detail = (event as CustomEvent<PlayUnitRangeDetail>).detail;
  if (detail === null || detail === undefined) return null;
  if (!Number.isFinite(detail.startTime) || !Number.isFinite(detail.endTime)) return null;
  if (detail.endTime <= detail.startTime) return null;
  return detail;
}
