import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { db } from './engine';
import {
  clearActiveProjectTextId,
  publishActiveProjectTextId,
} from '../utils/transcriptionUrlDeepLink';
import {
  listLanguageCatalogEntries,
  upsertLanguageCatalogEntry,
} from './storagePortServiceLanguageCatalogMutations';

async function clearLanguageTables(): Promise<void> {
  await Promise.all([
    db.languages.clear(),
    db.language_display_names.clear(),
    db.language_aliases.clear(),
    db.language_catalog_history.clear(),
  ]);
}

beforeEach(async () => {
  await clearLanguageTables();
  clearActiveProjectTextId();
});

afterEach(() => {
  clearActiveProjectTextId();
});

describe('language catalog projection isolation (#398)', () => {
  it('keeps built-in eng visible to project B after project A overrides it', async () => {
    publishActiveProjectTextId('project-a');
    await upsertLanguageCatalogEntry({
      id: 'eng',
      languageCode: 'eng',
      locale: 'en-US',
      localName: 'English A',
      englishName: 'English A',
    });
    expect((await db.languages.get('eng'))?.textId).toBe('project-a');

    publishActiveProjectTextId('project-b');
    const forB = await listLanguageCatalogEntries({
      locale: 'en-US',
      languageIds: ['eng'],
      includeHidden: true,
    });
    expect(forB).toEqual([
      expect.objectContaining({
        id: 'eng',
        entryKind: 'built-in',
      }),
    ]);

    publishActiveProjectTextId('project-a');
    const forA = await listLanguageCatalogEntries({
      locale: 'en-US',
      languageIds: ['eng'],
      includeHidden: true,
    });
    expect(forA).toEqual([
      expect.objectContaining({
        id: 'eng',
        entryKind: 'override',
        localName: 'English A',
      }),
    ]);
  });
});
