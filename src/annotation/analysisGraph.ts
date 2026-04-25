import { z } from 'zod';

export const analysisGraphNodeTypeSchema = z.enum([
  'token',
  'word',
  'morpheme',
  'zero',
  'mwe',
  'root',
  'pattern',
  'gloss',
  'pos',
  'note',
  'exponent',
  'featureBundle',
  'process',
  'underlyingForm',
  'surfaceForm',
  'prosodicFeature',
  'lexemeRef',
]);

export const analysisGraphRelationTypeSchema = z.enum([
  'glosses',
  'hasPos',
  'linksLexeme',
  'contains',
  'cliticizesTo',
  'partOfMwe',
  'discontinuousPartOf',
  'alternativeAnalysis',
  'reduplicates',
  'realizesFeature',
  'hasUnderlyingForm',
  'hasSurfaceForm',
  'derivedByProcess',
  'hasAllomorph',
  'suppletes',
  'deletesSegment',
  'substitutesSegment',
  'overwritesTone',
  'dependsOn',
  'corefersTo',
]);

export const analysisGraphProjectionTargetSchema = z.enum([
  'conllu',
  'flex',
  'lift',
  'elan',
  'latex',
]);

export const analysisGraphProjectionStatusSchema = z.enum([
  'complete',
  'degraded',
  'unsupported',
  'needsReview',
]);

const idSchema = z.string().trim().min(1).max(128);
const featureRecordSchema = z.record(z.string(), z.unknown());

export const analysisGraphSurfacePartSchema = z.object({
  tokenId: idSchema,
  startOffset: z.number().int().nonnegative().optional(),
  endOffset: z.number().int().nonnegative().optional(),
}).strict().superRefine((part, ctx) => {
  const startOffset = part.startOffset;
  const endOffset = part.endOffset;
  const hasStart = typeof startOffset === 'number';
  const hasEnd = typeof endOffset === 'number';
  if (hasStart !== hasEnd) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'startOffset and endOffset must be provided together',
    });
  }
  if (hasStart && hasEnd && endOffset <= startOffset) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'endOffset must be greater than startOffset',
    });
  }
});

export const analysisGraphNodeSchema = z.object({
  id: idSchema,
  type: analysisGraphNodeTypeSchema,
  label: z.string().trim().min(1).max(256),
  surfaceParts: z.array(analysisGraphSurfacePartSchema).optional(),
  features: featureRecordSchema.optional(),
}).strict();

export const analysisGraphRelationSchema = z.object({
  id: idSchema,
  type: analysisGraphRelationTypeSchema,
  sourceId: idSchema,
  targetId: idSchema,
  role: z.string().trim().min(1).max(64).optional(),
  features: featureRecordSchema.optional(),
}).strict();

export const projectionDiagnosticSchema = z.object({
  target: analysisGraphProjectionTargetSchema,
  status: analysisGraphProjectionStatusSchema,
  message: z.string().trim().min(1).max(500),
}).strict();

export const annotationAnalysisGraphFixtureSchema = z.object({
  id: idSchema,
  text: z.string().trim().min(1),
  displayGloss: z.string().trim().min(1),
  nodes: z.array(analysisGraphNodeSchema).min(1),
  relations: z.array(analysisGraphRelationSchema),
  projectionDiagnostics: z.array(projectionDiagnosticSchema).min(1),
}).strict().superRefine((graph, ctx) => {
  const nodeIds = new Set<string>();
  const relationIds = new Set<string>();
  for (const [index, node] of graph.nodes.entries()) {
    if (nodeIds.has(node.id)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['nodes', index, 'id'],
        message: `duplicate node id: ${node.id}`,
      });
    }
    nodeIds.add(node.id);
  }
  for (const [index, relation] of graph.relations.entries()) {
    if (relationIds.has(relation.id)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['relations', index, 'id'],
        message: `duplicate relation id: ${relation.id}`,
      });
    }
    relationIds.add(relation.id);
    if (!nodeIds.has(relation.sourceId)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['relations', index, 'sourceId'],
        message: `relation source does not exist: ${relation.sourceId}`,
      });
    }
    if (!nodeIds.has(relation.targetId)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['relations', index, 'targetId'],
        message: `relation target does not exist: ${relation.targetId}`,
      });
    }
  }
});

export type AnalysisGraphNodeType = z.infer<typeof analysisGraphNodeTypeSchema>;
export type AnalysisGraphRelationType = z.infer<typeof analysisGraphRelationTypeSchema>;
export type AnalysisGraphProjectionTarget = z.infer<typeof analysisGraphProjectionTargetSchema>;
export type AnalysisGraphProjectionStatus = z.infer<typeof analysisGraphProjectionStatusSchema>;
export type AnalysisGraphSurfacePart = z.infer<typeof analysisGraphSurfacePartSchema>;
export type AnalysisGraphNode = z.infer<typeof analysisGraphNodeSchema>;
export type AnalysisGraphRelation = z.infer<typeof analysisGraphRelationSchema>;
export type ProjectionDiagnostic = z.infer<typeof projectionDiagnosticSchema>;
export type AnnotationAnalysisGraphFixture = z.infer<typeof annotationAnalysisGraphFixtureSchema>;

export type ProjectionDiagnosticSummary = {
  total: number;
  byStatus: Record<AnalysisGraphProjectionStatus, number>;
  blockingCount: number;
};

export function summarizeProjectionDiagnostics(
  diagnostics: ProjectionDiagnostic[],
): ProjectionDiagnosticSummary {
  const byStatus: Record<AnalysisGraphProjectionStatus, number> = {
    complete: 0,
    degraded: 0,
    unsupported: 0,
    needsReview: 0,
  };
  for (const diagnostic of diagnostics) {
    byStatus[diagnostic.status] += 1;
  }
  return {
    total: diagnostics.length,
    byStatus,
    blockingCount: byStatus.unsupported + byStatus.needsReview,
  };
}

export function validateAnnotationAnalysisGraphFixture(
  input: unknown,
): AnnotationAnalysisGraphFixture {
  return annotationAnalysisGraphFixtureSchema.parse(input);
}
