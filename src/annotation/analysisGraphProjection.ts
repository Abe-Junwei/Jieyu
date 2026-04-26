import {
  annotationAnalysisGraphFixtureSchema,
  projectionDiagnosticSchema,
  type AnnotationAnalysisGraphFixture,
  type AnalysisGraphNode,
  type AnalysisGraphRelation,
  type ProjectionDiagnostic,
  type ProjectionDiagnosticSubject,
} from './analysisGraph';
import {
  DEFAULT_LEIPZIG_STRUCTURAL_PROFILE,
  type StructuralParseResult,
  type StructuralParsedSegment,
} from './structuralRuleProfile';

export type AnalysisGraphProjectionOptions = {
  id?: string;
  text?: string;
  displayGloss?: string;
};

function nodeId(prefix: string, index: number): string {
  return `${prefix}-${index + 1}`;
}

function relationId(index: number): string {
  return `rel-${index + 1}`;
}

function diagnosticsFromParse(parseResult: StructuralParseResult): ProjectionDiagnostic[] {
  if (parseResult.projectionDiagnostics.length > 0) {
    return parseResult.projectionDiagnostics;
  }
  return DEFAULT_LEIPZIG_STRUCTURAL_PROFILE.projectionTargets.map((target) => projectionDiagnosticSchema.parse({
    target,
    status: 'unsupported',
    message: 'Structural parse did not provide projection diagnostics for this target.',
  }));
}

function findAnalysisSegmentBefore(
  segments: StructuralParsedSegment[],
  segmentNodeIds: ReadonlyMap<string, string>,
  offset: number,
  wordIndex: number,
): StructuralParsedSegment | undefined {
  return segments
    .filter((segment) => (
      segment.wordIndex === wordIndex
      && segment.endOffset <= offset
      && segmentNodeIds.has(segment.id)
      && (segment.kind === 'lexical' || segment.kind === 'infix' || segment.kind === 'zero' || segment.kind === 'reduplication')
    ))
    .at(-1);
}

function findAnalysisSegmentAfter(
  segments: StructuralParsedSegment[],
  segmentNodeIds: ReadonlyMap<string, string>,
  offset: number,
  wordIndex: number,
): StructuralParsedSegment | undefined {
  return segments.find((segment) => (
    segment.wordIndex === wordIndex
    && segment.startOffset >= offset
    && segmentNodeIds.has(segment.id)
    && (segment.kind === 'lexical' || segment.kind === 'infix' || segment.kind === 'zero' || segment.kind === 'reduplication')
  ));
}

/** Gloss segments adjacent to a boundary (any kind), for clitic / diagnostics without analysis-node gating. */
function findGlossSegmentBeforeOffset(
  segments: readonly StructuralParsedSegment[],
  wordIndex: number,
  offset: number,
): StructuralParsedSegment | undefined {
  return segments.filter((s) => s.wordIndex === wordIndex && s.endOffset <= offset).at(-1);
}

function findGlossSegmentAfterOffset(
  segments: readonly StructuralParsedSegment[],
  wordIndex: number,
  offset: number,
): StructuralParsedSegment | undefined {
  return segments.find((s) => s.wordIndex === wordIndex && s.startOffset > offset);
}

/**
 * Projects a structural parse into a single-token candidate graph entry point (`token-1`).
 * Multi-word interlinear input is a known limitation: M2+ will add per-surface word / token nodes.
 */
export function projectStructuralParseToAnalysisGraph(
  parseResult: StructuralParseResult,
  options: AnalysisGraphProjectionOptions = {},
): AnnotationAnalysisGraphFixture {
  const nodes: AnalysisGraphNode[] = [
    {
      id: 'token-1',
      type: 'token',
      label: options.text ?? parseResult.input,
    },
  ];
  const relations: AnalysisGraphRelation[] = [];
  const segmentNodeIds = new Map<string, string>();
  const projectionDiagnostics: ProjectionDiagnostic[] = [...diagnosticsFromParse(parseResult)];
  let relationIndex = 0;

  const addRelation = (relation: Omit<AnalysisGraphRelation, 'id'>) => {
    relations.push({ id: relationId(relationIndex), ...relation });
    relationIndex += 1;
  };
  const defaultProjectionTargets = DEFAULT_LEIPZIG_STRUCTURAL_PROFILE.projectionTargets;
  const needsReviewKeys = new Set<string>();
  const addNeedsReviewDiagnostic = (message: string, subject?: ProjectionDiagnosticSubject) => {
    const targets = parseResult.projectionDiagnostics.length > 0
      ? Array.from(new Set(parseResult.projectionDiagnostics.map((diagnostic) => diagnostic.target)))
      : defaultProjectionTargets;
    for (const target of targets) {
      const key = `${target}\0${message}\0${JSON.stringify(subject ?? null)}`;
      if (needsReviewKeys.has(key)) continue;
      needsReviewKeys.add(key);
      projectionDiagnostics.push(projectionDiagnosticSchema.parse({
        target,
        status: 'needsReview',
        message,
        ...(subject ? { subject } : {}),
      }));
    }
  };

  for (const [index, segment] of parseResult.segments.entries()) {
    if (segment.kind === 'lexical' || segment.kind === 'infix' || segment.kind === 'reduplication') {
      const id = nodeId('morph', index);
      segmentNodeIds.set(segment.id, id);
      const node: AnalysisGraphNode = {
        id,
        type: 'morpheme',
        label: segment.text,
        features: {
          glossStartOffset: segment.startOffset,
          glossEndOffset: segment.endOffset,
        },
      };
      if (segment.kind === 'infix') {
        node.features = { ...node.features, role: 'infix' };
      }
      if (segment.kind === 'reduplication') {
        node.features = { ...node.features, role: 'reduplicant' };
      }
      nodes.push(node);
      const relation: Omit<AnalysisGraphRelation, 'id'> = {
        type: 'contains',
        sourceId: 'token-1',
        targetId: id,
      };
      if (segment.kind === 'infix') {
        relation.role = 'infix';
      }
      if (segment.kind === 'reduplication') {
        relation.role = 'reduplicant';
      }
      addRelation(relation);
      continue;
    }

    if (segment.kind === 'zero') {
      const zeroId = nodeId('zero', index);
      const featureId = nodeId('feature', index);
      segmentNodeIds.set(segment.id, zeroId);
      nodes.push(
        { id: zeroId, type: 'zero', label: segment.text },
        { id: featureId, type: 'featureBundle', label: segment.text, features: { label: segment.text } },
      );
      addRelation({ type: 'realizesFeature', sourceId: zeroId, targetId: featureId });
      continue;
    }

    if (segment.kind === 'feature') {
      const glossId = nodeId('gloss', index);
      const featureId = nodeId('feature', index);
      segmentNodeIds.set(segment.id, glossId);
      nodes.push(
        { id: glossId, type: 'gloss', label: segment.text, features: { label: segment.text } },
        { id: featureId, type: 'featureBundle', label: segment.text, features: { label: segment.text } },
      );
      addRelation({ type: 'realizesFeature', sourceId: glossId, targetId: featureId });

      const previousSegment = findAnalysisSegmentBefore(parseResult.segments, segmentNodeIds, segment.startOffset, segment.wordIndex);
      const previousNodeId = previousSegment ? segmentNodeIds.get(previousSegment.id) : undefined;
      if (previousNodeId) {
        addRelation({ type: 'glosses', sourceId: glossId, targetId: previousNodeId });
      } else {
        addNeedsReviewDiagnostic(`Feature "${segment.text}" has no preceding analysis node to gloss.`, {
          kind: 'segment',
          segmentId: segment.id,
        });
      }
      continue;
    }

    const noteId = nodeId('note', index);
    segmentNodeIds.set(segment.id, noteId);
    nodes.push({
      id: noteId,
      type: 'note',
      label: segment.text,
      features: { supplied: true, glossStartOffset: segment.startOffset, glossEndOffset: segment.endOffset },
    });
    addRelation({ type: 'contains', sourceId: 'token-1', targetId: noteId, role: 'supplied' });
  }

  for (const boundary of parseResult.boundaries) {
    if (boundary.type !== 'clitic') continue;
    const hostSegment = findAnalysisSegmentBefore(parseResult.segments, segmentNodeIds, boundary.offset, boundary.wordIndex);
    const cliticSegment = findAnalysisSegmentAfter(parseResult.segments, segmentNodeIds, boundary.offset, boundary.wordIndex);
    const hostNodeId = hostSegment ? segmentNodeIds.get(hostSegment.id) : undefined;
    const cliticNodeId = cliticSegment ? segmentNodeIds.get(cliticSegment.id) : undefined;
    if (hostNodeId && cliticNodeId) {
      addRelation({ type: 'cliticizesTo', sourceId: cliticNodeId, targetId: hostNodeId });
    } else {
      const beforeSeg = findGlossSegmentBeforeOffset(parseResult.segments, boundary.wordIndex, boundary.offset);
      const afterSeg = findGlossSegmentAfterOffset(parseResult.segments, boundary.wordIndex, boundary.offset);
      const bothFeature = beforeSeg?.kind === 'feature' && afterSeg?.kind === 'feature';
      const message = bothFeature
        ? `Clitic boundary at offset ${boundary.offset}: cliticizesTo skipped — both sides are gloss/feature segments (not analysable morpheme hosts).`
        : `Clitic boundary at offset ${boundary.offset} has no valid analysis host and clitic target.`;
      addNeedsReviewDiagnostic(message, { kind: 'cliticBoundary', boundaryOffset: boundary.offset });
    }
  }

  for (const segment of parseResult.segments) {
    if (segment.kind !== 'reduplication') continue;
    const reduplicantNodeId = segmentNodeIds.get(segment.id);
    const baseSegment = findAnalysisSegmentAfter(parseResult.segments, segmentNodeIds, segment.endOffset, segment.wordIndex);
    const baseNodeId = baseSegment ? segmentNodeIds.get(baseSegment.id) : undefined;
    if (reduplicantNodeId && baseNodeId && baseNodeId !== reduplicantNodeId) {
      addRelation({ type: 'reduplicates', sourceId: reduplicantNodeId, targetId: baseNodeId });
    } else {
      addNeedsReviewDiagnostic(`Reduplication marker "${segment.text}" has no following base segment.`, {
        kind: 'segment',
        segmentId: segment.id,
      });
    }
  }

  const graph = {
    id: options.id ?? `candidate-${parseResult.profileId}`,
    text: options.text ?? parseResult.input,
    displayGloss: options.displayGloss ?? parseResult.input,
    nodes,
    relations,
    projectionDiagnostics,
  };

  return annotationAnalysisGraphFixtureSchema.parse(graph);
}
