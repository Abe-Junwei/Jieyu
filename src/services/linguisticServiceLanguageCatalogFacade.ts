import Dexie from 'dexie';
import { createLogger } from '../observability/logger';
import {
  resolveLanguageQuery as resolveLanguageQueryImpl,
  searchLanguageCatalog,
} from '../utils/langMapping';
import { lookupIso639_3Seed as lookupIso639_3SeedImpl } from './languageCatalogSeedLookup';
import { loadLanguageCatalogService } from './linguisticServiceLazyLoaders';
import type {
  LanguageCatalogEntry,
  UpsertLanguageCatalogEntryInput,
} from './LinguisticService.languageCatalog';

let deferredLanguageCatalogRefreshScheduled = false;
const log = createLogger('LinguisticService.languageCatalog');

export async function listLanguageCatalogEntries(input: {
  locale: 'zh-CN' | 'en-US';
  searchText?: string;
  includeHidden?: boolean;
  languageIds?: readonly string[];
}): Promise<LanguageCatalogEntry[]> {
  return (await loadLanguageCatalogService()).listLanguageCatalogEntries(input);
}

export async function getLanguageCatalogEntry(input: {
  languageId: string;
  locale: 'zh-CN' | 'en-US';
}): Promise<LanguageCatalogEntry | null> {
  return (await loadLanguageCatalogService()).getLanguageCatalogEntry(input);
}

export async function upsertLanguageCatalogEntry(
  input: UpsertLanguageCatalogEntryInput,
): Promise<LanguageCatalogEntry> {
  return (await loadLanguageCatalogService()).upsertLanguageCatalogEntry(input);
}

export async function deleteLanguageCatalogEntry(input: {
  languageId: string;
  reason?: string;
  locale: 'zh-CN' | 'en-US';
}): Promise<void> {
  return (await loadLanguageCatalogService()).deleteLanguageCatalogEntry(input);
}

export async function listLanguageCatalogHistory(languageId: string) {
  return (await loadLanguageCatalogService()).listLanguageCatalogHistory(languageId);
}

export async function listCustomFieldDefinitions() {
  return (await loadLanguageCatalogService()).listCustomFieldDefinitions();
}

export async function upsertCustomFieldDefinition(
  input: Parameters<
    (typeof import('./LinguisticService.languageCatalog'))['upsertCustomFieldDefinition']
  >[0],
) {
  return (await loadLanguageCatalogService()).upsertCustomFieldDefinition(input);
}

export async function deleteCustomFieldDefinition(id: string) {
  return (await loadLanguageCatalogService()).deleteCustomFieldDefinition(id);
}

export async function refreshLanguageCatalogReadModel(): Promise<void> {
  if (Dexie.currentTransaction) {
    if (!deferredLanguageCatalogRefreshScheduled) {
      deferredLanguageCatalogRefreshScheduled = true;
      setTimeout(() => {
        deferredLanguageCatalogRefreshScheduled = false;
        void loadLanguageCatalogService()
          .then((service) => service.refreshLanguageCatalogReadModel())
          .catch((error) => {
            log.error('failed to refresh language catalog read model from deferred wrapper', {
              err: error,
            });
          });
      }, 0);
    }
    return;
  }
  return (await loadLanguageCatalogService()).refreshLanguageCatalogReadModel();
}

/**
 * 在语言目录中搜索匹配项 | Search for matching entries in the language catalog
 */
export function searchLanguageCatalogEntries(
  query: string,
  locale?: import('../utils/langMapping').LanguageSearchLocale,
  maxResults?: number,
): import('../utils/langMapping').LanguageCatalogMatch[] {
  return searchLanguageCatalog(query, locale, maxResults);
}

/** 解析用户输入为 ISO 639-3 代码 | Resolve user input to ISO 639-3 code */
export function resolveLanguageQuery(query: string): string | undefined {
  return resolveLanguageQueryImpl(query);
}

/** 同步查询 ISO 639-3 种子记录（用于前端即时预填充） | Synchronously look up ISO 639-3 seed record for instant pre-fill */
export function lookupIso639_3Seed(code: string) {
  return lookupIso639_3SeedImpl(code);
}
