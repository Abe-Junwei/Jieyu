export interface CreateRoutingUnit {
  id: string;
  speakerId: string | null;
  startMs: number | null;
  endMs: number | null;
}

export interface CreateRoutingLayer {
  id: string;
  tierType: string;
  parentId: string | null;
  units: readonly CreateRoutingUnit[];
}

export type CreateRoute =
  | {
      ok: true;
      layerId: string;
      parentUnitId: string | null;
      speakerId: string | null;
      startMs: number;
      endMs: number;
    }
  | { ok: false; reason: 'no-layer' | 'no-parent' | 'overlap' };

const MIN_SPAN_MS = 10;

/** Trim the range to the gap between siblings, like the legacy independent-segment insert. */
function clampToGap(
  units: readonly CreateRoutingUnit[],
  startMs: number,
  endMs: number,
): { startMs: number; endMs: number; speakerId: string | null } | null {
  let start = startMs;
  let end = endMs;
  let speakerId: string | null = null;
  const timed = units
    .filter((unit) => unit.startMs !== null && unit.endMs !== null)
    .sort((a, b) => (a.startMs ?? 0) - (b.startMs ?? 0));
  for (const unit of timed) {
    const unitStart = unit.startMs ?? 0;
    const unitEnd = unit.endMs ?? 0;
    if (unitEnd <= start || unitStart >= end) continue;
    speakerId ??= unit.speakerId;
    if (unitStart <= start) start = unitEnd;
    else end = Math.min(end, unitStart);
  }
  return end - start >= MIN_SPAN_MS ? { startMs: start, endMs: end, speakerId } : null;
}

/**
 * Same routing as the legacy timeline (`getLayerEditMode` + `createUnitFromSelectionRouted`):
 * independent boundary layers own their segment, time-subdivision layers need a parent unit
 * that contains the range, and symbolic layers have no time of their own so the new
 * segment goes to the host layer they hang off.
 */
export function routeUnitCreate(
  layers: readonly CreateRoutingLayer[],
  layerId: string,
  startMs: number,
  endMs: number,
): CreateRoute {
  const layer = layers.find((item) => item.id === layerId);
  if (!layer) return { ok: false, reason: 'no-layer' };
  if (layer.tierType === 'time-aligned') return routeIndependent(layer, startMs, endMs);
  if (layer.tierType === 'time-subdivision') {
    const parentLayer = layers.find((item) => item.id === layer.parentId);
    const parent = parentLayer?.units.find(
      (unit) =>
        unit.startMs !== null &&
        unit.endMs !== null &&
        unit.startMs <= startMs &&
        unit.endMs >= endMs,
    );
    if (!parent) return { ok: false, reason: 'no-parent' };
    const gap = clampToGap(layer.units, startMs, endMs);
    if (!gap) return { ok: false, reason: 'overlap' };
    if (gap.startMs < parent.startMs! || gap.endMs > parent.endMs!) {
      return { ok: false, reason: 'no-parent' };
    }
    return {
      ok: true,
      layerId: layer.id,
      parentUnitId: parent.id,
      speakerId: parent.speakerId,
      startMs: gap.startMs,
      endMs: gap.endMs,
    };
  }
  return routeToHost(layers, layer, startMs, endMs);
}

function routeIndependent(layer: CreateRoutingLayer, startMs: number, endMs: number): CreateRoute {
  const gap = clampToGap(layer.units, startMs, endMs);
  if (!gap) return { ok: false, reason: 'overlap' };
  return {
    ok: true,
    layerId: layer.id,
    parentUnitId: null,
    speakerId: gap.speakerId,
    startMs: gap.startMs,
    endMs: gap.endMs,
  };
}

function routeToHost(
  layers: readonly CreateRoutingLayer[],
  from: CreateRoutingLayer,
  startMs: number,
  endMs: number,
): CreateRoute {
  const seen = new Set<string>();
  let current: CreateRoutingLayer | undefined = from;
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    if (current.tierType === 'time-aligned') return routeIndependent(current, startMs, endMs);
    const parentId: string | null = current.parentId;
    current = layers.find((item) => item.id === parentId);
  }
  return { ok: false, reason: 'no-layer' };
}
