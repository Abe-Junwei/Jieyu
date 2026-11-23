/** Where a layer drag may land. Pure: nothing here writes. */

export interface DropLink {
  layerId: string;
  hostLayerId: string;
  isPreferred: boolean;
  linkType?: 'direct' | 'free' | 'literal' | 'pedagogical';
  sortOrder?: number;
}

export interface DropLayer {
  id: string;
  contentType: string;
  tierType: string;
  parentId?: string | null;
  name?: Record<string, string>;
}

export type DropLinkType = 'direct' | 'free' | 'literal' | 'pedagogical';

export type LayerDropTarget =
  | { kind: 'header'; layerId: string; edge?: 'before' | 'after' }
  | { kind: 'root'; index: number }
  | { kind: 'tail' };

export type LayerDropReason =
  'self' | 'descendant' | 'not-host' | 'same-host' | 'needs-host' | 'multi-host' | 'subdivision';

export type LayerDrop =
  | { ok: false; reason: LayerDropReason }
  | { ok: true; action: 'noop' }
  | {
      ok: true;
      action: 'set-host';
      layerId: string;
      hostLayerId: string;
      linkType: DropLinkType;
    }
  | { ok: true; action: 'clear'; layerId: string; sortOrder: number }
  | {
      ok: true;
      action: 'place';
      layerId: string;
      hostLayerId?: string;
      beforeId?: string;
      anchorId: string;
      edge: 'before' | 'after';
    };

const REASON_KEY = {
  self: 'app.desktopTranscription.layerDropNotHost',
  descendant: 'app.desktopTranscription.layerDropCycle',
  'not-host': 'app.desktopTranscription.layerDropNotHost',
  'same-host': 'app.desktopTranscription.layerDropSameHost',
  'needs-host': 'app.desktopTranscription.layerDropNeedsHost',
  'multi-host': 'app.desktopTranscription.layerDropMultiHost',
  subdivision: 'app.desktopTranscription.layerDropNotHost',
} as const;

export type LayerDropReasonKey = (typeof REASON_KEY)[LayerDropReason];

export function layerDropReasonKey(reason: LayerDropReason): LayerDropReasonKey {
  return REASON_KEY[reason];
}

/** One preferred host link, or none. The tree parent comes from that link, not parent_id. */
export function resolveDesktopLayerDrop(input: {
  dragId: string;
  target: LayerDropTarget;
  layers: readonly DropLayer[];
  links: readonly DropLink[];
}): LayerDrop {
  const drag = input.layers.find((layer) => layer.id === input.dragId);
  if (!drag) return { ok: false, reason: 'not-host' };
  if (drag.tierType === 'time-subdivision') return { ok: false, reason: 'subdivision' };
  const hit = input.target;
  if (hit.kind === 'root') {
    if (!isTimeTranscription(drag)) return { ok: false, reason: 'needs-host' };
    return { ok: true, action: 'clear', layerId: drag.id, sortOrder: hit.index };
  }
  if (hit.kind === 'tail') return placeTail(drag, input.links);
  if (hit.layerId === drag.id) return { ok: false, reason: 'self' };
  const target = input.layers.find((layer) => layer.id === hit.layerId);
  if (!target) return { ok: false, reason: 'not-host' };
  if (linkedUnder(drag.id, target.id, input.layers, input.links)) {
    return { ok: false, reason: 'descendant' };
  }
  if (target.contentType === 'transcription' && target.tierType !== 'time-subdivision') {
    if (isTimeTranscription(drag)) return { ok: false, reason: 'not-host' };
    if (drag.contentType === 'translation' && hostIds(drag.id, input.links).length > 1) {
      return { ok: false, reason: 'multi-host' };
    }
    if (drag.contentType !== 'translation' && !isTimeTranscription(drag)) {
      return { ok: false, reason: 'not-host' };
    }
    return {
      ok: true,
      action: 'set-host',
      layerId: drag.id,
      hostLayerId: target.id,
      linkType: keptLinkType(drag.id, input.links),
    };
  }
  const dragHost = preferredHost(drag.id, input.links);
  const targetHost = preferredHost(target.id, input.links);
  if (dragHost !== null && dragHost === targetHost) {
    const edge = hit.edge ?? 'before';
    const next =
      edge === 'after' ? nextSibling(target.id, dragHost, drag.id, input.links) : target.id;
    return {
      ok: true,
      action: 'place',
      layerId: drag.id,
      hostLayerId: dragHost,
      anchorId: target.id,
      edge,
      ...(next === undefined ? {} : { beforeId: next }),
    };
  }
  return { ok: false, reason: 'same-host' };
}

/**
 * How far each visible row slides to open a gap. Dragged rows are omitted: they follow the pointer.
 * A rejected drop slides nothing. `blockHeight` is the dragged block on that surface.
 */
export function layerDragShifts(input: {
  order: readonly string[];
  draggedIds: readonly string[];
  decision: LayerDrop | null;
  blockHeight: number;
  layers: readonly DropLayer[];
  links: readonly DropLink[];
}): ReadonlyMap<string, number> {
  const shifts = new Map<string, number>();
  const decision = input.decision;
  if (decision === null || !decision.ok || decision.action === 'noop') return shifts;
  if (input.blockHeight === 0 || input.order.length === 0) return shifts;
  const dragged = new Set(input.draggedIds);
  const span = visibleSpan(input.order, dragged);
  if (span === null) return shifts;
  const insertion = insertionIndex(input.order, dragged, decision, input.layers, input.links);
  if (
    insertion === null ||
    insertion === span.index ||
    (insertion > span.index && insertion <= span.index + span.count)
  ) {
    return shifts;
  }
  const distance = insertion > span.index ? -input.blockHeight : input.blockHeight;
  const from = insertion > span.index ? span.index + span.count : insertion;
  const to = insertion > span.index ? insertion : span.index;
  for (let i = from; i < to; i += 1) {
    const id = input.order[i];
    if (id === undefined || dragged.has(id)) continue;
    shifts.set(id, distance);
  }
  return shifts;
}

function visibleSpan(
  order: readonly string[],
  dragged: ReadonlySet<string>,
): { index: number; count: number } | null {
  const index = order.findIndex((id) => dragged.has(id));
  if (index < 0) return null;
  let count = 0;
  while (index + count < order.length && dragged.has(order[index + count]!)) count += 1;
  return { index, count };
}

function insertionIndex(
  order: readonly string[],
  dragged: ReadonlySet<string>,
  decision: Exclude<LayerDrop, { ok: false } | { ok: true; action: 'noop' }>,
  layers: readonly DropLayer[],
  links: readonly DropLink[],
): number | null {
  if (decision.action === 'clear') return 0;
  if (decision.action === 'place') {
    if (decision.beforeId !== undefined) {
      const at = order.indexOf(decision.beforeId);
      return at < 0 ? null : at;
    }
    let last = -1;
    for (let i = 0; i < order.length; i += 1) {
      const id = order[i];
      if (
        id !== undefined &&
        preferredHost(id, links) === decision.hostLayerId &&
        !dragged.has(id)
      ) {
        last = i;
      }
    }
    return last < 0 ? order.length : last + 1;
  }
  if (decision.action === 'set-host') {
    return appendIndex(order, decision.hostLayerId, dragged, layers, links);
  }
  const unreachable: never = decision;
  return unreachable;
}

/** Index after the host's last visible descendant, skipping the block being dragged. */
function appendIndex(
  order: readonly string[],
  hostId: string,
  dragged: ReadonlySet<string>,
  layers: readonly DropLayer[],
  links: readonly DropLink[],
): number {
  const hostAt = order.indexOf(hostId);
  if (hostAt < 0) return order.length;
  let end = hostAt + 1;
  while (end < order.length) {
    const id = order[end];
    if (id === undefined) break;
    if (dragged.has(id)) {
      end += 1;
      continue;
    }
    if (!isUnder(hostId, id, layers, links)) break;
    end += 1;
  }
  return end;
}

function placeTail(drag: DropLayer, links: readonly DropLink[]): LayerDrop {
  if (drag.contentType !== 'translation') return { ok: false, reason: 'not-host' };
  const hosts = hostIds(drag.id, links);
  if (hosts.length > 1) return { ok: false, reason: 'multi-host' };
  const hostId = hosts[0];
  if (hostId === undefined) return { ok: false, reason: 'needs-host' };
  return {
    ok: true,
    action: 'place',
    layerId: drag.id,
    hostLayerId: hostId,
    anchorId: drag.id,
    edge: 'after',
  };
}

function nextSibling(
  targetId: string,
  hostId: string,
  dragId: string,
  links: readonly DropLink[],
): string | undefined {
  const ordered = links
    .filter((link) => link.isPreferred && link.hostLayerId === hostId)
    .slice()
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.layerId.localeCompare(b.layerId));
  const at = ordered.findIndex((link) => link.layerId === targetId);
  return ordered.slice(at + 1).find((link) => link.layerId !== dragId)?.layerId;
}

function isTimeTranscription(layer: DropLayer): boolean {
  return layer.contentType === 'transcription' && layer.tierType === 'time-aligned';
}

function hostIds(layerId: string, links: readonly DropLink[]): string[] {
  return [
    ...new Set(links.filter((link) => link.layerId === layerId).map((link) => link.hostLayerId)),
  ];
}

function preferredHost(layerId: string, links: readonly DropLink[]): string | null {
  return links.find((link) => link.layerId === layerId && link.isPreferred)?.hostLayerId ?? null;
}

function keptLinkType(layerId: string, links: readonly DropLink[]): DropLinkType {
  return (
    links.find((link) => link.layerId === layerId && link.isPreferred)?.linkType ??
    links.find((link) => link.layerId === layerId)?.linkType ??
    'direct'
  );
}

/** Hosts to open so a moved layer is not left inside a collapsed group. */
export function revealHostIds(decision: LayerDrop, links: readonly DropLink[]): readonly string[] {
  if (!decision.ok || decision.action === 'clear' || decision.action === 'noop') return [];
  const start = decision.hostLayerId;
  if (start === undefined) return [];
  const ids: string[] = [];
  const seen = new Set<string>();
  let current: string | undefined = start;
  while (current !== undefined && !seen.has(current)) {
    seen.add(current);
    ids.push(current);
    const parent = preferredHost(current, links);
    current = parent ?? undefined;
  }
  return ids;
}

/** `node` sits under `ancestor` through any host link or `parent_id`, matching the write check. */
function linkedUnder(
  ancestor: string,
  node: string,
  layers: readonly DropLayer[],
  links: readonly DropLink[],
): boolean {
  const seen = new Set<string>();
  const queue = [node];
  while (queue.length > 0) {
    const current = queue.shift();
    if (current === undefined || seen.has(current)) continue;
    seen.add(current);
    const parents = links
      .filter((link) => link.layerId === current)
      .map((link) => link.hostLayerId);
    const structural = parentId(current, layers);
    if (structural !== null) parents.push(structural);
    for (const parent of parents) {
      if (parent === ancestor) return true;
      if (!seen.has(parent)) queue.push(parent);
    }
  }
  return false;
}

/** `node` sits under `ancestor` through a preferred host link. */
function isUnder(
  ancestor: string,
  node: string,
  layers: readonly DropLayer[],
  links: readonly DropLink[],
): boolean {
  const seen = new Set<string>();
  let current = node;
  while (!seen.has(current)) {
    seen.add(current);
    const parent = preferredHost(current, links) ?? parentId(current, layers);
    if (parent === null) return false;
    if (parent === ancestor) return true;
    current = parent;
  }
  return false;
}

function parentId(layerId: string, layers: readonly DropLayer[]): string | null {
  const parent = layers.find((layer) => layer.id === layerId)?.parentId;
  return parent === undefined || parent === null ? null : parent;
}
