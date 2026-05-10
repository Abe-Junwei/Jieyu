/**
 * Language catalog workspace API — thin barrel over `src/services/languageCatalog/*`.
 * Dynamic import path `import('./LinguisticService.languageCatalog')` must stay stable for lazy loaders.
 */
export { lookupIso639_3Seed, type Iso639_3Seed } from './languageCatalogSeedLookup';
export type * from './languageCatalog/languageCatalogTypes';
export * from './languageCatalog/languageCatalogCore';
export {
  listCustomFieldDefinitions,
  upsertCustomFieldDefinition,
  deleteCustomFieldDefinition,
} from './LinguisticService.languageCatalog.customFieldAdmin';
