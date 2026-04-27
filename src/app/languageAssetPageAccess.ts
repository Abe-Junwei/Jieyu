/**
 * 语言资产域服务转发 — 供 `src/pages/*` 使用（M3：页面不直连 `../services`）。
 * Language-assets service re-exports for pages.
 */

export {
  applyCustomFieldDraftDefaults,
  buildCustomFieldDraftValues,
  buildPersistedCustomFieldValues,
  CUSTOM_FIELD_RENDERER_REGISTRY,
  formatCustomFieldOptionsEditorValue,
  parseCustomFieldDraftMultiselectValue,
  parseCustomFieldOptionsEditorValue,
  readLocalizedFieldText,
  serializeCustomFieldDraftValue,
  validateCustomFieldDraftValue,
} from '../services/LanguageMetadataCustomFields';

export {
  deleteCustomFieldDefinition,
  deleteLanguageCatalogEntry,
  listCustomFieldDefinitions,
  listLanguageCatalogEntries,
  listLanguageCatalogHistory,
  upsertCustomFieldDefinition,
  upsertLanguageCatalogEntry,
} from '../services/LinguisticService.languageCatalog';
export { lookupIso639_3Seed } from '../services/languageCatalogSeedLookup';
export { searchLanguageCatalogSuggestions } from '../services/LanguageCatalogSearchService';

export { listOrthographyRecords, updateOrthographyRecord } from '../services/LinguisticService.orthography';

export { LinguisticService } from '../services/LinguisticService';
