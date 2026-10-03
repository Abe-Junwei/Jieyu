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

function locateForm(
  label: string,
  form: string,
  from: number,
): { startOffset: number; endOffset: number } | null {
  const needle = form.trim();
  if (needle.length === 0) return null;
  const startOffset = label.indexOf(needle, from);
  if (startOffset < 0) return null;
  return { startOffset, endOffset: startOffset + needle.length };
}

/** Two existing morphemes of one word. Spans are stored; the label is only a display. */
export function assignDiscontinuousParts(
  graph: AnnotationAnalysisGraphFixture,
  tokenId: string,
  leftMorphId: string,
  rightMorphId: string,
): AnnotationAnalysisGraphFixture {
  if (leftMorphId === rightMorphId) {
    throw new Error('Discontinuous parts need two different morphemes.');
  }
  const token = graph.nodes.find((node) => node.id === tokenId && node.type === 'token');
  const left = graph.nodes.find((node) => node.id === leftMorphId && node.type === 'morpheme');
  const right = graph.nodes.find((node) => node.id === rightMorphId && node.type === 'morpheme');
  if (token === undefined || left === undefined || right === undefined) {
    throw new Error('Discontinuous parts need a token and two morphemes.');
  }
  const owned = new Set(
    graph.relations
      .filter((relation) => relation.type === 'hasPart' && relation.sourceId === tokenId)
      .map((relation) => relation.targetId),
  );
  if (!owned.has(leftMorphId) || !owned.has(rightMorphId)) {
    throw new Error('Both morphemes must belong to the same word.');
  }
  const leftSpan = locateForm(token.label, left.label, 0);
  const rightSpan =
    leftSpan === null ? null : locateForm(token.label, right.label, leftSpan.endOffset);
  if (leftSpan === null || rightSpan === null || rightSpan.startOffset < leftSpan.endOffset) {
    throw new Error('The two forms were not found as separate spans in the word.');
  }
  const nodeId = `disc-${tokenId}`;
  if (graph.nodes.some((node) => node.id === nodeId)) return graph;
  return withAdditions(
    graph,
    [
      {
        id: nodeId,
        type: 'morpheme',
        label: `${left.label}...${right.label}`,
        surfaceParts: [
          { tokenId, startOffset: leftSpan.startOffset, endOffset: leftSpan.endOffset },
          { tokenId, startOffset: rightSpan.startOffset, endOffset: rightSpan.endOffset },
        ],
      },
    ],
    [{ type: 'discontinuousPartOf', sourceId: nodeId, targetId: tokenId }],
    interchangeDiagnostics('Discontinuous parts stay as two spans, not one concatenated string.'),
  );
}

/** Store a short prosodic label on the word. This is not a timed tier. */
export function assignTone(
  graph: AnnotationAnalysisGraphFixture,
  tokenId: string,
  toneLabel: string,
): AnnotationAnalysisGraphFixture {
  const token = graph.nodes.find((node) => node.id === tokenId && node.type === 'token');
  const label = toneLabel.trim();
  if (token === undefined || label.length === 0) {
    throw new Error('Tone needs a token and a short label.');
  }
  const toneId = `tone-${tokenId}`;
  const existing = graph.nodes.find((node) => node.id === toneId);
  if (existing?.label === label) return graph;
  if (existing) {
    return {
      ...graph,
      nodes: graph.nodes.map((node) =>
        node.id === toneId ? { ...node, label, features: { tone: label } } : node,
      ),
    };
  }
  const processId = `proc-tone-${tokenId}`;
  return withAdditions(
    graph,
    [
      { id: toneId, type: 'prosodicFeature', label, features: { tone: label } },
      { id: processId, type: 'process', label: 'toneOverwrite' },
    ],
    [
      { type: 'overwritesTone', sourceId: tokenId, targetId: toneId },
      { type: 'derivedByProcess', sourceId: tokenId, targetId: processId },
    ],
    interchangeDiagnostics('Tone is a label on the word, not a separate timed tier.'),
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
  const spans = graph.relations
    .filter((relation) => relation.type === 'hasPart' && relation.sourceId === tokenId)
    .flatMap((relation) => {
      const node = graph.nodes.find((item) => item.id === relation.targetId);
      return node?.surfaceParts ?? [];
    });
  return withAdditions(
    graph,
    [
      {
        id: rootId,
        type: 'root',
        label: root,
        ...(spans.length >= 2 ? { surfaceParts: spans } : {}),
      },
      { id: patternId, type: 'pattern', label: pattern },
      { id: processId, type: 'process', label: 'templaticMapping' },
    ],
    [
      { type: 'discontinuousPartOf', sourceId: rootId, targetId: tokenId },
      { type: 'derivedByProcess', sourceId: tokenId, targetId: processId },
    ],
    spans.length >= 2
      ? []
      : [
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
    if (relation.type === 'overwritesTone') {
      const feature = previous.nodes.find(
        (node) => node.id === relation.targetId && node.type === 'prosodicFeature',
      );
      if (feature) {
        graph = assignTone(graph, relation.sourceId, feature.label);
        continue;
      }
    }
    graph = assignSegmentProcess(graph, relation.sourceId, relation.type);
  }
  for (const node of previous.nodes) {
    if (!node.id.startsWith('disc-')) continue;
    const tokenId = node.id.slice('disc-'.length);
    const parts = node.surfaceParts ?? [];
    const left = parts[0];
    const right = parts[1];
    if (left === undefined || right === undefined || !ids.has(tokenId)) continue;
    const token = graph.nodes.find((item) => item.id === tokenId);
    if (
      token === undefined ||
      right.endOffset === undefined ||
      right.endOffset > token.label.length
    ) {
      continue;
    }
    if (graph.nodes.some((item) => item.id === node.id)) continue;
    graph = withAdditions(
      graph,
      [node],
      [{ type: 'discontinuousPartOf', sourceId: node.id, targetId: tokenId }],
      [],
    );
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
