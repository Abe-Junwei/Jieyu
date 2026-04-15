/**
 * 语段「自我确信度」：标注者对本人转写/标注/翻译的主观把握（与 annotationStatus、provenance、模型 confidence 独立）。
 * Utterance self-certainty — annotator's subjective confidence in their own work.
 */

export const UTTERANCE_SELF_CERTAINTY_VALUES = ['not_understood', 'uncertain', 'certain'] as const;

export type UtteranceSelfCertainty = (typeof UTTERANCE_SELF_CERTAINTY_VALUES)[number];

export function isUtteranceSelfCertainty(value: string): value is UtteranceSelfCertainty {
  return (UTTERANCE_SELF_CERTAINTY_VALUES as readonly string[]).includes(value);
}

export function resolveSelfCertaintyHostUtteranceId(
  unitId: string,
  utterances: ReadonlyArray<{ id: string; startTime: number; endTime: number; mediaId?: string | undefined }>,
  options?: {
    parentUtteranceId?: string | undefined;
    mediaId?: string | undefined;
    startTime?: number | undefined;
    endTime?: number | undefined;
  },
): string | undefined {
  const id = unitId.trim();
  const explicitParentId = options?.parentUtteranceId?.trim() ?? '';
  if (explicitParentId && utterances.some((utt) => utt.id === explicitParentId)) {
    return explicitParentId;
  }
  if (id && utterances.some((utt) => utt.id === id)) {
    return id;
  }

  if (typeof options?.startTime !== 'number' || typeof options?.endTime !== 'number') {
    return undefined;
  }

  const normalizedMediaId = options.mediaId?.trim() ?? '';
  const sameMediaUtterances = normalizedMediaId
    ? utterances.filter((utt) => (utt.mediaId?.trim() ?? '') === normalizedMediaId)
    : [];
  const mediaAgnosticUtterances = normalizedMediaId
    ? utterances.filter((utt) => (utt.mediaId?.trim() ?? '') === '')
    : [];
  const candidateGroups = sameMediaUtterances.length > 0 || mediaAgnosticUtterances.length > 0
    ? [sameMediaUtterances, mediaAgnosticUtterances, utterances]
    : [utterances];

  for (const candidates of candidateGroups) {
    const containing = candidates.find(
      (utt) => utt.startTime <= options.startTime! + 0.01 && utt.endTime >= options.endTime! - 0.01,
    );
    if (containing) return containing.id;
  }

  for (const candidates of candidateGroups) {
    const overlapping = candidates.find(
      (utt) => utt.startTime <= options.endTime! - 0.01 && utt.endTime >= options.startTime! + 0.01,
    );
    if (overlapping) return overlapping.id;
  }
  return undefined;
}

/**
 * 合并多条句段时取「更保守」的确信度：
 * - 任一为「不理解」→ 不理解
 * - 否则任一为「不确定」→ 不确定
 * - 否则若同时存在「确定」与未标记（undefined）→ 不确定（未标视为信息不完整）
 * - 否则若存在「确定」→ 确定
 * - 否则（全部未标）→ 无标记
 */
export function resolveSelfCertaintyHostUtteranceIds(
  unitIds: Iterable<string>,
  utterances: ReadonlyArray<{ id: string; startTime: number; endTime: number; mediaId?: string | undefined }>,
  hintsByUnitId?: ReadonlyMap<string, {
    parentUtteranceId?: string | undefined;
    mediaId?: string | undefined;
    startTime?: number | undefined;
    endTime?: number | undefined;
  }>,
): string[] {
  const out = new Set<string>();
  for (const rawId of unitIds) {
    const unitId = rawId.trim();
    if (!unitId) continue;
    const hint = hintsByUnitId?.get(unitId);
    const resolved = resolveSelfCertaintyHostUtteranceId(unitId, utterances, hint);
    if (resolved) out.add(resolved);
  }
  return [...out];
}

export function mergeUtteranceSelfCertaintyConservative(
  values: Array<UtteranceSelfCertainty | undefined>,
): UtteranceSelfCertainty | undefined {
  if (values.length === 0) return undefined;
  const has = (tier: UtteranceSelfCertainty) => values.some((v) => v === tier);
  const hasUndefined = values.some((v) => v === undefined);
  if (has('not_understood')) return 'not_understood';
  if (has('uncertain')) return 'uncertain';
  if (has('certain') && hasUndefined) return 'uncertain';
  if (has('certain')) return 'certain';
  return undefined;
}
