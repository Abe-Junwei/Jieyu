import Dexie from 'dexie';
import {
  normalizeLanguageCatalogRuntimeLabelKey,
  normalizeLanguageCatalogRuntimeLookupKey,
  writeLanguageCatalogRuntimeCache,
  type LanguageCatalogRuntimeEntry,
} from '../../data/languageCatalogRuntimeCache';
import {
  LANGUAGE_NAME_QUERY_LOCALES,
  type LanguageNameQueryLocale,
} from '../../data/languageNameTypes';
import { createLogger } from '../../observability/logger';
import type { LanguageCatalogEntry } from './languageCatalogTypes';
import * as lcNorm from './languageCatalogCoreNormalization';
import { readLanguageCatalogProjection } from './languageCatalogCoreProjection';

const log = createLogger('LinguisticService.languageCatalog');

let rebuildLanguageCatalogRuntimeCachePromise: Promise<void> | null = null;
let deferredLanguageCatalogRefreshScheduled = false;

function scheduleDeferredLanguageCatalogReadModelRefresh(): void {
  if (deferredLanguageCatalogRefreshScheduled) return;
  deferredLanguageCatalogRefreshScheduled = true;
  setTimeout(() => {
    deferredLanguageCatalogRefreshScheduled = false;
    void refreshLanguageCatalogReadModel().catch((error) => {
      log.error('failed to rebuild deferred language catalog runtime cache', { err: error });
    });
  }, 0);
}

/** Rebuild runtime cache using Dexie.Promise only (no native async) so PSD stays consistent on Safari. */
function rebuildLanguageCatalogRuntimeCache(): Promise<void> {
  const DP = Dexie.Promise;
  const projectedByLocale: Array<readonly [LanguageNameQueryLocale, LanguageCatalogEntry[]]> = [];

  let chain: ReturnType<typeof DP.resolve> = DP.resolve();
  for (const locale of LANGUAGE_NAME_QUERY_LOCALES) {
    chain = chain.then(() =>
      readLanguageCatalogProjection(locale, true).then((entries) => {
        projectedByLocale.push([locale, entries] as const);
      }),
    );
  }

  return chain.then(() => {
    const entriesByLanguageId = new Map<
      string,
      Partial<Record<LanguageNameQueryLocale, LanguageCatalogEntry>>
    >();
    projectedByLocale.forEach(([locale, entries]) => {
      entries.forEach((entry) => {
        const bucket = entriesByLanguageId.get(entry.id) ?? {};
        bucket[locale] = entry;
        entriesByLanguageId.set(entry.id, bucket);
      });
    });

    const entries = Object.fromEntries(
      Array.from(entriesByLanguageId.entries())
        .map(
          ([languageId, entryByLocale]) =>
            [languageId, lcNorm.buildRuntimeCacheEntry(entryByLocale)] as const,
        )
        .filter((item): item is [string, LanguageCatalogRuntimeEntry] => Boolean(item[1])),
    );

    const aliasToId = Object.fromEntries(
      Object.entries(entries).flatMap(([languageId, entry]) => {
        if (entry.visibility === 'hidden') {
          return [] as Array<[string, string]>;
        }
        return (entry.aliases ?? [])
          .map((alias) => [normalizeLanguageCatalogRuntimeLabelKey(alias), languageId] as const)
          .filter(([alias]) => alias.length > 0);
      }),
    );
    const lookupToId = Object.fromEntries(
      Object.entries(entries).flatMap(([languageId, entry]) => {
        const lookupKeys = lcNorm.dedupeStrings([
          languageId,
          entry.languageCode,
          entry.canonicalTag,
          entry.iso6391,
          entry.iso6392B,
          entry.iso6392T,
          entry.iso6393,
        ]);
        return lookupKeys.map(
          (lookupKey) => [normalizeLanguageCatalogRuntimeLookupKey(lookupKey), languageId] as const,
        );
      }),
    );

    writeLanguageCatalogRuntimeCache({
      entries,
      aliasToId,
      lookupToId,
      updatedAt: new Date().toISOString(),
    });
  });
}

export async function refreshLanguageCatalogReadModel(): Promise<void> {
  // Dexie 官方建议：不要在不相关事务内等待另一组表的异步读写。
  // 若当前仍处于其它事务（例如 layer_units）作用域，则改为下一 tick 再刷新，避免
  // `Table layer_units not part of transaction` / `TransactionInactiveError`。
  // | Dexie advises against awaiting unrelated async DB work inside another transaction.
  // If an ambient transaction is active, defer refresh to the next tick to avoid scope leaks.
  if (Dexie.currentTransaction) {
    scheduleDeferredLanguageCatalogReadModelRefresh();
    return;
  }

  if (!rebuildLanguageCatalogRuntimeCachePromise) {
    // `waitFor` accepts a promise-like task; pass the Dexie.Promise returned from the rebuild so PSD stays
    // on the Dexie chain without re-wrapping it in a native async continuation.
    rebuildLanguageCatalogRuntimeCachePromise = Dexie.waitFor(rebuildLanguageCatalogRuntimeCache())
      .catch((error) => {
        // H5: Log, then rethrow so callers observe the failure; .finally clears the promise so a later refresh can retry.
        log.error('failed to rebuild language catalog runtime cache', { err: error });
        throw error;
      })
      .finally(() => {
        rebuildLanguageCatalogRuntimeCachePromise = null;
      });
  }
  await rebuildLanguageCatalogRuntimeCachePromise;
}
