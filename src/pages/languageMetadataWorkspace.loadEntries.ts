import { t } from '../i18n';
import type { LanguageCatalogEntry } from '../types/linguisticCatalogSurface.types';
import type { LanguageCatalogSearchSuggestion } from '../types/languageCatalogSearchSuggestion.types';
import {
  listLanguageCatalogEntries,
  searchLanguageCatalogSuggestions,
} from '../app/languageAssetPageAccess';
import { WORKSPACE_LANGUAGE_SEARCH_LIMIT } from './orthographyBrowse.shared';
import type { WorkspaceLocale } from './languageMetadataWorkspace.shared';

export interface LoadEntriesDeps {
  locale: WorkspaceLocale;
  browseLanguageIds: string[];
  setLoading: (loading: boolean) => void;
  setError: (error: string) => void;
  setEntries: (entries: LanguageCatalogEntry[]) => void;
  setSearchSuggestionMap: (map: ReadonlyMap<string, LanguageCatalogSearchSuggestion>) => void;
}

export function createLoadEntries(deps: LoadEntriesDeps) {
  const { locale, browseLanguageIds, setLoading, setError, setEntries, setSearchSuggestionMap } =
    deps;

  return async (nextSearchText: string): Promise<LanguageCatalogEntry[]> => {
    setLoading(true);
    try {
      const normalizedSearchText = nextSearchText.trim();
      let records: LanguageCatalogEntry[];

      if (normalizedSearchText) {
        // 两阶段搜索：先用分层排名获取匹配 ID，再取完整条目 | Two-stage search: ranked IDs first, then full entries
        const suggestions = await searchLanguageCatalogSuggestions({
          query: normalizedSearchText,
          locale,
          limit: WORKSPACE_LANGUAGE_SEARCH_LIMIT,
          catalogScope: 'language',
        });
        const nextSuggestionMap = new Map<string, LanguageCatalogSearchSuggestion>();
        suggestions.forEach((suggestion) => nextSuggestionMap.set(suggestion.id, suggestion));
        setSearchSuggestionMap(nextSuggestionMap);

        if (suggestions.length === 0) {
          records = [];
        } else {
          const rankedIds = suggestions.map((suggestion) => suggestion.id);
          const raw = await listLanguageCatalogEntries({
            locale,
            includeHidden: true,
            languageIds: rankedIds,
          });
          // 按搜索排名排序 | Sort by search rank order
          const idOrder = new Map(rankedIds.map((id, index) => [id, index]));
          records = raw
            .slice()
            .sort((a, b) => (idOrder.get(a.id) ?? Infinity) - (idOrder.get(b.id) ?? Infinity));
        }
      } else {
        setSearchSuggestionMap(new Map());
        records =
          browseLanguageIds.length > 0
            ? await listLanguageCatalogEntries({
                locale,
                includeHidden: true,
                languageIds: browseLanguageIds,
              })
            : [];
      }

      setEntries(records);
      setError('');
      return records;
    } catch (loadError) {
      setEntries([]);
      setError(
        loadError instanceof Error
          ? loadError.message
          : t(locale, 'workspace.languageMetadata.errorFallback'),
      );
      return [] as LanguageCatalogEntry[];
    } finally {
      setLoading(false);
    }
  };
}
