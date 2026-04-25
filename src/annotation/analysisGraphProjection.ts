import {
  annotationAnalysisGraphFixtureSchema,
  projectionDiagnosticSchema,
  type AnnotationAnalysisGraphFixture,
  type AnalysisGraphNode,
  type AnalysisGraphRelation,
  type ProjectionDiagnostic,
} from './analysisGraph';
import { type StructuralParseResult, type StructuralParsedSegment } from './structuralRuleProfile';

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

function surfacePartFor(segment: StructuralParsedSegment): NonNullable<AnalysisGraphNode['surfaceParts']>[number] {
  return {
    tokenId: 'token-1',
    startOffset: segment.startOffset,
    endOffset: segment.endOffset,
  };
}

function diagnosticsFromParse(parseResult: StructuralParseResult): ProjectionDiagnostic[] {
  if (parseResult.projectionDiagnostics.length > 0) {
    return parseResult.projectionDiagnostics;
  }
  return [
    projectionDiagnosticSchema.parse({
      target: 'latex',
      status: parseResult.warnings.some((warning) => warning.severity === 'warning') ? 'needsReview' : 'complete',
      message: 'Candidate analysisGraph projection generated from structural parse.',
    }),
  ];
}

function findSegmentBefore(segments: StructuralParsedSegment[], offset: number, wordIndex: number): StructuralParsedSegment | undefined {
  return segments
    .filter((segment) => segment.wordIndex === wordIndex && segment.endOffset <= offset)
    .at(-1);
}

function findSegmentAfter(segments: StructuralParsedSegment[], offset: number, wordIndex: number): StructuralParsedSegment | undefined {
  return segments.find((segment) => segment.wordIndex === wordIndex && segment.startOffset >= offset);
}

export function projectStructuralParseToAnalysisGraph(
  parseResult: StructuralParseResult,
  options: AnalysisGraphProjectionOptions = {},
): AnnotationAnalysisGraphFixture {
  const nodes: AnalysisGraphNode[] = [
    {
      id: 'token-1',
      type: 'token',
      label: options.text ?? parseResult.input,
      surfaceParts: [{ tokenId: 'token-1', startOffset: 0, endOffset: parseResult.input.length }],
    },
  ];
  const relations: AnalysisGraphRelation[] = [];
  const segmentNodeIds = new Map<string, string>();
  let relationIndex = 0;

  const addRelation = (relation: Omit<AnalysisGraphRelation, 'id'>) => {
    relations.push({ id: relationId(relationIndex), ...relation });
    relationIndex += 1;
  };

  for (const [index, segment] of parseResult.segments.entries()) {
    if (segment.kind === 'lexical' || segment.kind === 'infix') {
      const id = nodeId('morph', index);
      segmentNodeIds.set(segment.id, id);
      const node: AnalysisGraphNode = {
        id,
        type: 'morpheme',
        label: segment.text,
        surfaceParts: [surfacePartFor(segment)],
      };
      if (segment.kind === 'infix') {
        node.features = { role: 'infix' };
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

      const previousSegment = findSegmentBefore(parseResult.segments, segment.startOffset, segment.wordIndex);
      const previousNodeId = previousSegment ? segmentNodeIds.get(previousSegment.id) : undefined;
      if (previousNodeId) {
        addRelation({ type: 'glosses', sourceId: glossId, targetId: previousNodeId });
      }
      continue;
    }

    const noteId = nodeId('note', index);
    segmentNodeIds.set(segment.id, noteId);
    nodes.push({
      id: noteId,
      type: 'note',
      label: segment.text,
      surfaceParts: [surfacePartFor(segment)],
      features: { supplied: true },
    });
    addRelation({ type: 'contains', sourceId: 'token-1', targetId: noteId, role: 'supplied' });
  }

  for (const boundary of parseResult.boundaries) {
    if (boundary.type !== 'clitic') continue;
    const hostSegment = findSegmentBefore(parseResult.segments, boundary.offset, boundary.wordIndex);
    const cliticSegment = findSegmentAfter(parseResult.segments, boundary.offset, boundary.wordIndex);
    const hostNodeId = hostSegment ? segmentNodeIds.get(hostSegment.id) : undefined;
    const cliticNodeId = cliticSegment ? segmentNodeIds.get(cliticSegment.id) : undefined;
    if (hostNodeId && cliticNodeId) {
      addRelation({ type: 'cliticizesTo', sourceId: cliticNodeId, targetId: hostNodeId });
    }
  }

  const graph = {
    id: options.id ?? `candidate-${parseResult.profileId}`,
    text: options.text ?? parseResult.input,
    displayGloss: options.displayGloss ?? parseResult.input,
    nodes,
    relations,
    projectionDiagnostics: diagnosticsFromParse(parseResult),
  };

  return annotationAnalysisGraphFixtureSchema.parse(graph);
}
