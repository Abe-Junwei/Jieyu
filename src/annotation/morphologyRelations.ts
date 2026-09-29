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

/** Point a later morpheme at the same feature bundle as an earlier one. Forms stay separate. */
export function assignSharedFeature(
  graph: AnnotationAnalysisGraphFixture,
  laterMorphId: string,
  earlierMorphId: string,
): AnnotationAnalysisGraphFixture {
  if (laterMorphId === earlierMorphId) {
    throw new Error('A morpheme cannot share a feature with itself.');
  }
  const later = graph.nodes.find((node) => node.id === laterMorphId);
  const earlier = graph.nodes.find((node) => node.id === earlierMorphId);
  if (later?.type !== 'morpheme' || earlier?.type !== 'morpheme') {
    throw new Error('Shared features need two morphemes already in the graph.');
  }
  const glossId = graph.relations.find(
    (relation) => relation.type === 'glosses' && relation.targetId === earlierMorphId,
  )?.sourceId;
  const bundleId = graph.relations.find(
    (relation) =>
      relation.type === 'realizesFeature' &&
      (relation.sourceId === earlierMorphId || relation.sourceId === glossId),
  )?.targetId;
  if (bundleId === undefined) {
    throw new Error('The earlier morpheme has no feature to share.');
  }
  const exists = graph.relations.some(
    (relation) =>
      relation.type === 'realizesFeature' &&
      relation.sourceId === laterMorphId &&
      relation.targetId === bundleId,
  );
  if (exists) return graph;
  return withAdditions(
    graph,
    [],
    [{ type: 'realizesFeature', sourceId: laterMorphId, targetId: bundleId }],
    [
      {
        target: 'conllu',
        status: 'degraded',
        message: 'Multiple exponence: the same feature is realized twice and is projected once.',
      },
    ],
  );
}

/** Record a root label and a pattern label. Character spans are not invented. */
export function assignRootPattern(
  graph: AnnotationAnalysisGraphFixture,
  tokenId: string,
  rootLabel: string,
  patternLabel: string,
): AnnotationAnalysisGraphFixture {
  const token = graph.nodes.find((node) => node.id === tokenId && node.type === 'token');
  const root = rootLabel.trim();
  const pattern = patternLabel.trim();
  if (token === undefined || root.length === 0 || pattern.length === 0) {
    throw new Error('A root pattern needs a token, a root label, and a pattern label.');
  }
  const rootId = `root-${tokenId}`;
  if (graph.nodes.some((node) => node.id === rootId)) return graph;
  const patternId = `pat-${tokenId}`;
  const processId = `proc-template-${tokenId}`;
  return withAdditions(
    graph,
    [
      { id: rootId, type: 'root', label: root },
      { id: patternId, type: 'pattern', label: pattern },
      { id: processId, type: 'process', label: 'templaticMapping' },
    ],
    [
      { type: 'discontinuousPartOf', sourceId: rootId, targetId: tokenId },
      { type: 'derivedByProcess', sourceId: tokenId, targetId: processId },
    ],
    [
      {
        target: 'latex',
        status: 'degraded',
        message: 'Root spans were not stored; only the root and pattern labels are kept.',
      },
    ],
  );
}

/** Mark one morpheme inside a word as incorporated. The token stays one syntactic word. */
export function assignIncorporation(
  graph: AnnotationAnalysisGraphFixture,
  morphId: string,
): AnnotationAnalysisGraphFixture {
  const morph = graph.nodes.find((node) => node.id === morphId && node.type === 'morpheme');
  if (morph === undefined) throw new Error('Incorporation needs a morpheme in the graph.');
  const processId = `proc-inc-${morphId}`;
  if (graph.nodes.some((node) => node.id === processId)) return graph;
  const host = graph.relations.find(
    (relation) => relation.type === 'hasPart' && relation.targetId === morphId,
  );
  const lexeme = host
    ? graph.relations.find(
        (relation) => relation.type === 'linksLexeme' && relation.sourceId === host.sourceId,
      )
    : undefined;
  const relations: Array<Omit<AnalysisGraphRelation, 'id'>> = [
    { type: 'derivedByProcess', sourceId: morphId, targetId: processId },
  ];
  if (
    lexeme !== undefined &&
    !graph.relations.some(
      (relation) =>
        relation.type === 'linksLexeme' &&
        relation.sourceId === morphId &&
        relation.targetId === lexeme.targetId,
    )
  ) {
    relations.push({ type: 'linksLexeme', sourceId: morphId, targetId: lexeme.targetId });
  }
  const next = withAdditions(
    graph,
    [{ id: processId, type: 'process', label: 'incorporation' }],
    relations,
    [
      {
        target: 'conllu',
        status: 'degraded',
        message: 'Keep one word line; put the incorporated noun in MISC, not a second token.',
      },
    ],
  );
  return validateAnnotationAnalysisGraphFixture({
    ...next,
    relations: next.relations.map((relation) =>
      relation.type === 'hasPart' && relation.targetId === morphId
        ? { ...relation, role: 'incorporated' }
        : relation,
    ),
  });
}

/** Mark a morpheme as an allomorph of a linked lexeme. Suppletion stays a separate action. */
export function assignAllomorph(
  graph: AnnotationAnalysisGraphFixture,
  morphId: string,
): AnnotationAnalysisGraphFixture {
  const morph = graph.nodes.find((node) => node.id === morphId && node.type === 'morpheme');
  if (morph === undefined) throw new Error('An allomorph needs a morpheme in the graph.');
  const host = graph.relations.find(
    (relation) => relation.type === 'hasPart' && relation.targetId === morphId,
  );
  const lexeme =
    graph.relations.find(
      (relation) => relation.type === 'linksLexeme' && relation.sourceId === morphId,
    ) ??
    (host
      ? graph.relations.find(
          (relation) => relation.type === 'linksLexeme' && relation.sourceId === host.sourceId,
        )
      : undefined);
  if (lexeme === undefined) throw new Error('An allomorph needs a linked lexeme.');
  const exists = graph.relations.some(
    (relation) =>
      relation.type === 'hasAllomorph' &&
      relation.sourceId === lexeme.targetId &&
      relation.targetId === morphId,
  );
  if (exists) return graph;
  return withAdditions(
    graph,
    [],
    [{ type: 'hasAllomorph', sourceId: lexeme.targetId, targetId: morphId }],
    [
      {
        target: 'flex',
        status: 'degraded',
        message: 'Allomorph stays in the analysis graph, not a FLEx variant field.',
      },
    ],
  );
}

function morphemeIdFor(graph: AnnotationAnalysisGraphFixture, nodeId: string): string | undefined {
  const node = graph.nodes.find((item) => item.id === nodeId);
  if (node?.type === 'morpheme') return nodeId;
  const glossed = graph.relations.find(
    (relation) => relation.type === 'glosses' && relation.sourceId === nodeId,
  );
  const owner = glossed ? graph.nodes.find((item) => item.id === glossed.targetId) : undefined;
  return owner?.type === 'morpheme' ? owner.id : undefined;
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
  for (const relation of previous.relations) {
    if (relation.type !== 'realizesFeature') continue;
    if (!ids.has(relation.targetId)) continue;
    const laterId = morphemeIdFor(previous, relation.sourceId);
    const earlier = previous.relations.find(
      (item) =>
        item.type === 'realizesFeature' &&
        item.targetId === relation.targetId &&
        item.sourceId !== relation.sourceId,
    );
    const earlierId = earlier === undefined ? undefined : morphemeIdFor(previous, earlier.sourceId);
    if (
      laterId === undefined ||
      earlierId === undefined ||
      !ids.has(laterId) ||
      !ids.has(earlierId)
    ) {
      continue;
    }
    try {
      graph = assignSharedFeature(graph, laterId, earlierId);
    } catch {
      continue;
    }
  }
  for (const node of previous.nodes) {
    if (node.type !== 'root' || !node.id.startsWith('root-')) continue;
    const tokenId = node.id.slice('root-'.length);
    const pattern = previous.nodes.find((item) => item.id === `pat-${tokenId}`);
    if (pattern === undefined || !ids.has(tokenId)) continue;
    graph = assignRootPattern(graph, tokenId, node.label, pattern.label);
  }
  for (const node of previous.nodes) {
    if (node.type !== 'process' || node.label !== 'incorporation') continue;
    const morphId = node.id.startsWith('proc-inc-') ? node.id.slice('proc-inc-'.length) : '';
    if (morphId.length === 0 || !ids.has(morphId)) continue;
    graph = assignIncorporation(graph, morphId);
  }
  for (const relation of previous.relations) {
    if (relation.type !== 'hasAllomorph') continue;
    if (!ids.has(relation.sourceId) || !ids.has(relation.targetId)) continue;
    graph = assignAllomorph(graph, relation.targetId);
  }
  return graph;
}
