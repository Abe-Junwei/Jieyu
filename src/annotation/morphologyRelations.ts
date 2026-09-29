import {
  validateAnnotationAnalysisGraphFixture,
  type AnalysisGraphNode,
  type AnalysisGraphRelation,
  type AnnotationAnalysisGraphFixture,
  type ProjectionDiagnostic,
} from './analysisGraph';

type SegmentProcess = 'substitutesSegment' | 'deletesSegment' | 'overwritesTone';

function withAdditions(
  graph: AnnotationAnalysisGraphFixture,
  nodes: AnalysisGraphNode[],
  relations: Array<Omit<AnalysisGraphRelation, 'id'>>,
  diagnostics: ProjectionDiagnostic[],
): AnnotationAnalysisGraphFixture {
  const relStart = graph.relations.length;
  return validateAnnotationAnalysisGraphFixture({
    ...graph,
    nodes: [...graph.nodes, ...nodes],
    relations: [
      ...graph.relations,
      ...relations.map((relation, index) => ({
        id: `rel-${relStart + index + 1}`,
        ...relation,
      })),
    ],
    projectionDiagnostics: [...graph.projectionDiagnostics, ...diagnostics],
  });
}

function interchangeDiagnostics(message: string): ProjectionDiagnostic[] {
  return [
    { target: 'flex', status: 'degraded', message },
    { target: 'elan', status: 'degraded', message },
    { target: 'latex', status: 'degraded', message },
  ];
}

/** Mark one morpheme as a copy of another. Does not invent a new cut in the form. */
export function assignReduplicates(
  graph: AnnotationAnalysisGraphFixture,
  reduplicantId: string,
  stemId: string,
): AnnotationAnalysisGraphFixture {
  if (reduplicantId === stemId) {
    throw new Error('A morpheme cannot reduplicate itself.');
  }
  const reduplicant = graph.nodes.find((node) => node.id === reduplicantId);
  const stem = graph.nodes.find((node) => node.id === stemId);
  if (reduplicant?.type !== 'morpheme' || stem?.type !== 'morpheme') {
    throw new Error('Reduplication needs two morphemes already in the graph.');
  }
  const exists = graph.relations.some(
    (relation) =>
      relation.type === 'reduplicates' &&
      relation.sourceId === reduplicantId &&
      relation.targetId === stemId,
  );
  if (exists) return graph;
  const processId = `proc-redup-${reduplicantId}`;
  return withAdditions(
    graph,
    [{ id: processId, type: 'process', label: 'reduplication' }],
    [
      { type: 'reduplicates', sourceId: reduplicantId, targetId: stemId },
      { type: 'derivedByProcess', sourceId: reduplicantId, targetId: processId },
    ],
    [
      { target: 'latex', status: 'complete', message: 'Render REDUP in the gloss row.' },
      ...interchangeDiagnostics(
        'Reduplication stays in the analysis graph, not a FLEx field or an ELAN tier.',
      ),
    ],
  );
}

/** Link a whole surface form to an underlying label. Does not cut the token into morphemes. */
export function assignSuppletion(
  graph: AnnotationAnalysisGraphFixture,
  tokenId: string,
  underlyingLabel: string,
): AnnotationAnalysisGraphFixture {
  const token = graph.nodes.find((node) => node.id === tokenId && node.type === 'token');
  const label = underlyingLabel.trim();
  if (token === undefined || label.length === 0) {
    throw new Error('Suppletion needs the token and an underlying label.');
  }
  const already = graph.relations.some(
    (relation) => relation.type === 'hasSurfaceForm' && relation.sourceId === tokenId,
  );
  if (already) return graph;
  const surfaceId = `srf-${tokenId}`;
  const underlyingId = `und-${tokenId}`;
  const processId = `proc-sup-${tokenId}`;
  return withAdditions(
    graph,
    [
      {
        id: surfaceId,
        type: 'surfaceForm',
        label: token.label,
        surfaceParts: [{ tokenId, startOffset: 0, endOffset: token.label.length }],
      },
      { id: underlyingId, type: 'underlyingForm', label },
      { id: processId, type: 'process', label: 'suppletion' },
    ],
    [
      { type: 'hasSurfaceForm', sourceId: tokenId, targetId: surfaceId },
      { type: 'hasUnderlyingForm', sourceId: tokenId, targetId: underlyingId },
      { type: 'suppletes', sourceId: surfaceId, targetId: underlyingId },
      { type: 'derivedByProcess', sourceId: surfaceId, targetId: processId },
    ],
    interchangeDiagnostics(
      'Suppletion is not a morpheme boundary; the written gloss stays as it is.',
    ),
  );
}

/** Record a non-linear process on a token without splitting its form. */
export function assignSegmentProcess(
  graph: AnnotationAnalysisGraphFixture,
  tokenId: string,
  kind: SegmentProcess,
): AnnotationAnalysisGraphFixture {
  const token = graph.nodes.find((node) => node.id === tokenId && node.type === 'token');
  if (token === undefined) throw new Error('Segment process needs a token in the graph.');
  const exists = graph.relations.some(
    (relation) => relation.type === kind && relation.sourceId === tokenId,
  );
  if (exists) return graph;
  const processId = `proc-${kind}-${tokenId}`;
  return withAdditions(
    graph,
    [{ id: processId, type: 'process', label: kind }],
    [{ type: kind, sourceId: tokenId, targetId: processId }],
    interchangeDiagnostics('This process is not a linear morpheme boundary.'),
  );
}

/** Re-apply saved morphology relations whose endpoints are still in the fresh projection. */
export function retainMorphologyRelations(
  fresh: AnnotationAnalysisGraphFixture,
  previous: AnnotationAnalysisGraphFixture | undefined,
): AnnotationAnalysisGraphFixture {
  if (previous === undefined) return fresh;
  let graph = fresh;
  const ids = new Set(fresh.nodes.map((node) => node.id));
  for (const relation of previous.relations) {
    if (relation.type !== 'reduplicates') continue;
    if (!ids.has(relation.sourceId) || !ids.has(relation.targetId)) continue;
    graph = assignReduplicates(graph, relation.sourceId, relation.targetId);
  }
  for (const relation of previous.relations) {
    if (relation.type !== 'suppletes') continue;
    const surface = previous.nodes.find((node) => node.id === relation.sourceId);
    const underlying = previous.nodes.find((node) => node.id === relation.targetId);
    const tokenId = surface?.surfaceParts?.[0]?.tokenId;
    if (tokenId === undefined || underlying === undefined || !ids.has(tokenId)) continue;
    graph = assignSuppletion(graph, tokenId, underlying.label);
  }
  for (const relation of previous.relations) {
    if (
      relation.type !== 'substitutesSegment' &&
      relation.type !== 'deletesSegment' &&
      relation.type !== 'overwritesTone'
    ) {
      continue;
    }
    if (!ids.has(relation.sourceId)) continue;
    graph = assignSegmentProcess(graph, relation.sourceId, relation.type);
  }
  return graph;
}
