import type {
  ActorType,
  CreationMethod,
  ProvenanceEnvelope,
  ReviewStatus,
  TierAnnotationDocType,
  UserNoteDocType,
  UtteranceDocType,
  UtteranceTextDocType,
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
  return {
    actorType: input?.actorType ?? 'human',
    method: input?.method ?? 'manual',
    createdAt: now,
    ...(input?.actorId ? { actorId: input.actorId } : {}),
    ...(input?.taskId ? { taskId: input.taskId } : {}),
    ...(input?.model ? { model: input.model } : {}),
    ...(input?.modelVersion ? { modelVersion: input.modelVersion } : {}),
    ...(typeof input?.confidence === 'number' ? { confidence: input.confidence } : {}),
    ...(input?.updatedAt ? { updatedAt: input.updatedAt } : {}),
    ...(input?.reviewStatus ? { reviewStatus: input.reviewStatus } : {}),
    ...(input?.reviewedBy ? { reviewedBy: input.reviewedBy } : {}),
    ...(input?.reviewedAt ? { reviewedAt: input.reviewedAt } : {}),
  };
}

export function normalizeUtteranceDocForStorage(doc: UtteranceDocType): UtteranceDocType {
  return { ...doc };
}

export function normalizeUtteranceTextDocForStorage(
  doc: UtteranceTextDocType,
  defaults?: ProvenanceInput,
): UtteranceTextDocType {
  const defaultProvenance = createDefaultProvenance({
    actorType: doc.sourceType === 'ai' ? 'ai' : (defaults?.actorType ?? 'human'),
    method: defaults?.method ?? (doc.sourceType === 'ai' ? 'auto-transcription' : 'manual'),
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    ...(typeof doc.ai_metadata?.confidence === 'number'
      ? { confidence: doc.ai_metadata.confidence }
      : {}),
    ...(doc.ai_metadata?.model ? { model: doc.ai_metadata.model } : {}),
    ...(defaults?.modelVersion ? { modelVersion: defaults.modelVersion } : {}),
    ...(defaults?.reviewStatus ? { reviewStatus: defaults.reviewStatus } : {}),
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
  const defaultProvenance = createDefaultProvenance({
    actorType: defaults?.actorType ?? 'human',
    method: defaults?.method ?? 'manual',
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    ...(typeof doc.ai_metadata?.confidence === 'number'
      ? { confidence: doc.ai_metadata.confidence }
      : {}),
    ...(doc.ai_metadata?.model ? { model: doc.ai_metadata.model } : {}),
    ...(doc.isVerified
      ? { reviewStatus: 'confirmed' as const }
      : (defaults?.reviewStatus ? { reviewStatus: defaults.reviewStatus } : {})),
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
  const defaultProvenance = createDefaultProvenance({
    actorType: defaults?.actorType ?? 'human',
    method: defaults?.method ?? 'manual',
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    ...(defaults?.reviewStatus ? { reviewStatus: defaults.reviewStatus } : {}),
  });

  return {
    ...doc,
    provenance: doc.provenance ?? defaultProvenance,
  };
}

// ── Unicode NFC 归一化 | Unicode NFC normalization ───────────

/**
 * 存储前归一化：NFC + 去除零宽字符 | Normalize for storage: NFC + strip zero-width chars
 */
export function normalizeTextForStorage(text: string): string {
  return text.normalize('NFC').replace(/[\u200B\u200C\u200D\uFEFF]/g, '');
}

/**
 * 搜索前归一化：NFC + 折叠变体选择符 | Normalize for search: NFC + fold variation selectors
 */
export function normalizeTextForSearch(text: string): string {
  return text.normalize('NFC').replace(/[\uFE00-\uFE0F\u200B-\u200D\uFEFF]/g, '');
}
