import {
  validateAnnotationAnalysisGraphFixture,
  type AnnotationAnalysisGraphFixture,
} from './analysisGraph';

function tokenOrder(graph: AnnotationAnalysisGraphFixture): string[] {
  return graph.nodes.filter((node) => node.type === 'token').map((node) => node.id);
}

/** Mark a contiguous run of tokens as one multiword expression. */
export function assignPartOfMwe(
  graph: AnnotationAnalysisGraphFixture,
  tokenIds: readonly string[],
): AnnotationAnalysisGraphFixture {
  const order = tokenOrder(graph);
  const selected = tokenIds.map((id) => id.trim()).filter((id) => id.length > 0);
  if (selected.length < 2) {
    throw new Error('A multiword expression needs at least two tokens.');
  }
  const indexes = selected.map((id) => order.indexOf(id));
  if (indexes.some((index) => index < 0)) {
    throw new Error('Every multiword token must already be in the utterance graph.');
  }
  const sorted = [...indexes].sort((a, b) => a - b);
  for (let index = 1; index < sorted.length; index += 1) {
    if (sorted[index] !== sorted[index - 1]! + 1) {
      throw new Error('Multiword tokens must be a contiguous run.');
    }
  }
  const orderedIds = sorted.map((index) => order[index]!);
  const selectedSet = new Set(orderedIds);
  const existingGroups = new Map<string, string[]>();
  for (const relation of graph.relations) {
    if (relation.type !== 'partOfMwe') continue;
    const members = existingGroups.get(relation.targetId) ?? [];
    members.push(relation.sourceId);
    existingGroups.set(relation.targetId, members);
  }
  for (const members of existingGroups.values()) {
    if (members.length === selectedSet.size && members.every((id) => selectedSet.has(id))) {
      return graph;
    }
  }
  const mweId = `mwe-${graph.nodes.filter((node) => node.type === 'mwe').length + 1}`;
  const label = orderedIds
    .map((id) => graph.nodes.find((node) => node.id === id)?.label ?? '')
    .filter((text) => text.length > 0)
    .join(' ');
  const relStart = graph.relations.length;
  return validateAnnotationAnalysisGraphFixture({
    ...graph,
    nodes: [...graph.nodes, { id: mweId, type: 'mwe', label }],
    relations: [
      ...graph.relations,
      ...orderedIds.map((id, index) => ({
        id: `rel-${relStart + index + 1}`,
        type: 'partOfMwe' as const,
        sourceId: id,
        targetId: mweId,
      })),
    ],
    projectionDiagnostics: [
      ...graph.projectionDiagnostics,
      {
        target: 'conllu' as const,
        status: 'complete' as const,
        message: 'Multiword expression projects as fixed on the non-initial tokens.',
      },
    ],
  });
}

/** Keep multiword groups whose tokens are still a contiguous run in the fresh projection. */
export function retainPartOfMwe(
  fresh: AnnotationAnalysisGraphFixture,
  previous: AnnotationAnalysisGraphFixture | undefined,
): AnnotationAnalysisGraphFixture {
  if (!previous) return fresh;
  const groups = new Map<string, string[]>();
  for (const relation of previous.relations) {
    if (relation.type !== 'partOfMwe') continue;
    const members = groups.get(relation.targetId) ?? [];
    members.push(relation.sourceId);
    groups.set(relation.targetId, members);
  }
  let graph = fresh;
  for (const members of groups.values()) {
    if (members.length < 2) continue;
    try {
      graph = assignPartOfMwe(graph, members);
    } catch {
      continue;
    }
  }
  return graph;
}
