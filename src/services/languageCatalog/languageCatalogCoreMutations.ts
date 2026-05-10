import {
  dexieStoresForLanguageCatalogMutateRw,
  getDb,
  withTransaction,
  type LanguageCatalogHistoryDocType,
  type LanguageCatalogSourceType,
  type LanguageDocType,
} from '../../db';
import { t, type Locale } from '../../i18n';
import { createLogger } from '../../observability/logger';
import type { LanguageCatalogEntry, UpsertLanguageCatalogEntryInput } from './languageCatalogTypes';
import * as lcHist from './languageCatalogCoreHistory';
import * as lcNorm from './languageCatalogCoreNormalization';
import * as lcProj from './languageCatalogCoreProjection';
import { refreshLanguageCatalogReadModel } from './languageCatalogCoreReadModel';
import { buildUpsertLanguageDocForCatalog } from './languageCatalogUpsertLanguageDoc';
import {
  prepareUpsertLanguageCatalogFields,
  resolveUpsertWorkspaceLocale,
} from './languageCatalogUpsertPrep';
import { filterLanguageCatalogEntriesBySearchText } from './languageCatalogListEntriesFilter';
import { buildUpsertAliasRows, buildUpsertDisplayNameRows } from './languageCatalogUpsertRows';

const log = createLogger('LinguisticService.languageCatalog');

export async function listLanguageCatalogEntries(input: {
  locale: Locale;
  searchText?: string;
  includeHidden?: boolean;
  languageIds?: readonly string[];
}): Promise<LanguageCatalogEntry[]> {
  const entries = await lcProj.readLanguageCatalogProjection(
    input.locale,
    input.includeHidden,
    input.languageIds,
  );

  return filterLanguageCatalogEntriesBySearchText(entries, input.searchText);
}

export async function getLanguageCatalogEntry(input: {
  languageId: string;
  locale: Locale;
}): Promise<LanguageCatalogEntry | null> {
  const entries = await lcProj.readLanguageCatalogProjection(input.locale, true, [
    input.languageId,
  ]);
  return entries.find((entry) => entry.id === input.languageId) ?? null;
}

export async function upsertLanguageCatalogEntry(
  input: UpsertLanguageCatalogEntryInput,
): Promise<LanguageCatalogEntry> {
  const db = await getDb();
  const languageId = lcNorm.resolveStoredLanguageId(input);
  const now = new Date().toISOString();
  const existing = await db.dexie.languages.get(languageId);
  const nextSourceType: LanguageCatalogSourceType = languageId.startsWith('user:')
    ? 'user-custom'
    : (existing?.sourceType ?? 'user-override');
  const locale = resolveUpsertWorkspaceLocale(input);
  const prep = prepareUpsertLanguageCatalogFields(input, existing, languageId, locale);

  await lcProj.assertNoAliasConflicts({
    languageId,
    locale,
    aliases: prep.normalizedAliases,
  });

  const nextLanguage: LanguageDocType = buildUpsertLanguageDocForCatalog({
    input,
    existing,
    languageId,
    now,
    nextSourceType,
    p: prep,
  });

  const aliasRows = buildUpsertAliasRows({
    normalizedAliases: prep.normalizedAliases,
    languageId,
    nextSourceType,
    upsertInput: input,
    now,
  });

  const displayRows = buildUpsertDisplayNameRows({
    languageId,
    locale,
    prep,
    nextSourceType,
    upsertInput: input,
    now,
  });

  const reason =
    lcNorm.normalizeOptionalValue(input.reason) ??
    t(
      locale,
      existing
        ? 'service.languageCatalog.historyReasonUpdateDefault'
        : 'service.languageCatalog.historyReasonCreateDefault',
    );

  await withTransaction(
    db,
    'rw',
    [...dexieStoresForLanguageCatalogMutateRw(db)],
    async () => {
      const [currentDisplayRows, currentAliasRows] = await Promise.all([
        db.dexie.language_display_names.where('languageId').equals(languageId).toArray(),
        db.dexie.language_aliases.where('languageId').equals(languageId).toArray(),
      ]);
      const beforeEntry = lcProj.shouldProjectBeforeEntry(
        languageId,
        existing,
        currentDisplayRows,
        currentAliasRows,
      )
        ? lcProj.projectLanguageCatalogEntry({
            languageId,
            locale,
            ...(existing ? { languageDoc: existing } : {}),
            displayNames: currentDisplayRows,
            aliases: currentAliasRows,
          })
        : null;
      const afterEntry = lcProj.projectLanguageCatalogEntry({
        languageId,
        locale,
        languageDoc: nextLanguage,
        displayNames: displayRows,
        aliases: aliasRows,
      });
      const historyDiff = lcHist.computeHistoryDiff(beforeEntry, afterEntry);

      await db.dexie.languages.put(nextLanguage);
      await db.dexie.language_display_names.where('languageId').equals(languageId).delete();
      await db.dexie.language_aliases.where('languageId').equals(languageId).delete();
      if (displayRows.length > 0) {
        await db.dexie.language_display_names.bulkPut(displayRows);
      }
      if (aliasRows.length > 0) {
        await db.dexie.language_aliases.bulkPut(aliasRows);
      }
      await db.dexie.language_catalog_history.put(
        lcHist.buildHistoryRecord({
          languageId,
          action: existing ? 'update' : 'create',
          summary: t(
            locale,
            existing
              ? 'service.languageCatalog.historyUpdate'
              : 'service.languageCatalog.historyCreate',
          ),
          changedFields: historyDiff.changedFields,
          reason,
          reasonCode: lcNorm.normalizeOptionalValue(input.reason)
            ? 'user-provided'
            : 'workspace-save',
          sourceType: nextSourceType,
          ...(historyDiff.beforePatch ? { beforePatch: historyDiff.beforePatch } : {}),
          ...(historyDiff.afterPatch ? { afterPatch: historyDiff.afterPatch } : {}),
          sourceRef: 'workspace.language-metadata',
          snapshot: {
            language: nextLanguage,
            displayNames: displayRows,
            aliases: aliasRows,
          },
        }),
      );
    },
    { label: 'LinguisticService.languageCatalog.upsertLanguageCatalogEntry' },
  );

  await refreshLanguageCatalogReadModel().catch((refreshError) => {
    log.error('failed to refresh language catalog read model after upsert', { err: refreshError });
  });

  return (await getLanguageCatalogEntry({ languageId, locale })) as LanguageCatalogEntry;
}

export async function deleteLanguageCatalogEntry(input: {
  languageId: string;
  reason?: string;
  locale: Locale;
}): Promise<void> {
  const db = await getDb();
  const existing = await db.dexie.languages.get(input.languageId);
  if (!existing) {
    throw new Error(t(input.locale, 'service.languageCatalog.deleteMissingPersisted'));
  }
  const reason =
    lcNorm.normalizeOptionalValue(input.reason) ??
    t(
      input.locale,
      existing.sourceType === 'user-custom'
        ? 'service.languageCatalog.historyReasonDeleteCustomDefault'
        : 'service.languageCatalog.historyReasonDeleteOverrideDefault',
    );

  await withTransaction(
    db,
    'rw',
    [...dexieStoresForLanguageCatalogMutateRw(db)],
    async () => {
      const [currentDisplayRows, currentAliasRows] = await Promise.all([
        db.dexie.language_display_names.where('languageId').equals(input.languageId).toArray(),
        db.dexie.language_aliases.where('languageId').equals(input.languageId).toArray(),
      ]);
      const beforeEntry = lcProj.projectLanguageCatalogEntry({
        languageId: input.languageId,
        locale: input.locale,
        languageDoc: existing,
        displayNames: currentDisplayRows,
        aliases: currentAliasRows,
      });
      const historyDiff = lcHist.computeHistoryDiff(beforeEntry, null);

      await db.dexie.languages.delete(input.languageId);
      await db.dexie.language_display_names.where('languageId').equals(input.languageId).delete();
      await db.dexie.language_aliases.where('languageId').equals(input.languageId).delete();
      await db.dexie.language_catalog_history.put(
        lcHist.buildHistoryRecord({
          languageId: input.languageId,
          action: 'delete',
          summary: t(
            input.locale,
            existing.sourceType === 'user-custom'
              ? 'service.languageCatalog.historyDeleteCustom'
              : 'service.languageCatalog.historyDeleteOverride',
          ),
          changedFields: historyDiff.changedFields,
          reason,
          reasonCode: lcNorm.normalizeOptionalValue(input.reason)
            ? 'user-provided'
            : 'workspace-delete',
          ...(existing.sourceType ? { sourceType: existing.sourceType } : {}),
          ...(historyDiff.beforePatch ? { beforePatch: historyDiff.beforePatch } : {}),
          sourceRef: 'workspace.language-metadata',
          snapshot: { language: existing },
        }),
      );
    },
    { label: 'LinguisticService.languageCatalog.deleteLanguageCatalogEntry' },
  );

  await refreshLanguageCatalogReadModel().catch((refreshError) => {
    log.error('failed to refresh language catalog read model after delete', { err: refreshError });
  });
}

export async function listLanguageCatalogHistory(
  languageId: string,
): Promise<LanguageCatalogHistoryDocType[]> {
  const db = await getDb();
  return db.dexie.language_catalog_history
    .where('languageId')
    .equals(languageId)
    .reverse()
    .sortBy('createdAt');
}
