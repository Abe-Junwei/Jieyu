type TimelineHitIndex = {
  isSortedByStart: boolean;
  starts: number[];
  prefixMaxEnds: number[];
};

export type LassoSelectionSnapshot = {
  primaryId: string;
  ids: Set<string>;
};

export function buildTimelineHitIndex(items: Array<{ startTime: number; endTime: number }>): TimelineHitIndex {
  if (items.length < 2) {
    const single = items[0];
    return {
      isSortedByStart: true,
      starts: single ? [single.startTime] : [],
      prefixMaxEnds: single ? [single.endTime] : [],
    };
  }

  for (let i = 1; i < items.length; i += 1) {
    if (items[i]!.startTime < items[i - 1]!.startTime) {
      return {
        isSortedByStart: false,
        starts: [],
        prefixMaxEnds: [],
      };
    }
  }

  const starts = new Array<number>(items.length);
  const prefixMaxEnds = new Array<number>(items.length);
  let runningMaxEnd = Number.NEGATIVE_INFINITY;

  for (let i = 0; i < items.length; i += 1) {
    const item = items[i]!;
    starts[i] = item.startTime;
    if (item.endTime > runningMaxEnd) {
      runningMaxEnd = item.endTime;
    }
    prefixMaxEnds[i] = runningMaxEnd;
  }

  return {
    isSortedByStart: true,
    starts,
    prefixMaxEnds,
  };
}

function upperBound(values: number[], target: number): number {
  let low = 0;
  let high = values.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if ((values[middle] ?? Number.NEGATIVE_INFINITY) <= target) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }
  return low;
}

export function hasTimelineHitAtTime(
  index: TimelineHitIndex,
  items: Array<{ startTime: number; endTime: number }>,
  time: number,
  eps: number,
): boolean {
  if (items.length === 0) {
    return false;
  }

  if (!index.isSortedByStart) {
    return items.some((item) => item.startTime - eps <= time && item.endTime + eps >= time);
  }

  const lastStartAtOrBeforeTime = upperBound(index.starts, time + eps) - 1;
  if (lastStartAtOrBeforeTime < 0) {
    return false;
  }

  return (index.prefixMaxEnds[lastStartAtOrBeforeTime] ?? Number.NEGATIVE_INFINITY) >= time - eps;
}

function areSelectionIdsEqual(left: Set<string>, right: Set<string>): boolean {
  if (left.size !== right.size) return false;
  for (const id of left) {
    if (!right.has(id)) return false;
  }
  return true;
}

export function areSelectionSnapshotsEqual(
  left: LassoSelectionSnapshot | null,
  right: LassoSelectionSnapshot | null,
): boolean {
  if (!left || !right) return false;
  if (left.primaryId !== right.primaryId) return false;
  return areSelectionIdsEqual(left.ids, right.ids);
}
