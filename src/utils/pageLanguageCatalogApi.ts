/**
 * Page-layer bridge for language catalog mutations + lookup helpers (M3).
 */

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
