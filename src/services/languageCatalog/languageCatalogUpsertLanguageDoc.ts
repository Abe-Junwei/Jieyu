import type { LanguageCatalogSourceType, LanguageDocType } from '../../db';
import type { UpsertLanguageCatalogEntryInput } from './languageCatalogTypes';
import * as lcNorm from './languageCatalogCoreNormalization';
import type { UpsertPreparedFields } from './languageCatalogUpsertPrep';
import type { UpsertLanguageDocBuildCtx } from './languageCatalogUpsertLanguageDocContext';
import { upsertLanguageDocExtendedFragment } from './languageCatalogUpsertLanguageDocExtended';
import { upsertLanguageDocIdentityFragment } from './languageCatalogUpsertLanguageDocIdentity';
import { upsertLanguageDocTrailFragment } from './languageCatalogUpsertLanguageDocTrail';

export function buildUpsertLanguageDocForCatalog(params: {
  input: UpsertLanguageCatalogEntryInput;
  existing: LanguageDocType | undefined;
  languageId: string;
  now: string;
  nextSourceType: LanguageCatalogSourceType;
  p: UpsertPreparedFields;
}): LanguageDocType {
  const { input, existing, languageId, now, nextSourceType, p } = params;
  const { mergedName, normIso6393 } = p;

  const ctx: UpsertLanguageDocBuildCtx = {
    input,
    existing,
    languageId,
    now,
    nextSourceType,
    p,
  };

  // 分片均为 Partial 合并；`trail` 含 `createdAt`/`updatedAt`，运行时与原先单对象一致 | Fragments are Partial merges; trail supplies timestamps (exactOptionalPropertyTypes needs assertion).
  return {
    id: languageId,
    name: mergedName,
    languageCode: lcNorm.normalizeOptionalValue(input.languageCode) ?? normIso6393 ?? languageId,
    ...upsertLanguageDocIdentityFragment(ctx),
    ...upsertLanguageDocExtendedFragment(ctx),
    ...upsertLanguageDocTrailFragment(ctx),
  } as LanguageDocType;
}
