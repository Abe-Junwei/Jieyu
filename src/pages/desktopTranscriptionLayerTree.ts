/**
 * Layer rows as a tree from `layer_links` (ADR-0132): a layer sits under its preferred host, its
 * subtree right after it; other hosts are only listed in `otherHostIds`. Pure, so the order and lines are testable.
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

export interface LayerTreeRow {
  layerId: string;
  depth: number;
  hostId: string | null;
  childCount: number;
  lastChild: boolean;
  groupCollapsed: boolean;
  folded: boolean;
  /** Per ancestor level above the parent: whether that trunk still runs through this row. */
  guides: boolean[];
  /** Hosts beyond the preferred one; shown as a single marker, not drawn as lines. */
  otherHostIds: string[];
}

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
  const linkOrder = (layerId: string, hostId: string) =>
    links.find((link) => link.layerId === layerId && link.hostLayerId === hostId)?.sortOrder ?? 0;

  const parentOf = new Map<string, string>();
  for (const layer of layers) {
    const preferred = hostLinks(layer.id)[0];
    if (preferred) parentOf.set(layer.id, preferred.hostLayerId);
  }
  const sorted = [...layers].sort(order);
  const roots = sorted.filter((layer) => !parentOf.has(layer.id) && !hasAnyLink(layer.id));
  const orphans = sorted.filter((layer) => !parentOf.has(layer.id) && hasAnyLink(layer.id));
  const childrenOf = (hostId: string) =>
    sorted
      .filter((layer) => parentOf.get(layer.id) === hostId)
      .sort((a, b) => linkOrder(a.id, hostId) - linkOrder(b.id, hostId) || order(a, b));

  /** Every layer below `id`, grandchildren included; the count shown on a collapsed host. */
  const countSubtree = (id: string, seen = new Set<string>([id])): number =>
    childrenOf(id).reduce((total, child) => {
      if (seen.has(child.id)) return total;
      seen.add(child.id);
      return total + 1 + countSubtree(child.id, seen);
    }, 0);

  // Depth-first: a host, then its whole subtree, then the next sibling.
  const rows: LayerTreeRow[] = [];
  const placed = new Set<string>();
  const push = (
    layer: TreeLayer,
    depth: number,
    hostId: string | null,
    lastChild: boolean,
    lasts: boolean[],
  ) => {
    placed.add(layer.id);
    const children = childrenOf(layer.id).filter((child) => !placed.has(child.id));
    const groupCollapsed = children.length > 0 && fold.groups.includes(layer.id);
    rows.push({
      layerId: layer.id,
      depth,
      hostId,
      childCount: countSubtree(layer.id),
      lastChild,
      groupCollapsed,
      folded: fold.rows.includes(layer.id),
      guides: lasts.map((last) => !last),
      otherHostIds: hostLinks(layer.id)
        .slice(1)
        .map((link) => link.hostLayerId),
    });
    if (groupCollapsed) {
      const hide = (id: string) =>
        childrenOf(id).forEach((child) => {
          if (placed.has(child.id)) return;
          placed.add(child.id);
          hide(child.id);
        });
      hide(layer.id);
      return;
    }
    const inherited = depth >= 1 ? [...lasts, lastChild] : [];
    children.forEach((child, index) =>
      push(child, depth + 1, layer.id, index === children.length - 1, depth >= 1 ? inherited : []),
    );
  };
  [...roots, ...orphans].forEach((layer) => push(layer, 0, null, false, []));
  // Members of a host cycle are unreachable from any root; keep them as plain roots.
  for (const layer of sorted) if (!placed.has(layer.id)) push(layer, 0, null, false, []);

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
