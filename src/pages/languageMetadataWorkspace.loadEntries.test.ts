import { describe, expect, it, vi } from 'vitest';
import { createLoadEntries } from './languageMetadataWorkspace.loadEntries';

vi.mock('../app/languageAssetPageAccess', () => ({
  listLanguageCatalogEntries: vi.fn(async () => {
    throw new Error('list failed');
  }),
  searchLanguageCatalogSuggestions: vi.fn(async () => []),
}));

function harness() {
  const setEntries = vi.fn();
  const setError = vi.fn();
  const loadEntries = createLoadEntries({
    locale: 'zh-CN',
    browseLanguageIds: ['lang-kept'],
    setLoading: vi.fn(),
    setError,
    setEntries,
    setSearchSuggestionMap: vi.fn(),
  });
  return { setEntries, setError, loadEntries };
}

describe('createLoadEntries', () => {
  it('keeps the current list when a post-write reload fails', async () => {
    const { setEntries, setError, loadEntries } = harness();
    const records = await loadEntries('', { preserveEntriesOnError: true });
    expect(records).toBeNull();
    expect(setEntries).not.toHaveBeenCalled();
    expect(setError).not.toHaveBeenCalled();
  });

  it('clears the list when a normal browse reload fails', async () => {
    const { setEntries, loadEntries } = harness();
    const records = await loadEntries('');
    expect(records).toEqual([]);
    expect(setEntries).toHaveBeenCalledWith([]);
  });
});
