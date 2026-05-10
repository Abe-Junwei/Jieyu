import type { LanguageDisplayNameRole, LanguageDocType, MultiLangString } from '../../db';
import type { Locale } from '../../i18n';
import { lookupIso639_3Seed, type Iso639_3Seed } from '../languageCatalogSeedLookup';
import type { UpsertLanguageCatalogEntryInput } from './languageCatalogTypes';
import * as lcNorm from './languageCatalogCoreNormalization';

export function resolveUpsertWorkspaceLocale(input: UpsertLanguageCatalogEntryInput): Locale {
  const rawLocale = lcNorm.normalizeCanonicalTag(input.locale ?? 'zh-CN', 'zh-CN') ?? 'zh-CN';
  return rawLocale.toLowerCase().startsWith('en') ? 'en-US' : 'zh-CN';
}

export type UpsertPreparedDisplayNameInputRow = {
  locale: string;
  role: LanguageDisplayNameRole;
  value: string;
  isPreferred?: boolean;
};

export type UpsertPreparedFields = {
  isoSeed: Iso639_3Seed | undefined;
  englishName: string | undefined;
  localName: string | undefined;
  nativeName: string | undefined;
  mergedName: MultiLangString;
  hasEnglishName: boolean;
  hasLocalName: boolean;
  hasNativeName: boolean;
  hasCanonicalTag: boolean;
  hasIso6391: boolean;
  hasIso6392B: boolean;
  hasIso6392T: boolean;
  hasIso6393: boolean;
  hasGlottocode: boolean;
  hasWikidataId: boolean;
  hasScope: boolean;
  hasMacrolanguage: boolean;
  hasGenus: boolean;
  hasClassificationPath: boolean;
  hasModality: boolean;
  hasLatitude: boolean;
  hasLongitude: boolean;
  hasLanguageType: boolean;
  normCanonicalTag: string | undefined;
  normIso6391: string | undefined;
  normIso6392B: string | undefined;
  normIso6392T: string | undefined;
  normIso6393: string | undefined;
  normGlottocode: string | undefined;
  normWikidataId: string | undefined;
  normMacrolanguage: string | undefined;
  normGenus: string | undefined;
  normSubfamily: string | undefined;
  normBranch: string | undefined;
  normClassificationPath: string | undefined;
  normalizedDisplayNameInput: UpsertPreparedDisplayNameInputRow[];
  normalizedAliases: string[];
};

export function prepareUpsertLanguageCatalogFields(
  input: UpsertLanguageCatalogEntryInput,
  existing: LanguageDocType | undefined,
  languageId: string,
  locale: Locale,
): UpsertPreparedFields {
  const isoSeed = !existing ? lookupIso639_3Seed(languageId) : undefined;

  const englishName =
    lcNorm.normalizeOptionalValue(input.englishName) ?? (!existing ? isoSeed?.name : undefined);
  const localName = lcNorm.normalizeOptionalValue(input.localName);
  const nativeName = lcNorm.normalizeOptionalValue(input.nativeName);
  const hasEnglishName =
    lcNorm.hasOwnField(input, 'englishName') || Boolean(!existing && isoSeed?.name);
  const hasLocalName = lcNorm.hasOwnField(input, 'localName');
  const hasNativeName = lcNorm.hasOwnField(input, 'nativeName');
  const hasCanonicalTag = lcNorm.hasOwnField(input, 'canonicalTag');
  const hasIso6391 = lcNorm.hasOwnField(input, 'iso6391') || Boolean(!existing && isoSeed?.iso6391);
  const hasIso6392B =
    lcNorm.hasOwnField(input, 'iso6392B') || Boolean(!existing && isoSeed?.iso6392B);
  const hasIso6392T =
    lcNorm.hasOwnField(input, 'iso6392T') || Boolean(!existing && isoSeed?.iso6392T);
  const hasIso6393 = lcNorm.hasOwnField(input, 'iso6393');
  const hasGlottocode = lcNorm.hasOwnField(input, 'glottocode');
  const hasWikidataId = lcNorm.hasOwnField(input, 'wikidataId');
  const hasScope = lcNorm.hasOwnField(input, 'scope') || Boolean(!existing && isoSeed?.scope);
  const hasMacrolanguage = lcNorm.hasOwnField(input, 'macrolanguage');
  const hasGenus = lcNorm.hasOwnField(input, 'genus');
  const hasClassificationPath = lcNorm.hasOwnField(input, 'classificationPath');
  const hasModality = lcNorm.hasOwnField(input, 'modality');
  const hasLatitude = lcNorm.hasOwnField(input, 'latitude');
  const hasLongitude = lcNorm.hasOwnField(input, 'longitude');
  const hasLanguageType =
    lcNorm.hasOwnField(input, 'languageType') || Boolean(!existing && isoSeed?.type);
  const mergedName: MultiLangString = {
    ...(existing?.name ?? {}),
  };
  if (hasEnglishName) {
    delete mergedName.eng;
    delete mergedName.en;
    delete mergedName['en-US'];
    if (englishName) {
      mergedName.eng = englishName;
      mergedName.en = englishName;
      mergedName['en-US'] = englishName;
    }
  }
  if (hasLocalName) {
    delete mergedName[locale];
    if (localName) {
      mergedName[locale] = localName;
    }
  }

  const normCanonicalTag = lcNorm.normalizeCanonicalTag(input.canonicalTag, locale);
  const normIso6391 =
    lcNorm.normalizeIsoAlphaCode(
      input.iso6391,
      2,
      locale,
      'service.languageCatalog.invalidIso6391',
    ) ?? (!existing ? isoSeed?.iso6391 : undefined);
  const normIso6392B =
    lcNorm.normalizeIsoAlphaCode(
      input.iso6392B,
      3,
      locale,
      'service.languageCatalog.invalidIso6392B',
    ) ?? (!existing ? isoSeed?.iso6392B : undefined);
  const normIso6392T =
    lcNorm.normalizeIsoAlphaCode(
      input.iso6392T,
      3,
      locale,
      'service.languageCatalog.invalidIso6392T',
    ) ?? (!existing ? isoSeed?.iso6392T : undefined);
  const normIso6393 = lcNorm.normalizeIsoAlphaCode(
    input.iso6393,
    3,
    locale,
    'service.languageCatalog.invalidIso6393',
  );
  const normGlottocode = lcNorm.normalizeOptionalValue(input.glottocode);
  const normWikidataId = lcNorm.normalizeOptionalValue(input.wikidataId);
  const normMacrolanguage = lcNorm.normalizeOptionalValue(input.macrolanguage);
  const normGenus = lcNorm.normalizeOptionalValue(input.genus);
  const normSubfamily = lcNorm.normalizeOptionalValue(input.subfamily);
  const normBranch = lcNorm.normalizeOptionalValue(input.branch);
  const normClassificationPath = lcNorm.normalizeOptionalValue(input.classificationPath);
  const normalizedDisplayNameInput: UpsertPreparedDisplayNameInputRow[] =
    input.displayNames?.map((row) => ({
      locale: lcNorm.normalizeValidatedDisplayLocale(row.locale, locale),
      role: row.role,
      value: row.value.trim(),
      ...(row.isPreferred ? { isPreferred: true } : {}),
    })) ?? [];
  const normalizedAliases = lcNorm.dedupeStrings(input.aliases ?? []);

  return {
    isoSeed,
    englishName,
    localName,
    nativeName,
    mergedName,
    hasEnglishName,
    hasLocalName,
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
    normalizedDisplayNameInput,
    normalizedAliases,
  };
}
