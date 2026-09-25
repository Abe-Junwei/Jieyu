/** Adjacency-list sense tree (FLEx/LIFT subsense). */
export type SenseTreeNode = {
  id?: string;
  parentId?: string;
};

export function readSenseId(sense: { id?: unknown }): string {
  return typeof sense.id === 'string' ? sense.id.trim() : '';
}

export function readSenseParentId(sense: { parentId?: unknown }): string {
  return typeof sense.parentId === 'string' ? sense.parentId.trim() : '';
}

export function senseDepth(nodes: SenseTreeNode[], id: string): number {
  if (id.length === 0) return 0;
  const byId = new Map(
    nodes
      .map((node) => [readSenseId(node), node] as const)
      .filter((entry): entry is readonly [string, SenseTreeNode] => entry[0].length > 0),
  );
  let depth = 0;
  let current = id;
  const seen = new Set<string>();
  while (depth < 8) {
    if (seen.has(current)) return depth;
    seen.add(current);
    const node = byId.get(current);
    if (!node) return depth;
    const parent = readSenseParentId(node);
    if (parent.length === 0 || !byId.has(parent) || seen.has(parent)) return depth;
    current = parent;
    depth += 1;
  }
  return depth;
}

export function descendantDraftIndexes(drafts: SenseTreeNode[], startIndex: number): number[] {
  if (startIndex < 0 || startIndex >= drafts.length) return [];
  const startId = readSenseId(drafts[startIndex] ?? {});
  const droppedIds = new Set<string>(startId.length > 0 ? [startId] : []);
  const dropped = new Set<number>([startIndex]);
  let grew = true;
  while (grew) {
    grew = false;
    drafts.forEach((draft, index) => {
      if (dropped.has(index)) return;
      const parent = readSenseParentId(draft);
      if (parent.length === 0 || !droppedIds.has(parent)) return;
      dropped.add(index);
      const id = readSenseId(draft);
      if (id.length > 0) droppedIds.add(id);
      grew = true;
    });
  }
  return [...dropped].sort((left, right) => left - right);
}

export function liftSenseRoots<T extends SenseTreeNode>(senses: T[]): T[] {
  const ids = new Set(senses.map((sense) => readSenseId(sense)).filter((id) => id.length > 0));
  return senses.filter((sense) => {
    const parent = readSenseParentId(sense);
    return parent.length === 0 || !ids.has(parent);
  });
}

export function liftSenseChildren<T extends SenseTreeNode>(senses: T[], parentId: string): T[] {
  if (parentId.length === 0) return [];
  return senses.filter((sense) => readSenseParentId(sense) === parentId);
}
