import { createHash } from 'node:crypto';
import { z } from 'zod';
import { isoDateSchema, provenanceSchema } from '../db/provenanceSchema';
import { analysisGraphNodeTypeSchema, analysisGraphRelationTypeSchema } from './analysisGraph';

const idSchema = z.string().min(1).max(128);
const stringMapSchema = z.record(z.string().min(1), z.string());
const EXPERIMENTAL_KEYS = new Set(['jieyuLinear', 'jieyuProvenance', 'jieyuLexemeLink']);

const editSchema = z
  .object({
    at: isoDateSchema,
    actorType: z.enum(['human', 'ai', 'system', 'importer']),
    actorId: z.string().min(1).optional(),
    fields: z.array(z.string().min(1)).min(1),
  })
  .strict();

const domainFields = {
  form: stringMapSchema,
  index: z.number().int().nonnegative(),
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
  gloss: stringMapSchema.optional(),
  pos: z.string().min(1).optional(),
  lexemeId: z.string().min(1).optional(),
  provenance: provenanceSchema.strict().optional(),
  edits: z.array(editSchema).optional(),
};

const tokenDomainSchema = z
  .object({
    ...domainFields,
    languageId: z.string().min(1).optional(),
  })
  .strict();

const morphemeDomainSchema = z.object(domainFields).strict();

const linkSchema = z
  .object({
    lexemeId: z.string().min(1),
    senseId: z.string().min(1).optional(),
    role: z.enum(['exact', 'stem', 'gloss_candidate', 'manual']).optional(),
    confidence: z.number().finite().min(0).max(1).optional(),
    provenance: provenanceSchema.strict().optional(),
    edits: z.array(editSchema).optional(),
    createdAt: isoDateSchema,
    updatedAt: isoDateSchema,
  })
  .strict();

const surfacePartSchema = z
  .object({
    tokenId: idSchema,
    formKey: z.string().min(1),
    startOffset: z.number().int().nonnegative().optional(),
    endOffset: z.number().int().nonnegative().optional(),
    alignedForm: z.string().optional(),
  })
  .strict();

const residueSchema = z
  .object({
    id: idSchema,
    namespace: z.string().min(1),
    batchId: idSchema,
    localId: z.string().min(1),
    body: z.unknown(),
    review: z.enum(['unreviewed', 'needs-review', 'reviewed']),
    reviews: z.array(z.unknown()),
  })
  .strict()
  .superRefine((residue, ctx) => {
    if (!isJsonValue(residue.body) || !residue.reviews.every(isJsonValue)) {
      ctx.addIssue({ code: 'custom', message: 'residue is not json' });
    }
  });

const nodeSchema = z
  .object({
    id: idSchema,
    type: analysisGraphNodeTypeSchema,
    label: z.string().trim().min(1).max(256),
    domain: z.unknown().optional(),
    features: z.record(z.string(), z.unknown()).optional(),
    surfaceParts: z.array(surfacePartSchema).optional(),
    residue: z.array(residueSchema).optional(),
    customFields: z.record(z.string().min(1), z.unknown()).optional(),
  })
  .strict();

const relationSchema = z
  .object({
    id: idSchema,
    type: analysisGraphRelationTypeSchema,
    sourceId: idSchema,
    targetId: idSchema,
    role: z.string().trim().min(1).max(64).optional(),
    features: z.record(z.string(), z.unknown()).optional(),
    link: z.unknown().optional(),
    customFields: z.record(z.string().min(1), z.unknown()).optional(),
  })
  .strict();

const displayContextSchema = z
  .object({
    formKey: z.string().min(1).optional(),
    glossKey: z.string().min(1).optional(),
  })
  .strict();

const payloadSchema = z
  .object({
    payloadVersion: z.number(),
    id: idSchema,
    text: z.string(),
    nodes: z.array(nodeSchema),
    relations: z.array(relationSchema),
    displayContext: displayContextSchema.optional(),
  })
  .strict();

export type AnalysisGraphDomain = z.infer<typeof tokenDomainSchema>;
export type AnalysisGraphLink = z.infer<typeof linkSchema>;
export type AnalysisGraphSurfacePart = z.infer<typeof surfacePartSchema>;
export type AnalysisResidue = z.infer<typeof residueSchema>;
type ParsedNode = z.infer<typeof nodeSchema>;
type ParsedRelation = z.infer<typeof relationSchema>;

export interface AnalysisGraphNode {
  id: string;
  type: ParsedNode['type'];
  label: string;
  domain?: AnalysisGraphDomain | undefined;
  features?: Record<string, unknown> | undefined;
  surfaceParts?: AnalysisGraphSurfacePart[] | undefined;
  residue?: AnalysisResidue[] | undefined;
  customFields?: Record<string, unknown> | undefined;
}

export interface AnalysisGraphRelation {
  id: string;
  type: ParsedRelation['type'];
  sourceId: string;
  targetId: string;
  role?: string | undefined;
  features?: Record<string, unknown> | undefined;
  link?: AnalysisGraphLink | undefined;
  customFields?: Record<string, unknown> | undefined;
}

export interface AnalysisGraphPayload {
  payloadVersion: 1;
  id: string;
  text: string;
  nodes: AnalysisGraphNode[];
  relations: AnalysisGraphRelation[];
  displayContext?: { formKey?: string | undefined; glossKey?: string | undefined } | undefined;
}

const FINGERPRINT_EXCLUDED = new Set(['displayContext', 'displayGloss', 'projectionDiagnostics']);

/** Stale means the span still describes another form. Export must not treat it as verified alignment. */
export function surfacePartAlignment(
  graph: AnalysisGraphPayload,
  part: AnalysisGraphSurfacePart,
): 'aligned' | 'stale' {
  const displayKey = graph.displayContext?.formKey;
  if (displayKey === undefined || displayKey === part.formKey) return 'aligned';
  const token = graph.nodes.find((node) => node.id === part.tokenId);
  const displayed = token?.domain?.form[displayKey];
  if (
    displayed === undefined ||
    part.startOffset === undefined ||
    part.endOffset === undefined ||
    part.alignedForm === undefined
  ) {
    return 'stale';
  }
  return part.alignedForm === displayed.slice(part.startOffset, part.endOffset)
    ? 'aligned'
    : 'stale';
}

export function analysisGraphFingerprint(graph: unknown): string {
  if (graph === null || graph === undefined) return '';
  if (typeof graph !== 'object' || Array.isArray(graph)) {
    throw new Error('analysis graph fingerprint input is not an object');
  }
  const copy: Record<string, unknown> = { ...(graph as Record<string, unknown>) };
  for (const key of FINGERPRINT_EXCLUDED) delete copy[key];
  if (Array.isArray(copy.nodes)) copy.nodes = [...copy.nodes].sort(compareId);
  if (Array.isArray(copy.relations)) copy.relations = [...copy.relations].sort(compareId);
  return createHash('sha256')
    .update(JSON.stringify(canonicalize(copy)))
    .digest('hex');
}

export function validateAnalysisGraphPayload(
  input: unknown,
  unitText: string,
): AnalysisGraphPayload {
  const parsed = payloadSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? 'analysis payload is invalid');
  }
  const graph = parsed.data;
  if (graph.payloadVersion !== 1) throw new Error('unknown analysis payload version');
  if (graph.text !== unitText) throw new Error('analysis text does not match the unit text');

  const nodes = new Map<string, AnalysisGraphNode>();
  for (const node of graph.nodes) {
    if (nodes.has(node.id)) throw new Error(`duplicate node id: ${node.id}`);
    nodes.set(node.id, acceptNode(node));
  }
  const relations: AnalysisGraphRelation[] = [];
  const relationIds = new Set<string>();
  for (const relation of graph.relations) {
    if (relationIds.has(relation.id)) throw new Error(`duplicate relation id: ${relation.id}`);
    relationIds.add(relation.id);
    relations.push(acceptRelation(relation, nodes));
  }
  for (const node of nodes.values()) acceptSurfaceParts(node, nodes);

  return {
    payloadVersion: 1,
    id: graph.id,
    text: graph.text,
    nodes: [...nodes.values()],
    relations,
    ...(graph.displayContext ? { displayContext: graph.displayContext } : {}),
  };
}

function acceptNode(node: ParsedNode): AnalysisGraphNode {
  const experimental = experimentalKey(node.features);
  if (experimental !== null) throw new Error(`experimental key ${experimental}`);
  if (node.type === 'token' || node.type === 'morpheme') {
    if (node.domain === undefined) throw new Error(`${node.type} domain is missing`);
    const schema = node.type === 'token' ? tokenDomainSchema : morphemeDomainSchema;
    const domain = schema.safeParse(node.domain);
    if (!domain.success) throw new Error(`${node.type} domain is invalid`);
    return { ...node, domain: domain.data };
  }
  if (node.domain !== undefined) throw new Error('domain is only valid on a token or morpheme');
  return node as AnalysisGraphNode;
}

function acceptRelation(
  relation: ParsedRelation,
  nodes: ReadonlyMap<string, AnalysisGraphNode>,
): AnalysisGraphRelation {
  const experimental = experimentalKey(relation.features);
  if (experimental !== null) throw new Error(`experimental key ${experimental}`);
  const source = nodes.get(relation.sourceId);
  const target = nodes.get(relation.targetId);
  if (!source) throw new Error(`relation source does not exist: ${relation.sourceId}`);
  if (!target) throw new Error(`relation target does not exist: ${relation.targetId}`);
  if (relation.type === 'linksLexeme') {
    const link = linkSchema.safeParse(relation.link);
    if (!link.success) throw new Error('lexeme link is invalid');
    if (target.type !== 'lexemeRef')
      throw new Error('lexeme link target is not a lexeme reference');
    return { ...relation, link: link.data };
  }
  if (relation.link !== undefined) throw new Error('link is only valid on linksLexeme');
  return relation as AnalysisGraphRelation;
}

function acceptSurfaceParts(
  node: AnalysisGraphNode,
  nodes: ReadonlyMap<string, AnalysisGraphNode>,
): void {
  for (const part of node.surfaceParts ?? []) {
    const token = nodes.get(part.tokenId);
    if (!token || token.type !== 'token' || !token.domain) {
      throw new Error('surface part token is missing');
    }
    const form = token.domain.form[part.formKey];
    if (form === undefined) throw new Error('surface part form is missing');
    const hasStart = part.startOffset !== undefined;
    const hasEnd = part.endOffset !== undefined;
    if (hasStart !== hasEnd) throw new Error('surface part offsets must be paired');
    if (!hasStart) {
      if (part.alignedForm !== undefined) throw new Error('surface part alignment is incomplete');
      continue;
    }
    const start = part.startOffset ?? 0;
    const end = part.endOffset ?? 0;
    if (end <= start || end > form.length || part.alignedForm !== form.slice(start, end)) {
      throw new Error('surface part is not aligned');
    }
  }
}

function isJsonValue(value: unknown): boolean {
  if (value === null) return true;
  if (typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(isJsonValue);
  if (typeof value === 'object') return Object.values(value).every(isJsonValue);
  return false;
}

function experimentalKey(features: Record<string, unknown> | undefined): string | null {
  return findExperimentalKey(features);
}

function findExperimentalKey(value: unknown): string | null {
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findExperimentalKey(item);
      if (found !== null) return found;
    }
    return null;
  }
  if (typeof value !== 'object' || value === null) return null;
  for (const [key, child] of Object.entries(value)) {
    if (EXPERIMENTAL_KEYS.has(key)) return key;
    const found = findExperimentalKey(child);
    if (found !== null) return found;
  }
  return null;
}

function compareId(left: unknown, right: unknown): number {
  const a = idOf(left);
  const b = idOf(right);
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

function idOf(value: unknown): string {
  if (
    typeof value === 'object' &&
    value !== null &&
    'id' in value &&
    typeof value.id === 'string'
  ) {
    return value.id;
  }
  return '';
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (typeof value === 'object' && value !== null) {
    const source = value as Record<string, unknown>;
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(source).sort()) result[key] = canonicalize(source[key]);
    return result;
  }
  return value;
}
