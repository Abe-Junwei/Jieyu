/**
 * 语段「自我确信度」：标注者对本人转写/标注/翻译的主观把握（与 annotationStatus、provenance、模型 confidence 独立）。
 * Unit self-certainty — annotator's subjective confidence in their own work.
 */

export const UNIT_SELF_CERTAINTY_VALUES = ['not_understood', 'uncertain', 'certain'] as const;

export type UnitSelfCertainty = (typeof UNIT_SELF_CERTAINTY_VALUES)[number];

export function isUnitSelfCertainty(value: string): value is UnitSelfCertainty {
  return (UNIT_SELF_CERTAINTY_VALUES as readonly string[]).includes(value);
}

export function resolveSelfCertaintyHostUnitId(
  unitId: string,
  units: ReadonlyArray<{ id: string; startTime: number; endTime: number; mediaId?: string | undefined }>,
  options?: {
    parentUnitId?: string | undefined;
    mediaId?: string | undefined;
    startTime?: number | undefined;
    endTime?: number | undefined;
  },
): string | undefined {
  const id = unitId.trim();
  const explicitParentId = options?.parentUnitId?.trim() ?? '';
  if (explicitParentId && units.some((utt) => utt.id === explicitParentId)) {
    return explicitParentId;
  }
  if (id && units.some((utt) => utt.id === id)) {
    return id;
  }

  if (typeof options?.startTime !== 'number' || typeof options?.endTime !== 'number') {
    return undefined;
  }

  const normalizedMediaId = options.mediaId?.trim() ?? '';
  const sameMediaUnits = normalizedMediaId
    ? units.filter((utt) => (utt.mediaId?.trim() ?? '') === normalizedMediaId)
    : [];
  const mediaAgnosticUnits = normalizedMediaId
    ? units.filter((utt) => (utt.mediaId?.trim() ?? '') === '')
    : [];
  const candidateGroups = sameMediaUnits.length > 0 || mediaAgnosticUnits.length > 0
    ? [sameMediaUnits, mediaAgnosticUnits, units]
    : [units];

  const segmentCenter = (options.startTime + options.endTime) / 2;
  for (const candidates of candidateGroups) {
    let bestContaining: { id: string; span: number; centerDistance: number } | null = null;
    for (const utt of candidates) {
      const contains = utt.startTime <= options.startTime + 0.01 && utt.endTime >= options.endTime - 0.01;
      if (!contains) continue;
      const span = utt.endTime - utt.startTime;
      const centerDistance = Math.abs(((utt.startTime + utt.endTime) / 2) - segmentCenter);
      if (
        !bestContaining
        || span < bestContaining.span
        || (span === bestContaining.span && centerDistance < bestContaining.centerDistance)
      ) {
        bestContaining = { id: utt.id, span, centerDistance };
      }
    }
    if (bestContaining) return bestContaining.id;
  }

  for (const candidates of candidateGroups) {
    let bestOverlap: { id: string; overlap: number; centerDistance: number } | null = null;
    for (const utt of candidates) {
      if (utt.startTime > options.endTime - 0.01 || utt.endTime < options.startTime + 0.01) continue;
      const overlapStart = Math.max(options.startTime, utt.startTime);
      const overlapEnd = Math.min(options.endTime, utt.endTime);
      const overlap = Math.max(0, overlapEnd - overlapStart);
      const centerDistance = Math.abs(((utt.startTime + utt.endTime) / 2) - segmentCenter);
      if (
        !bestOverlap
        || overlap > bestOverlap.overlap
        || (overlap === bestOverlap.overlap && centerDistance < bestOverlap.centerDistance)
      ) {
        bestOverlap = { id: utt.id, overlap, centerDistance };
      }
    }
    if (bestOverlap) return bestOverlap.id;
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
export function resolveSelfCertaintyHostUnitIds(
  unitIds: Iterable<string>,
  units: ReadonlyArray<{ id: string; startTime: number; endTime: number; mediaId?: string | undefined }>,
  hintsByUnitId?: ReadonlyMap<string, {
    parentUnitId?: string | undefined;
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
    const resolved = resolveSelfCertaintyHostUnitId(unitId, units, hint);
    if (resolved) out.add(resolved);
  }
  return [...out];
}

export function mergeUnitSelfCertaintyConservative(
  values: Array<UnitSelfCertainty | undefined>,
): UnitSelfCertainty | undefined {
  if (values.length === 0) return undefined;
  const has = (tier: UnitSelfCertainty) => values.some((v) => v === tier);
  const hasUndefined = values.some((v) => v === undefined);
  if (has('not_understood')) return 'not_understood';
  if (has('uncertain')) return 'uncertain';
  if (has('certain') && hasUndefined) return 'uncertain';
  if (has('certain')) return 'certain';
  return undefined;
}
