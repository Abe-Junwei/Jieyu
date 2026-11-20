/**
 * Layer rows as a two-level tree from `layer_links` (ADR-0132): a layer sits under its preferred
 * host; other hosts draw a dashed groove. Pure, so the order and lines are testable.
 */

export interface TreeLayer {
  id: string;
  sortOrder?: number;
}

export interface TreeLink {
  layerId: string;
  hostLayerId: string;
  isPreferred: boolean;
  sortOrder: number;
}

/** Local view preference: layers whose children are hidden, and layers squeezed to a strip. */
export interface LayerFold {
  groups: readonly string[];
  rows: readonly string[];
}

export type GrooveKind = 'none' | 'through' | 'start' | 'end';

export interface LayerTreeRow {
  layerId: string;
  depth: 0 | 1;
  hostId: string | null;
  childCount: number;
  lastChild: boolean;
  groupCollapsed: boolean;
  folded: boolean;
  groove: GrooveKind;
}

const GROOVE_RANK: Record<GrooveKind, number> = { none: 0, through: 1, start: 2, end: 3 };

export function buildLayerTree(
  layers: readonly TreeLayer[],
  links: readonly TreeLink[],
  fold: LayerFold,
): LayerTreeRow[] {
  const byId = new Map(layers.map((layer) => [layer.id, layer]));
  const order = (a: TreeLayer, b: TreeLayer) =>
    (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.id.localeCompare(b.id);
  const hostLinks = (layerId: string) =>
    links
      .filter(
        (link) =>
          link.layerId === layerId && link.hostLayerId !== layerId && byId.has(link.hostLayerId),
      )
      .sort(
        (a, b) =>
          Number(b.isPreferred) - Number(a.isPreferred) ||
          a.sortOrder - b.sortOrder ||
          a.hostLayerId.localeCompare(b.hostLayerId),
      );
  const hasAnyLink = (layerId: string) => links.some((link) => link.layerId === layerId);

  const parentOf = new Map<string, string>();
  for (const layer of layers) {
    const preferred = hostLinks(layer.id)[0];
    if (preferred) parentOf.set(layer.id, preferred.hostLayerId);
  }
  // Two levels at most: a host that is itself a child gives way to its own root.
  const rootOf = (layerId: string): string | null => {
    let current = layerId;
    const seen = new Set<string>([layerId]);
    while (parentOf.has(current)) {
      current = parentOf.get(current) as string;
      if (seen.has(current)) return null;
      seen.add(current);
    }
    return current;
  };
  const treeParent = new Map<string, string>();
  const orphans: TreeLayer[] = [];
  const roots: TreeLayer[] = [];
  for (const layer of [...layers].sort(order)) {
    if (!parentOf.has(layer.id)) {
      (hasAnyLink(layer.id) ? orphans : roots).push(layer);
      continue;
    }
    const root = rootOf(layer.id);
    if (root === null || root === layer.id) roots.push(layer);
    else treeParent.set(layer.id, root);
  }

  const childrenOf = (hostId: string) =>
    layers
      .filter((layer) => treeParent.get(layer.id) === hostId)
      .sort((a, b) => linkOrder(a.id, hostId) - linkOrder(b.id, hostId) || order(a, b));
  const linkOrder = (layerId: string, hostId: string) =>
    links.find((link) => link.layerId === layerId && link.hostLayerId === hostId)?.sortOrder ?? 0;

  const rows: LayerTreeRow[] = [];
  const push = (layer: TreeLayer, depth: 0 | 1, hostId: string | null, lastChild: boolean) => {
    const children = depth === 0 ? childrenOf(layer.id) : [];
    const groupCollapsed = children.length > 0 && fold.groups.includes(layer.id);
    rows.push({
      layerId: layer.id,
      depth,
      hostId,
      childCount: children.length,
      lastChild,
      groupCollapsed,
      folded: fold.rows.includes(layer.id),
      groove: 'none',
    });
    if (groupCollapsed) return;
    children.forEach((child, index) => push(child, 1, layer.id, index === children.length - 1));
  };
  roots.forEach((root) => push(root, 0, null, false));
  orphans.forEach((orphan) => push(orphan, 0, null, false));

  const indexOf = new Map(rows.map((row, index) => [row.layerId, index]));
  const mark = (index: number, kind: GrooveKind) => {
    const row = rows[index];
    if (row && GROOVE_RANK[kind] > GROOVE_RANK[row.groove]) row.groove = kind;
  };
  for (const link of links) {
    if (link.isPreferred || link.layerId === link.hostLayerId) continue;
    if (treeParent.get(link.layerId) === link.hostLayerId) continue;
    const child = indexOf.get(link.layerId);
    const host = indexOf.get(link.hostLayerId);
    if (child === undefined || host === undefined) continue;
    const [from, to] = host < child ? [host, child] : [child, host];
    for (let index = from + 1; index < to; index += 1) mark(index, 'through');
    mark(host, 'start');
    mark(child, 'end');
  }
  return rows;
}

export function emptyFold(): LayerFold {
  return { groups: [], rows: [] };
}

export function toggleIn(list: readonly string[], id: string): string[] {
  return list.includes(id) ? list.filter((item) => item !== id) : [...list, id];
}

export function parseFold(raw: string | null): LayerFold {
  if (raw === null) return emptyFold();
  try {
    const value = JSON.parse(raw) as { groups?: unknown; rows?: unknown };
    const strings = (list: unknown) =>
      Array.isArray(list) ? list.filter((item): item is string => typeof item === 'string') : [];
    return { groups: strings(value.groups), rows: strings(value.rows) };
  } catch {
    return emptyFold();
  }
}
