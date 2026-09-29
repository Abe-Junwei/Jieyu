import {
  validateAnnotationAnalysisGraphFixture,
  type AnalysisGraphNode,
  type AnalysisGraphRelation,
  type AnnotationAnalysisGraphFixture,
} from './analysisGraph';

export type AlternativeAnalysisChoice = {
  relationId: string;
  sourceId: string;
  sourceLabel: string;
  targetId: string;
  targetLabel: string;
  role: 'pending' | 'accepted' | 'rejected';
};

const ANALYSIS_CHOICE_ROLES = new Set<AlternativeAnalysisChoice['role']>([
  'pending',
  'accepted',
  'rejected',
]);

function normalizeRole(role: string | undefined): AlternativeAnalysisChoice['role'] {
  if (role === 'accepted' || role === 'rejected') return role;
  return 'pending';
}

/** Retokenize snapshots use the same edge type but are not POS/analysis choices. */
function isAnalysisChoice(relation: AnalysisGraphRelation): boolean {
  return (
    relation.type === 'alternativeAnalysis' &&
    (relation.role === undefined ||
      ANALYSIS_CHOICE_ROLES.has(relation.role as AlternativeAnalysisChoice['role']))
  );
}

/** List pending/accepted/rejected alternativeAnalysis edges for readout and UI. */
export function listAlternativeAnalysisChoices(
  graph: AnnotationAnalysisGraphFixture,
): AlternativeAnalysisChoice[] {
  const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
  return graph.relations
    .filter(isAnalysisChoice)
    .map((relation) => {
      const source = nodes.get(relation.sourceId);
      const target = nodes.get(relation.targetId);
      return {
        relationId: relation.id,
        sourceId: relation.sourceId,
        sourceLabel: source?.label ?? relation.sourceId,
        targetId: relation.targetId,
        targetLabel: target?.label ?? relation.targetId,
        role: normalizeRole(relation.role),
      };
    })
    .sort((left, right) => left.relationId.localeCompare(right.relationId));
}

/**
 * Accept one alternativeAnalysis edge for its source; reject sibling alternatives.
 * Does not invent new tokens. Dirty drafts are the caller's responsibility.
 */
export function selectAlternativeAnalysis(
  graph: AnnotationAnalysisGraphFixture,
  relationId: string,
): AnnotationAnalysisGraphFixture {
  const chosen = graph.relations.find(
    (relation) => relation.id === relationId && isAnalysisChoice(relation),
  );
  if (chosen === undefined) {
    throw new Error(`alternativeAnalysis relation not found: ${relationId}`);
  }
  const sourceId = chosen.sourceId;
  const siblings = graph.relations.filter(
    (relation) => isAnalysisChoice(relation) && relation.sourceId === sourceId,
  );
  if (siblings.length < 2) {
    throw new Error('Selecting an alternative needs at least two candidates for the same source.');
  }

  const nextRelations: AnalysisGraphRelation[] = graph.relations.map((relation) => {
    if (!isAnalysisChoice(relation) || relation.sourceId !== sourceId) {
      return relation;
    }
    if (relation.id === relationId) {
      return { ...relation, role: 'accepted' };
    }
    return { ...relation, role: 'rejected' };
  });

  const withoutHasPos = nextRelations.filter(
    (relation) => !(relation.type === 'hasPos' && relation.sourceId === sourceId),
  );
  const target = graph.nodes.find((node) => node.id === chosen.targetId);
  const withHasPos =
    target?.type === 'pos'
      ? [
          ...withoutHasPos,
          {
            id: `rel-haspos-${sourceId}-${chosen.targetId}`,
            type: 'hasPos' as const,
            sourceId,
            targetId: chosen.targetId,
            role: 'accepted',
          },
        ]
      : withoutHasPos;

  const message = `Accepted alternative ${target?.label ?? chosen.targetId}; siblings rejected.`;
  const diagnostics = [
    ...graph.projectionDiagnostics.filter(
      (diagnostic) =>
        !diagnostic.message.startsWith('Accepted alternative ') &&
        !diagnostic.message.startsWith('Ambiguous'),
    ),
    { target: 'flex' as const, status: 'complete' as const, message },
  ];

  return validateAnnotationAnalysisGraphFixture({
    ...graph,
    relations: withHasPos,
    projectionDiagnostics: diagnostics,
  });
}

/** Keep alternativeAnalysis edges (and missing target nodes) whose source still exists. */
export function retainAlternativeAnalyses(
  fresh: AnnotationAnalysisGraphFixture,
  previous: AnnotationAnalysisGraphFixture | undefined,
): AnnotationAnalysisGraphFixture {
  if (previous === undefined) return fresh;
  const freshIds = new Set(fresh.nodes.map((node) => node.id));
  const previousNodes = new Map(previous.nodes.map((node) => [node.id, node]));
  const extraNodes: AnalysisGraphNode[] = [];
  const extraRelations: AnalysisGraphRelation[] = [];
  const seenRelation = new Set(
    fresh.relations
      .filter((relation) => relation.type === 'alternativeAnalysis')
      .map(
        (relation) => `${relation.sourceId}->${relation.targetId}:${relation.role ?? 'pending'}`,
      ),
  );

  for (const relation of previous.relations) {
    if (relation.type !== 'alternativeAnalysis') continue;
    if (!freshIds.has(relation.sourceId)) continue;
    const target = previousNodes.get(relation.targetId);
    if (target === undefined) continue;
    if (!freshIds.has(relation.targetId) && !extraNodes.some((node) => node.id === target.id)) {
      extraNodes.push(target);
    }
    const key = `${relation.sourceId}->${relation.targetId}:${relation.role ?? 'pending'}`;
    if (seenRelation.has(key)) continue;
    seenRelation.add(key);
    extraRelations.push(relation);
  }

  if (extraNodes.length === 0 && extraRelations.length === 0) return fresh;

  const relStart = fresh.relations.length;
  return validateAnnotationAnalysisGraphFixture({
    ...fresh,
    nodes: [...fresh.nodes, ...extraNodes],
    relations: [
      ...fresh.relations,
      ...extraRelations.map((relation, index) => ({
        ...relation,
        id: relation.id.startsWith('rel-') ? relation.id : `rel-alt-${relStart + index + 1}`,
      })),
    ],
  });
}
