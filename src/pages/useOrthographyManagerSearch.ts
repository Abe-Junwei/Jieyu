import { useCallback, useEffect, useRef, useState } from 'react';
import type { OrthographyDocType } from '../types/jieyuDbDocTypes';
import type { LanguageCatalogSearchSuggestion } from '../types/languageCatalogSearchSuggestion.types';
import { useListKeyboardNav } from '~/hooks/ui/useListKeyboardNav';

export interface UseOrthographyManagerSearchParams {
  orthographies: OrthographyDocType[];
  onSelect: (id: string) => void;
}

export function useOrthographyManagerSearch({
  orthographies,
  onSelect,
}: UseOrthographyManagerSearchParams) {
  const [searchText, setSearchText] = useState('');
  const [searchSuggestions, setSearchSuggestions] = useState<LanguageCatalogSearchSuggestion[]>([]);
  const [searchSuggestionActiveIndex, setSearchSuggestionActiveIndex] = useState(-1);
  const [searchInputFocused, setSearchInputFocused] = useState(false);

  const getOrthographyId = useCallback((o: OrthographyDocType) => o.id, []);
  const selectRef = useRef(onSelect);
  selectRef.current = onSelect;

  const {
    activeIndex: kbActiveIndex,
    handleSearchKeyDown: kbSearchKeyDown,
    listRef: kbListRef,
    resetActiveIndex: kbReset,
  } = useListKeyboardNav({
    items: orthographies,
    getItemId: getOrthographyId,
    onSelect: (id) => {
      selectRef.current(id);
    },
  });

  // 列表变化时重置高亮 | Reset highlight when list changes
  useEffect(() => {
    kbReset();
  }, [orthographies, kbReset]);

  const handleSearchTextChange = useCallback((value: string) => {
    setSearchText(value);
    setSearchSuggestionActiveIndex(-1);
    setSearchInputFocused(true);
  }, []);

  const handleSearchSuggestionSelect = useCallback(
    (suggestion: LanguageCatalogSearchSuggestion) => {
      setSearchText(suggestion.primaryLabel);
      setSearchSuggestionActiveIndex(-1);
      setSearchInputFocused(false);
    },
    [],
  );

  const hasVisibleSearchSuggestions = searchInputFocused && searchSuggestions.length > 0;

  const handleSearchInputKeyDown = useCallback(
    (event: React.KeyboardEvent<Element>) => {
      if (!hasVisibleSearchSuggestions) {
        kbSearchKeyDown(event);
        return;
      }

      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setSearchSuggestionActiveIndex((prev) => {
          if (searchSuggestions.length === 0) return -1;
          if (prev < 0) return 0;
          return Math.min(prev + 1, searchSuggestions.length - 1);
        });
        return;
      }

      if (event.key === 'ArrowUp') {
        event.preventDefault();
        setSearchSuggestionActiveIndex((prev) => {
          if (searchSuggestions.length === 0) return -1;
          if (prev <= 0) return 0;
          return prev - 1;
        });
        return;
      }

      if (event.key === 'Escape') {
        event.preventDefault();
        setSearchSuggestionActiveIndex(-1);
        setSearchInputFocused(false);
        return;
      }

      if (event.key === 'Enter') {
        if (searchSuggestions.length === 0) return;
        event.preventDefault();
        const targetIndex = searchSuggestionActiveIndex >= 0 ? searchSuggestionActiveIndex : 0;
        const suggestion = searchSuggestions[targetIndex];
        if (suggestion) {
          handleSearchSuggestionSelect(suggestion);
        }
        return;
      }

      kbSearchKeyDown(event);
    },
    [
      hasVisibleSearchSuggestions,
      handleSearchSuggestionSelect,
      kbSearchKeyDown,
      searchSuggestionActiveIndex,
      searchSuggestions,
    ],
  );

  return {
    searchText,
    setSearchText,
    searchSuggestions,
    setSearchSuggestions,
    searchSuggestionActiveIndex,
    setSearchSuggestionActiveIndex,
    searchInputFocused,
    setSearchInputFocused,
    kbActiveIndex,
    kbListRef,
    handleSearchTextChange,
    handleSearchSuggestionSelect,
    handleSearchInputKeyDown,
  };
}
