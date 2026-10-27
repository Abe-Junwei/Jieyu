import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { db } from './engine';
import { CatalogOwnershipMismatchError } from '../services/projectCatalogScope';
import {
  clearActiveProjectTextId,
  publishActiveProjectTextId,
} from '../utils/transcriptionUrlDeepLink';
import { upsertLanguageCatalogEntry } from './storagePortServiceLanguageCatalogMutations';

function isOwnershipMismatch(err: unknown): boolean {
  if (err instanceof CatalogOwnershipMismatchError) return true;
  return err instanceof Error && err.cause instanceof CatalogOwnershipMismatchError;
}

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

describe('language catalog ownership (#397)', () => {
  it('refuses another project overriding the same language id after the first write commits', async () => {
    publishActiveProjectTextId('project-a');
    await upsertLanguageCatalogEntry({
      id: 'eng',
      languageCode: 'eng',
      locale: 'zh-CN',
      localName: '英语A',
      englishName: 'English A',
    });
    expect((await db.languages.get('eng'))?.textId).toBe('project-a');

    publishActiveProjectTextId('project-b');
    await expect(
      upsertLanguageCatalogEntry({
        id: 'eng',
        languageCode: 'eng',
        locale: 'zh-CN',
        localName: '英语B',
        englishName: 'English B',
      }),
    ).rejects.toSatisfy(isOwnershipMismatch);

    const kept = await db.languages.get('eng');
    expect(kept?.textId).toBe('project-a');
  });

  it('re-reads ownership inside the write txn so a just-committed peer row is not overwritten', async () => {
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
    await expect(
      upsertLanguageCatalogEntry({
        id: 'eng',
        languageCode: 'eng',
        locale: 'en-US',
        localName: 'English B',
        englishName: 'English B',
      }),
    ).rejects.toSatisfy(isOwnershipMismatch);
    expect((await db.languages.get('eng'))?.textId).toBe('project-a');
  });
});
