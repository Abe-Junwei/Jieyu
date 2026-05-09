import type {
  ActorType,
  CreationMethod,
  ProvenanceEnvelope,
  ReviewStatus,
  TierAnnotationDocType,
  UserNoteDocType,
  LayerUnitDocType,
  LayerUnitContentDocType,
} from '../db';

type ProvenanceInput = Partial<ProvenanceEnvelope> & {
  actorType?: ActorType;
  method?: CreationMethod;
  reviewStatus?: ReviewStatus;
};

// ── M1 Write Contract Guards ──────────────────────────────────────────

/**
 * Throws if `id` is missing or empty — prevents index-only positioning
 * for entities that require stable identity (tokens, morphemes, links, notes).
 */
export function assertStableId(id: string | undefined, label: string): asserts id is string {
  if (typeof id !== 'string' || id.length === 0) {
    throw new Error(`[WriteContract] ${label} 缺少稳定 id，禁止 index-only 定位`);
  }
}

/**
 * Prevent AI from overwriting a confirmed object.
 * If the existing record has `reviewStatus === 'confirmed'` and the
 * incoming write is from an AI actor, the write is blocked.
 */
export function assertReviewProtection(
  existingReviewStatus: ReviewStatus | undefined,
  incomingActorType: ActorType,
): void {
  if (existingReviewStatus === 'confirmed' && incomingActorType === 'ai') {
    throw new Error('[WriteContract] confirmed 对象禁止被 AI 直接覆盖，需先降级或创建新候选');
  }
}

export function createDefaultProvenance(input?: ProvenanceInput): ProvenanceEnvelope {
  const now = input?.createdAt ?? new Date().toISOString();
  const actorId = input?.actorId;
  const taskId = input?.taskId;
  const model = input?.model;
  const modelVersion = input?.modelVersion;
  const updatedAt = input?.updatedAt;
  const reviewStatus = input?.reviewStatus;
  const reviewedBy = input?.reviewedBy;
  const reviewedAt = input?.reviewedAt;
  return {
    actorType: input?.actorType ?? 'human',
    method: input?.method ?? 'manual',
    createdAt: now,
    ...(actorId !== undefined && actorId.length > 0 ? { actorId } : {}),
    ...(taskId !== undefined && taskId.length > 0 ? { taskId } : {}),
    ...(model !== undefined && model.length > 0 ? { model } : {}),
    ...(modelVersion !== undefined && modelVersion.length > 0 ? { modelVersion } : {}),
    ...(typeof input?.confidence === 'number' ? { confidence: input.confidence } : {}),
    ...(updatedAt !== undefined && updatedAt.length > 0 ? { updatedAt } : {}),
    ...(reviewStatus !== undefined ? { reviewStatus } : {}),
    ...(reviewedBy !== undefined && reviewedBy.length > 0 ? { reviewedBy } : {}),
    ...(reviewedAt !== undefined && reviewedAt.length > 0 ? { reviewedAt } : {}),
  };
}

export function normalizeUnitDocForStorage(doc: LayerUnitDocType): LayerUnitDocType {
  return { ...doc };
}

export function normalizeUnitTextDocForStorage(
  doc: LayerUnitContentDocType,
  defaults?: ProvenanceInput,
): LayerUnitContentDocType {
  const aiModel = doc.ai_metadata?.model;
  const defaultModelVersion = defaults?.modelVersion;
  const defaultReviewStatus = defaults?.reviewStatus;
  const defaultProvenance = createDefaultProvenance({
    actorType: doc.sourceType === 'ai' ? 'ai' : (defaults?.actorType ?? 'human'),
    method: defaults?.method ?? (doc.sourceType === 'ai' ? 'auto-transcription' : 'manual'),
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    ...(typeof doc.ai_metadata?.confidence === 'number'
      ? { confidence: doc.ai_metadata.confidence }
      : {}),
    ...(aiModel !== undefined && aiModel.length > 0 ? { model: aiModel } : {}),
    ...(defaultModelVersion !== undefined && defaultModelVersion.length > 0
      ? { modelVersion: defaultModelVersion }
      : {}),
    ...(defaultReviewStatus !== undefined ? { reviewStatus: defaultReviewStatus } : {}),
  });

  return {
    ...doc,
    provenance: doc.provenance ?? defaultProvenance,
  };
}

export function normalizeTierAnnotationDocForStorage(
  doc: TierAnnotationDocType,
  defaults?: ProvenanceInput,
): TierAnnotationDocType {
  const aiModel = doc.ai_metadata?.model;
  const defaultReviewStatus = defaults?.reviewStatus;
  const defaultProvenance = createDefaultProvenance({
    actorType: defaults?.actorType ?? 'human',
    method: defaults?.method ?? 'manual',
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    ...(typeof doc.ai_metadata?.confidence === 'number'
      ? { confidence: doc.ai_metadata.confidence }
      : {}),
    ...(aiModel !== undefined && aiModel.length > 0 ? { model: aiModel } : {}),
    ...(doc.isVerified === true
      ? { reviewStatus: 'confirmed' as const }
      : defaultReviewStatus !== undefined
        ? { reviewStatus: defaultReviewStatus }
        : {}),
  });

  return {
    ...doc,
    provenance: doc.provenance ?? defaultProvenance,
  };
}

export function normalizeUserNoteDocForStorage(
  doc: UserNoteDocType,
  defaults?: ProvenanceInput,
): UserNoteDocType {
  const defaultReviewStatus = defaults?.reviewStatus;
  const defaultProvenance = createDefaultProvenance({
    actorType: defaults?.actorType ?? 'human',
    method: defaults?.method ?? 'manual',
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    ...(defaultReviewStatus !== undefined ? { reviewStatus: defaultReviewStatus } : {}),
  });

  return {
    ...doc,
    provenance: doc.provenance ?? defaultProvenance,
  };
}
