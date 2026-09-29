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
    (relation) =>
      !(
        relation.type === 'hasPos' &&
        (relation.targetId === sourceId || relation.sourceId === sourceId)
      ),
  );
  const target = graph.nodes.find((node) => node.id === chosen.targetId);
  const withHasPos =
    target?.type === 'pos'
      ? [
          ...withoutHasPos,
          {
            id: `rel-haspos-${chosen.targetId}-${sourceId}`.slice(0, 128),
            type: 'hasPos' as const,
            sourceId: chosen.targetId,
            targetId: sourceId,
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

/** Add a second part-of-speech candidate beside the token's current hasPos. */
export function addAlternativePos(
  graph: AnnotationAnalysisGraphFixture,
  tokenId: string,
  posLabel: string,
): AnnotationAnalysisGraphFixture {
  const label = posLabel.trim();
  const token = graph.nodes.find((node) => node.id === tokenId && node.type === 'token');
  if (token === undefined || label.length === 0) {
    throw new Error('An alternative part of speech needs a token and a label.');
  }
  const current = graph.relations.find(
    (relation) => relation.type === 'hasPos' && relation.targetId === tokenId,
  );
  if (current === undefined) {
    throw new Error('Add a second part of speech beside the current one.');
  }
  const duplicate = graph.relations.some((relation) => {
    if (!isAnalysisChoice(relation) || relation.sourceId !== tokenId) return false;
    return graph.nodes.find((node) => node.id === relation.targetId)?.label === label;
  });
  if (duplicate) return graph;

  const nodes = [...graph.nodes];
  const relations = [...graph.relations];
  const currentIsChoice = relations.some(
    (relation) =>
      isAnalysisChoice(relation) &&
      relation.sourceId === tokenId &&
      relation.targetId === current.sourceId,
  );
  if (!currentIsChoice) {
    relations.push({
      id: `alt-pos-${tokenId}-${current.sourceId}`.slice(0, 128),
      type: 'alternativeAnalysis',
      sourceId: tokenId,
      targetId: current.sourceId,
      role: 'pending',
    });
  }
  const posId = `pos-alt-${tokenId}-${label}`.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 128);
  if (!nodes.some((node) => node.id === posId)) {
    nodes.push({ id: posId, type: 'pos', label });
  }
  relations.push({
    id: `alt-${posId}`.slice(0, 128),
    type: 'alternativeAnalysis',
    sourceId: tokenId,
    targetId: posId,
    role: 'pending',
  });
  const hasAmbiguity = graph.projectionDiagnostics.some((item) =>
    item.message.startsWith('Ambiguous POS'),
  );
  return validateAnnotationAnalysisGraphFixture({
    ...graph,
    nodes,
    relations,
    projectionDiagnostics: hasAmbiguity
      ? graph.projectionDiagnostics
      : [
          ...graph.projectionDiagnostics,
          {
            target: 'conllu',
            status: 'needsReview',
            message: `Ambiguous POS: choose one alternative for ${token.label}.`,
          },
        ],
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
