export type VerticalDragDirection = 'up' | 'down' | 'none';

interface ResolveVerticalReorderTargetOptions {
  allowedBoundaryIndexes?: readonly number[];
}

interface VerticalRectLike {
  top: number;
  bottom: number;
  height: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function normalizeBoundaryIndexes(
  rectCount: number,
  allowedBoundaryIndexes?: readonly number[],
): number[] {
  if (!allowedBoundaryIndexes || allowedBoundaryIndexes.length === 0) {
    return Array.from({ length: rectCount + 1 }, (_, index) => index);
  }

  const normalized = [...new Set(allowedBoundaryIndexes.map((index) => clamp(index, 0, rectCount)))];
  normalized.sort((left, right) => left - right);
  return normalized;
}

function resolveBoundaryY(rects: readonly VerticalRectLike[], boundaryIndex: number): number {
  if (boundaryIndex <= 0) {
    return rects[0]!.top;
  }
  if (boundaryIndex >= rects.length) {
    return rects[rects.length - 1]!.bottom;
  }
  return rects[boundaryIndex]!.top;
}

export function resolveVerticalReorderTargetIndex(
  rects: readonly VerticalRectLike[],
  clientY: number,
  direction: VerticalDragDirection = 'none',
  options: ResolveVerticalReorderTargetOptions = {},
): number | null {
  if (rects.length === 0) return null;

  const snapTolerancePx = clamp(rects[0]?.height ?? 0, 12, 20);
  const boundaries = normalizeBoundaryIndexes(rects.length, options.allowedBoundaryIndexes)
    .map((index) => ({ index, y: resolveBoundaryY(rects, index) }));
  if (boundaries.length === 0) return null;

  let nearestIndex = boundaries[0]!.index;
  let nearestDistance = Math.abs(clientY - boundaries[0]!.y);
  for (let i = 1; i < boundaries.length; i += 1) {
    const boundary = boundaries[i]!;
    const distance = Math.abs(clientY - boundary.y);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestIndex = boundary.index;
    }
  }

  if (nearestDistance <= snapTolerancePx) {
    return nearestIndex;
  }

  const biasRatio = direction === 'down'
    ? 0.42
    : direction === 'up'
      ? 0.58
      : 0.5;

  if (clientY <= boundaries[0]!.y) {
    return boundaries[0]!.index;
  }

  for (let i = 0; i < boundaries.length - 1; i += 1) {
    const current = boundaries[i]!;
    const next = boundaries[i + 1]!;
    if (clientY < next.y) {
      const threshold = current.y + ((next.y - current.y) * biasRatio);
      return clientY < threshold ? current.index : next.index;
    }
  }

  return boundaries[boundaries.length - 1]!.index;
}