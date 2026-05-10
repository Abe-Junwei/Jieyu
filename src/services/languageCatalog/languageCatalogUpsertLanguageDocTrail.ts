import type { LanguageDocType } from '../../db';
import type { UpsertLanguageDocBuildCtx } from './languageCatalogUpsertLanguageDocContext';

/** sourceType、审核态、可见性、备注与时间戳 | Trail fields for upsert */
export function upsertLanguageDocTrailFragment(
  ctx: UpsertLanguageDocBuildCtx,
): Partial<LanguageDocType> {
  const { input, existing, now, nextSourceType } = ctx;

  return {
    sourceType: nextSourceType,
    ...(input.reviewStatus
      ? { reviewStatus: input.reviewStatus }
      : existing?.reviewStatus
        ? { reviewStatus: existing.reviewStatus }
        : {}),
    visibility: input.visibility ?? existing?.visibility ?? 'visible',
    ...(input.notes ? { notes: input.notes } : existing?.notes ? { notes: existing.notes } : {}),
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
}
