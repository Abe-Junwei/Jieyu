import { normalizeLanguageCatalogRuntimeLabelKey } from '../../data/languageCatalogRuntimeCache';
import type {
  LanguageAliasDocType,
  LanguageCatalogSourceType,
  LanguageDisplayNameDocType,
} from '../../db';
import { newId } from '../../utils/transcriptionFormatters';
import type { UpsertLanguageCatalogEntryInput } from './languageCatalogTypes';
import * as lcNorm from './languageCatalogCoreNormalization';
import type { UpsertPreparedFields } from './languageCatalogUpsertPrep';

export function buildUpsertAliasRows(input: {
  normalizedAliases: string[];
  languageId: string;
  nextSourceType: LanguageCatalogSourceType;
  upsertInput: UpsertLanguageCatalogEntryInput;
  now: string;
}): LanguageAliasDocType[] {
  return input.normalizedAliases.map((alias) => ({
    id: newId('langalias'),
    languageId: input.languageId,
    alias,
    normalizedAlias: normalizeLanguageCatalogRuntimeLabelKey(alias),
    aliasType: 'search',
    sourceType: input.nextSourceType,
    ...(input.upsertInput.reviewStatus ? { reviewStatus: input.upsertInput.reviewStatus } : {}),
    createdAt: input.now,
    updatedAt: input.now,
  }));
}

export function buildUpsertDisplayNameRows(input: {
  languageId: string;
  locale: string;
  prep: UpsertPreparedFields;
  nextSourceType: LanguageCatalogSourceType;
  upsertInput: UpsertLanguageCatalogEntryInput;
  now: string;
}): LanguageDisplayNameDocType[] {
  const { prep, upsertInput, languageId, locale, nextSourceType, now } = input;
  return lcNorm.buildPersistedDisplayNameRows({
    languageId,
    locale,
    ...(prep.englishName ? { englishName: prep.englishName } : {}),
    ...(prep.localName ? { localName: prep.localName } : {}),
    ...(prep.nativeName ? { nativeName: prep.nativeName } : {}),
    ...(prep.normalizedDisplayNameInput.length > 0
      ? { displayNames: prep.normalizedDisplayNameInput }
      : {}),
    sourceType: nextSourceType,
    ...(upsertInput.reviewStatus ? { reviewStatus: upsertInput.reviewStatus } : {}),
    createdAt: now,
  });
}
