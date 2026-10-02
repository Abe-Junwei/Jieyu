import type { ActorType, CreationMethod, ProvenanceEnvelope, ReviewStatus } from '../db';

const PROVENANCE_ACTOR_TYPES = new Set<ActorType>(['human', 'ai', 'system', 'importer']);

const PROVENANCE_METHODS = new Set<CreationMethod>([
  'manual',
  'import',
  'auto-segmentation',
  'auto-transcription',
  'auto-gloss',
  'alignment',
  'projection',
  'merge',
  'split',
  'migration',
]);

const PROVENANCE_REVIEW_STATUSES = new Set<ReviewStatus>([
  'draft',
  'suggested',
  'confirmed',
  'rejected',
]);

function readRecord(value: unknown): Record<string, unknown> | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function readText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/** undefined = absent. null = present but malformed, so callers must not treat it as usable. */
export function readProvenance(value: unknown): ProvenanceEnvelope | undefined | null {
  if (value === undefined) return undefined;
  const record = readRecord(value);
  if (!record) return null;
  const actorType = readText(record.actorType);
  const method = readText(record.method);
  const createdAt = readText(record.createdAt);
  if (
    !PROVENANCE_ACTOR_TYPES.has(actorType as ActorType) ||
    !PROVENANCE_METHODS.has(method as CreationMethod) ||
    createdAt.length === 0
  ) {
    return null;
  }
  const reviewStatus = readText(record.reviewStatus);
  if (reviewStatus.length > 0 && !PROVENANCE_REVIEW_STATUSES.has(reviewStatus as ReviewStatus)) {
    return null;
  }
  const provenance: ProvenanceEnvelope = {
    actorType: actorType as ActorType,
    method: method as CreationMethod,
    createdAt,
    ...(reviewStatus.length > 0 ? { reviewStatus: reviewStatus as ReviewStatus } : {}),
  };
  const stringKeys = [
    'actorId',
    'taskId',
    'model',
    'modelVersion',
    'updatedAt',
    'reviewedBy',
    'reviewedAt',
  ] as const;
  for (const key of stringKeys) {
    const text = readText(record[key]);
    if (text.length > 0) provenance[key] = text;
  }
  const confidence = record.confidence;
  if (typeof confidence === 'number' && Number.isFinite(confidence)) {
    provenance.confidence = confidence;
  }
  return provenance;
}
