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

export function descendantDraftIndexes(
  drafts: readonly SenseTreeNode[],
  startIndex: number,
): number[] {
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

/** Move one sibling and its descendant block. No-op returns the same array. */
export function moveSenseSiblingBlock<T extends SenseTreeNode>(
  drafts: readonly T[],
  index: number,
  direction: -1 | 1,
): readonly T[] {
  if (index < 0 || index >= drafts.length || (direction !== -1 && direction !== 1)) return drafts;
  const parent = readSenseParentId(drafts[index] ?? {});
  const siblingIndexes = drafts.flatMap((draft, draftIndex) =>
    readSenseParentId(draft) === parent ? [draftIndex] : [],
  );
  const neighborIndex = siblingIndexes[siblingIndexes.indexOf(index) + direction];
  if (neighborIndex === undefined) return drafts;
  const selfSet = new Set(descendantDraftIndexes(drafts, index));
  const neighborSet = new Set(descendantDraftIndexes(drafts, neighborIndex));
  for (const row of selfSet) {
    if (neighborSet.has(row)) return drafts;
  }
  const selfItems = drafts.filter((_, row) => selfSet.has(row));
  const neighborItems = drafts.filter((_, row) => neighborSet.has(row));
  const earlier = direction < 0 ? selfItems : neighborItems;
  const later = direction < 0 ? neighborItems : selfItems;
  const out: T[] = [];
  let inserted = false;
  drafts.forEach((draft, row) => {
    if (selfSet.has(row) || neighborSet.has(row)) {
      if (!inserted) {
        out.push(...earlier, ...later);
        inserted = true;
      }
      return;
    }
    out.push(draft);
  });
  return out;
}

function withSenseParent<T extends SenseTreeNode>(node: T, parentId: string): T {
  const { parentId: _parentId, ...rest } = node;
  if (parentId.length === 0) return rest as T;
  return { ...rest, parentId } as T;
}

function extraSenseDepth(
  drafts: readonly SenseTreeNode[],
  index: number,
  primaryId: string,
): number {
  let depth = 0;
  let parent = readSenseParentId(drafts[index] ?? {});
  const seen = new Set<string>();
  const primary = primaryId.trim();
  while (parent.length > 0 && depth < 8) {
    if (seen.has(parent)) return depth;
    seen.add(parent);
    if (primary.length > 0 && parent === primary) return depth + 1;
    const parentNode = drafts.find((draft) => readSenseId(draft) === parent);
    if (!parentNode) return depth;
    depth += 1;
    parent = readSenseParentId(parentNode);
  }
  return depth;
}

function siblingDraftIndexes(drafts: readonly SenseTreeNode[], parentId: string): number[] {
  return drafts.flatMap((draft, index) => (readSenseParentId(draft) === parentId ? [index] : []));
}

/** Raise one sense one level. No-op returns the same array. Does not reorder. */
export function promoteSense<T extends SenseTreeNode>(
  drafts: readonly T[],
  index: number,
  primaryId: string,
): readonly T[] {
  const row = drafts[index];
  if (!row) return drafts;
  const parent = readSenseParentId(row);
  if (parent.length === 0) return drafts;
  const primary = primaryId.trim();
  let nextParent = '';
  if (parent !== primary) {
    const parentNode = drafts.find((draft) => readSenseId(draft) === parent);
    nextParent = parentNode ? readSenseParentId(parentNode) : '';
  }
  if (nextParent === parent) return drafts;
  return drafts.map((draft, rowIndex) =>
    rowIndex === index ? withSenseParent(draft, nextParent) : draft,
  );
}

/** True when demote would change parentId, including when the controller must assign an id first. */
export function canDemoteSense(
  drafts: readonly SenseTreeNode[],
  index: number,
  primaryId: string,
): boolean {
  if (index < 0 || index >= drafts.length) return false;
  if (extraSenseDepth(drafts, index, primaryId) >= 8) return false;
  const parent = readSenseParentId(drafts[index] ?? {});
  const position = siblingDraftIndexes(drafts, parent).indexOf(index);
  if (position > 0) return true;
  return parent.length === 0;
}

/** Lower one sense under the previous sibling, or under the primary gloss. No-op returns the same array. */
export function demoteSense<T extends SenseTreeNode>(
  drafts: readonly T[],
  index: number,
  primaryId: string,
): readonly T[] {
  if (!canDemoteSense(drafts, index, primaryId)) return drafts;
  const parent = readSenseParentId(drafts[index] ?? {});
  const siblings = siblingDraftIndexes(drafts, parent);
  const previousIndex = siblings[siblings.indexOf(index) - 1];
  const primary = primaryId.trim();
  const nextParent =
    previousIndex === undefined ? primary : readSenseId(drafts[previousIndex] ?? {});
  if (nextParent.length === 0 || nextParent === parent) return drafts;
  return drafts.map((draft, rowIndex) =>
    rowIndex === index ? withSenseParent(draft, nextParent) : draft,
  );
}
