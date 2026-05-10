import type { LanguageDocType } from '../../db';
import * as lcNorm from './languageCatalogCoreNormalization';
import type { UpsertLanguageDocBuildCtx } from './languageCatalogUpsertLanguageDocContext';

/** ISO / Glottolog / Wikidata、分类树、坐标、语言类型等「身份与分类」字段 | Identity & taxonomy merge for upsert */
export function upsertLanguageDocIdentityFragment(
  ctx: UpsertLanguageDocBuildCtx,
): Partial<LanguageDocType> {
  const { input, existing, p } = ctx;
  const {
    hasNativeName,
    hasCanonicalTag,
    hasIso6391,
    hasIso6392B,
    hasIso6392T,
    hasIso6393,
    hasGlottocode,
    hasWikidataId,
    hasScope,
    hasMacrolanguage,
    hasGenus,
    hasClassificationPath,
    hasModality,
    hasLatitude,
    hasLongitude,
    hasLanguageType,
    normCanonicalTag,
    normIso6391,
    normIso6392B,
    normIso6392T,
    normIso6393,
    normGlottocode,
    normWikidataId,
    normMacrolanguage,
    normGenus,
    normSubfamily,
    normBranch,
    normClassificationPath,
    isoSeed,
    nativeName,
  } = p;

  return {
    ...(!hasCanonicalTag && existing?.canonicalTag ? { canonicalTag: existing.canonicalTag } : {}),
    ...(hasCanonicalTag && normCanonicalTag ? { canonicalTag: normCanonicalTag } : {}),
    ...(!hasIso6391 && existing?.iso6391 ? { iso6391: existing.iso6391 } : {}),
    ...(hasIso6391 && normIso6391 ? { iso6391: normIso6391 } : {}),
    ...(!hasIso6392B && existing?.iso6392B ? { iso6392B: existing.iso6392B } : {}),
    ...(hasIso6392B && normIso6392B ? { iso6392B: normIso6392B } : {}),
    ...(!hasIso6392T && existing?.iso6392T ? { iso6392T: existing.iso6392T } : {}),
    ...(hasIso6392T && normIso6392T ? { iso6392T: normIso6392T } : {}),
    ...(!hasIso6393 && existing?.iso6393 ? { iso6393: existing.iso6393 } : {}),
    ...(hasIso6393 && normIso6393 ? { iso6393: normIso6393 } : {}),
    ...(!hasNativeName && existing?.autonym ? { autonym: existing.autonym } : {}),
    ...(hasNativeName && nativeName ? { autonym: nativeName } : {}),
    ...(!hasGlottocode && existing?.glottocode ? { glottocode: existing.glottocode } : {}),
    ...(hasGlottocode && normGlottocode ? { glottocode: normGlottocode } : {}),
    ...(!hasWikidataId && existing?.wikidataId ? { wikidataId: existing.wikidataId } : {}),
    ...(hasWikidataId && normWikidataId ? { wikidataId: normWikidataId } : {}),
    ...(!hasScope && existing?.scope ? { scope: existing.scope } : {}),
    ...(hasScope && (input.scope ?? isoSeed?.scope)
      ? { scope: (input.scope ?? isoSeed!.scope) as NonNullable<LanguageDocType['scope']> }
      : {}),
    ...(!hasMacrolanguage && existing?.macrolanguage
      ? { macrolanguage: existing.macrolanguage }
      : {}),
    ...(hasMacrolanguage && normMacrolanguage ? { macrolanguage: normMacrolanguage } : {}),
    ...(!hasGenus && existing?.genus ? { genus: existing.genus } : {}),
    ...(hasGenus && normGenus ? { genus: normGenus } : {}),
    ...(lcNorm.hasOwnField(input, 'subfamily')
      ? normSubfamily
        ? { subfamily: normSubfamily }
        : {}
      : existing?.subfamily
        ? { subfamily: existing.subfamily }
        : {}),
    ...(lcNorm.hasOwnField(input, 'branch')
      ? normBranch
        ? { branch: normBranch }
        : {}
      : existing?.branch
        ? { branch: existing.branch }
        : {}),
    ...(!hasClassificationPath && existing?.classificationPath
      ? { classificationPath: existing.classificationPath }
      : {}),
    ...(hasClassificationPath && normClassificationPath
      ? { classificationPath: normClassificationPath }
      : {}),
    ...(!hasModality && existing?.modality ? { modality: existing.modality } : {}),
    ...(hasModality ? (input.modality ? { modality: input.modality } : {}) : {}),
    ...(!hasLatitude && existing?.latitude !== undefined ? { latitude: existing.latitude } : {}),
    ...(hasLatitude ? (input.latitude !== undefined ? { latitude: input.latitude } : {}) : {}),
    ...(!hasLongitude && existing?.longitude !== undefined
      ? { longitude: existing.longitude }
      : {}),
    ...(hasLongitude ? (input.longitude !== undefined ? { longitude: input.longitude } : {}) : {}),
    ...(!hasLanguageType && existing?.languageType ? { languageType: existing.languageType } : {}),
    ...(hasLanguageType
      ? (input.languageType ?? isoSeed?.type)
        ? {
            languageType: (input.languageType ?? isoSeed!.type) as NonNullable<
              LanguageDocType['languageType']
            >,
          }
        : {}
      : {}),
  };
}
