/**
 * Where a drag-created segment lands. Adapted from the legacy
 * `resolveSegmentTimelineSourceLayer` and `createUnitFromSelectionRouted` (ADR-0132).
 */

export const CREATE_MIN_MS = 50;

export interface RouteUnit {
  id: string;
  speakerId: string | null;
  startMs: number | null;
  endMs: number | null;
}

export interface RouteLayer {
  id: string;
  tierType: string;
  contentType: string;
  units: readonly RouteUnit[];
}

export interface RouteLink {
  layerId: string;
  hostLayerId: string;
  isPreferred: boolean;
  sortOrder: number;
}

export type CreateRoute =
  | {
      kind: 'create';
      layerId: string;
      speakerId: string | null;
      parentUnitId: string | null;
      startMs: number;
      endMs: number;
    }
  | { kind: 'select'; unitIds: string[] }
  | { kind: 'reject'; reason: 'short' | 'no-layer' | 'no-parent' };

function ownsSegments(layer: RouteLayer): boolean {
  return layer.tierType === 'time-aligned' || layer.tierType === 'time-subdivision';
}

function hostsOf(layerId: string, layers: readonly RouteLayer[], links: readonly RouteLink[]) {
  return links
    .filter((link) => link.layerId === layerId)
    .sort(
      (a, b) =>
        Number(b.isPreferred) - Number(a.isPreferred) ||
        a.sortOrder - b.sortOrder ||
        a.hostLayerId.localeCompare(b.hostLayerId),
    )
    .map((link) => layers.find((layer) => layer.id === link.hostLayerId))
    .filter((layer): layer is RouteLayer => layer !== undefined);
}

/** The layer whose units a create writes to: the target itself, its first segment-owning host, or the default transcription layer. */
export function resolveCreateSourceLayer(
  targetLayerId: string | null,
  layers: readonly RouteLayer[],
  links: readonly RouteLink[],
): RouteLayer | null {
  const target = layers.find((layer) => layer.id === targetLayerId);
  if (!target) {
    return (
      layers.find(
        (layer) => layer.tierType === 'time-aligned' && layer.contentType === 'transcription',
      ) ?? null
    );
  }
  if (ownsSegments(target)) return target;
  return hostsOf(target.id, layers, links).find(ownsSegments) ?? null;
}

function overlaps(unit: RouteUnit, startMs: number, endMs: number): boolean {
  return (
    unit.startMs !== null && unit.endMs !== null && unit.startMs < endMs && startMs < unit.endMs
  );
}

/**
 * `speakerId` is the text-track lane under the pointer; `undefined` means the waveform,
 * where any segment under the drag turns it into a selection.
 */
export function routeCreate(input: {
  targetLayerId: string | null;
  layers: readonly RouteLayer[];
  links: readonly RouteLink[];
  startMs: number;
  endMs: number;
  speakerId?: string | null | undefined;
}): CreateRoute {
  const { startMs, endMs } = input;
  const source = resolveCreateSourceLayer(input.targetLayerId, input.layers, input.links);
  if (!source) return { kind: 'reject', reason: 'no-layer' };
  if (endMs - startMs < CREATE_MIN_MS) return { kind: 'reject', reason: 'short' };
  let speakerId = input.speakerId ?? null;
  let parentUnitId: string | null = null;
  if (source.tierType === 'time-subdivision') {
    const parent = hostsOf(source.id, input.layers, input.links)
      .flatMap((host) => host.units)
      .find(
        (unit) =>
          unit.startMs !== null &&
          unit.endMs !== null &&
          unit.startMs <= startMs &&
          endMs <= unit.endMs &&
          (input.speakerId === undefined || unit.speakerId === input.speakerId),
      );
    if (!parent) return { kind: 'reject', reason: 'no-parent' };
    parentUnitId = parent.id;
    speakerId = parent.speakerId;
  }
  const hits = source.units.filter(
    (unit) =>
      overlaps(unit, startMs, endMs) &&
      (input.speakerId === undefined || unit.speakerId === speakerId),
  );
  if (hits.length > 0) return { kind: 'select', unitIds: hits.map((unit) => unit.id) };
  return { kind: 'create', layerId: source.id, speakerId, parentUnitId, startMs, endMs };
}
