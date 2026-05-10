import type { LanguageDocType } from '../../db';
import * as lcNorm from './languageCatalogCoreNormalization';
import type { UpsertLanguageDocBuildCtx } from './languageCatalogUpsertLanguageDocContext';

/** 濒危、人口、地理、方言与自定义字段等扩展元数据 | Extended metadata merge for upsert */
export function upsertLanguageDocExtendedFragment(
  ctx: UpsertLanguageDocBuildCtx,
): Partial<LanguageDocType> {
  const { input, existing } = ctx;

  return {
    ...(lcNorm.hasOwnField(input, 'endangermentLevel')
      ? input.endangermentLevel
        ? { endangermentLevel: input.endangermentLevel }
        : {}
      : existing?.endangermentLevel
        ? { endangermentLevel: existing.endangermentLevel }
        : {}),
    ...(lcNorm.hasOwnField(input, 'aesStatus')
      ? input.aesStatus
        ? { aesStatus: input.aesStatus }
        : {}
      : existing?.aesStatus
        ? { aesStatus: existing.aesStatus }
        : {}),
    ...(lcNorm.hasOwnField(input, 'endangermentSource')
      ? input.endangermentSource
        ? { endangermentSource: input.endangermentSource }
        : {}
      : existing?.endangermentSource
        ? { endangermentSource: existing.endangermentSource }
        : {}),
    ...(lcNorm.hasOwnField(input, 'endangermentAssessmentYear')
      ? input.endangermentAssessmentYear !== undefined
        ? { endangermentAssessmentYear: input.endangermentAssessmentYear }
        : {}
      : existing?.endangermentAssessmentYear !== undefined
        ? { endangermentAssessmentYear: existing.endangermentAssessmentYear }
        : {}),
    ...(lcNorm.hasOwnField(input, 'speakerCountL1')
      ? input.speakerCountL1 !== undefined
        ? { speakerCountL1: input.speakerCountL1 }
        : {}
      : existing?.speakerCountL1 !== undefined
        ? { speakerCountL1: existing.speakerCountL1 }
        : {}),
    ...(lcNorm.hasOwnField(input, 'speakerCountL2')
      ? input.speakerCountL2 !== undefined
        ? { speakerCountL2: input.speakerCountL2 }
        : {}
      : existing?.speakerCountL2 !== undefined
        ? { speakerCountL2: existing.speakerCountL2 }
        : {}),
    ...(lcNorm.hasOwnField(input, 'speakerCountSource')
      ? input.speakerCountSource
        ? { speakerCountSource: input.speakerCountSource }
        : {}
      : existing?.speakerCountSource
        ? { speakerCountSource: existing.speakerCountSource }
        : {}),
    ...(lcNorm.hasOwnField(input, 'speakerCountYear')
      ? input.speakerCountYear !== undefined
        ? { speakerCountYear: input.speakerCountYear }
        : {}
      : existing?.speakerCountYear !== undefined
        ? { speakerCountYear: existing.speakerCountYear }
        : {}),
    ...(lcNorm.hasOwnField(input, 'speakerTrend')
      ? input.speakerTrend
        ? { speakerTrend: input.speakerTrend }
        : {}
      : existing?.speakerTrend
        ? { speakerTrend: existing.speakerTrend }
        : {}),
    ...(lcNorm.hasOwnField(input, 'countries')
      ? input.countries?.length
        ? { countries: input.countries }
        : {}
      : existing?.countries?.length
        ? { countries: existing.countries }
        : {}),
    ...(lcNorm.hasOwnField(input, 'countriesOfficial')
      ? input.countriesOfficial?.length
        ? { countriesOfficial: input.countriesOfficial }
        : {}
      : existing?.countriesOfficial?.length
        ? { countriesOfficial: existing.countriesOfficial }
        : {}),
    ...(lcNorm.hasOwnField(input, 'macroarea')
      ? input.macroarea
        ? { macroarea: input.macroarea }
        : {}
      : existing?.macroarea
        ? { macroarea: existing.macroarea }
        : {}),
    ...(lcNorm.hasOwnField(input, 'administrativeDivisions')
      ? input.administrativeDivisions?.length
        ? { administrativeDivisions: input.administrativeDivisions }
        : {}
      : existing?.administrativeDivisions?.length
        ? { administrativeDivisions: existing.administrativeDivisions }
        : {}),
    ...(lcNorm.hasOwnField(input, 'intergenerationalTransmission')
      ? input.intergenerationalTransmission
        ? { intergenerationalTransmission: input.intergenerationalTransmission }
        : {}
      : existing?.intergenerationalTransmission
        ? { intergenerationalTransmission: existing.intergenerationalTransmission }
        : {}),
    ...(lcNorm.hasOwnField(input, 'domains')
      ? input.domains?.length
        ? { domains: input.domains }
        : {}
      : existing?.domains?.length
        ? { domains: existing.domains }
        : {}),
    ...(lcNorm.hasOwnField(input, 'officialStatus')
      ? input.officialStatus
        ? { officialStatus: input.officialStatus }
        : {}
      : existing?.officialStatus
        ? { officialStatus: existing.officialStatus }
        : {}),
    ...(lcNorm.hasOwnField(input, 'egids')
      ? input.egids
        ? { egids: input.egids }
        : {}
      : existing?.egids
        ? { egids: existing.egids }
        : {}),
    ...(lcNorm.hasOwnField(input, 'documentationLevel')
      ? input.documentationLevel
        ? { documentationLevel: input.documentationLevel }
        : {}
      : existing?.documentationLevel
        ? { documentationLevel: existing.documentationLevel }
        : {}),
    ...(lcNorm.hasOwnField(input, 'dialects')
      ? input.dialects?.length
        ? { dialects: input.dialects }
        : {}
      : existing?.dialects?.length
        ? { dialects: existing.dialects }
        : {}),
    ...(lcNorm.hasOwnField(input, 'vernaculars')
      ? input.vernaculars?.length
        ? { vernaculars: input.vernaculars }
        : {}
      : existing?.vernaculars?.length
        ? { vernaculars: existing.vernaculars }
        : {}),
    ...(lcNorm.hasOwnField(input, 'writingSystems')
      ? input.writingSystems?.length
        ? { writingSystems: input.writingSystems }
        : {}
      : existing?.writingSystems?.length
        ? { writingSystems: existing.writingSystems }
        : {}),
    ...(lcNorm.hasOwnField(input, 'literacyRate')
      ? input.literacyRate !== undefined
        ? { literacyRate: input.literacyRate }
        : {}
      : existing?.literacyRate !== undefined
        ? { literacyRate: existing.literacyRate }
        : {}),
    ...(lcNorm.hasOwnField(input, 'customFields')
      ? input.customFields && Object.keys(input.customFields).length > 0
        ? { customFields: input.customFields }
        : {}
      : existing?.customFields && Object.keys(existing.customFields).length > 0
        ? { customFields: existing.customFields }
        : {}),
  };
}
