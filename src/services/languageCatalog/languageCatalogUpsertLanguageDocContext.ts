import type { LanguageCatalogSourceType, LanguageDocType } from '../../db';
import type { UpsertLanguageCatalogEntryInput } from './languageCatalogTypes';
import type { UpsertPreparedFields } from './languageCatalogUpsertPrep';

export type UpsertLanguageDocBuildCtx = {
  input: UpsertLanguageCatalogEntryInput;
  existing: LanguageDocType | undefined;
  languageId: string;
  now: string;
  nextSourceType: LanguageCatalogSourceType;
  p: UpsertPreparedFields;
};
