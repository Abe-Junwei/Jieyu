/** Where a layer drag may land. Pure: nothing here writes. */

export interface DropLayer {
  id: string;
  contentType: string;
  tierType: string;
  parentId?: string | null;
}

export interface DropLink {
  layerId: string;
  hostLayerId: string;
  isPreferred: boolean;
  linkType?: 'direct' | 'free' | 'literal' | 'pedagogical';
}

export type DropLinkType = 'direct' | 'free' | 'literal' | 'pedagogical';

export type LayerDropTarget = { kind: 'header'; layerId: string } | { kind: 'root'; index: number };

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
  if (hit.layerId === drag.id) return { ok: false, reason: 'self' };
  const target = input.layers.find((layer) => layer.id === hit.layerId);
  if (!target) return { ok: false, reason: 'not-host' };
  if (isUnder(drag.id, target.id, input.layers, input.links)) {
    return { ok: false, reason: 'descendant' };
  }
  if (target.contentType === 'transcription' && target.tierType !== 'time-subdivision') {
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
    return {
      ok: true,
      action: 'place',
      layerId: drag.id,
      hostLayerId: dragHost,
      beforeId: target.id,
    };
  }
  return { ok: false, reason: 'same-host' };
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
