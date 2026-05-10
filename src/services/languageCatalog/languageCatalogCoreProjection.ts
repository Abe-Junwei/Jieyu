import Dexie from 'dexie';
import {
  getDb,
  type LanguageAliasDocType,
  type LanguageDisplayNameDocType,
  type LanguageDocType,
} from '../../db';
import {
  getBaselineLanguageAliasesForExactId,
  getBaselineLanguageDisplayCoreEntryByExactId,
} from '../../data/languageNameCatalog';
import {
  loadIso6393CountryBaselines,
  type Iso6393CountryBaselinesPayload,
} from '../../data/iso6393CountryBaselinesLoader';
import type { LanguageNameQueryLocale } from '../../data/languageNameTypes';
import {
  isPublicBaselineCatalogLanguageId,
  normalizeLanguageCatalogRuntimeLabelKey,
} from '../../data/languageCatalogRuntimeCache';
import { tf, type Locale } from '../../i18n';
import { isKnownIso639_3Code } from '../../utils/langMapping';
import { lookupIso639_3Seed } from '../languageCatalogSeedLookup';
import type { LanguageCatalogEntry, LanguageCatalogEntryKind } from './languageCatalogTypes';
import * as lcNorm from './languageCatalogCoreNormalization';

export function shouldProjectBeforeEntry(
  languageId: string,
  existing: LanguageDocType | undefined,
  displayNames: readonly LanguageDisplayNameDocType[],
  aliases: readonly LanguageAliasDocType[],
): boolean {
  if (existing || displayNames.length > 0 || aliases.length > 0) {
    return true;
  }
  return isPublicBaselineCatalogLanguageId(languageId) || isKnownIso639_3Code(languageId);
}

function formatConflictEntryLabel(entry: LanguageCatalogEntry): string {
  return `${entry.localName} (${entry.id})`;
}

function entryMatchesAlias(entry: LanguageCatalogEntry, normalizedAlias: string): boolean {
  const candidates = lcNorm.dedupeStrings([
    entry.id,
    entry.languageCode,
    entry.canonicalTag,
    entry.iso6391,
    entry.iso6392B,
    entry.iso6392T,
    entry.iso6393,
    entry.englishName,
    entry.localName,
    entry.nativeName,
    ...entry.aliases,
    ...entry.displayNames.map((row) => row.value),
  ]);
  return candidates.some(
    (candidate) => normalizeLanguageCatalogRuntimeLabelKey(candidate) === normalizedAlias,
  );
}

export async function assertNoAliasConflicts(input: {
  languageId: string;
  locale: Locale;
  aliases: readonly string[];
}): Promise<void> {
  if (input.aliases.length === 0) {
    return;
  }

  const entries = await readLanguageCatalogProjection(input.locale, true);
  const issues = input.aliases.flatMap((alias) => {
    const normalizedAlias = normalizeLanguageCatalogRuntimeLabelKey(alias);
    if (!normalizedAlias) {
      return [] as string[];
    }

    const conflictingEntries = entries.filter(
      (entry) => entry.id !== input.languageId && entryMatchesAlias(entry, normalizedAlias),
    );
    if (conflictingEntries.length === 0) {
      return [] as string[];
    }

    const targets = lcNorm
      .dedupeStrings(conflictingEntries.map(formatConflictEntryLabel))
      .join('、');
    const dictKey = lcNorm.HIGH_AMBIGUITY_LANGUAGE_ALIASES.has(normalizedAlias)
      ? 'service.languageCatalog.aliasHighAmbiguity'
      : 'service.languageCatalog.aliasConflict';
    return [tf(input.locale, dictKey, { alias, targets })];
  });

  if (issues.length > 0) {
    throw new Error(issues.join('\n'));
  }
}
export function projectLanguageCatalogEntry(input: {
  languageId: string;
  locale: string;
  languageDoc?: LanguageDocType;
  displayNames: readonly LanguageDisplayNameDocType[];
  aliases: readonly LanguageAliasDocType[];
  countryBaselines?: Pick<
    Iso6393CountryBaselinesPayload,
    'distributionByIso6393' | 'officialByIso6393'
  > | null;
}): LanguageCatalogEntry {
  const isoRecord = lookupIso639_3Seed(input.languageId);
  const usePublicBaseline = isPublicBaselineCatalogLanguageId(input.languageId);
  const generated = usePublicBaseline
    ? getBaselineLanguageDisplayCoreEntryByExactId(input.languageId)
    : undefined;
  const builtInAliases = usePublicBaseline
    ? [...getBaselineLanguageAliasesForExactId(input.languageId)]
    : [];
  const languageDoc = input.languageDoc;
  const projectedDisplayNames = lcNorm.buildProjectedDisplayNames({
    ...(generated ? { generatedEntry: generated } : {}),
    ...(languageDoc ? { languageDoc } : {}),
    displayNames: input.displayNames,
  });
  const entryKind: LanguageCatalogEntryKind =
    input.languageId.startsWith('user:') || languageDoc?.sourceType === 'user-custom'
      ? 'custom'
      : languageDoc
        ? 'override'
        : 'built-in';
  const hasPersistedRecord =
    Boolean(languageDoc) || input.displayNames.length > 0 || input.aliases.length > 0;
  const englishName =
    lcNorm.pickDisplayName(input.displayNames, 'en-US', [
      'preferred',
      'menu',
      'exonym',
      'academic',
    ]) ??
    lcNorm.readMultiLangValue(languageDoc?.name, 'en-US') ??
    generated?.english ??
    isoRecord?.name ??
    input.languageId;
  const generatedLocalName = generated?.byLocale?.[input.locale as LanguageNameQueryLocale];
  const localName =
    lcNorm.pickDisplayName(input.displayNames, input.locale, [
      'preferred',
      'menu',
      'exonym',
      'academic',
    ]) ??
    lcNorm.readMultiLangValue(languageDoc?.name, input.locale) ??
    generatedLocalName ??
    englishName;
  const nativeName =
    lcNorm.pickDisplayName(input.displayNames, 'native', ['autonym']) ??
    lcNorm.normalizeOptionalValue(languageDoc?.autonym) ??
    lcNorm.normalizeOptionalValue(generated?.native);
  const aliases = lcNorm.dedupeStrings([
    ...builtInAliases,
    ...input.aliases.map((row) => row.alias),
  ]);
  const sourceType = languageDoc?.sourceType ?? (generated ? 'built-in-generated' : 'user-custom');

  // 提取复合可选值，避免 exactOptionalPropertyTypes 违规 | Extract compound optional values to satisfy exactOptionalPropertyTypes
  const resolvedCanonicalTag = languageDoc?.canonicalTag;
  const resolvedIso6391 = languageDoc?.iso6391 ?? isoRecord?.iso6391;
  const resolvedIso6392B = languageDoc?.iso6392B ?? isoRecord?.iso6392B;
  const resolvedIso6392T = languageDoc?.iso6392T ?? isoRecord?.iso6392T;
  const resolvedIso6393 =
    languageDoc?.iso6393 ??
    isoRecord?.iso6393 ??
    (isKnownIso639_3Code(input.languageId) ? input.languageId : undefined);
  const baselineLookupKey = (resolvedIso6393 ?? input.languageId).trim().toLowerCase();
  const baselineDist = input.countryBaselines?.distributionByIso6393[baselineLookupKey];
  const baselineOff = input.countryBaselines?.officialByIso6393[baselineLookupKey];
  const resolvedGlottocode = languageDoc?.glottocode;
  const resolvedWikidataId = languageDoc?.wikidataId;
  const resolvedScope = languageDoc?.scope ?? isoRecord?.scope;
  const resolvedGenus = languageDoc?.genus;
  const resolvedSubfamily = languageDoc?.subfamily;
  const resolvedBranch = languageDoc?.branch;
  const resolvedClassificationPath = languageDoc?.classificationPath;
  const resolvedMacrolanguage = languageDoc?.macrolanguage;
  const resolvedLanguageType = languageDoc?.languageType ?? isoRecord?.type;
  const resolvedModality = languageDoc?.modality;
  const resolvedReviewStatus = languageDoc?.reviewStatus;
  const resolvedNotes = languageDoc?.notes;
  const resolvedLatitude = languageDoc?.latitude ?? generated?.latitude;
  const resolvedLongitude = languageDoc?.longitude ?? generated?.longitude;
  const resolvedUpdatedAt = languageDoc?.updatedAt;

  return {
    id: input.languageId,
    entryKind,
    hasPersistedRecord,
    languageCode: languageDoc?.languageCode ?? languageDoc?.iso6393 ?? input.languageId,
    ...(resolvedCanonicalTag ? { canonicalTag: resolvedCanonicalTag } : {}),
    ...(resolvedIso6391 ? { iso6391: resolvedIso6391 } : {}),
    ...(resolvedIso6392B ? { iso6392B: resolvedIso6392B } : {}),
    ...(resolvedIso6392T ? { iso6392T: resolvedIso6392T } : {}),
    ...(resolvedIso6393 ? { iso6393: resolvedIso6393 } : {}),
    ...(resolvedGlottocode ? { glottocode: resolvedGlottocode } : {}),
    ...(resolvedWikidataId ? { wikidataId: resolvedWikidataId } : {}),
    englishName,
    localName,
    ...(nativeName ? { nativeName } : {}),
    aliases,
    ...(resolvedScope ? { scope: resolvedScope } : {}),
    ...(resolvedGenus ? { genus: resolvedGenus } : {}),
    ...(resolvedSubfamily ? { subfamily: resolvedSubfamily } : {}),
    ...(resolvedBranch ? { branch: resolvedBranch } : {}),
    ...(resolvedClassificationPath ? { classificationPath: resolvedClassificationPath } : {}),
    ...(resolvedMacrolanguage ? { macrolanguage: resolvedMacrolanguage } : {}),
    ...(resolvedLanguageType ? { languageType: resolvedLanguageType } : {}),
    ...(resolvedModality ? { modality: resolvedModality } : {}),
    ...(languageDoc?.endangermentLevel ? { endangermentLevel: languageDoc.endangermentLevel } : {}),
    ...(languageDoc?.aesStatus ? { aesStatus: languageDoc.aesStatus } : {}),
    ...(languageDoc?.endangermentSource
      ? { endangermentSource: languageDoc.endangermentSource }
      : {}),
    ...(languageDoc?.endangermentAssessmentYear !== undefined
      ? { endangermentAssessmentYear: languageDoc.endangermentAssessmentYear }
      : {}),
    ...(languageDoc?.speakerCountL1 !== undefined
      ? { speakerCountL1: languageDoc.speakerCountL1 }
      : {}),
    ...(languageDoc?.speakerCountL2 !== undefined
      ? { speakerCountL2: languageDoc.speakerCountL2 }
      : {}),
    ...(languageDoc?.speakerCountSource
      ? { speakerCountSource: languageDoc.speakerCountSource }
      : {}),
    ...(languageDoc?.speakerCountYear !== undefined
      ? { speakerCountYear: languageDoc.speakerCountYear }
      : {}),
    ...(languageDoc?.speakerTrend ? { speakerTrend: languageDoc.speakerTrend } : {}),
    ...(languageDoc?.countries?.length ? { countries: languageDoc.countries } : {}),
    ...(languageDoc?.countriesOfficial?.length
      ? { countriesOfficial: languageDoc.countriesOfficial }
      : {}),
    ...(baselineDist?.length ? { baselineDistributionCountryCodes: baselineDist } : {}),
    ...(baselineOff?.length ? { baselineOfficialCountryCodes: baselineOff } : {}),
    ...(languageDoc?.macroarea ? { macroarea: languageDoc.macroarea } : {}),
    ...(languageDoc?.administrativeDivisions?.length
      ? { administrativeDivisions: languageDoc.administrativeDivisions }
      : {}),
    ...(languageDoc?.intergenerationalTransmission
      ? { intergenerationalTransmission: languageDoc.intergenerationalTransmission }
      : {}),
    ...(languageDoc?.domains?.length ? { domains: languageDoc.domains } : {}),
    ...(languageDoc?.officialStatus ? { officialStatus: languageDoc.officialStatus } : {}),
    ...(languageDoc?.egids ? { egids: languageDoc.egids } : {}),
    ...(languageDoc?.documentationLevel
      ? { documentationLevel: languageDoc.documentationLevel }
      : {}),
    ...(languageDoc?.dialects?.length ? { dialects: languageDoc.dialects } : {}),
    ...(languageDoc?.vernaculars?.length ? { vernaculars: languageDoc.vernaculars } : {}),
    ...(languageDoc?.writingSystems?.length ? { writingSystems: languageDoc.writingSystems } : {}),
    ...(languageDoc?.literacyRate !== undefined ? { literacyRate: languageDoc.literacyRate } : {}),
    ...(resolvedLatitude !== undefined ? { latitude: resolvedLatitude } : {}),
    ...(resolvedLongitude !== undefined ? { longitude: resolvedLongitude } : {}),
    ...(languageDoc?.customFields && Object.keys(languageDoc.customFields).length > 0
      ? { customFields: languageDoc.customFields }
      : {}),
    sourceType,
    ...(resolvedReviewStatus ? { reviewStatus: resolvedReviewStatus } : {}),
    visibility: languageDoc?.visibility ?? 'visible',
    ...(resolvedNotes ? { notes: resolvedNotes } : {}),
    displayNames: projectedDisplayNames,
    ...(resolvedUpdatedAt ? { updatedAt: resolvedUpdatedAt } : {}),
  };
}

export async function readLanguageCatalogProjection(
  locale: string,
  includeHidden = false,
  requestedLanguageIds?: readonly string[],
): Promise<LanguageCatalogEntry[]> {
  const scopedLanguageIds = lcNorm.normalizeRequestedLanguageIds(requestedLanguageIds);
  if (scopedLanguageIds && scopedLanguageIds.length === 0) {
    return [];
  }

  // Dexie `ignoreTransaction` uses `usePSD`: `finally` runs as soon as the callback returns. An `async` callback
  // returns at the first `await`, so PSD falls back to the parent scope while IDB reads still run — Safari then
  // throws `Table layer_units not part of transaction`. Use `Dexie.Promise` chains so `.then` captures `transless`.
  // | Do not use async/await directly inside `ignoreTransaction`; use Dexie.Promise continuation instead.
  const DP = Dexie.Promise;

  // No nested `db.dexie.transaction` here: Safari can mis-scope nested readonly txns vs `ignoreTransaction` / parent txns.
  // | Plain table reads under Dexie.Promise + `ignoreTransaction` only.
  return Dexie.ignoreTransaction(() =>
    DP.resolve(getDb())
      .then((db) =>
        scopedLanguageIds
          ? DP.all([
              db.dexie.languages.bulkGet(scopedLanguageIds),
              db.dexie.language_display_names
                .where('languageId')
                .anyOf(scopedLanguageIds)
                .toArray(),
              db.dexie.language_aliases.where('languageId').anyOf(scopedLanguageIds).toArray(),
            ])
          : DP.all([
              db.dexie.languages.toArray(),
              db.dexie.language_display_names.toArray(),
              db.dexie.language_aliases.toArray(),
            ]),
      )
      .then(([languages, displayNames, aliases]) => {
        const persistedLanguages = languages.filter((row): row is LanguageDocType => Boolean(row));

        const languageIds = new Set<string>(
          scopedLanguageIds ?? [
            ...lcNorm.buildBaselineCodes(),
            ...persistedLanguages.map((row) => row.id),
            ...displayNames.map((row) => row.languageId),
            ...aliases.map((row) => row.languageId),
          ],
        );

        const languageById = new Map(persistedLanguages.map((row) => [row.id, row] as const));
        const displayNamesByLanguageId = new Map<string, LanguageDisplayNameDocType[]>();
        const aliasesByLanguageId = new Map<string, LanguageAliasDocType[]>();

        displayNames.forEach((row) => {
          const bucket = displayNamesByLanguageId.get(row.languageId) ?? [];
          bucket.push(row);
          displayNamesByLanguageId.set(row.languageId, bucket);
        });

        aliases.forEach((row) => {
          const bucket = aliasesByLanguageId.get(row.languageId) ?? [];
          bucket.push(row);
          aliasesByLanguageId.set(row.languageId, bucket);
        });

        return DP.resolve(loadIso6393CountryBaselines())
          .then((loaded) => ({
            distributionByIso6393: loaded.distributionByIso6393,
            officialByIso6393: loaded.officialByIso6393,
          }))
          .catch((): null => null)
          .then((countryBaselines) => {
            const projected = Array.from(languageIds).map((languageId) => {
              const doc = languageById.get(languageId);
              return projectLanguageCatalogEntry({
                languageId,
                locale,
                ...(doc ? { languageDoc: doc } : {}),
                displayNames: displayNamesByLanguageId.get(languageId) ?? [],
                aliases: aliasesByLanguageId.get(languageId) ?? [],
                countryBaselines,
              });
            });

            // 管理视图需要包含隐藏条目 | Management views need hidden entries
            const filtered = includeHidden
              ? projected
              : projected.filter((entry) => entry.visibility !== 'hidden');

            return filtered.sort((left, right) => {
              const labelDiff = left.localName.localeCompare(right.localName, locale);
              if (labelDiff !== 0) return labelDiff;
              return left.id.localeCompare(right.id);
            });
          });
      }),
  );
}
